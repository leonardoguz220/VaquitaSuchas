import Link from 'next/link';
import { ServiceLogo } from '@/components/features/catalog/ServiceLogo';
import { Badge } from '@/components/ui';
import { formatCalendarDayLaPaz } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import type { GroupSummary } from '@/services/groups';
import { groupStatusTags, ROLE_BADGE, ROLE_LABEL, shareLabel } from './group-labels';

/**
 * Tarjeta de `/grupos` (RF-001-19; mockup `Grupos.dc.html`): todo sale de `GET /groups` tal
 * cual, incluida la cuota y si es de referencia (CA-001-20, CA-001-21).
 */
export function GroupCard({ group }: { group: GroupSummary }) {
  const tags = groupStatusTags(group.status, group.frozenReason);
  const inactive = group.status === 'cerrado';
  return (
    <Link
      href={`/grupos/${group.id}`}
      className="flex h-full min-h-11 flex-col gap-4 rounded-card border-[1.5px] border-line bg-surface p-4 text-ink no-underline transition-colors hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:p-5"
    >
      <span className="flex items-start gap-3">
        <ServiceLogo
          name={group.serviceName}
          logoUrl={group.logoUrl}
          brandColor={group.brandColor}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-lg leading-tight font-bold break-words">
            {group.name}
          </span>
          <span className="text-[15px] text-muted">{group.serviceName}</span>
        </span>
        <Badge variant={ROLE_BADGE[group.role]}>{ROLE_LABEL[group.role]}</Badge>
      </span>

      <span className="flex flex-col">
        <span className="text-[15px] text-muted">{shareLabel(group.myShareIsReference)}</span>
        <span className="font-display text-2xl font-bold">{formatBs(group.myShareCents)}</span>
      </span>

      <span className="flex flex-col gap-1 text-[15px]">
        <span>
          Miembros: <strong>{`${group.memberCount}/${group.totalSlots}`}</strong>
        </span>
        {!inactive && (
          <span>
            Próximo corte: <strong>{formatCalendarDayLaPaz(group.nextCutDate)}</strong>
          </span>
        )}
      </span>

      <span className="mt-auto flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge key={tag.label} variant={tag.variant}>
            {tag.label}
          </Badge>
        ))}
      </span>
    </Link>
  );
}
