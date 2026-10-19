'use client';

import { useId, useState, type ReactNode } from 'react';
import { Button, Card } from '@/components/ui';
import { buildJoinPath } from '@/lib/routes';
import { GROUP_MESSAGES } from './group-messages';

/** Texto de la invitación que se comparte con el enlace a `/unirse?codigo=…` (plan 010 §6). */
export function inviteMessage(groupName: string, code: string, url: string): string {
  return `Únete a «${groupName}» en Vaquita con el código ${code}: ${url}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface InviteCodeCardProps {
  code: string;
  groupName: string;
  /** Acciones extra del titular (por ejemplo, regenerar el código). */
  children?: ReactNode;
}

/**
 * Código de invitación con **Copiar** y **Compartir** (RF-001-06, plan 001 §6). Compartir usa
 * la hoja del sistema si existe (celular) y si no copia la invitación con el enlace. El
 * resultado se anuncia en una región `aria-live`.
 */
export function InviteCodeCard({ code, groupName, children }: InviteCodeCardProps) {
  const titleId = useId();
  const [notice, setNotice] = useState('');

  async function handleCopy() {
    setNotice((await copyText(code)) ? GROUP_MESSAGES.copied : GROUP_MESSAGES.copyFailed);
  }

  async function handleShare() {
    const url = new URL(buildJoinPath(code), window.location.origin).toString();
    const text = inviteMessage(groupName, code, url);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Vaquita', text });
        setNotice('');
        return;
      } catch (error) {
        // Cerrar la hoja de compartir no es un error.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    setNotice((await copyText(text)) ? GROUP_MESSAGES.inviteCopied : GROUP_MESSAGES.copyFailed);
  }

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="font-display text-xl font-bold">
          Código de invitación
        </h2>
        <p className="text-[15px] text-muted">
          Compártelo con quien quieras sumar. Con él abre una solicitud de ingreso.
        </p>
      </div>
      <p
        data-testid="invite-code"
        className="font-display rounded-field bg-bg px-4 py-3 text-center text-3xl font-bold tracking-[0.2em] break-all select-all"
      >
        {code}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => void handleCopy()}
          className="flex-1 sm:flex-none"
        >
          Copiar
        </Button>
        <Button onClick={() => void handleShare()} className="flex-1 sm:flex-none">
          Compartir
        </Button>
      </div>
      <p role="status" aria-live="polite" className="text-[15px] font-bold text-primary-hover">
        {notice}
      </p>
      {children}
    </Card>
  );
}
