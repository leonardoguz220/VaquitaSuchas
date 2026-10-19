'use client';

import { useEffect, useRef, useState } from 'react';
import { PlanPicker } from '@/components/features/catalog/plan-picker';
import { ServicePicker } from '@/components/features/catalog/service-picker';
import { Button } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useCatalogService } from '@/hooks/use-catalog-service';
import { useCatalogServices } from '@/hooks/use-catalog-services';
import type { CatalogPlan, CatalogService } from '@/services/catalog';

/** Resultado de los pasos 1 y 2: un plan del catálogo o un servicio personalizado (RF-004-09). */
export type NewGroupChoice = { service: CatalogService; plan: CatalogPlan } | { custom: true };

type WizardStep =
  { step: 1 } | { step: 2; service: CatalogService } | { step: 3; choice: NewGroupChoice };

const STEP_NAMES = ['servicio', 'plan', 'datos del grupo'] as const;

function serviceSummary(current: WizardStep): string | null {
  if (current.step === 2) return current.service.name;
  if (current.step === 3) {
    return 'custom' in current.choice ? 'Personalizado' : current.choice.service.name;
  }
  return null;
}

function StepList({ current }: { current: WizardStep }) {
  const service = serviceSummary(current);
  const plan = current.step === 3 && 'plan' in current.choice ? current.choice.plan.name : null;
  const done = [service && `Servicio: ${service}`, plan && `Plan: ${plan}`];
  const labels = ['Servicio', 'Plan', 'Datos del grupo'];

  return (
    <ol aria-label="Pasos" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {labels.map((label, index) => {
        const number = index + 1;
        const isCurrent = number === current.step;
        const isDone = number < current.step;
        return (
          <li
            key={label}
            aria-current={isCurrent ? 'step' : undefined}
            className={cx(
              'flex items-center gap-2',
              isDone && 'font-bold text-status-pagado-fg',
              isCurrent && 'font-bold text-ink',
              !isDone && !isCurrent && 'text-muted',
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                'inline-flex size-7 items-center justify-center rounded-full',
                isDone && 'bg-status-pagado-bg',
                isCurrent && 'bg-primary text-white',
                !isDone && !isCurrent && 'border-2 border-field-border',
              )}
            >
              {isDone ? '✓' : number}
            </span>
            {isDone ? (done[index] ?? label) : label}
            {isDone && <span className="sr-only"> (hecho)</span>}
          </li>
        );
      })}
    </ol>
  );
}

function ChoiceSummary({ choice }: { choice: NewGroupChoice }) {
  const rows =
    'custom' in choice
      ? [{ label: 'Servicio', value: 'Personalizado' }]
      : [
          { label: 'Servicio', value: choice.service.name },
          { label: 'Plan', value: choice.plan.name },
        ];
  return (
    <ul aria-label="Lo que elegiste" className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.label} className="flex flex-wrap gap-x-2">
          <span className="text-muted">{row.label}:</span>
          <strong>{row.value}</strong>
        </li>
      ))}
    </ul>
  );
}

export interface NewGroupWizardProps {
  /** Se llama al terminar el paso 2 (o al elegir «personalizado»), antes del paso 3. */
  onComplete?: (choice: NewGroupChoice) => void;
}

/**
 * Asistente de `/grupos/nuevo` (plan 001 §6): 1) servicio o personalizado, 2) plan, 3) datos del
 * grupo. Esta versión hace los pasos 1 y 2 (spec 004 T011); el 3 llega con la spec 001 (T016).
 * El paso vive en el cliente: «Volver» no pierde la lista ya cargada.
 */
export function NewGroupWizard({ onComplete }: NewGroupWizardProps) {
  const [current, setCurrent] = useState<WizardStep>({ step: 1 });
  /** Plan elegido la última vez, para dejarlo marcado al volver desde el paso 3. */
  const [lastPlanSlug, setLastPlanSlug] = useState<string | undefined>(undefined);
  const catalog = useCatalogServices();
  const selectedSlug =
    current.step === 2
      ? current.service.slug
      : current.step === 3 && 'plan' in current.choice
        ? current.choice.service.slug
        : null;
  const detail = useCatalogService(selectedSlug);

  // Al cambiar de paso, el foco va al título del paso (no al montar la página).
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [current]);

  function complete(choice: NewGroupChoice) {
    onComplete?.(choice);
    setLastPlanSlug('plan' in choice ? choice.plan.slug : undefined);
    setCurrent({ step: 3, choice });
  }

  function backToServices({ reload = false } = {}) {
    if (reload) catalog.retry();
    setCurrent({ step: 1 });
  }

  const title =
    current.step === 1
      ? 'Elige el servicio'
      : current.step === 2
        ? `Elige el plan de ${current.service.name}`
        : 'Datos del grupo';

  return (
    <div className="flex flex-col gap-6">
      <StepList current={current} />
      <section
        aria-labelledby="paso-actual"
        className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 sm:p-6"
      >
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold text-muted">
            Paso {current.step} de 3: {STEP_NAMES[current.step - 1]}
          </p>
          <h2
            id="paso-actual"
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-2xl leading-tight font-bold focus:outline-none"
          >
            {title}
          </h2>
        </div>

        {current.step === 1 && (
          <ServicePicker
            catalog={catalog}
            onSelect={(service) => setCurrent({ step: 2, service })}
            onCustom={() => complete({ custom: true })}
          />
        )}

        {current.step === 2 && (
          <>
            <PlanPicker
              detail={detail}
              onSelect={(plan) => {
                if (detail.state.status === 'success') {
                  complete({ service: detail.state.service, plan });
                }
              }}
              onBack={() => backToServices({ reload: true })}
              defaultPlanSlug={lastPlanSlug}
            />
            <Button
              variant="secondary"
              onClick={() => backToServices()}
              className="w-full sm:w-auto sm:self-start"
            >
              Volver
            </Button>
          </>
        )}

        {current.step === 3 && (
          <>
            {/* spec 001 T016: datos del grupo */}
            <ChoiceSummary choice={current.choice} />
            <Button
              variant="secondary"
              onClick={() => {
                const { choice } = current;
                if ('custom' in choice) setCurrent({ step: 1 });
                else setCurrent({ step: 2, service: choice.service });
              }}
              className="w-full sm:w-auto sm:self-start"
            >
              Volver
            </Button>
          </>
        )}
      </section>
    </div>
  );
}
