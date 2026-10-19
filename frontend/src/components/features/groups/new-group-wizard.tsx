'use client';

import { useEffect, useRef, useState } from 'react';
import { PlanPicker } from '@/components/features/catalog/plan-picker';
import { ServicePicker } from '@/components/features/catalog/service-picker';
import { Alert, Button } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useCatalogService } from '@/hooks/use-catalog-service';
import { useCatalogServices } from '@/hooks/use-catalog-services';
import type { CreateGroupOutcome } from '@/hooks/use-create-group';
import { useHostEligibility, type UseHostEligibilityResult } from '@/hooks/use-host-eligibility';
import type { CatalogService } from '@/services/catalog';
import { isConnectionError } from '@/services/http';
import { GroupCreated } from './group-created';
import { HostEligibilityPanel } from './host-eligibility-panel';
import { NEW_GROUP_MESSAGES } from './new-group-errors';
import { NewGroupForm } from './new-group-form';
import type { NewGroupChoice } from './new-group-form-model';

export type { NewGroupChoice } from './new-group-form-model';

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

function EligibilityNotice({
  eligibility,
  onShowPanel,
}: {
  eligibility: UseHostEligibilityResult;
  onShowPanel: () => void;
}) {
  const { state, retry } = eligibility;
  if (state.status === 'error') {
    return (
      <Alert
        variant="error"
        title={NEW_GROUP_MESSAGES.eligibilityLoadFailed}
        action={
          <Button variant="secondary" onClick={retry} className="w-full sm:w-auto">
            Reintentar
          </Button>
        }
      >
        {isConnectionError(state.error)
          ? NEW_GROUP_MESSAGES.connection
          : 'Puedes seguir llenando los datos; lo volvemos a revisar al crear.'}
      </Alert>
    );
  }
  if (state.status !== 'success') return null;
  const { eligible, canCreateMore } = state.eligibility;
  if (eligible && canCreateMore) return null;
  return (
    <Alert
      variant="warning"
      title={eligible ? NEW_GROUP_MESSAGES.tooManyGroups : NEW_GROUP_MESSAGES.notEligible}
      action={
        <Button variant="secondary" onClick={onShowPanel} className="w-full sm:w-auto">
          Ver qué me falta
        </Button>
      }
    >
      Puedes ver los servicios y planes, pero no crear la suscripción.
    </Alert>
  );
}

export interface NewGroupWizardProps {
  /** Se llama al terminar el paso 2 (o al elegir «personalizado»), antes del paso 3. */
  onComplete?: (choice: NewGroupChoice) => void;
}

/**
 * Asistente de `/grupos/nuevo` (plan 001 §6): 1) servicio o personalizado, 2) plan (spec 004
 * T011), 3) datos del grupo (spec 001 T016). Si el usuario no está habilitado como titular
 * (RF-001-21) o ya tiene 5 grupos activos (RN-001-14), abre el panel que explica qué falta.
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
  const eligibility = useHostEligibility();
  const [panelDismissed, setPanelDismissed] = useState(false);
  const [created, setCreated] = useState<CreateGroupOutcome | null>(null);
  const eligibilityData =
    eligibility.state.status === 'success' ? eligibility.state.eligibility : null;
  const blocked =
    eligibilityData !== null && !(eligibilityData.eligible && eligibilityData.canCreateMore);

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

  if (created) return <GroupCreated group={created.group} qrError={created.qrError} />;

  return (
    <div className="flex flex-col gap-6">
      {eligibilityData && (
        <HostEligibilityPanel
          open={blocked && !panelDismissed}
          onClose={() => setPanelDismissed(true)}
          eligibility={eligibilityData}
        />
      )}
      <EligibilityNotice eligibility={eligibility} onShowPanel={() => setPanelDismissed(false)} />
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
            <ChoiceSummary choice={current.choice} />
            <NewGroupForm
              choice={current.choice}
              blocked={blocked}
              onBack={() => {
                const { choice } = current;
                if ('custom' in choice) setCurrent({ step: 1 });
                else setCurrent({ step: 2, service: choice.service });
              }}
              onCreated={setCreated}
              onEligibilityProblem={() => {
                eligibility.retry();
                setPanelDismissed(false);
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}
