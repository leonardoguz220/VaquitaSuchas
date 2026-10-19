import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { ChargeSubmitted } from '../../../shared/events/charge-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import { FileStorage, StorageObjectNotFoundError } from '../../../shared/ports/file-storage.js';
import { GroupsRepository } from '../../subscriptions/repositories/groups.repository.js';
import { checkReceiptFile } from '../domain/file-signature.js';
import { normalizeReference } from '../domain/reference.js';
import {
  mimeOfFileType,
  receiptStorageKey,
  RECEIPT_URL_TTL_SECONDS,
  withDownloadHint,
} from '../domain/receipt-file.js';
import { planUpload } from '../domain/receipt-upload.js';
import { ChargesRepository } from '../repositories/charges.repository.js';
import { ChargeEventsRepository } from '../repositories/events.repository.js';
import { ReceiptsRepository, type PaymentMethod } from '../repositories/receipts.repository.js';
import { BillingReadService } from './billing-read.service.js';
import { ChargeAccessService, forbidden, notFound } from './charge-access.service.js';
import type { ChargeView } from './charge-views.js';
import { PaymentReferenceService, referenceAlreadyUsed } from './payment-reference.service.js';

export interface UploadReceiptInput {
  /** Contenido del archivo; `undefined` si la petición no trajo ninguno. */
  bytes: Uint8Array | undefined;
  method: PaymentMethod;
  /** Texto de la referencia como lo escribió la persona. */
  reference: string;
  /** Versión del cobro que la persona tenía en pantalla (control de concurrencia opcional). */
  version: number | null;
}

export interface ReceiptFileUrl {
  url: string;
  expiresAt: string;
  mime: string;
}

const groupFrozen = (): DomainError =>
  new DomainError(
    'GROUP_FROZEN',
    422,
    'El grupo está congelado: por ahora solo se puede consultar.',
  );

const staleState = (): DomainError =>
  new DomainError(
    'STALE_STATE',
    409,
    'El cobro cambió mientras lo veías. Recarga e intenta de nuevo.',
  );

const storageUnavailable = (): DomainError =>
  new DomainError(
    ErrorCode.SERVICE_UNAVAILABLE,
    503,
    'No pudimos guardar el archivo, intenta de nuevo.',
  );

const validationError = (field: string, code: string): DomainError =>
  new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
    fields: { [field]: [code] },
  });

/**
 * Comprobantes de pago (spec 002, US2): subida segura con compensación (`research.md` R4) y URL
 * firmada de lectura. Los permisos salen de `ChargeAccessService`; los estados, de `planUpload` y
 * `transition`; el SQL y el almacén están detrás de repositorios y de `FileStorage`.
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly bus: TxEventBus,
    private readonly storage: FileStorage,
    private readonly access: ChargeAccessService,
    private readonly groups: GroupsRepository,
    private readonly charges: ChargesRepository,
    private readonly receipts: ReceiptsRepository,
    private readonly events: ChargeEventsRepository,
    private readonly references: PaymentReferenceService,
    private readonly reads: BillingReadService,
  ) {}

  /**
   * `POST /charges/:chargeId/receipts` (RF-002-06, RF-002-07, RF-002-08). Pasos:
   * 1. acceso, estado del grupo, estado y versión del cobro;
   * 2. archivo (tamaño y firma binaria) y referencia, sin tocar nada;
   * 3. el archivo se guarda en el almacén con una clave generada por el servidor (si falla: 503,
   *    sin cambios en la base);
   * 4. una transacción bloquea el cobro, revalida, reemplaza al vigente si lo hay, inserta el
   *    comprobante, reserva la referencia, aplica la transición y escribe el evento.
   * Si el paso 4 falla, se borra el archivo recién guardado (compensación) y la reserva se
   * revierte con la transacción.
   */
  async upload(userId: string, chargeId: string, input: UploadReceiptInput): Promise<ChargeView> {
    const context = await this.access.resolve(this.db, userId, chargeId);
    // El titular y quien solo mira no suben comprobantes de otro (plan §7).
    if (context.access === 'titular') throw forbidden();
    this.assertWritable(context.group.frozen_at);
    const now = this.clock.now();
    planUpload(context.charge.status, now, context.charge.dueAt);
    if (input.version !== null && input.version !== context.charge.version) throw staleState();

    const file = this.checkFile(input.bytes);
    const referenceKey = this.references.normalize(input.reference);
    await this.failEarlyOnUsedReference(context.charge.id, context.charge.groupId, referenceKey);

    const fileId = randomUUID();
    const key = receiptStorageKey({
      groupId: context.charge.groupId,
      chargeId: context.charge.id,
      fileId,
      type: file.type,
    });
    const mime = mimeOfFileType(file.type);
    try {
      await this.storage.put(key, file.bytes, { contentType: mime });
    } catch {
      this.logger.warn('El almacén de archivos falló al guardar un comprobante.');
      throw storageUnavailable();
    }

    try {
      await this.db.withTransaction((tx) =>
        this.recordUpload(tx, userId, chargeId, input, {
          key,
          mime,
          sizeBytes: file.bytes.length,
          referenceText: input.reference.trim(),
        }),
      );
    } catch (error) {
      await this.discardFile(key);
      throw error;
    }
    return this.reads.getCharge(userId, chargeId);
  }

  /** `GET /charges/:chargeId/receipts/:receiptId/file` (RNF-002-01). */
  async fileUrl(userId: string, chargeId: string, receiptId: string): Promise<ReceiptFileUrl> {
    const { access } = await this.access.resolve(this.db, userId, chargeId);
    const receipt = await this.receipts.findById(this.db, receiptId);
    if (!receipt || receipt.chargeId !== chargeId) throw notFound();
    if (receipt.fileDeletedAt !== null) {
      throw new DomainError(
        'FILE_DELETED',
        410,
        'El archivo de este comprobante ya fue eliminado.',
      );
    }
    let url: string;
    try {
      url = await this.storage.signedUrl(receipt.fileKey, RECEIPT_URL_TTL_SECONDS);
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) throw notFound();
      this.logger.warn('El almacén de archivos falló al firmar la URL de un comprobante.');
      throw storageUnavailable();
    }
    const expiresAt = new Date(this.clock.now().getTime() + RECEIPT_URL_TTL_SECONDS * 1000);
    // Registro de la emisión (RNF-002-01): quién la pidió (rol) y qué, nunca la URL ni la referencia.
    this.logger.log(
      `Emitida URL firmada de comprobante (cobro ${chargeId}, comprobante ${receiptId}, acceso ${access}).`,
    );
    return {
      url: withDownloadHint(url, receipt.mime),
      expiresAt: expiresAt.toISOString(),
      mime: receipt.mime,
    };
  }

  private assertWritable(frozenAt: Date | null): void {
    if (frozenAt !== null) throw groupFrozen();
  }

  private checkFile(bytes: Uint8Array | undefined): {
    bytes: Uint8Array;
    type: 'jpeg' | 'png' | 'pdf';
  } {
    if (bytes === undefined) throw validationError('file', 'REQUIRED');
    const check = checkReceiptFile(bytes);
    if (check.ok) return { bytes, type: check.type };
    if (check.reason === 'empty') throw validationError('file', 'EMPTY_FILE');
    if (check.reason === 'too_large') {
      throw new DomainError(ErrorCode.FILE_TOO_LARGE, 413, DEFAULT_MESSAGES.FILE_TOO_LARGE);
    }
    throw new DomainError(
      ErrorCode.UNSUPPORTED_FILE_TYPE,
      415,
      'Solo se aceptan archivos JPG, PNG o PDF.',
    );
  }

  /**
   * Evita guardar un archivo que la reserva va a rechazar. Si la referencia es la del comprobante
   * vigente que esta subida reemplaza, no cuenta: al reemplazar se libera antes de reservar.
   */
  private async failEarlyOnUsedReference(
    chargeId: string,
    groupId: string,
    referenceKey: string,
  ): Promise<void> {
    const active = await this.receipts.findActiveByCharge(this.db, chargeId);
    if (active && normalizeReference(active.reference) === referenceKey) return;
    if (await this.references.isReserved(this.db, groupId, referenceKey)) {
      throw referenceAlreadyUsed();
    }
  }

  private async recordUpload(
    tx: Parameters<Parameters<DbService['withTransaction']>[0]>[0],
    userId: string,
    chargeId: string,
    input: UploadReceiptInput,
    stored: {
      key: string;
      mime: ReturnType<typeof mimeOfFileType>;
      sizeBytes: number;
      referenceText: string;
    },
  ): Promise<void> {
    const now = this.clock.now();
    const charge = await this.charges.findByIdForUpdate(tx, chargeId);
    if (!charge) throw notFound();
    const group = await this.groups.findById(tx, charge.groupId);
    if (!group) throw notFound();
    this.assertWritable(group.frozen_at);
    if (input.version !== null && input.version !== charge.version) throw staleState();
    const plan = planUpload(charge.status, now, charge.dueAt);

    const previous = await this.receipts.findActiveByCharge(tx, charge.id);
    if (previous) {
      await this.receipts.setStatus(tx, previous.id, 'reemplazado');
      await this.references.release(tx, 'receipt', previous.id, now);
    }
    const receipt = await this.receipts.insert(tx, {
      chargeId: charge.id,
      uploadedBy: userId,
      fileKey: stored.key,
      mime: stored.mime,
      sizeBytes: stored.sizeBytes,
      method: input.method,
      reference: stored.referenceText,
      uploadedAt: now,
    });
    await this.references.reserve(tx, {
      groupId: charge.groupId,
      reference: input.reference,
      sourceType: 'receipt',
      sourceId: receipt.id,
    });
    await this.charges.updateStatus(tx, charge.id, plan.to, { firstSubmittedAt: now });
    await this.events.append(tx, {
      chargeId: charge.id,
      groupId: charge.groupId,
      type: plan.replaced ? 'comprobante_reemplazado' : 'comprobante_subido',
      actorId: userId,
      fromStatus: charge.status,
      toStatus: plan.to,
      metadata: { receiptId: receipt.id, method: input.method },
      occurredAt: now,
    });
    const event: ChargeSubmitted = {
      type: 'billing.charge-submitted',
      chargeId: charge.id,
      groupId: charge.groupId,
      userId,
      receiptId: receipt.id,
      replaced: plan.replaced,
    };
    await this.bus.publish(tx, event);
  }

  /** Compensación: el archivo huérfano se borra; si el borrado falla queda uno privado y sin fila. */
  private async discardFile(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      this.logger.warn('No se pudo borrar un archivo de comprobante tras una subida fallida.');
    }
  }
}
