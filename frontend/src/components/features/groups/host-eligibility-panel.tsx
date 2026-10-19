'use client';

import { Button, Modal } from '@/components/ui';
import type { HostEligibility } from '@/services/groups';

function formatDecimal(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

function Requirement({
  label,
  current,
  required,
}: {
  label: string;
  current: string;
  required: string;
}) {
  return (
    <li className="flex flex-col gap-1 rounded-field border border-line p-4">
      <span className="font-bold">{label}</span>
      <span>
        Tienes: <strong>{current}</strong>
      </span>
      <span>
        Se pide: <strong>{required}</strong>
      </span>
    </li>
  );
}

export interface HostEligibilityPanelProps {
  open: boolean;
  onClose: () => void;
  eligibility: HostEligibility;
}

/**
 * Panel de RF-001-21 y RN-001-14: explica qué le falta a quien no puede crear una suscripción,
 * con los datos de `GET /users/me/host-eligibility` tal cual (CA-001-24, CA-001-28).
 */
export function HostEligibilityPanel({ open, onClose, eligibility }: HostEligibilityPanelProps) {
  const { requirement, current } = eligibility;
  const footer = (
    <>
      <Button variant="secondary" href="/grupos" className="w-full sm:w-auto">
        Ir a Mis suscripciones
      </Button>
      <Button onClick={onClose} className="w-full sm:w-auto">
        Entendido
      </Button>
    </>
  );

  if (!eligibility.eligible) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Todavía no puedes crear suscripciones"
        description="Para ser titular necesitas una muy buena puntualidad en tus pagos o que un administrador te habilite."
        footer={footer}
      >
        <ul aria-label="Lo que se pide para ser titular" className="flex flex-col gap-3">
          <Requirement
            label="Estrellas de puntualidad"
            current={`${formatDecimal(current.stars)} (${current.level})`}
            required={`${formatDecimal(requirement.minStars)} o más`}
          />
          <Requirement
            label={`Cobros considerados en los últimos ${requirement.windowMonths} meses`}
            current={String(current.consideredCharges)}
            required={`${requirement.minConsideredCharges} o más`}
          />
        </ul>
        <p>
          <strong>Otra opción:</strong> que un administrador te habilite como titular.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Llegaste al límite de grupos"
      description={`Ya eres titular de ${eligibility.activeGroups} grupos activos y el máximo es ${eligibility.maxActiveGroups}.`}
      footer={footer}
    >
      <p>Para crear otro, cierra uno de tus grupos o transfiere su titularidad a otro miembro.</p>
      <p className="text-muted">Como miembro puedes estar en todos los grupos que quieras.</p>
    </Modal>
  );
}
