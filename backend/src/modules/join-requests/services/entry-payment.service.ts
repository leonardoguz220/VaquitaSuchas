import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type DbTransaction } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type {
  PaymentDataSent,
  ProofSubmitted,
} from '../../../shared/events/join-request-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import { FileStorage, StorageObjectNotFoundError } from '../../../shared/ports/file-storage.js';
import { MAX_REFERENCE_LENGTH } from '../../billing/domain/reference.js';
import { checkReceiptFile } from '../../billing/domain/file-signature.js';
import {
  mimeOfFileType,
  RECEIPT_URL_TTL_SECONDS,
  withDownloadHint,
} from '../../billing/domain/receipt-file.js';
import { PaymentReferenceService } from '../../billing/services/payment-reference.service.js';
import { entryWindow } from '../../subscriptions/domain/entry-window.js';
import {
  GroupsRepository,
  type GroupRow,
} from '../../subscriptions/repositories/groups.repository.js';
import { MembersRepository } from '../../subscriptions/repositories/members.repository.js';
import { computeDeadlines } from '../domain/deadlines.js';
import { buildEntryQuote } from '../domain/entry-quote.js';
import { planExtension } from '../domain/extension.js';
import { checkQrFile, MAX_PAYMENT_TEXT, resolvePaymentInfo } from '../domain/payment-info.js';
import { openRequestError } from '../domain/open-request-errors.js';
import { paymentQrKeyOf, proofKeyOf } from '../domain/request-files.js';
import { transition } from '../domain/request-state.js';
import { availableSlots } from '../domain/slots.js';
import { RequestEventsRepository } from '../repositories/events.repository.js';
import { RequestsRepository, type JoinRequestRecord } from '../repositories/requests.repository.js';
import { JoinRequestsService, type RequestAccess } from './join-requests.service.js';
import { currentDeadline, RequestLifecycle } from './request-lifecycle.js';
import type { JoinRequestView } from './request-views.js';

export interface PaymentDataInput {
  /** Texto escrito por el titular; `null` si no envió. */
  text: string | null;
  /** Contenido del QR adjunto; `undefined` si no envió. */
  qrBytes: Uint8Array | undefined;
  version: number | null;
}

export interface UploadProofInput {
  bytes: Uint8Array | undefined;
  method: 'qr' | 'transferencia';
  /** Texto de la referencia como lo escribió la persona. */
  reference: string;
  version: number | null;
}

export interface SignedFile {
  url: string;
  expiresAt: string;
  mime: string;
}

/** Resultado de una transacción que puede haber persistido un vencimiento y aun así debe fallar. */
type Outcome = { error: DomainError } | { error?: undefined };

const staleState = (): DomainError =>
  new DomainError(
    'STALE_STATE',
    409,
    'La solicitud cambió mientras la veías. Recarga e intenta de nuevo.',
  );

const invalidTransition = (from: string, action: string): DomainError =>
  new DomainError(
    'INVALID_TRANSITION',
    409,
    'Esa acción no es válida para el estado actual de la solicitud.',
    { from, action },
  );

const storageUnavailable = (): DomainError =>
  new DomainError(
    ErrorCode.SERVICE_UNAVAILABLE,
    503,
    'No pudimos guardar el archivo, intenta de nuevo.',
  );

const forbidden = (): DomainError =>
  new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);

const validationError = (field: string, code: string): DomainError =>
  new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
    fields: { [field]: [code] },
  });

const fileTooLarge = (): DomainError =>
  new DomainError(ErrorCode.FILE_TOO_LARGE, 413, DEFAULT_MESSAGES.FILE_TOO_LARGE);

const unsupportedType = (message: string): DomainError =>
  new DomainError(ErrorCode.UNSUPPORTED_FILE_TYPE, 415, message);

/**
 * Pago de ingreso (spec 010, US2 y US3): datos de pago con cotización, prórroga y comprobante.
 * Toda acción bloquea la solicitud y DESPUÉS el grupo (plan §5), persiste el vencimiento con
 * `expireIfDue` y, si el plazo ya había vencido, confirma ese vencimiento y recién entonces
 * responde con el error (si se lanzara dentro de la transacción, el `ROLLBACK` lo deshacería).
 */
@Injectable()
export class EntryPaymentService {
  private readonly logger = new Logger(EntryPaymentService.name);

  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly bus: TxEventBus,
    private readonly storage: FileStorage,
    private readonly requestsService: JoinRequestsService,
    private readonly requests: RequestsRepository,
    private readonly events: RequestEventsRepository,
    private readonly groups: GroupsRepository,
    private readonly members: MembersRepository,
    private readonly lifecycle: RequestLifecycle,
    private readonly references: PaymentReferenceService,
  ) {}

  /**
   * `POST /join-requests/:id/payment-data` (titular; RF-010-11, RF-010-12). Cotiza con los
   * miembros actuales, copia los datos de pago (y el QR) a la solicitud, reserva el cupo con el
   * plazo de 15 minutos y publica `PaymentDataSent`. Si algo falla tras guardar el QR, se borra.
   */
  async sendPaymentData(
    userId: string,
    requestId: string,
    input: PaymentDataInput,
  ): Promise<JoinRequestView> {
    const access = await this.requestsService.access(this.db, requestId, userId);
    if (access.role !== 'titular') throw forbidden();
    const text = input.text?.trim() || null;
    if (text !== null && text.length > MAX_PAYMENT_TEXT) throw validationError('text', 'TOO_LONG');
    const qr = input.qrBytes === undefined ? null : this.checkQr(input.qrBytes);

    const stored: string[] = [];
    try {
      const outcome = await this.db.withTransaction<Outcome>(async (tx) => {
        const now = this.clock.now();
        const locked = await this.lockAndExpire(tx, requestId, input.version, now);
        const record = locked.record;
        if (record.status === 'expirada') return { error: await this.expiredOnSend(tx, record) };
        transition(record.status, 'sendPaymentData', {
          now,
          windowOpen: true,
          slotAvailable: true,
          deadlineAt: currentDeadline(record),
        });
        // Orden de bloqueo: solicitud y luego grupo (plan §5).
        const group = (await this.groups.findByIdForUpdate(tx, record.groupId)) as GroupRow;
        if (group.frozen_at !== null) {
          throw new DomainError(
            'GROUP_FROZEN',
            422,
            'El grupo está congelado y solo se puede consultar.',
            { rule: 'RF-009-22' },
          );
        }
        const window = entryWindow(
          { billingDay: group.billing_day, createdAt: group.created_at },
          now,
        );
        if (!window.isOpen) throw openRequestError(['window_closed'], window.opensAt);
        const members = await this.members.countActive(tx, group.id);
        const reserved = await this.requests.countReserved(tx, group.id, now);
        const slots = availableSlots({
          totalSlots: group.total_slots,
          activeMembers: members,
          reserved,
        });
        if (slots <= 0) throw openRequestError(['no_slots'], null);

        const groupInfo = await this.requests.groupPaymentInfo(tx, group.id);
        const info = resolvePaymentInfo(
          { text, hasQr: qr !== null },
          { text: groupInfo.text, hasQr: groupInfo.qrKey !== null },
        );
        if (info === null) throw paymentInfoMissing();

        const files = await this.storeQr(info.qr, qr, groupInfo, group.id, record.id, stored);
        if (info.text === null && files.key === null) throw paymentInfoMissing();

        const quote = buildEntryQuote(
          {
            priceCents: Number(group.price_cents),
            currency: group.currency,
            exchangeRate: group.exchange_rate,
            totalBsCents: Number(group.total_bs_cents),
          },
          members,
        );
        const deadlines = computeDeadlines('paymentData', now);
        const payDeadlineAt = deadlines.payDeadlineAt as Date;
        await this.requests.recordPaymentData(tx, record.id, {
          quote,
          paymentText: info.text,
          qrKey: files.key,
          qrMime: files.mime,
          sentAt: now,
          payDeadlineAt,
        });
        await this.events.insert(tx, {
          requestId: record.id,
          type: 'datos_pago_enviados',
          actorId: userId,
          fromStatus: record.status,
          toStatus: 'esperando_pago',
          occurredAt: now,
        });
        const event: PaymentDataSent = {
          type: 'join-requests.payment-data-sent',
          requestId: record.id,
          groupId: group.id,
          applicantId: record.applicantId,
          hostId: group.owner_id,
          amountCents: quote.amountCents,
          payDeadlineAt,
        };
        await this.bus.publish(tx, event);
        return {};
      });
      if (outcome.error) throw outcome.error;
    } catch (error) {
      await this.discard(stored);
      throw error;
    }
    return this.requestsService.get(userId, requestId);
  }

  /** `POST /join-requests/:id/extend` (titular; RF-010-28): +15 minutos, una sola vez. */
  async extend(userId: string, requestId: string): Promise<JoinRequestView> {
    const access = await this.requestsService.access(this.db, requestId, userId);
    if (access.role !== 'titular') throw forbidden();
    const outcome = await this.db.withTransaction<Outcome>(async (tx) => {
      const now = this.clock.now();
      const { record } = await this.lockAndExpire(tx, requestId, null, now);
      if (record.status === 'expirada') {
        return { error: invalidTransition('expirada', 'extend') };
      }
      const plan = planExtension(
        {
          status: record.status,
          payDeadlineAt: record.payDeadlineAt,
          extendedAt: record.extendedAt,
        },
        now,
      );
      await this.requests.recordExtension(tx, record.id, plan.payDeadlineAt, now);
      await this.events.insert(tx, {
        requestId: record.id,
        type: 'plazo_prorrogado',
        actorId: userId,
        fromStatus: record.status,
        toStatus: record.status,
        occurredAt: now,
      });
      return {};
    });
    if (outcome.error) throw outcome.error;
    return this.requestsService.get(userId, requestId);
  }

  /**
   * `POST /join-requests/:id/proof` (solicitante; RF-010-13, RN-010-14). Misma subida segura que
   * los comprobantes de cobros (spec 002 R4): firma binaria, 5 MB, referencia única por grupo,
   * clave generada y compensación. La referencia se reserva antes de guardar el archivo.
   */
  async uploadProof(
    userId: string,
    requestId: string,
    input: UploadProofInput,
  ): Promise<JoinRequestView> {
    const access = await this.requestsService.access(this.db, requestId, userId);
    if (access.role !== 'solicitante') throw forbidden();
    const file = this.checkProof(input.bytes);
    const reference = input.reference.trim();
    if (reference.length === 0 || reference.length > MAX_REFERENCE_LENGTH) {
      throw validationError('reference', 'INVALID_REFERENCE');
    }
    this.references.normalize(reference);

    const stored: string[] = [];
    try {
      const outcome = await this.db.withTransaction<Outcome>(async (tx) => {
        const now = this.clock.now();
        const { record } = await this.lockAndExpire(tx, requestId, input.version, now);
        if (record.status === 'expirada') {
          return {
            error:
              record.finalReason === 'plazo_pago'
                ? new DomainError(
                    'PAYMENT_DEADLINE_PASSED',
                    422,
                    'El plazo para subir el comprobante venció.',
                    { rule: 'RN-010-06' },
                  )
                : invalidTransition('expirada', 'uploadProof'),
          };
        }
        transition(record.status, 'uploadProof', {
          now,
          windowOpen: true,
          slotAvailable: true,
          deadlineAt: currentDeadline(record),
        });
        await this.references.reserve(tx, {
          groupId: record.groupId,
          reference,
          sourceType: 'join_request',
          sourceId: record.id,
        });
        const key = proofKeyOf({
          groupId: record.groupId,
          requestId: record.id,
          fileId: randomUUID(),
          type: file.type,
        });
        const mime = mimeOfFileType(file.type);
        await this.putFile(key, file.bytes, mime, stored);
        const deadlines = computeDeadlines('proof', now);
        const decisionDeadlineAt = deadlines.decisionDeadlineAt as Date;
        await this.requests.recordProof(tx, record.id, {
          key,
          mime,
          sizeBytes: file.bytes.length,
          method: input.method,
          reference,
          uploadedAt: now,
          decisionDeadlineAt,
        });
        await this.events.insert(tx, {
          requestId: record.id,
          type: 'comprobante_subido',
          actorId: userId,
          fromStatus: record.status,
          toStatus: 'pago_informado',
          metadata: { method: input.method },
          occurredAt: now,
        });
        const group = (await this.groups.findById(tx, record.groupId)) as GroupRow;
        const event: ProofSubmitted = {
          type: 'join-requests.proof-submitted',
          requestId: record.id,
          groupId: record.groupId,
          applicantId: record.applicantId,
          hostId: group.owner_id,
          decisionDeadlineAt,
        };
        await this.bus.publish(tx, event);
        return {};
      });
      if (outcome.error) throw outcome.error;
    } catch (error) {
      await this.discard(stored);
      throw error;
    }
    return this.requestsService.get(userId, requestId);
  }

  /** `GET /join-requests/:id/proof/file` (solicitante o titular; RNF-010-02). */
  async proofFile(userId: string, requestId: string): Promise<SignedFile> {
    const access = await this.requestsService.access(this.db, requestId, userId);
    const { proofKey, proofMime } = access.record;
    return this.signedFile(access, 'comprobante', proofKey, proofMime);
  }

  /** `GET /join-requests/:id/payment-qr` (solicitante o titular; RNF-010-02). */
  async paymentQr(userId: string, requestId: string): Promise<SignedFile> {
    const access = await this.requestsService.access(this.db, requestId, userId);
    const { paymentQrKey, paymentQrMime } = access.record;
    return this.signedFile(access, 'qr', paymentQrKey, paymentQrMime);
  }

  private async signedFile(
    access: RequestAccess,
    what: 'comprobante' | 'qr',
    key: string | null,
    mime: string | null,
  ): Promise<SignedFile> {
    if (key === null || mime === null) throw notFound();
    if (access.record.contentPurgedAt !== null) {
      throw new DomainError('FILE_DELETED', 410, 'El archivo ya fue eliminado.');
    }
    let url: string;
    try {
      url = await this.storage.signedUrl(key, RECEIPT_URL_TTL_SECONDS);
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) throw notFound();
      this.logger.warn('El almacén de archivos falló al firmar la URL de una solicitud.');
      throw storageUnavailable();
    }
    const expiresAt = new Date(this.clock.now().getTime() + RECEIPT_URL_TTL_SECONDS * 1000);
    // Registro de la emisión (RNF-010-02): quién la pidió (rol) y qué; nunca la URL ni la referencia.
    this.logger.log(
      `Emitida URL firmada (${what}) de la solicitud ${access.record.id}, acceso ${access.role}.`,
    );
    return {
      url: mime === 'application/pdf' ? withDownloadHint(url, 'application/pdf') : url,
      expiresAt: expiresAt.toISOString(),
      mime,
    };
  }

  /** Bloquea la solicitud, comprueba la versión y persiste el vencimiento si ya llegó. */
  private async lockAndExpire(
    tx: DbTransaction,
    requestId: string,
    version: number | null,
    now: Date,
  ): Promise<{ record: JoinRequestRecord }> {
    const locked = await this.requests.findByIdForUpdate(tx, requestId);
    if (!locked) throw notFound();
    if (version !== null && version !== locked.version) throw staleState();
    return { record: await this.lifecycle.expireIfDue(tx, locked, now) };
  }

  /** Error de una solicitud `abierta` que ya había vencido: ventana cerrada o plazo de 24 h. */
  private async expiredOnSend(tx: DbTransaction, record: JoinRequestRecord): Promise<DomainError> {
    if (record.finalReason !== 'ventana_cerrada')
      return invalidTransition('expirada', 'sendPaymentData');
    const group = (await this.groups.findById(tx, record.groupId)) as GroupRow;
    const window = entryWindow(
      { billingDay: group.billing_day, createdAt: group.created_at },
      this.clock.now(),
    );
    return openRequestError(['window_closed'], window.opensAt);
  }

  private checkQr(bytes: Uint8Array): { bytes: Uint8Array; type: 'jpeg' | 'png' } {
    const check = checkQrFile(bytes);
    if (check.ok) return { bytes, type: check.type };
    if (check.reason === 'empty') throw validationError('qr', 'EMPTY_FILE');
    if (check.reason === 'too_large') throw fileTooLarge();
    throw unsupportedType('Solo se aceptan imágenes JPG o PNG.');
  }

  private checkProof(bytes: Uint8Array | undefined): {
    bytes: Uint8Array;
    type: 'jpeg' | 'png' | 'pdf';
  } {
    if (bytes === undefined) throw validationError('file', 'REQUIRED');
    const check = checkReceiptFile(bytes);
    if (check.ok) return { bytes, type: check.type };
    if (check.reason === 'empty') throw validationError('file', 'EMPTY_FILE');
    if (check.reason === 'too_large') throw fileTooLarge();
    throw unsupportedType('Solo se aceptan archivos JPG, PNG o PDF.');
  }

  /**
   * Guarda la copia propia del QR en la solicitud: el QR subido ahora o una copia del QR del
   * grupo (que luego puede cambiar sin afectar a la solicitud).
   */
  private async storeQr(
    source: 'upload' | 'group' | null,
    upload: { bytes: Uint8Array; type: 'jpeg' | 'png' } | null,
    groupInfo: { qrKey: string | null; qrMime: string | null },
    groupId: string,
    requestId: string,
    stored: string[],
  ): Promise<{ key: string | null; mime: string | null }> {
    if (source === 'upload' && upload) {
      const key = paymentQrKeyOf({ groupId, requestId, fileId: randomUUID(), type: upload.type });
      const mime = mimeOfFileType(upload.type);
      await this.putFile(key, upload.bytes, mime, stored);
      return { key, mime };
    }
    if (source === 'group' && groupInfo.qrKey && groupInfo.qrMime) {
      const type = groupInfo.qrMime === 'image/png' ? 'png' : 'jpeg';
      const key = paymentQrKeyOf({ groupId, requestId, fileId: randomUUID(), type });
      try {
        await this.storage.copy(groupInfo.qrKey, key);
        stored.push(key);
      } catch (error) {
        // El QR del grupo ya no está: se envía solo el texto, si lo hay.
        if (error instanceof StorageObjectNotFoundError) return { key: null, mime: null };
        this.logger.warn('El almacén de archivos falló al copiar el QR de pago.');
        throw storageUnavailable();
      }
      return { key, mime: groupInfo.qrMime };
    }
    return { key: null, mime: null };
  }

  private async putFile(
    key: string,
    body: Uint8Array,
    contentType: string,
    stored: string[],
  ): Promise<void> {
    try {
      await this.storage.put(key, body, { contentType });
      stored.push(key);
    } catch {
      this.logger.warn('El almacén de archivos falló al guardar un archivo de solicitud.');
      throw storageUnavailable();
    }
  }

  /** Compensación: los archivos recién guardados se borran; si el borrado falla queda uno privado y sin fila. */
  private async discard(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.storage.delete(key);
      } catch {
        this.logger.warn('No se pudo borrar un archivo tras una operación fallida.');
      }
    }
  }
}

const paymentInfoMissing = (): DomainError =>
  new DomainError(
    'PAYMENT_INFO_MISSING',
    422,
    'El grupo no tiene datos de pago configurados. Escribe un texto o sube un QR.',
    { rule: 'RF-001-20' },
  );
