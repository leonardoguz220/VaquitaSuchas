import { DomainError } from '../../../shared/errors/domain-error.js';
import { ErrorCode } from '../../../shared/errors/error-codes.js';
import type { OpenRequestRule } from './can-open-request.js';

// Orden en que se informa la primera regla incumplida (el contrato devuelve una sola).
const PRIORITY: readonly OpenRequestRule[] = [
  'account_restricted',
  'group_not_active',
  'already_member',
  'group_frozen',
  'group_not_accepting',
  'window_closed',
  'no_slots',
  'open_charges',
  'active_request_in_group',
  'too_many_active_requests',
];

/** Error del contrato (`contracts/api.md`, POST /join-requests) para la primera regla incumplida. */
export function openRequestError(
  broken: readonly OpenRequestRule[],
  opensAt: Date | null,
): DomainError {
  const first = PRIORITY.find((rule) => broken.includes(rule));
  switch (first) {
    case 'account_restricted':
      return new DomainError(
        'ACCOUNT_RESTRICTED',
        403,
        'Tu cuenta está restringida y no puede abrir solicitudes.',
        { rule: 'RF-009-10' },
      );
    case 'group_not_active':
      return new DomainError('INVALID_INVITE_CODE', 422, 'Código inválido.', { rule: 'RF-001-07' });
    case 'already_member':
      return new DomainError('ALREADY_MEMBER', 422, 'Ya perteneces a este grupo.', {
        rule: 'RN-001-05',
      });
    case 'group_frozen':
      return new DomainError(
        'GROUP_FROZEN',
        422,
        'El grupo está congelado y solo se puede consultar.',
        {
          rule: 'RF-009-22',
        },
      );
    case 'group_not_accepting':
      return new DomainError('GROUP_NOT_ACCEPTING', 422, 'El grupo no está recibiendo miembros.', {
        rule: 'RF-001-09',
      });
    case 'window_closed':
      return new DomainError(
        'ENTRY_WINDOW_CLOSED',
        422,
        'El grupo no recibe ingresos en este momento.',
        { rule: 'RF-001-22', opensAt: opensAt ? opensAt.toISOString() : null },
      );
    case 'no_slots':
      return new DomainError('NO_SLOTS_AVAILABLE', 422, 'El grupo no tiene cupos disponibles.', {
        rule: 'RN-010-02',
      });
    case 'open_charges':
      return new DomainError(
        'OPEN_CHARGES_IN_GROUP',
        422,
        'Tienes cobros abiertos en este grupo y no puedes volver a solicitar el ingreso.',
        { rule: 'RN-010-13' },
      );
    case 'active_request_in_group':
      return new DomainError(
        'ACTIVE_REQUEST_EXISTS',
        422,
        'Ya tienes una solicitud activa en este grupo.',
        { rule: 'RF-010-02' },
      );
    case 'too_many_active_requests':
      return new DomainError('TOO_MANY_ACTIVE_REQUESTS', 422, 'Ya tienes 5 solicitudes activas.', {
        rule: 'RF-010-02',
      });
    default:
      return new DomainError(ErrorCode.BUSINESS_RULE, 422, 'No se puede abrir la solicitud.');
  }
}
