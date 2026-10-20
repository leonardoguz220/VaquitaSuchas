import type { ReactNode } from 'react';
import { SessionBar } from './session-bar';

/** Id del contenido principal, destino del enlace "Saltar al contenido". */
export const MAIN_CONTENT_ID = 'contenido';

/** Id de la región de avisos globales que anuncian los lectores de pantalla. */
export const GLOBAL_NOTICES_ID = 'avisos-globales';

/**
 * Cuerpo común de todas las pantallas (plan 000 §6, RF-000-16): enlace para saltar al
 * contenido, región de avisos globales con `aria-live` y el contenido principal.
 * La barra superior (`SessionBar`) solo aparece en las pantallas con sesión.
 */
export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-field focus:bg-primary focus:px-4 focus:py-2 focus:font-bold focus:text-white focus:outline-2 focus:outline-offset-2 focus:outline-ink"
      >
        Saltar al contenido
      </a>
      <div id={GLOBAL_NOTICES_ID} role="status" aria-live="polite" aria-atomic="true" />
      <SessionBar />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="min-h-dvh focus:outline-none">
        {children}
      </main>
    </>
  );
}
