import { Alert, Card } from '@/components/ui';
import type { ReputationDetail } from '@/services/reputation';
import { hostEligibleText, hostMissingLines, REPUTATION_MESSAGES } from './reputation-messages';

function EligibleAlert({ detail }: { detail: ReputationDetail }) {
  const bySource = detail.host.source === 'manual';
  return (
    <Alert variant="success" title={REPUTATION_MESSAGES.hostEligible}>
      {bySource ? REPUTATION_MESSAGES.hostBySource : hostEligibleText(detail)}
    </Alert>
  );
}

function NotEligibleAlert({ detail }: { detail: ReputationDetail }) {
  const lines = hostMissingLines(detail.host, detail.consideredCount);
  return (
    <Alert variant="warning" title={REPUTATION_MESSAGES.hostNotEligible}>
      {lines.length > 0 && (
        <ul aria-label="Lo que falta para ser titular" className="mb-2 list-disc pl-5">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <p>{REPUTATION_MESSAGES.hostOtherOption}</p>
    </Alert>
  );
}

/**
 * Estado de la habilitación como titular (RF-007-15 a 17, CA-007-20): si puede crear suscripciones
 * y, si no, qué le falta según `host.missing`. Las cifras vienen de la API.
 */
export function HostStatusCard({ detail }: { detail: ReputationDetail }) {
  return (
    <Card as="section" aria-labelledby="host-title" className="flex flex-col gap-4">
      <h2 id="host-title" className="font-display text-xl font-bold">
        {REPUTATION_MESSAGES.hostTitle}
      </h2>
      {detail.host.eligible ? (
        <EligibleAlert detail={detail} />
      ) : (
        <NotEligibleAlert detail={detail} />
      )}
    </Card>
  );
}
