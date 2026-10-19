'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PlanPicker } from '@/components/features/catalog/plan-picker';
import { ServicePicker } from '@/components/features/catalog/service-picker';
import { Alert, Button } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useHostEligibility, type CreateGroupOutcome } from '@/hooks/use-create-group';
import type { GroupFormContext, GroupFormValues } from '@/lib/group-form';
import { formatAmountInput } from '@/lib/money';
import { GROUPS_PATH, groupPath } from '@/lib/routes';
import type { CatalogPlan, CatalogService } from '@/services/catalog';
import { GROUP_MESSAGES, groupErrorMessage } from './group-messages';
import { GroupDetailsForm } from './group-details-form';
import { canCreateGroups, HostEligibilityPanel } from './host-eligibility-panel';
import { InviteCodeCard } from './invite-code-card';

type Selection =
  { kind: 'catalog'; service: CatalogService; plan: CatalogPlan | null } | { kind: 'custom' };

type Step = 'choose' | 'details' | 'done';

/** Clave de lo elegido en los pasos 1 y 2: si cambia, el formulario vuelve a sus valores propuestos. */
function selectionKey(selection: Selection | null): string | null {
  if (!selection) return null;
  if (selection.kind === 'custom') return 'custom';
  return selection.plan ? `plan:${selection.plan.slug}` : null;
}

function formContext(selection: Selection): GroupFormContext {
  if (selection.kind === 'custom' || !selection.plan) return { planSlug: null, planMaxSlots: null };
  return { planSlug: selection.plan.slug, planMaxSlots: selection.plan.maxSlots };
}

/** Valores propuestos: el precio, la moneda y los cupos del plan (RF-001-05), editables. */
function initialValues(selection: Selection): GroupFormValues {
  const base: GroupFormValues = {
    customServiceName: '',
    name: '',
    currency: 'BS',
    price: '',
    exchangeRate: '',
    billingDay: '',
    totalSlots: '2',
    paymentInfoText: '',
  };
  if (selection.kind === 'custom' || !selection.plan) return base;
  return {
    ...base,
    name: selection.service.name,
    currency: selection.plan.currency,
    price: formatAmountInput(selection.plan.priceCents),
    totalSlots: String(selection.plan.maxSlots),
  };
}

function Stepper({ step, selection }: { step: Step; selection: Selection | null }) {
  const serviceDone = selection !== null;
  const serviceLabel =
    selection?.kind === 'catalog'
      ? `Servicio: ${selection.service.name}`
      : selection?.kind === 'custom'
        ? 'Servicio: personalizado'
        : 'Servicio';
  const planLabel =
    selection?.kind === 'custom'
      ? 'Plan: no aplica'
      : selection?.kind === 'catalog' && selection.plan
        ? `Plan: ${selection.plan.name}`
        : 'Plan';
  const planDone = step !== 'choose';
  const items = [
    { label: serviceLabel, done: serviceDone },
    { label: planLabel, done: planDone },
    { label: 'Datos del grupo', done: step === 'done' },
  ];
  const currentIndex = step === 'choose' ? (serviceDone ? 1 : 0) : step === 'details' ? 2 : -1;

  return (
    <ol aria-label="Pasos" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px]">
      {items.map((item, index) => {
        const current = index === currentIndex;
        return (
          <li
            key={index}
            aria-current={current ? 'step' : undefined}
            className={cx(
              'inline-flex min-h-9 items-center gap-2 rounded-full px-3',
              current ? 'bg-ink font-bold text-white' : 'text-muted',
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                'inline-flex size-6 items-center justify-center rounded-full text-[13px] font-bold',
                item.done && !current ? 'bg-primary text-white' : 'border border-current',
              )}
            >
              {item.done && !current ? '✓' : index + 1}
            </span>
            <span>
              {item.done && !current && <span className="sr-only">Hecho: </span>}
              {item.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function WizardSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Cargando…</span>
      <div
        aria-hidden="true"
        className="h-40 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none"
      />
    </div>
  );
}

function CreatedView({ outcome }: { outcome: CreateGroupOutcome }) {
  const { group, qrError } = outcome;
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Alert variant="success" title={`Creaste «${group.name}».`}>
        Quedaste como titular. Comparte el código para que se sumen los miembros.
      </Alert>
      {qrError && <Alert variant="warning">{GROUP_MESSAGES.qrUploadFailed}</Alert>}
      {group.inviteCode && <InviteCodeCard code={group.inviteCode} groupName={group.name} />}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button href={groupPath(group.id)}>Ir al grupo</Button>
        <Button href={GROUPS_PATH} variant="secondary">
          Volver a mis suscripciones
        </Button>
      </div>
    </div>
  );
}

/**
 * Asistente `/grupos/nuevo` de 3 pasos (spec 001 T016, plan 001 §6; mockups
 * `NuevoGrupoServicio.dc.html` y `NuevoGrupo.dc.html`): 1) servicio del catálogo o
 * personalizado; 2) plan; 3) datos del grupo con la cotización del backend. Primero comprueba
 * la habilitación como titular; si falta algo, muestra el panel que lo explica (RF-001-21).
 */
export function CreateGroupWizard() {
  const eligibility = useHostEligibility();
  const [step, setStep] = useState<Step>('choose');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [form, setForm] = useState<{ key: string; values: GroupFormValues } | null>(null);
  const [qr, setQr] = useState<File | null>(null);
  const [outcome, setOutcome] = useState<CreateGroupOutcome | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Al cambiar de paso, el foco vuelve al título para que el lector de pantalla lo anuncie.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const key = selectionKey(selection);
  const canContinue = key !== null;

  function goToDetails() {
    if (!selection || !key) return;
    if (form?.key !== key) setForm({ key, values: initialValues(selection) });
    setStep('details');
  }

  function selectService(service: CatalogService) {
    setSelection((current) =>
      current?.kind === 'catalog' && current.service.slug === service.slug
        ? current
        : { kind: 'catalog', service, plan: null },
    );
  }

  function handleCreated(result: CreateGroupOutcome) {
    setOutcome(result);
    setStep('done');
  }

  let content: ReactNode;
  if (eligibility.status === 'loading' || eligibility.status === 'redirecting') {
    content = <WizardSkeleton />;
  } else if (eligibility.status === 'error' && eligibility.error) {
    content = (
      <Alert
        variant="error"
        title={GROUP_MESSAGES.eligibilityFailed}
        action={
          <Button variant="secondary" onClick={eligibility.reload}>
            Reintentar
          </Button>
        }
      >
        {groupErrorMessage(eligibility.error)}
      </Alert>
    );
  } else if (eligibility.data && !canCreateGroups(eligibility.data)) {
    content = <HostEligibilityPanel eligibility={eligibility.data} />;
  } else if (step === 'done' && outcome) {
    content = <CreatedView outcome={outcome} />;
  } else if (step === 'details' && selection && form) {
    content = (
      <GroupDetailsForm
        context={formContext(selection)}
        values={form.values}
        onValuesChange={(values) => setForm({ key: form.key, values })}
        qr={qr}
        onQrChange={setQr}
        onBack={() => setStep('choose')}
        onCreated={handleCreated}
      />
    );
  } else {
    content = (
      <div className="flex flex-col gap-8">
        <ServicePicker
          selectedSlug={selection?.kind === 'catalog' ? selection.service.slug : null}
          customSelected={selection?.kind === 'custom'}
          onSelectService={selectService}
          onSelectCustom={() => setSelection({ kind: 'custom' })}
        />
        {selection?.kind === 'catalog' && (
          <PlanPicker
            serviceSlug={selection.service.slug}
            selectedPlanSlug={selection.plan?.slug ?? null}
            onSelectPlan={(plan, service) => setSelection({ kind: 'catalog', service, plan })}
            onChangeService={() => setSelection(null)}
          />
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button href={GROUPS_PATH} variant="secondary">
            Cancelar
          </Button>
          <Button onClick={goToDetails} disabled={!canContinue}>
            Siguiente: datos del grupo
          </Button>
        </div>
        {!canContinue && (
          <p className="text-[15px] text-muted sm:text-right">
            {selection?.kind === 'catalog'
              ? 'Elige un plan para seguir.'
              : 'Elige un servicio o crea uno personalizado para seguir.'}
          </p>
        )}
      </div>
    );
  }

  const showSteps = eligibility.data !== null && canCreateGroups(eligibility.data);

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-3xl leading-tight font-bold tracking-tight focus:outline-none sm:text-4xl"
        >
          Crear suscripción
        </h1>
        {showSteps && <Stepper step={step} selection={selection} />}
      </div>
      {content}
    </>
  );
}
