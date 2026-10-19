import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { FileStorage } from '../../../shared/ports/file-storage.js';
import {
  checkPaymentQr,
  normalizePaymentText,
  paymentQrKey,
  paymentQrMime,
  PAYMENT_QR_URL_TTL_SECONDS,
  planPaymentInfoChange,
  type PaymentQrMime,
} from '../domain/payment-qr.js';
import { GroupsRepository, type GroupRow } from '../repositories/groups.repository.js';
import { groupClosed, groupFrozen } from './group-errors.js';

export interface PaymentInfoView {
  text: string | null;
  /** URL firmada de 10 minutos; solo se genera al consultar un miembro (RF-001-20). */
  qrUrl: string | null;
  configured: boolean;
}

export interface UpdatePaymentInfoInput {
  /** `undefined`: no se toca el texto; vacío: se borra. */
  text: string | undefined;
  /** Contenido del QR adjunto; `undefined` si la petición no trajo ninguno. */
  qrBytes: Uint8Array | undefined;
  removeQr: boolean;
}

const validationError = (field: string, code: string): DomainError =>
  new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
    fields: { [field]: [code] },
  });

const storageUnavailable = (): DomainError =>
  new DomainError(
    ErrorCode.SERVICE_UNAVAILABLE,
    503,
    'No pudimos guardar el archivo, intenta de nuevo.',
  );

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);

/**
 * Datos de pago del grupo (spec 001, RF-001-20): texto de hasta 500 caracteres y QR por
 * `FileStorage`. El QR nuevo se guarda primero con una clave generada por el servidor; el cambio en
 * la base va en una transacción; el QR anterior se borra solo después de confirmar. Si algo falla
 * antes de confirmar, el archivo nuevo se borra y el anterior sigue vigente. Los permisos (titular)
 * los resuelve `GroupOwnerGuard`.
 */
@Injectable()
export class PaymentInfoService {
  private readonly logger = new Logger(PaymentInfoService.name);

  constructor(
    private readonly db: DbService,
    private readonly storage: FileStorage,
    private readonly groups: GroupsRepository,
  ) {}

  /** `PUT /groups/:id/payment-info`. */
  async update(groupId: string, input: UpdatePaymentInfoInput): Promise<PaymentInfoView> {
    const text = this.checkText(input.text);
    const qr = this.checkQr(input.qrBytes, input.removeQr);

    // Antes de tocar el almacén: un grupo cerrado o congelado no recibe archivos.
    this.assertWritable(await this.groups.findById(this.db, groupId));

    let newQr: { key: string; mime: PaymentQrMime } | undefined;
    if (qr && input.qrBytes) {
      newQr = {
        key: paymentQrKey({ groupId, fileId: randomUUID(), type: qr.type }),
        mime: paymentQrMime(qr.type),
      };
      try {
        await this.storage.put(newQr.key, input.qrBytes, { contentType: newQr.mime });
      } catch {
        this.logger.warn('El almacén de archivos falló al guardar el QR de pago de un grupo.');
        throw storageUnavailable();
      }
    }

    let saved: { row: GroupRow; obsoleteQrKey: string | null };
    try {
      saved = await this.db.withTransaction(async (tx) => {
        const group = await this.groups.findByIdForUpdate(tx, groupId);
        this.assertWritable(group);
        const plan = planPaymentInfoChange(
          {
            text: (group as GroupRow).payment_info_text,
            qrKey: (group as GroupRow).payment_qr_key,
            qrMime: (group as GroupRow).payment_qr_mime,
          },
          { text, ...(newQr && { newQr }), removeQr: input.removeQr },
        );
        const row = await this.groups.updatePaymentInfo(tx, groupId, plan.next);
        return { row, obsoleteQrKey: plan.obsoleteQrKey };
      });
    } catch (error) {
      if (newQr) await this.discard(newQr.key, 'tras una actualización fallida');
      throw error;
    }

    // Confirmado: el QR anterior ya no lo usa nadie.
    if (saved.obsoleteQrKey) await this.discard(saved.obsoleteQrKey, 'reemplazado');
    return this.view(saved.row);
  }

  /** Texto, QR firmado y `configured` de un grupo; para un miembro que consulta. */
  async view(
    group: Pick<GroupRow, 'payment_info_text' | 'payment_qr_key'>,
  ): Promise<PaymentInfoView> {
    const qrUrl = await this.signedQrUrl(group.payment_qr_key);
    return {
      text: group.payment_info_text,
      qrUrl,
      configured: group.payment_info_text !== null || group.payment_qr_key !== null,
    };
  }

  /** URL firmada de 10 minutos; si el almacén falla se responde sin QR en lugar de romper la vista. */
  async signedQrUrl(qrKey: string | null): Promise<string | null> {
    if (qrKey === null) return null;
    try {
      return await this.storage.signedUrl(qrKey, PAYMENT_QR_URL_TTL_SECONDS);
    } catch {
      this.logger.warn('No se pudo firmar el QR de pago de un grupo.');
      return null;
    }
  }

  private checkText(raw: string | undefined): string | null | undefined {
    if (raw === undefined) return undefined;
    const check = normalizePaymentText(raw);
    if (!check.ok) throw validationError('text', 'TOO_LONG');
    return check.value;
  }

  private checkQr(
    bytes: Uint8Array | undefined,
    removeQr: boolean,
  ): { type: 'jpeg' | 'png' } | null {
    if (bytes === undefined) return null;
    if (removeQr) throw validationError('removeQr', 'CONFLICTS_WITH_QR');
    const check = checkPaymentQr(bytes);
    if (check.ok) return { type: check.type };
    if (check.reason === 'empty') throw validationError('qr', 'EMPTY_FILE');
    if (check.reason === 'too_large') {
      throw new DomainError(ErrorCode.FILE_TOO_LARGE, 413, DEFAULT_MESSAGES.FILE_TOO_LARGE);
    }
    throw new DomainError(
      ErrorCode.UNSUPPORTED_FILE_TYPE,
      415,
      'Solo se aceptan imágenes JPG o PNG.',
    );
  }

  private assertWritable(group: GroupRow | null): void {
    if (!group) throw notFound();
    if (group.status === 'cerrado') throw groupClosed();
    if (group.frozen_at !== null) throw groupFrozen();
  }

  /** El archivo sobrante se borra; si el borrado falla queda uno privado sin referencia. */
  private async discard(key: string, why: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      this.logger.warn(`No se pudo borrar un archivo de QR de pago (${why}).`);
    }
  }
}
