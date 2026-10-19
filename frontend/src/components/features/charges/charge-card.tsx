import Link from 'next/link';
import { ServiceLogo } from '@/components/features/catalog/ServiceLogo';
import { Badge } from '@/components/ui';
import { formatPeriod } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import type { MyCharge } from '@/services/charges';
import {
  chargePath,
  dueLine,
  FORMER_MEMBER_NOTICE,
  showsFormerMemberNotice,
} from './charge-labels';

/**
 * Tarjeta de `/cobros` (RF-002-15; mockup `MisCobros.dc.html`): servicio, monto, vencimiento e
 * insignia de estado con color y texto, todo tal como lo entrega `GET /me/charges`.
 */
export function ChargeCard({ charge }: { charge: MyCharge }) {
  const { group } = charge;
  return (
    <Link
      href={chargePath(charge.id)}
      className="flex min-h-11 flex-col gap-3 rounded-card border-[1.5px] border-line bg-surface p-4 text-ink no-underline transition-colors hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:p-5"
    >
      <span className="flex items-start gap-3">
        <ServiceLogo name={group.serviceName} logoUrl={group.logoUrl} brandColor={null} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-lg leading-tight font-bold break-words">
            {group.name}
          </span>
          <span className="text-[15px] text-muted">
            {`${group.serviceName} · ${formatPeriod(charge.period)}`}
          </span>
          <span className="text-[15px] text-muted">{dueLine(charge)}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-2">
          <span className="font-display text-xl font-bold">{formatBs(charge.amountCents)}</span>
          <Badge variant={charge.status} />
        </span>
      </span>
      {showsFormerMemberNotice(charge) && (
        <span className="flex items-start gap-2 rounded-field bg-status-atrasado-bg p-3 text-[15px] font-bold text-status-atrasado-fg">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="mt-0.5 size-4 shrink-0"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 1.8 19 18H1L10 1.8Zm-.9 5.7v5h1.8v-5H9.1Zm.9 8.3a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z"
            />
          </svg>
          {FORMER_MEMBER_NOTICE}
        </span>
      )}
    </Link>
  );
}
