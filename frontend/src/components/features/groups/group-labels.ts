import type { BadgeVariant } from '@/components/ui';
import type { GroupRole, GroupStatus, GroupFrozenReason } from '@/services/groups';

/** Texto visible del rol del usuario en un grupo. */
export const ROLE_LABEL: Record<GroupRole, string> = { titular: 'Titular', miembro: 'Miembro' };

export const ROLE_BADGE: Record<GroupRole, BadgeVariant> = {
  titular: 'success',
  miembro: 'neutral',
};

/** El titular no tiene cobro propio: su cuota es solo de referencia (CA-001-21). */
export function shareLabel(isReference: boolean): string {
  return isReference ? 'Cuota de referencia' : 'Tu cuota';
}

export interface GroupStatusTag {
  variant: BadgeVariant;
  label: string;
}

/** Etiquetas del estado que entrega la API; no deduce nada más. */
export function groupStatusTags(
  status: GroupStatus,
  frozenReason: GroupFrozenReason,
): GroupStatusTag[] {
  const tags: GroupStatusTag[] = [];
  if (status === 'cerrado') tags.push({ variant: 'neutral', label: 'Cerrado' });
  if (frozenReason === 'titular_baneado')
    tags.push({ variant: 'danger', label: 'Titular baneado' });
  if (tags.length === 0) tags.push({ variant: 'success', label: 'Activo' });
  return tags;
}
