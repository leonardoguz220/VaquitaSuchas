'use client';

import { useState } from 'react';
import { Alert, Button } from '@/components/ui';
import type { GroupDetail } from '@/services/groups';
import type { ApiError } from '@/services/http';
import { qrUploadErrorMessage } from './new-group-errors';

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

export interface GroupCreatedProps {
  group: GroupDetail;
  qrError: ApiError | null;
}

/** Resultado de crear (RF-001-04): el código de invitación con **Copiar** y **Compartir**. */
export function GroupCreated({ group, qrError }: GroupCreatedProps) {
  const [feedback, setFeedback] = useState<ShareFeedback>(null);
  const code = group.inviteCode ?? '';
  const shareText = `Únete a «${group.name}» en Vaquita con el código ${code}.`;

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
    <section
      aria-labelledby="grupo-creado"
      className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="grupo-creado" className="font-display text-2xl font-bold">
          ¡Listo! Creaste «{group.name}»
        </h2>
        <p className="text-muted">
          Comparte este código con quienes quieras invitar a tu suscripción.
        </p>
      </div>
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
      {qrError && (
        <Alert variant="warning" title={qrUploadErrorMessage(qrError)}>
          Tu grupo ya está creado. Puedes subir el QR desde la configuración del grupo.
        </Alert>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button href={`/grupos/${group.id}`} className="w-full sm:w-auto">
          Ver el grupo
        </Button>
        <Button variant="secondary" href="/grupos" className="w-full sm:w-auto">
          Ir a Mis suscripciones
        </Button>
      </div>
    </section>
  );
}
