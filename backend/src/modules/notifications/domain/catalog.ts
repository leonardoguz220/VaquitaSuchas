// Catálogo de avisos (plan.md §5). Es la única fuente de qué tipos existen, a quién llegan, en qué
// categoría caen y cuándo se pueden enviar por correo/Telegram. La parte A (MVP) solo crea la
// notificación dentro de la app; las partes B y C agregan tareas programadas y envíos por canal.

export const NOTIFICATION_CATEGORIES = [
  'recordatorios',
  'resoluciones',
  'titular',
  'grupo',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** `inmediato`: sin ventana horaria. `ventana`: el correo solo sale entre 08:00 y 20:00 de La Paz. */
export type SendTiming = 'inmediato' | 'ventana';

/** Parte de la spec en que se construye el aviso; `P2` lo producen specs posteriores. */
export type CatalogPart = 'A' | 'B' | 'C' | 'P2';

export type NotificationRecipient =
  | 'miembro'
  | 'titular'
  | 'miembro_retirado'
  | 'miembros_afectados'
  | 'miembros_del_grupo'
  | 'solicitante'
  | 'otra_parte'
  | 'parte_acusada'
  | 'ambas_partes';

export const NOTIFICATION_TYPES = [
  'cobro_generado',
  'pago_confirmado',
  'pago_rechazado',
  'retiro_por_mora',
  'retiro_por_mora_titular',
  'comprobante_subido',
  'miembro_se_une',
  'miembro_abandona',
  'miembro_quitado',
  'titularidad_cambiada',
  'grupo_cerrado',
  'titular_suspendido',
  'titular_baneado',
  'solicitud_nueva',
  'solicitud_comprobante',
  'solicitud_recordatorio_30',
  'solicitud_datos_pago',
  'solicitud_aceptada',
  'solicitud_rechazada',
  'solicitud_expirada',
  'solicitud_mensaje',
  'reclamo_abierto',
  'reclamo_resuelto',
  'publicacion_decision',
  'publicacion_oculta',
  'publicacion_transferida',
  'aviso_previo',
  'recordatorio_vencimiento',
  'comprobante_pendiente_48h',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Rol de quien recibe un aviso cuya categoría depende de si actúa como titular o como miembro. */
export type RecipientRole = 'titular' | 'miembro';

export interface CatalogEntry {
  readonly recipient: NotificationRecipient;
  /** Categoría base; si `byRole` existe, manda según el rol del destinatario. */
  readonly category: NotificationCategory;
  readonly byRole?: Readonly<Record<RecipientRole, NotificationCategory>>;
  readonly timing: SendTiming;
  readonly part: CatalogPart;
}

const entry = (
  recipient: NotificationRecipient,
  category: NotificationCategory,
  part: CatalogPart,
  timing: SendTiming = 'inmediato',
): CatalogEntry => ({ recipient, category, timing, part });

const roleBased = (recipient: NotificationRecipient): CatalogEntry => ({
  recipient,
  category: 'titular',
  byRole: { titular: 'titular', miembro: 'grupo' },
  timing: 'inmediato',
  part: 'A',
});

export const NOTIFICATION_CATALOG: Readonly<Record<NotificationType, CatalogEntry>> = {
  cobro_generado: entry('miembro', 'recordatorios', 'A'),
  pago_confirmado: entry('miembro', 'resoluciones', 'A'),
  pago_rechazado: entry('miembro', 'resoluciones', 'A'),
  retiro_por_mora: entry('miembro_retirado', 'grupo', 'A'),
  retiro_por_mora_titular: entry('titular', 'titular', 'A'),
  comprobante_subido: entry('titular', 'titular', 'A'),
  miembro_se_une: entry('titular', 'titular', 'A'),
  miembro_abandona: entry('titular', 'titular', 'A'),
  miembro_quitado: entry('miembros_afectados', 'grupo', 'A'),
  titularidad_cambiada: entry('miembros_afectados', 'grupo', 'A'),
  grupo_cerrado: entry('miembros_afectados', 'grupo', 'A'),
  titular_suspendido: entry('miembros_del_grupo', 'grupo', 'A'),
  titular_baneado: entry('miembros_del_grupo', 'grupo', 'A'),
  solicitud_nueva: entry('titular', 'titular', 'A'),
  solicitud_comprobante: entry('titular', 'titular', 'A'),
  solicitud_recordatorio_30: entry('titular', 'titular', 'A'),
  solicitud_datos_pago: entry('solicitante', 'grupo', 'A'),
  solicitud_aceptada: entry('solicitante', 'grupo', 'A'),
  solicitud_rechazada: entry('solicitante', 'grupo', 'A'),
  solicitud_expirada: entry('solicitante', 'grupo', 'A'),
  solicitud_mensaje: roleBased('otra_parte'),
  reclamo_abierto: roleBased('parte_acusada'),
  reclamo_resuelto: roleBased('ambas_partes'),
  publicacion_decision: entry('titular', 'titular', 'P2'),
  publicacion_oculta: entry('titular', 'titular', 'P2'),
  publicacion_transferida: entry('titular', 'titular', 'P2'),
  aviso_previo: entry('miembro', 'recordatorios', 'B', 'ventana'),
  recordatorio_vencimiento: entry('miembro', 'recordatorios', 'B', 'ventana'),
  comprobante_pendiente_48h: entry('titular', 'titular', 'B', 'ventana'),
};

export function isNotificationType(value: string): value is NotificationType {
  return Object.hasOwn(NOTIFICATION_CATALOG, value);
}

/** Categoría del aviso; los que dependen del rol exigen `role`. */
export function categoryFor(type: NotificationType, role?: RecipientRole): NotificationCategory {
  const item = NOTIFICATION_CATALOG[type];
  if (!item.byRole) return item.category;
  if (!role) throw new Error(`El aviso ${type} necesita el rol del destinatario.`);
  return item.byRole[role];
}
