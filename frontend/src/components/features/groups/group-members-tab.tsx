import { Badge, Card } from '@/components/ui';
import { formatDateLaPaz } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import type { GroupDetail } from '@/services/groups';

/**
 * Pestaña **Miembros** de `/grupos/[id]` (plan 001 §6; mockup `GrupoMiembros.dc.html`): nombre,
 * rol, celular (solo lo ven el titular y los miembros activos, RN-003-03) y desde cuándo está.
 * Quitar miembros llega con la gestión del titular (spec 001 T029).
 */
export function GroupMembersTab({ group }: { group: GroupDetail }) {
  return (
    <Card as="section" aria-labelledby="group-members-title" className="flex flex-col gap-3">
      <h2 id="group-members-title" className="font-display text-xl font-bold">
        Miembros ({group.members.length})
      </h2>
      {group.members.length === 0 ? (
        <p className="text-muted">Todavía no hay miembros en este grupo.</p>
      ) : (
        <ul className="flex flex-col">
          {group.members.map((member) => (
            <li
              key={member.userId}
              className="flex flex-col gap-1 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex flex-wrap items-center gap-2">
                <strong>{member.fullName}</strong>
                {member.role === 'titular' && <Badge variant="success">Titular</Badge>}
              </span>
              <span className="flex flex-col text-[15px] text-muted sm:items-end">
                {member.phone && <span>{formatPhone(member.phone)}</span>}
                <span>Desde el {formatDateLaPaz(member.joinedAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
