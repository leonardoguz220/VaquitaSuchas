import { Button, Card } from '@/components/ui';
import { GROUPS_PATH } from '@/lib/routes';
import type { HostEligibility } from '@/services/groups';
import { formatDecimal } from './group-messages';

/** Indica si la persona puede usar el asistente: habilitada y con cupo de grupos activos. */
export function canCreateGroups(eligibility: HostEligibility): boolean {
  return eligibility.eligible && eligibility.canCreateMore;
}

/** Título del panel según lo que falta. */
export function hostEligibilityTitle(eligibility: HostEligibility): string {
  return eligibility.eligible
    ? 'Ya tienes el máximo de grupos como titular'
    : 'Todavía no puedes crear suscripciones';
}

function currentStatus(current: HostEligibility['current']): string {
  if (current.stars === null || current.consideredCharges === 0) {
    return 'Todavía no tienes cobros considerados para tu calificación.';
  }
  const level = current.level ? ` (${current.level})` : '';
  return `Hoy tienes ${formatDecimal(current.stars)} estrellas${level} con ${current.consideredCharges} cobros considerados.`;
}

/**
 * Explicación de qué falta para crear una suscripción (RF-001-21, RN-001-14): la calificación
 * que pide `GET /users/me/host-eligibility` o el máximo de grupos activos como titular. Solo
 * muestra los datos de la API; no decide nada.
 */
export function HostEligibilityExplanation({ eligibility }: { eligibility: HostEligibility }) {
  const { requirement } = eligibility;
  if (eligibility.eligible) {
    return (
      <p>
        Tienes {eligibility.activeGroups} de {eligibility.maxActiveGroups} grupos activos como
        titular. Para crear otro, cierra o transfiere uno de los que ya tienes.
      </p>
    );
  }
  return (
    <>
      <p>
        Para ser titular necesitas una calificación de{' '}
        <strong>{formatDecimal(requirement.minStars)} estrellas o más</strong> con al menos{' '}
        <strong>{requirement.minConsideredCharges} cobros considerados</strong> en los últimos{' '}
        {requirement.windowMonths} meses, o que un administrador te habilite.
      </p>
      <p className="text-muted">{currentStatus(eligibility.current)}</p>
      <p className="text-muted">
        Mientras tanto puedes entrar a otros grupos como miembro y pagar a tiempo para subir tu
        calificación.
      </p>
    </>
  );
}

/** Panel de `/grupos/nuevo` cuando no se puede crear una suscripción (plan 001 §6). */
export function HostEligibilityPanel({ eligibility }: { eligibility: HostEligibility }) {
  return (
    <Card as="section" aria-labelledby="host-eligibility-title" className="flex flex-col gap-4">
      <h2 id="host-eligibility-title" className="font-display text-xl font-bold">
        {hostEligibilityTitle(eligibility)}
      </h2>
      <HostEligibilityExplanation eligibility={eligibility} />
      <Button href={GROUPS_PATH} variant="secondary" className="w-full sm:w-auto sm:self-start">
        Volver a mis suscripciones
      </Button>
    </Card>
  );
}
