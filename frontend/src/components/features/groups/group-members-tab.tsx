import { Badge, Card } from '@/components/ui';
import { formatDateLaPaz } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import type { GroupMember } from '@/services/groups';
import { ROLE_BADGE, ROLE_LABEL } from './group-labels';

/**
 * Pestaña «Miembros» del detalle (RF-001-19; mockup `GrupoMiembros.dc.html`): nombre, rol,
 * celular solo si la API lo entrega y fecha de ingreso.
 */
export function GroupMembersTab({ members }: { members: GroupMember[] }) {
  return (
    <Card as="section" aria-labelledby="group-members-title" className="flex flex-col gap-2">
      <h2 id="group-members-title" className="font-display text-xl font-bold">
        Miembros ({members.length})
      </h2>
      <ul aria-label="Miembros del grupo" className="flex flex-col divide-y divide-line">
        {members.map((member) => (
          <li key={member.userId} className="flex flex-col gap-1 py-3">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-bold break-words">{member.fullName}</span>
              <Badge variant={ROLE_BADGE[member.role]}>{ROLE_LABEL[member.role]}</Badge>
            </span>
            {member.phone && (
              <span className="text-[15px]">
                Celular: <span className="font-bold">{formatPhone(member.phone)}</span>
              </span>
            )}
            <span className="text-[15px] text-muted">
              Desde el {formatDateLaPaz(member.joinedAt)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
