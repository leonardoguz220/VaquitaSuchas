import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/features/brand/logo';
import { DevTelegramPanel } from '@/components/features/dev-telegram/dev-telegram-panel';
import { Alert } from '@/components/ui';
import { isTelegramDevMode } from '@/lib/routes';

export const metadata: Metadata = { title: 'Bot de Telegram (desarrollo)' };

/**
 * `/dev/telegram` (plan 003 §6, spec 003 T024): simula el bot para probar el registro sin
 * Telegram real. Solo existe con `NEXT_PUBLIC_TELEGRAM_MODE=dev`; en otro modo responde 404
 * (y el backend también responde 404 a `/dev/telegram/*`, contrato 000 B).
 */
export default function DevTelegramPage() {
  if (!isTelegramDevMode()) notFound();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <Logo />
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight">
          Bot de Telegram simulado
        </h1>
        <p className="text-muted">
          Envía <code>/start</code> con el token del enlace y luego comparte el contacto, como lo
          haría Telegram.
        </p>
      </header>
      <Alert variant="warning" title="Solo para desarrollo">
        Esta pantalla existe solo con{' '}
        <code className="break-all">NEXT_PUBLIC_TELEGRAM_MODE=dev</code>. No uses datos reales.
      </Alert>
      <DevTelegramPanel />
    </main>
  );
}
