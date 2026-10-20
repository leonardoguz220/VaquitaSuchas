import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { RuleFailure } from '../domain/admin-rules.js';
import { validateReason } from '../domain/reason.js';

const MESSAGES: Record<RuleFailure['code'], string> = {
  ADMIN_TARGET_FORBIDDEN:
    'No se puede aplicar esta acción a un administrador ni a uno mismo; primero hay que quitarle el rol.',
  USER_BANNED: 'La reactivación no deshace un baneo.',
  LAST_ADMIN: 'Debe existir al menos un administrador.',
  SAME_ADMIN: 'Solo otro administrador puede revertir este baneo.',
  INVALID_TRANSITION: 'El estado actual de la cuenta no admite esta acción.',
  ALREADY_REVOKED: 'El baneo ya estaba revertido.',
};

/** Traduce el resultado de las reglas puras al error del contrato (422 con regla, 409 en conflictos). */
export function ruleError(failure: RuleFailure): DomainError {
  const details = { rule: failure.rule };
  if (failure.code === 'INVALID_TRANSITION') {
    return new DomainError('INVALID_TRANSITION', 409, MESSAGES[failure.code], details);
  }
  if (failure.code === 'ALREADY_REVOKED') {
    return new DomainError(ErrorCode.CONFLICT, 409, MESSAGES[failure.code], details);
  }
  return new DomainError(failure.code, 422, MESSAGES[failure.code], details);
}

export const userNotFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);

/** Motivo de 10 a 300 caracteres tras recortar (RN-009-04); 400 con el código por campo si no. */
export function requireReason(text: unknown): string {
  const result = validateReason(text);
  if (!result.ok) {
    throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
      fields: { reason: ['REASON_LENGTH'] },
    });
  }
  return result.value;
}
