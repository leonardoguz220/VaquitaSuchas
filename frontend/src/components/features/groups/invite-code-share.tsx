'use client';

import { useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { cx } from '@/components/ui/cx';

type ShareFeedback = { variant: 'success' | 'error'; message: string } | null;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export interface InviteCodeShareProps {
  code: string;
  groupName: string;
  className?: string;
}

/**
 * Código de invitación con **Copiar** y **Compartir** (RF-001-04, RF-001-06). Compartir usa
 * `navigator.share` y, si no existe o falla, copia el código. Lo usan T016 y T025.
 */
export function InviteCodeShare({ code, groupName, className }: InviteCodeShareProps) {
  const [feedback, setFeedback] = useState<ShareFeedback>(null);
  const shareText = `Únete a «${groupName}» en Vaquita con el código ${code}.`;

  async function copy() {
    setFeedback(
      (await copyText(code))
        ? { variant: 'success', message: 'Código copiado.' }
        : { variant: 'error', message: 'No pudimos copiar el código. Cópialo a mano.' },
    );
  }

  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Vaquita', text: shareText });
        setFeedback(null);
        return;
      } catch (error) {
        if (isAbort(error)) return;
      }
    }
    await copy();
  }

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <div className="flex flex-col items-center gap-2 rounded-field bg-primary-soft p-5">
        <span className="text-sm font-bold text-primary-hover">Código de invitación</span>
        <span
          data-testid="invite-code"
          className="font-mono text-3xl font-bold tracking-[0.2em] text-ink sm:text-4xl"
        >
          {code}
        </span>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={copy} className="w-full sm:w-auto">
          Copiar
        </Button>
        <Button variant="secondary" onClick={share} className="w-full sm:w-auto">
          Compartir
        </Button>
      </div>
      {feedback && <Alert variant={feedback.variant} title={feedback.message} />}
    </div>
  );
}
