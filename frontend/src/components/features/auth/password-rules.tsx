import { cx } from '@/components/ui/cx';
import { evaluatePasswordRules } from '@/lib/auth-validation';

export interface PasswordRulesProps {
  /** Id de la lista, para enlazarla con `aria-describedby` desde el campo de contraseña. */
  id: string;
  password: string;
  email: string;
}

function MetIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0">
      <circle cx="12" cy="12" r="10" className="fill-primary" />
      <path
        d="M7.5 12.5 L10.5 15.5 L16.5 9"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-surface"
      />
    </svg>
  );
}

function PendingIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0">
      <circle cx="12" cy="12" r="9" fill="none" strokeWidth="2" className="stroke-muted" />
    </svg>
  );
}

/**
 * Reglas de la contraseña de RF-003-03 con su estado en vivo (RNF-003-04). Cada regla
 * muestra un ícono distinto y el texto "Cumplida" o "Pendiente" para lectores de pantalla,
 * así que no depende solo del color. Un resumen discreto con `aria-live` anuncia cuántas se
 * cumplen. Es solo una ayuda: el servidor decide (`WEAK_PASSWORD`).
 */
export function PasswordRules({ id, password, email }: PasswordRulesProps) {
  const rules = evaluatePasswordRules(password, email);
  const metCount = rules.filter((rule) => rule.met).length;

  return (
    <div className="rounded-field bg-bg px-4 py-3.5">
      <p className="mb-2 text-[15px] font-bold text-ink">Tu contraseña debe tener:</p>
      <ul id={id} aria-label="Reglas de la contraseña" className="grid gap-2 sm:grid-cols-2">
        {rules.map((rule) => (
          <li
            key={rule.id}
            data-rule={rule.id}
            data-met={rule.met}
            className={cx(
              'flex items-center gap-2.5 text-[15px]',
              rule.met ? 'text-ink' : 'text-muted',
            )}
          >
            {rule.met ? <MetIcon /> : <PendingIcon />}
            <span>
              {rule.label}
              <span className="sr-only">{rule.met ? ': cumplida' : ': pendiente'}</span>
            </span>
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="sr-only">
        {password ? `La contraseña cumple ${metCount} de ${rules.length} reglas.` : ''}
      </p>
    </div>
  );
}
