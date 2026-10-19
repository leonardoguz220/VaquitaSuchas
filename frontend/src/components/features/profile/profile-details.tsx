import { useId, type ReactNode } from 'react';
import { Card } from '@/components/ui';
import { formatDateTimeLaPaz } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import type { UserSelf } from '@/services/auth';
import { NameForm } from './name-form';

export interface ProfileDetailsProps {
  user: UserSelf;
  onUserChange: (user: UserSelf) => void;
}

/** RF-003-09: el último ingreso en La Paz, o el aviso de primer ingreso si la API trae `null`. */
function lastLoginText(lastLoginAt: string | null): string {
  return lastLoginAt ? formatDateTimeLaPaz(lastLoginAt) : 'Este es tu primer ingreso';
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[15px] text-muted">{term}</dt>
      <dd className="font-bold break-words">{children}</dd>
    </div>
  );
}

/**
 * "Tus datos" de `/perfil` (RF-003-14, RF-003-09; mockup `Perfil.dc.html`): nombre editable y
 * correo, CI enmascarada, celular y último ingreso de solo lectura. La CI se muestra tal como
 * llega en `ciMasked` (CA-003-31): el cliente nunca la recibe completa.
 */
export function ProfileDetails({ user, onUserChange }: ProfileDetailsProps) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-5">
      <h2 id={titleId} className="font-display text-xl font-bold">
        Tus datos
      </h2>
      <NameForm fullName={user.fullName} onSaved={onUserChange} />
      <dl className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
        <Detail term="Correo">{user.email}</Detail>
        <Detail term="Cédula de identidad">{user.ciMasked}</Detail>
        <Detail term="Celular">{user.phone ? formatPhone(user.phone) : 'Sin celular'}</Detail>
        <Detail term="Último ingreso">{lastLoginText(user.lastLoginAt)}</Detail>
      </dl>
      <p className="text-[15px] text-muted">
        Tu correo y tu cédula no se pueden cambiar. Tu nombre y tu celular los ven el titular y los
        miembros de tus grupos; tu correo y tu cédula no los ve nadie más.
      </p>
    </Card>
  );
}
