import type { Metadata } from 'next';
import { AuthShell } from '@/components/features/auth/auth-shell';
import { UnsubscribeView } from '@/components/features/notifications/unsubscribe-view';
import type { SearchParamsRecord } from '@/lib/routes';

/** La URL lleva el token firmado: no se indexa ni se envía como `Referer`. */
export const metadata: Metadata = {
  title: 'Dejar de recibir correos',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export interface UnsubscribePageProps {
  searchParams: Promise<SearchParamsRecord>;
}

/**
 * `/avisos/desactivar?token=` (spec 005 T023, plan §6). Ruta pública: se abre desde el correo sin
 * sesión. Lee el token de la query y se lo pasa a la vista, que solo lo envía al confirmar.
 */
export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const raw = (await searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw)?.trim() || null;
  return (
    <AuthShell
      title="¿Dejar de recibir este tipo de correos?"
      subtitle="Confirma para que Vaquita deje de enviarte los correos de este tipo de aviso."
    >
      <UnsubscribeView token={token} />
    </AuthShell>
  );
}
