import type { Metadata } from 'next';
import { JoinByCodeView } from '@/components/features/join-requests/join-by-code-view';
import { INVITE_CODE_PARAM, type SearchParamsRecord } from '@/lib/routes';

export const metadata: Metadata = { title: 'Unirme con un código' };

export interface JoinPageProps {
  searchParams: Promise<SearchParamsRecord>;
}

/**
 * `/unirse` "Unirme con un código" (spec 010 T017, plan §6; mockup `Unirse.dc.html`). Ruta
 * protegida por `proxy.ts`: sin sesión va a `/ingresar?next=/unirse?codigo=…` y vuelve aquí con
 * el código. Acepta `?codigo=` del enlace de invitación (spec 005, RF-005-14).
 */
export default async function JoinPage({ searchParams }: JoinPageProps) {
  const params = await searchParams;
  const raw = params[INVITE_CODE_PARAM];
  const code = Array.isArray(raw) ? raw[0] : raw;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <JoinByCodeView initialCode={code ?? ''} />
    </div>
  );
}
