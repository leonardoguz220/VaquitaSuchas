import type { AdminChargeStatus, AdminRole, AdminUserStatus } from '@/services/admin';

/** Texto e ícono de cada estado de cuenta: nunca solo color (RNF-009-02). */
export const USER_STATUS_LABEL: Record<AdminUserStatus, string> = {
  activo: '✓ Activo',
  suspendido: '⏸ Suspendido',
  baneado: '⛔ Baneado',
};

export const ROLE_LABEL: Record<AdminRole, string> = {
  usuario: 'Usuario',
  admin: 'Administrador',
};

/** Estados de cobro del tablero, con ícono y texto (los mismos rótulos de la spec 002). */
export const CHARGE_STATUS_LABEL: Record<AdminChargeStatus, string> = {
  pendiente: '… Pendientes',
  en_revision: '↻ En revisión',
  pagado: '✓ Pagados',
  atrasado: '! Atrasados',
  cancelado: '✕ Cancelados',
};

/** Mínimo y máximo del motivo de las acciones sensibles (RF-009-10, RF-009-19). */
export const REASON_LIMITS = { min: 10, max: 300 } as const;
