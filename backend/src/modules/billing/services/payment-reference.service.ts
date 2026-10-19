import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { normalizeReference } from '../domain/reference.js';
import {
  PaymentReferencesRepository,
  type ReferenceSource,
} from '../repositories/payment-references.repository.js';

export interface ReserveReferenceInput {
  groupId: string;
  /** Texto como lo escribió la persona; aquí se normaliza. */
  reference: string;
  sourceType: ReferenceSource;
  sourceId: string;
}

/**
 * Reserva única de referencias de pago por grupo (RN-010-14, RF-002-07). La comparten los
 * comprobantes de cobros (spec 002) y los de solicitudes de ingreso (spec 010). Todos los métodos
 * reciben la transacción del llamador: la reserva se confirma o se revierte junto con su hecho.
 */
@Injectable()
export class PaymentReferenceService {
  constructor(private readonly references: PaymentReferencesRepository) {}

  /** Clave normalizada de la referencia; `VALIDATION_ERROR` (400) si no es válida. */
  normalize(reference: string): string {
    const key = normalizeReference(reference);
    if (key === null) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
        fields: { reference: ['INVALID_REFERENCE'] },
      });
    }
    return key;
  }

  /**
   * Reserva la referencia en el grupo y devuelve su clave. `REFERENCE_ALREADY_USED` (409) si otra
   * reserva activa ya la tiene; una referencia liberada o de otro grupo se acepta (CA-002-27).
   */
  async reserve(q: Queryable, input: ReserveReferenceInput): Promise<string> {
    const referenceKey = this.normalize(input.reference);
    const reserved = await this.references.reserve(q, {
      groupId: input.groupId,
      referenceKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
    if (!reserved) throw referenceAlreadyUsed();
    return referenceKey;
  }

  /** Libera las reservas activas de un comprobante o solicitud (rechazo, reemplazo, cancelación). */
  release(q: Queryable, sourceType: ReferenceSource, sourceId: string, now: Date): Promise<number> {
    return this.references.release(q, sourceType, sourceId, now);
  }

  /** ¿La referencia ya está reservada en el grupo? Sirve para fallar antes de guardar el archivo. */
  isReserved(q: Queryable, groupId: string, reference: string): Promise<boolean> {
    return this.references.isReserved(q, groupId, this.normalize(reference));
  }
}

export const referenceAlreadyUsed = (): DomainError =>
  new DomainError('REFERENCE_ALREADY_USED', 409, 'Esa referencia ya fue usada en este grupo.', {
    rule: 'RN-010-14',
  });
