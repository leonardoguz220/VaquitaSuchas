'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Alert, Button } from '@/components/ui';
import { TelegramQr } from './telegram-qr';
import { VerifyCountdown } from './verify-countdown';

/** Estado que muestra la tarjeta; sale de la respuesta del servidor. */
export type TelegramVerifyStatus = 'loading' | 'pending' | 'expired' | 'rejected' | 'verified';

export interface TelegramVerifyCardProps {
  status: TelegramVerifyStatus;
  /** Enlace al bot con el token. `null` en `pending` pide un enlace nuevo. */
  telegramUrl: string | null;
  /** Vencimiento que entrega la API (ISO 8601). */
  expiresAt: string | null;
  onRequestNewLink: () => void;
  requestingLink?: boolean;
  /** Error al pedir un enlace nuevo, ya traducido por `code`. */
  linkError?: string | null;
  /** Mensaje del rechazo, ya traducido por `code`. */
  rejectedMessage?: string;
  /** Acción del rechazo, por ejemplo "Volver al registro". */
  rejectedAction?: ReactNode;
  verifiedMessage?: string;
  /** Aviso discreto mientras el sondeo reintenta, por ejemplo "Sin conexión, reintentando…". */
  pollingNotice?: string | null;
  /** Se llama al llegar la cuenta regresiva a 0 (para volver a consultar al servidor). */
  onCountdownEnd?: () => void;
}

const STEPS: ReactNode[] = [
  <>
    Abre el bot: toca <strong>Abrir Telegram</strong>
    {/* El QR solo se muestra desde md; en celular el botón es lo principal. */}
    <span className="hidden md:inline"> (o escanea el código con tu celular)</span>.
  </>,
  <>
    En el chat con el bot, toca <strong>Iniciar</strong>.
  </>,
  <>
    Comparte tu número con el botón <strong>Compartir mi número</strong> y vuelve aquí.
  </>,
];

function TelegramIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0" fill="none">
      <path
        d="M21 4 3 11l7 2 2 7 9-16Zm-11 9L21 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CardSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Cargando la verificación…</span>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          aria-hidden="true"
          className="h-5 w-full max-w-sm animate-pulse rounded-field bg-line motion-reduce:animate-none"
        />
      ))}
      <div
        aria-hidden="true"
        className="h-12 w-full animate-pulse rounded-field bg-line motion-reduce:animate-none sm:w-52"
      />
    </div>
  );
}

function NewLinkButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <Button onClick={onClick} loading={loading} className="w-full sm:w-auto sm:self-start">
      Pedir un enlace nuevo
    </Button>
  );
}

/**
 * Verificación del celular con el bot de Telegram (RF-003-21, plan 003 §6; mockup
 * `Verificar.dc.html`). No sabe de registro: recibe el enlace, el vencimiento, el estado y las
 * acciones, para reutilizarse en el cambio de celular de `/perfil` (T039).
 */
export function TelegramVerifyCard(props: TelegramVerifyCardProps) {
  const { status, telegramUrl, expiresAt, pollingNotice } = props;
  const statusRef = useRef<HTMLDivElement>(null);

  // Lleva el foco al aviso cuando el enlace vence o la verificación se rechaza.
  useEffect(() => {
    if (status === 'expired' || status === 'rejected') statusRef.current?.focus();
  }, [status]);

  const waiting = status === 'pending' && telegramUrl !== null;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-body">
        <strong>Necesitas Telegram para verificar tu celular.</strong> Así sabemos que el número es
        tuyo, sin SMS y sin costo.
      </p>

      <div
        ref={statusRef}
        tabIndex={-1}
        aria-live="polite"
        className="flex flex-col gap-3 rounded-field focus:outline-none"
      >
        {status === 'loading' && <CardSkeleton />}
        {status === 'pending' && telegramUrl === null && (
          <Alert variant="info">Pide un enlace nuevo para continuar.</Alert>
        )}
        {waiting && (
          <Alert variant="info" title="Esperando que compartas tu número…">
            Cuando lo compartas en Telegram, esta pantalla avanza sola.
          </Alert>
        )}
        {status === 'expired' && (
          <Alert variant="warning" title="El enlace venció.">
            Pide uno nuevo para seguir con la verificación.
          </Alert>
        )}
        {status === 'rejected' && <Alert variant="error">{props.rejectedMessage}</Alert>}
        {status === 'verified' && (
          <Alert variant="success">
            {props.verifiedMessage ?? '¡Listo! Tu celular quedó verificado.'}
          </Alert>
        )}
      </div>

      {pollingNotice && (status === 'loading' || status === 'pending') && (
        <p role="status" className="flex items-center gap-2 text-[15px] text-muted">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="size-4 shrink-0"
            fill="currentColor"
          >
            <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-.9 3.5h1.8v5.5H9.1V5.5Zm.9 9a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Z" />
          </svg>
          {pollingNotice}
        </p>
      )}

      {waiting && (
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <ol aria-label="Pasos para verificar tu celular" className="flex flex-col gap-3">
              {STEPS.map((step, index) => (
                <li key={index} className="flex gap-3 text-body">
                  <span aria-hidden="true" className="font-bold text-primary">
                    {index + 1}.
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <Button
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto sm:self-start sm:px-7"
            >
              <TelegramIcon />
              Abrir Telegram
              <span className="sr-only"> (se abre en una pestaña nueva)</span>
            </Button>
            {expiresAt && <VerifyCountdown expiresAt={expiresAt} onEnd={props.onCountdownEnd} />}
            <p className="text-[15px] text-muted">
              ¿No se abre Telegram? Abre este enlace en tu celular:{' '}
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold break-all text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {telegramUrl}
              </a>
            </p>
          </div>
          <TelegramQr telegramUrl={telegramUrl} className="hidden md:flex" />
        </div>
      )}

      {(status === 'expired' || (status === 'pending' && telegramUrl === null)) && (
        <div className="flex flex-col gap-3">
          {props.linkError && <Alert variant="error">{props.linkError}</Alert>}
          <NewLinkButton onClick={props.onRequestNewLink} loading={props.requestingLink ?? false} />
        </div>
      )}

      {status === 'rejected' && props.rejectedAction}
    </div>
  );
}
