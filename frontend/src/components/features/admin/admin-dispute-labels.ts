import type { AdminDisputeResult, AdminDisputeType } from '@/services/admin-disputes';

export const DISPUTE_TYPE_LABEL: Record<AdminDisputeType, string> = {
  pago_sin_ingreso: 'Pago sin ingreso',
  comprobante_falso: 'Comprobante falso',
};

export const DISPUTE_RESULT_LABEL: Record<AdminDisputeResult, string> = {
  estafa_confirmada: 'Estafa confirmada',
  sin_falta: 'Sin falta',
};

/** Qué pasa al resolver como estafa: el acusado queda baneado (RF-009-20, CA-009-25 y 30). */
export const DISPUTE_RESULT_EFFECT: Record<AdminDisputeResult, string> = {
  estafa_confirmada:
    'La persona acusada queda baneada: se bloquean su correo, celular, cédula y Telegram, y sus solicitudes activas se rechazan. Sus miembros reciben un aviso.',
  sin_falta: 'Ninguna cuenta cambia de estado. Las dos partes ven la decisión y el motivo.',
};
