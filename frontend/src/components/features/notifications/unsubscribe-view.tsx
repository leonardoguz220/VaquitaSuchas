'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { useUnsubscribeEmail } from '@/hooks/use-notifications';
import { NOTIFICATION_SETTINGS_PATH } from '@/lib/routes';
import { isConnectionError, type ApiError } from '@/services/http';
import type { NotificationCategory } from '@/services/notifications';
import { CATEGORY_LABEL, NOTIFICATION_MESSAGES } from './notification-messages';

const INVALID_LINK =
  'Este enlace no es válido. Puedes elegir qué correos recibir en Ajustes de avisos, después de ingresar.';

function SettingsLink() {
  return (
    <Link
      href={NOTIFICATION_SETTINGS_PATH}
      className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      Ir a Ajustes de avisos
    </Link>
  );
}

function errorText(error: ApiError): string {
  if (error.statusCode === 400) return INVALID_LINK;
  return isConnectionError(error)
    ? NOTIFICATION_MESSAGES.connection
    : NOTIFICATION_MESSAGES.unexpected;
}

/**
 * `/avisos/desactivar?token=` (spec 005 T023, plan §6): página pública del enlace de los correos
 * no transaccionales (RF-005-18). Abrirla no cambia nada: el tipo de correo se desactiva solo al
 * confirmar con el botón (`POST /notifications/unsubscribe`), para que los lectores de correo
 * que abren enlaces no lo activen por accidente. El token no se muestra.
 */
export function UnsubscribeView({ token }: { token: string | null }) {
  const unsubscribe = useUnsubscribeEmail();
  const [done, setDone] = useState<NotificationCategory | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  if (!token) {
    return (
      <>
        <Alert variant="error" title="Falta el código del enlace.">
          {INVALID_LINK}
        </Alert>
        <SettingsLink />
      </>
    );
  }

  if (done) {
    return (
      <>
        <Alert variant="success" title="Listo.">
          Ya no te enviaremos correos de «{CATEGORY_LABEL[done]}». Seguirás viendo esos avisos en la
          app.
        </Alert>
        <p className="text-muted">Puedes volver a activarlos cuando quieras.</p>
        <SettingsLink />
      </>
    );
  }

  const onConfirm = async () => {
    setError(null);
    const result = await unsubscribe.submit(token);
    if (!result) return;
    if (result.ok) setDone(result.data.category);
    else setError(result.error);
  };

  const invalid = error?.statusCode === 400;

  return (
    <>
      <p className="text-body">
        Solo se desactiva el tipo de correo del enlace que abriste. Seguirás viendo tus avisos en la
        app y recibiendo los correos de seguridad de tu cuenta.
      </p>
      {error && (
        <Alert variant="error" title="No pudimos desactivar el correo.">
          {errorText(error)}
        </Alert>
      )}
      {invalid ? (
        <SettingsLink />
      ) : (
        <Button onClick={() => void onConfirm()} loading={unsubscribe.isSubmitting} fullWidth>
          {error ? 'Reintentar' : 'Sí, dejar de recibirlos'}
        </Button>
      )}
    </>
  );
}
