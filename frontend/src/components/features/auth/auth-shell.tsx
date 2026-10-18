import { useId, type ReactNode } from 'react';
import { Logo } from '@/components/features/brand/logo';
import { Badge, Card } from '@/components/ui';
import { formatBs } from '@/lib/money';

export interface AuthShellProps {
  /** Título de la pantalla (único `h1`). */
  title: ReactNode;
  subtitle?: ReactNode;
  /** Paso del flujo, por ejemplo "Paso 1 de 2". */
  step?: ReactNode;
  children: ReactNode;
  /** Pie de la tarjeta, por ejemplo "¿Ya tienes cuenta? Ingresa". */
  footer?: ReactNode;
}

/**
 * Panel de marca de las pantallas de acceso (mockup `Main.dc.html`). Solo en escritorio.
 * La tarjeta de ejemplo es decorativa (`aria-hidden`): sus datos son de muestra y no salen de
 * la API.
 */
function BrandPanel() {
  return (
    <section
      aria-label="Vaquita"
      className="hidden bg-primary px-12 py-14 text-bg lg:flex lg:flex-col lg:gap-10 xl:px-16"
    >
      <Logo variant="inverse" />
      <div className="flex max-w-md flex-col gap-4">
        <p className="font-display text-4xl leading-tight font-bold tracking-tight xl:text-5xl">
          Las suscripciones compartidas, con las cuentas claras.
        </p>
        <p className="text-lg leading-relaxed text-primary-soft">
          Vaquita calcula la cuota de cada uno, convierte de dólares a bolivianos y lleva el
          registro de quién pagó cada mes.
        </p>
      </div>
      <div
        aria-hidden="true"
        className="mt-auto flex max-w-sm flex-col gap-3.5 rounded-card bg-bg px-6 py-5 text-ink"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-bold">Netflix · Plan Estándar</span>
          <span className="text-sm text-muted">4 miembros</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] text-muted">Tu cuota de noviembre</span>
          <span className="font-display text-3xl font-bold">{formatBs(2550)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="pagado">Pagado · 3</Badge>
          <Badge variant="en_revision">En revisión · 1</Badge>
        </div>
      </div>
    </section>
  );
}

/**
 * Esqueleto de las pantallas de acceso (`/registro`, `/registro/verificar`, `/ingresar`,
 * `/recuperar`), plan 003 §6. Celular primero: en celular, el logo y la tarjeta del
 * formulario; desde `lg`, además el panel de marca verde a la izquierda.
 */
export function AuthShell({ title, subtitle, step, children, footer }: AuthShellProps) {
  const titleId = useId();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <BrandPanel />
      <div className="flex justify-center px-4 py-8 sm:px-6 sm:py-12 lg:items-center lg:py-14">
        <div className="flex w-full max-w-xl flex-col gap-6">
          <Logo className="lg:hidden" />
          <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-6">
            <header className="flex flex-col gap-2">
              {step && <p className="text-[15px] font-bold text-primary">{step}</p>}
              <h1
                id={titleId}
                className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl"
              >
                {title}
              </h1>
              {subtitle && <p className="text-body text-muted">{subtitle}</p>}
            </header>
            {children}
            {footer && <div className="border-t border-line pt-5 text-muted">{footer}</div>}
          </Card>
        </div>
      </div>
    </div>
  );
}
