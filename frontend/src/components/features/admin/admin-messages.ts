/**
 * Textos del panel de administración (plan 009 §6). Los errores se eligen por `code` y estado
 * HTTP, nunca por `message` (contrato 000 A.2). Nada aquí decide permisos: el backend responde
 * `403` a quien no es administrador (RNF-009-01) y la pantalla lo explica.
 */
import type { BadgeIcon, BadgeTone } from '@/components/ui';
import { isConnectionError, type ApiError } from '@/services/http';
import {
  ADMIN_REASON_MAX,
  ADMIN_REASON_MIN,
  type AdminUserRole,
  type AdminUserStatus,
} from '@/services/admin-users';
import { REGISTER_ERROR_MESSAGES } from '../auth/register-errors';

export const ADMIN_MESSAGES = {
  connection: REGISTER_ERROR_MESSAGES.connection,
  unexpected: REGISTER_ERROR_MESSAGES.unexpected,
  forbidden:
    'Tu cuenta no tiene permiso de administrador. Si te quitaron el rol hace poco, vuelve a tu panel.',
  audited: 'Queda en auditoría con tu nombre.',
} as const;

/** Mensaje de una carga que falló (que no es un `401`): `403` sin permiso, `404` o conexión. */
export function adminLoadErrorMessage(error: ApiError, notFound = 'No encontramos lo que buscas.') {
  if (error.statusCode === 403) return ADMIN_MESSAGES.forbidden;
  if (error.statusCode === 404) return notFound;
  return isConnectionError(error) ? ADMIN_MESSAGES.connection : ADMIN_MESSAGES.unexpected;
}

/** Regla del contrato 009 (`details.rule`) → código propio de la tabla «Errores propios». */
const RULE_CODES: Record<string, string> = {
  'RN-009-01': 'LAST_ADMIN',
  'RN-009-02': 'ADMIN_TARGET_FORBIDDEN',
  'RN-009-07': 'ADMIN_TARGET_FORBIDDEN',
  'RF-009-19': 'USER_BANNED',
  'RF-009-23': 'SAME_ADMIN',
  'RF-009-24': 'OWNER_NOT_SUSPENDED',
  'RF-001-17': 'NOT_A_MEMBER',
  'RF-001-21': 'NOT_HOST_ELIGIBLE',
  'RN-001-14': 'TOO_MANY_ACTIVE_GROUPS',
  'RN-010-09': 'JOIN_REQUESTS_IN_PAYMENT',
};

/**
 * Código de la regla incumplida. El contrato 009 la nombra como `code` propio (`LAST_ADMIN`…) y
 * también como `422 BUSINESS_RULE` con `details.rule` (`RN-009-01`); se aceptan las dos formas,
 * igual que en la spec 010. Con `details.code` se usa ese.
 */
export function adminErrorCode(error: ApiError): string {
  if (error.code !== 'BUSINESS_RULE') return error.code;
  if (typeof error.details?.code === 'string') return error.details.code;
  const rule = error.details?.rule;
  return (typeof rule === 'string' && RULE_CODES[rule]) || error.code;
}

export interface AdminActionOutcome {
  message: string;
  /** El estado cambió en el servidor: se vuelve a pedir la ficha y se cierra el modal. */
  refresh: boolean;
  /** El error es del motivo: se muestra junto al campo. */
  field: 'reason' | null;
}

/**
 * Error de una acción con motivo (contrato 009): `400` motivo, `422` `LAST_ADMIN`,
 * `ADMIN_TARGET_FORBIDDEN`, `USER_BANNED`, `SAME_ADMIN`, `409 INVALID_TRANSITION` o
 * `DISPUTE_NOT_OPEN`, `403` sin permiso y errores de conexión.
 */
export function adminActionOutcome(error: ApiError): AdminActionOutcome {
  const plain = (message: string, refresh = false): AdminActionOutcome => ({
    message,
    refresh,
    field: null,
  });
  if (error.statusCode === 403 && error.code !== 'BUSINESS_RULE') {
    return plain(ADMIN_MESSAGES.forbidden);
  }
  switch (adminErrorCode(error)) {
    case 'VALIDATION_ERROR':
      return { message: reasonLengthMessage(), refresh: false, field: 'reason' };
    case 'LAST_ADMIN':
      return plain('Debe existir al menos un administrador.');
    case 'ADMIN_TARGET_FORBIDDEN':
      return plain(
        'No puedes aplicar esta acción a ti mismo ni a otro administrador. Si es otro administrador, primero quítale el rol.',
      );
    case 'USER_BANNED':
      return plain(
        'La cuenta está baneada: reactivar no deshace un baneo. Otro administrador puede revertirlo.',
        true,
      );
    case 'SAME_ADMIN':
      return plain(
        'Quien baneó no puede revertir el baneo. Pide a otro administrador que lo revise.',
      );
    case 'OWNER_NOT_SUSPENDED':
      return plain('Solo se transfiere un grupo cuyo titular está suspendido.');
    case 'NOT_A_MEMBER':
      return plain('La persona elegida no es miembro activo de ese grupo. Elige a otra.');
    case 'NOT_HOST_ELIGIBLE':
      return plain(
        'La persona elegida no está habilitada como titular. Habilítala primero o elige a otra.',
      );
    case 'TOO_MANY_ACTIVE_GROUPS':
      return plain('La persona elegida ya es titular de 5 grupos activos. Elige a otra.');
    case 'JOIN_REQUESTS_IN_PAYMENT':
      return plain(
        'El grupo tiene solicitudes de ingreso en pago. Espera a que se resuelvan y vuelve a intentarlo.',
      );
    case 'INVALID_TRANSITION':
    case 'DISPUTE_NOT_OPEN':
    case 'CONFLICT':
      return plain(
        'El estado cambió mientras lo revisabas. Cargamos los datos actualizados.',
        true,
      );
    case 'NOT_FOUND':
      return plain('Ya no existe. Cargamos los datos actualizados.', true);
    default:
      return plain(
        isConnectionError(error) ? ADMIN_MESSAGES.connection : ADMIN_MESSAGES.unexpected,
      );
  }
}

/** Ayuda y error del motivo (RN-009-04, RN-009-07). */
export function reasonLengthMessage(): string {
  return `Escribe un motivo de ${ADMIN_REASON_MIN} a ${ADMIN_REASON_MAX} caracteres.`;
}

/** Texto, color e ícono de cada estado de cuenta: nunca solo el color. */
export const USER_STATUS_STYLE: Record<
  AdminUserStatus,
  { label: string; tone: BadgeTone; icon: BadgeIcon }
> = {
  activo: { label: 'Activo', tone: 'success', icon: 'check' },
  suspendido: { label: 'Suspendido', tone: 'warning', icon: 'clock' },
  baneado: { label: 'Baneado', tone: 'danger', icon: 'x' },
};

export const USER_ROLE_LABEL: Record<AdminUserRole, string> = {
  usuario: 'Usuario',
  admin: 'Administrador',
};
