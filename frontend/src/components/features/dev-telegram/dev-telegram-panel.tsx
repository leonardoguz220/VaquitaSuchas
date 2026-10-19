'use client';

import { useId, useState, useSyncExternalStore } from 'react';
import { readRegisterVerification } from '@/components/features/auth/verification-storage';
import { Alert, Button, Card, Field } from '@/components/ui';
import { useDevTelegram, type SimulateResult } from '@/hooks/use-dev-telegram';
import { extractStartToken } from '@/lib/telegram-link';
import { isConnectionError } from '@/services/http';
import { TelegramOutbox } from './telegram-outbox';

export const DEV_TELEGRAM_DEFAULTS = { telegramUserId: '1001', phoneNumber: '+59171234567' };

type FieldName = 'token' | 'telegramUserId' | 'phoneNumber' | 'contactUserId';
type FieldErrors = Partial<Record<FieldName, string>>;

const noSubscription = () => () => {};
const readStoredToken = () => extractStartToken(readRegisterVerification()?.telegramUrl);

function parseId(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const id = Number(value.trim());
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function resultText(result: SimulateResult, okText: string): { ok: boolean; text: string } {
  if (result.ok) return { ok: true, text: okText };
  if (isConnectionError(result.error)) {
    return { ok: false, text: 'No se pudo contactar con el servidor.' };
  }
  return {
    ok: false,
    text: `El backend respondió ${result.error.code} (${result.error.statusCode}).`,
  };
}

/**
 * Pantalla de desarrollo del bot (plan 003 §6): simula `/start` y "Compartir mi número" con
 * `POST /dev/telegram/simulate` y muestra la bandeja del bot, para probar el registro completo
 * sin Telegram real. El token se prellena con el del enlace que guardó `/registro`.
 */
export function DevTelegramPanel() {
  const titleId = useId();
  // Lee sessionStorage sin desajustar la hidratación (en el servidor no hay token).
  const storedToken = useSyncExternalStore(noSubscription, readStoredToken, () => null);
  const [token, setToken] = useState<string | null>(null);
  const [telegramUserId, setTelegramUserId] = useState(DEV_TELEGRAM_DEFAULTS.telegramUserId);
  const [phoneNumber, setPhoneNumber] = useState(DEV_TELEGRAM_DEFAULTS.phoneNumber);
  // `null`: sin editar, igual al ID de Telegram (cámbialo para probar un contacto ajeno).
  const [contactUserId, setContactUserId] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const { simulate, sending, outbox, loadOutbox } = useDevTelegram();

  const tokenValue = token ?? storedToken ?? '';
  const contactValue = contactUserId ?? telegramUserId;

  function validate(fields: FieldName[]): FieldErrors {
    const found: FieldErrors = {};
    if (fields.includes('token') && !tokenValue.trim()) found.token = 'Pega el token del enlace.';
    if (fields.includes('telegramUserId') && parseId(telegramUserId) === null) {
      found.telegramUserId = 'Escribe un número entero positivo.';
    }
    if (fields.includes('phoneNumber') && !phoneNumber.trim()) {
      found.phoneNumber = 'Escribe un celular.';
    }
    if (fields.includes('contactUserId') && parseId(contactValue) === null) {
      found.contactUserId = 'Escribe un número entero positivo.';
    }
    setErrors(found);
    return found;
  }

  async function onStart() {
    if (Object.keys(validate(['token', 'telegramUserId'])).length > 0) return;
    const id = parseId(telegramUserId)!;
    const outcome = await simulate({ kind: 'start', telegramUserId: id, token: tokenValue.trim() });
    if (!outcome) return;
    setResult(resultText(outcome, 'Se envió /start al bot.'));
    if (outcome.ok) void loadOutbox(id);
  }

  async function onContact() {
    if (Object.keys(validate(['telegramUserId', 'phoneNumber', 'contactUserId'])).length > 0) {
      return;
    }
    const id = parseId(telegramUserId)!;
    const outcome = await simulate({
      kind: 'contact',
      telegramUserId: id,
      phoneNumber: phoneNumber.trim(),
      contactUserId: parseId(contactValue)!,
    });
    if (!outcome) return;
    setResult(resultText(outcome, 'Se compartió el contacto con el bot.'));
    if (outcome.ok) void loadOutbox(id);
  }

  function onRefreshOutbox() {
    if (Object.keys(validate(['telegramUserId'])).length > 0) return;
    void loadOutbox(parseId(telegramUserId)!);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-5">
        <h2 id={titleId} className="font-display text-xl font-bold">
          Simular mensajes
        </h2>
        <Field
          label="Token"
          name="token"
          autoComplete="off"
          spellCheck={false}
          hint="El valor de start= del enlace. Se completa con el del último registro."
          value={tokenValue}
          onChange={(event) => setToken(event.target.value)}
          error={errors.token}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="ID de Telegram simulado"
            name="telegramUserId"
            inputMode="numeric"
            autoComplete="off"
            value={telegramUserId}
            onChange={(event) => setTelegramUserId(event.target.value)}
            error={errors.telegramUserId}
          />
          <Field
            label="ID del contacto"
            name="contactUserId"
            inputMode="numeric"
            autoComplete="off"
            hint="Distinto del ID de Telegram simula un contacto de otra cuenta."
            value={contactValue}
            onChange={(event) => setContactUserId(event.target.value)}
            error={errors.contactUserId}
          />
        </div>
        <Field
          label="Celular"
          name="phoneNumber"
          type="tel"
          autoComplete="off"
          hint="Cámbialo por uno no boliviano para probar el rechazo."
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value)}
          error={errors.phoneNumber}
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={onStart} loading={sending === 'start'} disabled={sending !== null}>
            Enviar /start
          </Button>
          <Button
            variant="secondary"
            onClick={onContact}
            loading={sending === 'contact'}
            disabled={sending !== null}
          >
            Compartir contacto
          </Button>
        </div>
        <div aria-live="polite">
          {result && <Alert variant={result.ok ? 'success' : 'error'}>{result.text}</Alert>}
        </div>
      </Card>
      <TelegramOutbox state={outbox} onRefresh={onRefreshOutbox} />
    </div>
  );
}
