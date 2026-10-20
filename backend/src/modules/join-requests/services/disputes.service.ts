import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type Queryable } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type {
  DisputeOpened,
  DisputeResolved,
  DisputeResponded,
} from '../../../shared/events/join-request-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import { FileStorage } from '../../../shared/ports/file-storage.js';
import { RECEIPT_URL_TTL_SECONDS } from '../../billing/domain/receipt-file.js';
import { isChatImage, MAX_CHAT_IMAGE_BYTES } from '../domain/chat-rules.js';
import {
  disputeEligibility,
  isValidDisputeText,
  isValidResolutionReason,
  type DisputeDenial,
} from '../domain/dispute-rules.js';
import { disputeEvidenceKeyOf } from '../domain/request-files.js';
import { AUDIT_PORT, type AuditPort } from '../ports/audit.port.js';
import { BAN_PORT, type BanPort } from '../ports/ban.port.js';
import { DisputesRepository, type DisputeRecord } from '../repositories/disputes.repository.js';
import { RequestEventsRepository } from '../repositories/events.repository.js';
import { MessagesRepository } from '../repositories/messages.repository.js';
import { RequestsRepository } from '../repositories/requests.repository.js';
import { JoinRequestsService } from './join-requests.service.js';
import { RequestLifecycle } from './request-lifecycle.js';

export type DisputeResult = 'estafa_confirmada' | 'sin_falta';

/** `Dispute` del contrato (spec 010): la resolución la ven ambas partes. */
export interface DisputeView {
  id: string;
  kind: DisputeRecord['kind'];
  status: DisputeRecord['status'];
  openedBy: { userId: string; fullName: string };
  description: string;
  evidenceAvailable: boolean;
  openedAt: string;
  response: { text: string; evidenceAvailable: boolean; respondedAt: string } | null;
  resolution: { result: DisputeResult; reason: string; resolvedAt: string } | null;
}

interface SignedImage {
  url: string;
  expiresAt: string;
  mime: string;
}

/** Evidencia completa para el administrador (RF-010-23). */
export interface DisputeEvidence {
  dispute: DisputeView;
  disputes: DisputeView[];
  request: {
    id: string;
    status: string;
    openedAt: string;
    finalAt: string | null;
    finalReason: string | null;
    rejectReason: string | null;
    rejectedAsFalse: boolean;
    quote: {
      amountCents: number;
      priceCents: number | null;
      totalBsCents: number | null;
      currency: string | null;
      exchangeRate: string | null;
      memberCount: number | null;
    } | null;
  };
  timeline: {
    type: string;
    actorId: string | null;
    fromStatus: string | null;
    toStatus: string | null;
    reason: string | null;
    occurredAt: string;
  }[];
  messages: {
    id: string;
    seq: number;
    senderId: string;
    body: string | null;
    image: SignedImage | null;
    createdAt: string;
  }[];
  proof: {
    method: string | null;
    reference: string | null;
    uploadedAt: string;
    file: SignedImage | null;
  } | null;
  evidenceFiles: { description: SignedImage | null; response: SignedImage | null };
}

export interface EvidenceFile {
  bytes: Uint8Array | undefined;
}

type Outcome = { error: DomainError } | { error?: undefined };

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);
const forbidden = (): DomainError =>
  new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);
const validation = (field: string, code: string): DomainError =>
  new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
    fields: { [field]: [code] },
  });
const storageUnavailable = (): DomainError =>
  new DomainError(
    ErrorCode.SERVICE_UNAVAILABLE,
    503,
    'No pudimos guardar el archivo, intenta de nuevo.',
  );
const rule = (code: string, message: string, ruleId: string): DomainError =>
  new DomainError(code, 422, message, { rule: ruleId });

const DENIALS: Record<DisputeDenial, () => DomainError> = {
  not_final: () => rule('DISPUTE_NOT_ALLOWED', 'Aún no puedes abrir un reclamo.', 'RF-010-21'),
  no_payment_reported: () =>
    rule('DISPUTE_NOT_ALLOWED', 'No se informó un pago en esta solicitud.', 'RF-010-21'),
  not_eligible: () =>
    rule('DISPUTE_NOT_ALLOWED', 'No puedes abrir un reclamo en esta solicitud.', 'RF-010-21'),
  window_expired: () =>
    rule('DISPUTE_WINDOW_CLOSED', 'Pasaron más de 7 días desde el cierre.', 'RF-010-21'),
  already_open: () =>
    rule('DISPUTE_ALREADY_OPEN', 'Ya abriste un reclamo en esta solicitud.', 'RF-010-21'),
};

/** Valida la imagen de evidencia: ≤ 5 MB y JPG/PNG por firma binaria (CA-010-46). */
function checkEvidence(bytes: Uint8Array | undefined): void {
  if (bytes === undefined) return;
  if (bytes.length > MAX_CHAT_IMAGE_BYTES) {
    throw new DomainError(ErrorCode.FILE_TOO_LARGE, 413, DEFAULT_MESSAGES.FILE_TOO_LARGE);
  }
  if (bytes.length === 0 || !isChatImage(bytes)) {
    throw new DomainError(
      ErrorCode.UNSUPPORTED_FILE_TYPE,
      415,
      'Solo se aceptan imágenes JPG o PNG.',
    );
  }
}

/**
 * Reclamos de la spec 010 (US6, RN-010-07/08). Un reclamo no devuelve dinero ni cambia el estado
 * de la solicitud. Las operaciones de administración (`getEvidence`, `resolve`) las exponen los
 * controladores `/admin/disputes…` (contrato de la 009). Nunca registra textos, referencias, URLs
 * firmadas ni nombres de archivo en los logs (RNF-010-02).
 */
@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly bus: TxEventBus,
    private readonly storage: FileStorage,
    private readonly requestsService: JoinRequestsService,
    private readonly requests: RequestsRepository,
    private readonly disputes: DisputesRepository,
    private readonly messages: MessagesRepository,
    private readonly events: RequestEventsRepository,
    private readonly lifecycle: RequestLifecycle,
    @Inject(BAN_PORT) private readonly bans: BanPort,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  /** `POST /join-requests/:id/disputes` (RF-010-21; CA-010-27, 28, 46). */
  async open(
    userId: string,
    requestId: string,
    input: { description: string; evidence: Uint8Array | undefined },
  ): Promise<DisputeView> {
    const { role } = await this.requestsService.access(this.db, requestId, userId);
    if (!isValidDisputeText(input.description)) throw validation('description', 'LENGTH_10_500');
    checkEvidence(input.evidence);

    const stored: string[] = [];
    try {
      const outcome = await this.db.withTransaction<Outcome & { dispute?: DisputeRecord }>(
        async (tx) => {
          const now = this.clock.now();
          const locked = await this.requests.findByIdForUpdate(tx, requestId);
          if (!locked) throw notFound();
          const record = await this.lifecycle.expireIfDue(tx, locked, now);
          const own = (await this.disputes.listByRequest(tx, requestId)).some(
            (d) => d.openedBy === userId,
          );
          const verdict = disputeEligibility({
            role,
            request: {
              status: record.status,
              paymentReported: record.proofUploadedAt !== null,
              finalReason: record.finalReason,
              finalAt: record.finalAt,
              rejectedAsFalse: record.rejectedAsFalse,
              ownDisputeOpen: own,
            },
            now,
          });
          // El error sale tras confirmar: un vencimiento recién persistido no debe revertirse.
          if (!verdict.ok) return { error: DENIALS[verdict.reason]() };

          const hostId = await this.hostOf(tx, record.groupId);
          const accusedId = role === 'solicitante' ? hostId : record.applicantId;
          const evidence = input.evidence
            ? await this.store(stored, record.groupId, record.id, input.evidence)
            : null;
          const dispute = await this.disputes.insert(tx, {
            requestId: record.id,
            kind: verdict.kind,
            openedBy: userId,
            accusedId,
            description: input.description.trim(),
            evidence,
            openedAt: now,
          });
          const event: DisputeOpened = {
            type: 'join-requests.dispute-opened',
            requestId: record.id,
            groupId: record.groupId,
            applicantId: record.applicantId,
            hostId,
            disputeId: dispute.id,
            kind: dispute.kind,
            openedBy: userId,
            accusedId,
          };
          await this.bus.publish(tx, event);
          return { dispute };
        },
      );
      if (outcome.error) throw outcome.error;
      return (await this.views(this.db, [outcome.dispute as DisputeRecord]))[0] as DisputeView;
    } catch (error) {
      await this.discard(stored);
      throw error;
    }
  }

  /** `POST /join-requests/:id/disputes/:disputeId/response` (RF-010-22): una sola, la otra parte. */
  async respond(
    userId: string,
    requestId: string,
    disputeId: string,
    input: { text: string; evidence: Uint8Array | undefined },
  ): Promise<DisputeView> {
    await this.requestsService.access(this.db, requestId, userId);
    if (!isValidDisputeText(input.text)) throw validation('text', 'LENGTH_10_500');
    checkEvidence(input.evidence);

    const stored: string[] = [];
    try {
      const saved = await this.db.withTransaction(async (tx) => {
        const dispute = await this.disputes.findByIdForUpdate(tx, requestId, disputeId);
        if (!dispute) throw notFound();
        if (dispute.accusedId !== userId) throw forbidden();
        if (dispute.status === 'resuelto')
          throw rule('DISPUTE_RESOLVED', 'El reclamo ya fue resuelto.', 'RF-010-22');
        if (dispute.respondedAt !== null)
          throw rule('DISPUTE_ALREADY_RESPONDED', 'Ya respondiste este reclamo.', 'RF-010-22');
        const request = await this.requests.findById(tx, requestId);
        if (!request) throw notFound();
        const evidence = input.evidence
          ? await this.store(stored, request.groupId, request.id, input.evidence)
          : null;
        const updated = await this.disputes.saveResponse(tx, dispute.id, {
          text: input.text.trim(),
          evidence,
          respondedAt: this.clock.now(),
        });
        const event: DisputeResponded = {
          type: 'join-requests.dispute-responded',
          requestId: request.id,
          groupId: request.groupId,
          applicantId: request.applicantId,
          hostId: await this.hostOf(tx, request.groupId),
          disputeId: dispute.id,
          kind: dispute.kind,
          respondedBy: userId,
        };
        await this.bus.publish(tx, event);
        return updated;
      });
      return (await this.views(this.db, [saved]))[0] as DisputeView;
    } catch (error) {
      await this.discard(stored);
      throw error;
    }
  }

  /** `GET /join-requests/:id/disputes`: ambas partes ven los reclamos y su resolución. */
  async list(userId: string, requestId: string): Promise<{ items: DisputeView[] }> {
    await this.requestsService.access(this.db, requestId, userId);
    const rows = await this.disputes.listByRequest(this.db, requestId);
    return { items: await this.views(this.db, rows) };
  }

  /**
   * `GET /admin/disputes/:disputeId/evidence` (RF-010-23; CA-010-29). Solo de un reclamo abierto
   * (`403` si ya está resuelto). La auditoría se escribe y confirma antes de leer la evidencia.
   */
  async getEvidence(adminId: string, disputeId: string): Promise<DisputeEvidence> {
    const dispute = await this.db.withTransaction(async (tx) => {
      const found = await this.disputes.findById(tx, disputeId);
      if (!found) throw notFound();
      if (found.status !== 'abierto') throw forbidden();
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'reclamo_abrir_evidencia',
        targetType: 'join_dispute',
        targetId: found.id,
        metadata: { disputeId: found.id, requestId: found.requestId },
      });
      return found;
    });
    const request = await this.requests.findById(this.db, dispute.requestId);
    if (!request) throw notFound();
    const purged = request.contentPurgedAt !== null;
    const all = await this.disputes.listByRequest(this.db, request.id);
    const timeline = await this.events.listByRequest(this.db, request.id);
    const messages = await this.messages.listAfter(this.db, request.id, 0, 1000);
    const viewable = async (
      key: string | null,
      mime: string | null,
    ): Promise<SignedImage | null> =>
      key === null || mime === null || purged ? null : this.sign(key, mime);
    const views = await this.views(this.db, all);
    return {
      dispute: views.find((v) => v.id === dispute.id) as DisputeView,
      disputes: views,
      request: {
        id: request.id,
        status: request.status,
        openedAt: request.openedAt.toISOString(),
        finalAt: request.finalAt?.toISOString() ?? null,
        finalReason: request.finalReason,
        rejectReason: request.rejectReason,
        rejectedAsFalse: request.rejectedAsFalse,
        quote:
          request.quoteAmountCents === null
            ? null
            : {
                amountCents: request.quoteAmountCents,
                priceCents: request.quotePriceCents,
                totalBsCents: request.quoteTotalBsCents,
                currency: request.quoteCurrency,
                exchangeRate: request.quoteExchangeRate,
                memberCount: request.quoteMemberCount,
              },
      },
      timeline: timeline.map((e) => ({
        type: e.type,
        actorId: e.actorId,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        reason: e.reason,
        occurredAt: e.occurredAt.toISOString(),
      })),
      messages: await Promise.all(
        messages.map(async (m) => ({
          id: m.id,
          seq: m.seq,
          senderId: m.senderId,
          body: m.body,
          image: await viewable(m.imageKey, m.imageMime),
          createdAt: m.createdAt.toISOString(),
        })),
      ),
      proof:
        request.proofUploadedAt === null
          ? null
          : {
              method: request.proofMethod,
              reference: request.proofReference,
              uploadedAt: request.proofUploadedAt.toISOString(),
              file: await viewable(request.proofKey, request.proofMime),
            },
      evidenceFiles: {
        description: await viewable(dispute.evidenceKey, dispute.evidenceMime),
        response: await viewable(dispute.responseEvidenceKey, dispute.responseEvidenceMime),
      },
    };
  }

  /**
   * `POST /admin/disputes/:disputeId/resolve` (RF-010-24; CA-010-30, 31, 43). Todo en una
   * transacción: `estafa_confirmada` banea a la persona acusada (RN-010-08) y se audita. Un reclamo
   * resuelto no se vuelve a resolver (`409 INVALID_TRANSITION`).
   */
  async resolve(
    adminId: string,
    disputeId: string,
    result: DisputeResult,
    reason: string,
  ): Promise<DisputeView> {
    if (result !== 'estafa_confirmada' && result !== 'sin_falta')
      throw validation('result', 'INVALID');
    if (!isValidResolutionReason(reason)) throw validation('reason', 'LENGTH_10_300');
    const trimmed = reason.trim();
    const resolved = await this.db.withTransaction(async (tx) => {
      const dispute = await this.disputes.findById(tx, disputeId, true);
      if (!dispute) throw notFound();
      if (dispute.status === 'resuelto') {
        throw new DomainError('INVALID_TRANSITION', 409, 'El reclamo ya fue resuelto.');
      }
      const request = await this.requests.findById(tx, dispute.requestId);
      if (!request) throw notFound();
      let banId: string | null = null;
      if (result === 'estafa_confirmada') {
        const ban = await this.bans.ban(tx, {
          adminId,
          userId: dispute.accusedId,
          reason: trimmed,
          disputeId: dispute.id,
        });
        banId = ban?.banId ?? null;
      }
      const now = this.clock.now();
      const updated = await this.disputes.resolve(tx, dispute.id, {
        resolution: result,
        reason: trimmed,
        resolvedBy: adminId,
        resolvedAt: now,
      });
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'reclamo_resolver',
        targetType: 'join_dispute',
        targetId: dispute.id,
        reason: trimmed,
        metadata: { disputeId: dispute.id, requestId: dispute.requestId, outcome: result, banId },
      });
      const event: DisputeResolved = {
        type: 'join-requests.dispute-resolved',
        requestId: request.id,
        groupId: request.groupId,
        applicantId: request.applicantId,
        hostId: await this.hostOf(tx, request.groupId),
        disputeId: dispute.id,
        kind: dispute.kind,
        result,
      };
      await this.bus.publish(tx, event);
      return updated;
    });
    return (await this.views(this.db, [resolved]))[0] as DisputeView;
  }

  private hostOf(q: Queryable, groupId: string): Promise<string> {
    return this.disputes.hostOf(q, groupId);
  }

  private async views(q: Queryable, rows: readonly DisputeRecord[]): Promise<DisputeView[]> {
    const names = await this.disputes.namesOf(q, [...new Set(rows.map((d) => d.openedBy))]);
    return rows.map((d) => ({
      id: d.id,
      kind: d.kind,
      status: d.status,
      openedBy: { userId: d.openedBy, fullName: names.get(d.openedBy) ?? '' },
      description: d.description,
      evidenceAvailable: d.evidenceKey !== null && d.evidencePurgedAt === null,
      openedAt: d.openedAt.toISOString(),
      response:
        d.respondedAt === null
          ? null
          : {
              text: d.responseText as string,
              evidenceAvailable: d.responseEvidenceKey !== null && d.evidencePurgedAt === null,
              respondedAt: d.respondedAt.toISOString(),
            },
      resolution:
        d.status === 'resuelto' && d.resolution
          ? {
              result: d.resolution,
              reason: d.resolutionReason as string,
              resolvedAt: (d.resolvedAt as Date).toISOString(),
            }
          : null,
    }));
  }

  /** Guarda la imagen con una clave del servidor; la deduce de la firma, no del nombre. */
  private async store(
    stored: string[],
    groupId: string,
    requestId: string,
    bytes: Uint8Array,
  ): Promise<{ key: string; mime: string }> {
    const type = bytes[0] === 0x89 ? 'png' : 'jpeg';
    const mime = type === 'png' ? 'image/png' : 'image/jpeg';
    const key = disputeEvidenceKeyOf({ groupId, requestId, fileId: randomUUID(), type });
    try {
      await this.storage.put(key, bytes, { contentType: mime });
    } catch {
      this.logger.warn('El almacén de archivos falló al guardar la evidencia de un reclamo.');
      throw storageUnavailable();
    }
    stored.push(key);
    return { key, mime };
  }

  private async sign(key: string, mime: string): Promise<SignedImage | null> {
    try {
      const url = await this.storage.signedUrl(key, RECEIPT_URL_TTL_SECONDS);
      return {
        url,
        expiresAt: new Date(
          this.clock.now().getTime() + RECEIPT_URL_TTL_SECONDS * 1000,
        ).toISOString(),
        mime,
      };
    } catch {
      this.logger.warn('El almacén de archivos falló al firmar un archivo de evidencia.');
      return null;
    }
  }

  private async discard(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.storage.delete(key);
      } catch {
        this.logger.warn('No se pudo borrar la evidencia tras una operación fallida.');
      }
    }
  }
}
