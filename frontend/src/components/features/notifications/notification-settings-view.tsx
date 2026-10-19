'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Switch } from '@/components/ui';
import {
  useNotificationPreferences,
  useReactivateTelegram,
  useUpdateNotificationPreferences,
} from '@/hooks/use-notifications';
import type { ApiError } from '@/services/http';
import type {
  ChannelPreferences,
  NotificationCategory,
  NotificationPreferences,
} from '@/services/notifications';
import {
  CATEGORY_DESCRIPTION,
  CATEGORY_LABEL,
  notificationErrorMessage,
  SETTINGS_MESSAGES,
} from './notification-messages';

const CATEGORIES: NotificationCategory[] = ['recordatorios', 'resoluciones', 'titular', 'grupo'];

function pickChannel(source: ChannelPreferences): ChannelPreferences {
  return {
    recordatorios: source.recordatorios,
    resoluciones: source.resoluciones,
    titular: source.titular,
    grupo: source.grupo,
  };
}

function SettingsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Cargando tus ajustes de avisos…</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="h-28 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

type Notice = { variant: 'success' | 'info'; text: string } | null;

/** Estado de Telegram con «Reactivar» si la persona bloqueó el bot (RF-005-28). */
function TelegramStatus({
  blocked,
  onReactivated,
}: {
  blocked: boolean;
  onReactivated: (preferences: NotificationPreferences) => void;
}) {
  const reactivate = useReactivateTelegram();
  const [notice, setNotice] = useState<Notice>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const onReactivate = async () => {
    setNotice(null);
    setError(null);
    const result = await reactivate.submit(undefined);
    if (!result) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(
      result.data.telegram.blocked
        ? { variant: 'info', text: SETTINGS_MESSAGES.stillBlocked }
        : { variant: 'success', text: SETTINGS_MESSAGES.reactivated },
    );
    onReactivated(result.data);
  };

  return (
    <section
      aria-labelledby="telegram-status-title"
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="telegram-status-title" className="font-display text-lg font-bold">
          {blocked ? 'Telegram: bloqueado' : 'Telegram: conectado'}
        </h2>
        {blocked ? (
          <Badge variant="warning">Pausado</Badge>
        ) : (
          <Badge variant="success">Activo</Badge>
        )}
      </div>
      <p className="text-muted">
        {blocked ? SETTINGS_MESSAGES.telegramBlocked : SETTINGS_MESSAGES.telegramActive}
      </p>
      {blocked && (
        <Button
          variant="secondary"
          onClick={() => void onReactivate()}
          loading={reactivate.isSubmitting}
          className="self-start"
        >
          Reactivar
        </Button>
      )}
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      {error && (
        <Alert variant="error" title="No pudimos reactivar Telegram.">
          {notificationErrorMessage(error)}
        </Alert>
      )}
    </section>
  );
}

/** Interruptores por tipo de aviso para correo y Telegram (RF-005-17). */
function PreferencesForm({
  preferences,
  saved,
  setSaved,
  onSaved,
}: {
  preferences: NotificationPreferences;
  /** Vive en el padre: el formulario se vuelve a montar cuando llegan las preferencias nuevas. */
  saved: boolean;
  setSaved: (saved: boolean) => void;
  onSaved: () => void;
}) {
  const update = useUpdateNotificationPreferences();
  const [email, setEmail] = useState(() => pickChannel(preferences.email));
  const [telegram, setTelegram] = useState(() => pickChannel(preferences.telegram));
  const [error, setError] = useState<ApiError | null>(null);
  const blocked = preferences.telegram.blocked;
  const dirty = CATEGORIES.some(
    (category) =>
      email[category] !== preferences.email[category] ||
      telegram[category] !== preferences.telegram[category],
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(false);
    setError(null);
    const result = await update.submit({ email, telegram });
    if (!result) return;
    if (result.ok) {
      setSaved(true);
      onSaved();
    } else {
      setError(result.error);
    }
  };

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <ul aria-label="Tipos de aviso" className="flex flex-col gap-3">
        {CATEGORIES.map((category) => (
          <li
            key={category}
            className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-5"
          >
            <div className="flex flex-col gap-1">
              <h3 className="font-bold">{CATEGORY_LABEL[category]}</h3>
              <p className="text-[15px] text-muted">{CATEGORY_DESCRIPTION[category]}</p>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
              <p className="inline-flex min-h-11 items-center gap-2">
                <span>En la app</span>
                <Badge variant="success">Siempre</Badge>
              </p>
              <Switch
                label="Correo"
                aria-label={`Correo: ${CATEGORY_LABEL[category]}`}
                checked={email[category]}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSaved(false);
                  setEmail((current) => ({ ...current, [category]: checked }));
                }}
              />
              <Switch
                label="Telegram"
                aria-label={`Telegram: ${CATEGORY_LABEL[category]}`}
                checked={telegram[category]}
                disabled={blocked}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSaved(false);
                  setTelegram((current) => ({ ...current, [category]: checked }));
                }}
              />
            </div>
          </li>
        ))}
        <li className="flex flex-col gap-3 rounded-card border border-line bg-bg p-4 sm:p-5">
          <div className="flex flex-col gap-1">
            <h3 className="font-bold">Seguridad de la cuenta</h3>
            <p className="text-[15px] text-muted">
              Recuperar o cambiar tu contraseña. Siempre te llegan por correo y no se pueden
              desactivar.
            </p>
          </div>
          <p className="inline-flex min-h-11 items-center gap-2">
            <span>Correo</span>
            <Badge variant="success">Siempre</Badge>
          </p>
        </li>
      </ul>

      {blocked && (
        <p className="text-[15px] text-muted">
          Los interruptores de Telegram se habilitan cuando reactives Telegram.
        </p>
      )}

      {saved && <Alert variant="success">{SETTINGS_MESSAGES.saved}</Alert>}
      {error && (
        <Alert variant="error" title="No pudimos guardar tus preferencias.">
          {notificationErrorMessage(error)}
        </Alert>
      )}

      <Button
        type="submit"
        loading={update.isSubmitting}
        disabled={!dirty}
        className="w-full sm:w-auto sm:self-start"
      >
        Guardar cambios
      </Button>
    </form>
  );
}

/**
 * `/ajustes/avisos` (spec 005 T023, plan §6; mockup `AjustesAvisos.dc.html`): interruptores por
 * tipo de aviso para correo y Telegram, aviso si el correo rebota, estado de Telegram con
 * «Reactivar» y el texto fijo de lo que no se desactiva. Cubre cargando, error y con datos (las
 * preferencias siempre existen: no hay estado vacío).
 */
export function NotificationSettingsView() {
  const { status, data, error, reload, refresh, replace } = useNotificationPreferences();
  const [saved, setSaved] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Ajustes de avisos
        </h1>
        <p className="text-muted">Elige qué avisos te llegan por correo y por Telegram.</p>
      </div>

      {(status === 'loading' || status === 'redirecting') && <SettingsSkeleton />}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title="No pudimos cargar tus ajustes de avisos."
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {notificationErrorMessage(error)}
        </Alert>
      )}

      {status === 'success' && data && (
        <>
          {data.emailProblem && (
            <Alert variant="warning" title={SETTINGS_MESSAGES.emailProblemTitle}>
              {SETTINGS_MESSAGES.emailProblem}
            </Alert>
          )}
          <TelegramStatus blocked={data.telegram.blocked} onReactivated={replace} />
          <PreferencesForm
            key={JSON.stringify(data)}
            preferences={data}
            saved={saved}
            setSaved={setSaved}
            onSaved={() => void refresh()}
          />
        </>
      )}

      <p className="text-[15px] text-muted">{SETTINGS_MESSAGES.fixedRules}</p>
    </>
  );
}
