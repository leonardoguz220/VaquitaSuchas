import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { FileStorage } from '../../../shared/ports/file-storage.js';
import {
  checkQrFile,
  normalizePaymentText,
  QR_URL_TTL_SECONDS,
  qrStorageKey,
} from '../domain/payment-info.js';
import { GroupsRepository, type GroupRow } from '../repositories/groups.repository.js';
import { assertGroupWritable, fieldsError } from './group-errors.js';

export interface UpdatePaymentInfoInput {
  /** `undefined` conserva el texto; vacío lo borra. */
  text?: string;
  qrBytes?: Uint8Array;
  removeQr?: boolean;
}

export interface PaymentInfoView {
  text: string | null;
  qrUrl: string | null;
  configured: boolean;
}

/** Datos de pago del grupo: texto y QR (RF-001-20). */
@Injectable()
export class PaymentInfoService {
  private readonly logger = new Logger(PaymentInfoService.name);

  constructor(
    private readonly db: DbService,
    private readonly groups: GroupsRepository,
    private readonly storage: FileStorage,
  ) {}

  /** URL firmada de 10 minutos del QR; solo se pide al consultar un miembro. `null` si no hay o falla. */
  async qrUrl(group: Pick<GroupRow, 'payment_qr_key'>): Promise<string | null> {
    if (!group.payment_qr_key) return null;
    try {
      return await this.storage.signedUrl(group.payment_qr_key, QR_URL_TTL_SECONDS);
    } catch {
      this.logger.warn('No se pudo firmar la URL del QR de pago.');
      return null;
    }
  }

  async view(group: GroupRow): Promise<PaymentInfoView> {
    const qrUrl = await this.qrUrl(group);
    return {
      text: group.payment_info_text,
      qrUrl,
      configured: group.payment_info_text !== null || qrUrl !== null,
    };
  }

  /**
   * `PUT /groups/:id/payment-info`. Valida texto, tamaño y tipo real antes de tocar nada; sube el QR
   * nuevo, actualiza la fila y solo entonces borra el QR anterior: si algo falla se conserva el anterior.
   */
  async update(
    groupId: string,
    input: UpdatePaymentInfoInput,
  ): Promise<{ paymentInfo: PaymentInfoView }> {
    const fields: Record<string, string[]> = {};
    let text: string | null | undefined;
    if (input.text !== undefined) {
      const normalized = normalizePaymentText(input.text);
      if (normalized) text = normalized.text;
      else fields['text'] = ['TOO_LONG'];
    }
    if (input.qrBytes !== undefined && input.removeQr) fields['removeQr'] = ['CONFLICTS_WITH_QR'];
    if (Object.keys(fields).length > 0) throw fieldsError(fields);

    let upload: { key: string; mime: string } | null = null;
    if (input.qrBytes !== undefined) {
      const check = checkQrFile(input.qrBytes);
      if (!check.ok) throw this.fileError(check.reason);
      upload = { key: qrStorageKey(groupId, randomUUID(), check.extension), mime: check.mime };
      try {
        await this.storage.put(upload.key, input.qrBytes, { contentType: upload.mime });
      } catch {
        this.logger.warn('El almacén de archivos falló al guardar un QR de pago.');
        throw new DomainError(
          ErrorCode.SERVICE_UNAVAILABLE,
          503,
          DEFAULT_MESSAGES.SERVICE_UNAVAILABLE,
        );
      }
    }

    let result: { previousKey: string | null; row: GroupRow };
    try {
      result = await this.db.withTransaction(async (tx) => {
        const group = await this.groups.findByIdForUpdate(tx, groupId);
        if (!group) throw new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);
        assertGroupWritable(group);
        const qr = upload ?? (input.removeQr ? null : undefined);
        await this.groups.updatePaymentInfo(tx, groupId, {
          ...(text !== undefined && { text }),
          ...(qr !== undefined && { qr }),
        });
        const row = (await this.groups.findById(tx, groupId)) as GroupRow;
        return { previousKey: group.payment_qr_key, row };
      });
    } catch (error) {
      if (upload) await this.discard(upload.key);
      throw error;
    }

    if (result.previousKey && result.previousKey !== result.row.payment_qr_key) {
      await this.discard(result.previousKey);
    }
    return { paymentInfo: await this.view(result.row) };
  }

  private async discard(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      this.logger.warn('No se pudo borrar un archivo QR del almacén.');
    }
  }

  private fileError(reason: 'empty' | 'too_large' | 'unsupported_type'): DomainError {
    if (reason === 'empty') return fieldsError({ qr: ['EMPTY_FILE'] });
    if (reason === 'too_large') {
      return new DomainError(ErrorCode.FILE_TOO_LARGE, 413, DEFAULT_MESSAGES.FILE_TOO_LARGE);
    }
    return new DomainError(
      ErrorCode.UNSUPPORTED_FILE_TYPE,
      415,
      'Solo se aceptan imágenes JPG o PNG.',
    );
  }
}
