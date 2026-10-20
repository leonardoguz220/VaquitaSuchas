'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Card } from '@/components/ui';
import {
  usePhoneChange,
  type PhoneChangeIssue,
  type PhoneChangeView,
} from '@/hooks/use-phone-change';
import { formatPhone } from '@/lib/phone';
import type { UserSelf } from '@/services/auth';
import {
  REGISTER_VERIFY_MESSAGES,
  registerLinkErrorMessage,
} from '../auth/register-verify-messages';
import { TelegramVerifyCard, type TelegramVerifyStatus } from '../auth/telegram-verify-card';
import { PROFILE_MESSAGES, phoneChangeRejectedMessage } from './profile-errors';

export interface PhoneChangeSectionProps {
  /** Celular vigente, tal como lo entrega la API. */
  phone: string;
  /** Recibe el `UserSelf` con el celular nuevo cuando el bot lo confirma. */
  onVerified: (user: UserSelf) => void;
  /** Si la respuesta `verified` no trae `user`, vuelve a pedir `GET /auth/me`. */
  onReload: () => void;
}

type ActiveView = Extract<
  PhoneChangeView,
  { kind: 'starting' | 'pending' | 'expired' | 'rejected' }
>;

function isActive(view: PhoneChangeView): view is ActiveView {
  return view.kind !== 'idle' && view.kind !== 'verified';
}

function cardStatus(view: ActiveView): TelegramVerifyStatus {
  return view.kind === 'starting' ? 'loading' : view.kind;
}

function pollingNotice(issue: PhoneChangeIssue): string | null {
  if (issue === 'connection') return REGISTER_VERIFY_MESSAGES.pollingConnection;
  if (issue === 'server') return REGISTER_VERIFY_MESSAGES.pollingServer;
  return null;
}

/**
 * "Cambiar celular" de `/perfil` (RF-003-14). Reutiliza `TelegramVerifyCard` del registro con el
 * enlace de `POST /users/me/phone-change` y el estado de `GET /users/me/phone-change/status`.
 * Mientras el número nuevo no se verifique, la pantalla sigue mostrando el anterior (CA-003-32).
 */
export function PhoneChangeSection({ phone, onVerified, onReload }: PhoneChangeSectionProps) {
  const titleId = useId();
  const { view, issue, startError, isStarting, start, cancel, refresh } = usePhoneChange();
  const [focusStart, setFocusStart] = useState(0);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const handledView = useRef<PhoneChangeView | null>(null);

  // Al verificarse, muestra el celular nuevo que entregó el servidor y lleva el foco al aviso.
  // Una sola vez por respuesta, aunque cambien las funciones que llegan por props.
  useEffect(() => {
    if (view.kind !== 'verified' || handledView.current === view) return;
    handledView.current = view;
    if (view.user) onVerified(view.user);
    else onReload();
    noticeRef.current?.focus();
  }, [view, onVerified, onReload]);

  useEffect(() => {
    if (focusStart > 0) startButtonRef.current?.focus();
  }, [focusStart]);

  function onCancel() {
    cancel();
    setFocusStart((count) => count + 1);
  }

  const startErrorMessage = startError ? registerLinkErrorMessage(startError) : null;

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-5">
      <h2 id={titleId} className="font-display text-xl font-bold">
        Cambiar celular
      </h2>

      {isActive(view) ? (
        <>
          <p className="text-body">
            Hasta que verifiques el número nuevo, sigues usando{' '}
            <strong>{formatPhone(phone)}</strong>.
          </p>
          <TelegramVerifyCard
            status={cardStatus(view)}
            telegramUrl={view.kind === 'pending' ? view.telegramUrl : null}
            expiresAt={view.kind === 'pending' ? view.expiresAt : null}
            onRequestNewLink={() => void start()}
            requestingLink={isStarting}
            linkError={view.kind === 'expired' ? startErrorMessage : null}
            rejectedMessage={
              view.kind === 'rejected' ? phoneChangeRejectedMessage(view.code) : undefined
            }
            rejectedAction={
              <Button
                onClick={() => void start()}
                loading={isStarting}
                className="w-full sm:w-auto sm:self-start"
              >
                Intentar de nuevo
              </Button>
            }
            pollingNotice={pollingNotice(issue)}
            onCountdownEnd={refresh}
          />
          <Button variant="secondary" onClick={onCancel} className="w-full sm:w-auto sm:self-start">
            Cancelar
          </Button>
        </>
      ) : (
        <>
          {view.kind === 'verified' && (
            <div ref={noticeRef} tabIndex={-1} className="rounded-field focus:outline-none">
              <Alert variant="success">{PROFILE_MESSAGES.phoneUpdated}</Alert>
            </div>
          )}
          {startErrorMessage && <Alert variant="error">{startErrorMessage}</Alert>}
          <p className="text-body">
            Tu celular es <strong>{phone ? formatPhone(phone) : 'Sin celular'}</strong>. Para
            cambiarlo, verifica el número nuevo con el bot de Telegram desde la cuenta que tiene ese
            número.
          </p>
          <Button
            ref={startButtonRef}
            onClick={() => void start()}
            loading={isStarting}
            className="w-full sm:w-auto sm:self-start"
          >
            Cambiar celular
          </Button>
        </>
      )}
    </Card>
  );
}
