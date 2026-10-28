import type { BadgeTone } from '@/components/ui';
import type { ApiError } from '@/services/http';
import type {
  ExtraStatus,
  RefundStatus,
  RoundStatus,
  ShortfallChoice,
} from '@/services/shortfalls';

export const ROUND_LABEL: Record<RoundStatus, { text: string; tone: BadgeTone }> = {
  abierta: { text: 'Abierta', tone: 'warning' },
  cerrada: { text: 'Cerrada', tone: 'neutral' },
  cancelada: { text: 'Cancelada', tone: 'neutral' },
};

export const CHOICE_LABEL: Record<ShortfallChoice, string> = {
  pendiente: 'Sin responder',
  cubrir: 'Cubre su parte',
  devolucion: 'Pidió devolución',
  sin_respuesta: 'No respondió a tiempo',
};

export const EXTRA_LABEL: Record<ExtraStatus, string> = {
  no_aplica: '',
  pendiente_pago: 'Pago adicional pendiente',
  informado: 'Pago adicional informado',
  confirmado: 'Pago adicional confirmado',
  vencido: 'Pago adicional vencido',
};

export const REFUND_LABEL: Record<RefundStatus, string> = {
  no_aplica: '',
  pendiente: 'Devolución pendiente',
  enviada: 'Devolución registrada por el titular',
  confirmada: 'Devolución recibida',
  disputada: 'Devolución disputada',
};

/** Mensajes por código de error de la API (la interfaz decide por `code`, nunca por `message`). */
const ERROR_MESSAGE: Record<string, string> = {
  NO_SHORTFALL: 'No hay una diferencia que repartir entre los miembros.',
  ROUND_ALREADY_OPEN: 'Ya hay una ronda abierta en este grupo.',
  ROUND_LIMIT_REACHED: 'Ya se usaron las dos rondas permitidas para este período.',
  ROUND_HAS_RESPONSES: 'La ronda ya tiene respuestas y no se puede cancelar.',
  DEADLINE_PASSED: 'El plazo para esta acción venció.',
  GROUP_CLOSED: 'El grupo está cerrado y solo se puede consultar.',
  GROUP_FROZEN: 'El grupo está congelado y solo se puede consultar.',
  INVALID_TRANSITION: 'Esa acción ya no es válida. Actualizamos la pantalla.',
  STALE_STATE: 'La información cambió. Actualizamos la pantalla.',
  FORBIDDEN: 'No tienes permiso para hacer esto.',
  NOT_FOUND: 'No encontramos lo que buscas.',
};

export function shortfallErrorMessage(error: ApiError): string {
  return (
    ERROR_MESSAGE[error.code] ??
    (error.statusCode === 400
      ? 'Revisa los datos: la referencia y el motivo son obligatorios.'
      : 'Ocurrió un error inesperado. Inténtalo de nuevo.')
  );
}

/** Errores tras los que conviene volver a pedir los datos al servidor. */
export const REFRESH_CODES = new Set(['INVALID_TRANSITION', 'STALE_STATE', 'DEADLINE_PASSED']);
