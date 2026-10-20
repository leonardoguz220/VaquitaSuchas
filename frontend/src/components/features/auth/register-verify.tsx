'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { useRegisterLink } from '@/hooks/use-register-link';
import { useRegisterStatus, type RegisterStatusIssue } from '@/hooks/use-register-status';
import { REGISTER_PATH } from '@/lib/routes';
import { isSameInstant } from '@/lib/telegram-link';
import type { RegisterVerification } from '@/services/auth';
import {
  REGISTER_VERIFY_MESSAGES,
  registerLinkErrorMessage,
  rejectedMessage,
} from './register-verify-messages';
import { TelegramVerifyCard } from './telegram-verify-card';
import {
  clearRegisterVerification,
  readRegisterVerification,
  saveRegisterVerification,
} from './verification-storage';

/** La raíz redirige según la cookie de sesión que el proxy ya guardó (plan 000 §6). */
const AFTER_VERIFIED_PATH = '/';

function pollingNotice(issue: RegisterStatusIssue): string | null {
  if (issue === 'connection') return REGISTER_VERIFY_MESSAGES.pollingConnection;
  if (issue === 'server') return REGISTER_VERIFY_MESSAGES.pollingServer;
  return null;
}

function BackToRegister() {
  return (
    <Button href={REGISTER_PATH} variant="secondary" className="w-full sm:w-auto sm:self-start">
      Volver al registro
    </Button>
  );
}

function InactiveRegistration() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div ref={ref} tabIndex={-1} className="flex flex-col gap-4 rounded-field focus:outline-none">
      <Alert variant="warning">{REGISTER_VERIFY_MESSAGES.inactive}</Alert>
      <BackToRegister />
    </div>
  );
}

/**
 * Paso 2 del registro (RF-003-04, RF-003-21): consulta el estado cada 2 s y muestra la
 * verificación con Telegram. El enlace viene de `sessionStorage` (lo dejó `/registro`); si
 * falta o no corresponde al vencimiento que informa el servidor, se pide uno nuevo.
 */
export function RegisterVerify() {
  const router = useRouter();
  // Solo se usa en `pending`, que nunca es el primer render: no afecta a la hidratación.
  const [stored, setStored] = useState<RegisterVerification | null>(() =>
    typeof window === 'undefined' ? null : readRegisterVerification(),
  );
  const [linkError, setLinkError] = useState<string | null>(null);
  const { view, issue, refresh, restart, markInactive } = useRegisterStatus();
  const { request, isRequesting } = useRegisterLink();

  useEffect(() => {
    if (view.kind !== 'verified') return;
    clearRegisterVerification();
    router.replace(AFTER_VERIFIED_PATH);
  }, [view.kind, router]);

  async function onRequestNewLink() {
    const result = await request();
    if (!result) return;
    if (result.ok) {
      const { verification } = result.data;
      saveRegisterVerification(verification);
      setStored(verification);
      setLinkError(null);
      restart(verification.expiresAt);
      return;
    }
    const { error } = result;
    if (error.statusCode === 401) {
      markInactive();
    } else if (error.code === 'ALREADY_VERIFIED') {
      setLinkError(null);
      refresh();
    } else {
      setLinkError(registerLinkErrorMessage(error));
    }
  }

  if (view.kind === 'inactive') return <InactiveRegistration />;

  const expiresAt = view.kind === 'pending' ? view.expiresAt : null;
  const telegramUrl =
    expiresAt && stored && isSameInstant(stored.expiresAt, expiresAt) ? stored.telegramUrl : null;

  return (
    <TelegramVerifyCard
      status={view.kind}
      telegramUrl={telegramUrl}
      expiresAt={expiresAt}
      onRequestNewLink={onRequestNewLink}
      requestingLink={isRequesting}
      linkError={linkError}
      rejectedMessage={view.kind === 'rejected' ? rejectedMessage(view.code) : undefined}
      rejectedAction={<BackToRegister />}
      verifiedMessage={REGISTER_VERIFY_MESSAGES.verified}
      pollingNotice={pollingNotice(issue)}
      onCountdownEnd={refresh}
    />
  );
}
