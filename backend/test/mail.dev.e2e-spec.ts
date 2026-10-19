import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  InvalidMailMessageError,
  MailDeliveryError,
  MailService,
} from '../src/shared/ports/mail.service.js';

// CA-000-09: con MAIL_MODE=dev el correo llega a la bandeja local (Mailpit) y no sale a internet.
// Requiere Mailpit: `npm run db:up` en local; en CI es el servicio `mail` del job test-backend.

const MAILPIT_URL = (process.env.MAILPIT_URL || 'http://localhost:8025').replace(/\/$/, '');
const LOCAL_DATABASE_URL = 'postgres://vaquita:vaquita@localhost:5432/vaquita';

// Entorno mínimo válido para validateEnv (RF-000-08): valores ficticios, sin archivo .env.
const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || LOCAL_DATABASE_URL,
  JWT_SECRET: 'j'.repeat(32),
  FINGERPRINT_KEY: 'fingerprint-test-key',
  CI_ENCRYPTION_KEY: 'ab'.repeat(32),
  JOBS_TOKEN: 'cd'.repeat(32),
  MAIL_MODE: 'dev',
  TELEGRAM_MODE: 'dev',
  STORAGE_DRIVER: 'local',
};

interface MailpitSummary {
  ID: string;
  From: { Name: string; Address: string };
  To: { Address: string }[];
  Subject: string;
}

interface MailpitMessage extends MailpitSummary {
  Text: string;
  HTML: string;
}

async function mailpitJson<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`);
  if (!response.ok) throw new Error(`Mailpit respondió ${response.status} en ${path}`);
  return (await response.json()) as T;
}

/** Espera a que Mailpit tenga el correo dirigido a `to` (la entrega por SMTP es asíncrona). */
async function waitForMessageTo(to: string): Promise<MailpitMessage[]> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { messages } = await mailpitJson<{ messages: MailpitSummary[] }>(
      `/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    );
    if (messages.length > 0) {
      return Promise.all(
        messages.map((m) => mailpitJson<MailpitMessage>(`/api/v1/message/${m.ID}`)),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return [];
}

describe('MailService en modo dev (CA-000-09)', () => {
  let app: INestApplication;
  let mail: MailService;

  beforeAll(async () => {
    Object.assign(process.env, TEST_ENV);
    // ConfigModule.forRoot lee el entorno al evaluar app.module.ts: se importa ya con el entorno listo.
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    mail = app.get(MailService);

    const info = await fetch(`${MAILPIT_URL}/api/v1/info`).catch(() => null);
    if (!info?.ok) {
      throw new Error(`Mailpit no responde en ${MAILPIT_URL}; levántalo con «npm run db:up».`);
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  it('CA-000-09: el correo enviado aparece en la bandeja local con sus campos y acentos', async () => {
    const to = `ana-${randomUUID()}@ejemplo.com`;

    await mail.send({
      to,
      subject: 'Recuperación de contraseña',
      html: '<p>Tu código es <b>123456</b> — pagá Bs 25,50.</p>',
      text: 'Tu código es 123456 — pagá Bs 25,50.',
    });

    const received = await waitForMessageTo(to);
    expect(received).toHaveLength(1);
    const [message] = received;
    expect(message?.Subject).toBe('Recuperación de contraseña');
    expect(message?.From.Address).toBe('no-reply@vaquita.local');
    expect(message?.To.map((recipient) => recipient.Address)).toEqual([to]);
    expect(message?.Text).toContain('Tu código es 123456 — pagá Bs 25,50.');
    expect(message?.HTML).toContain('<b>123456</b>');
  });

  it('CA-000-09: enviar un correo no hace ninguna llamada HTTP a internet', async () => {
    const to = `luis-${randomUUID()}@ejemplo.com`;
    const realFetch = globalThis.fetch;
    const spy = jest.fn<typeof fetch>(realFetch);
    globalThis.fetch = spy;
    try {
      await mail.send({ to, subject: 'Aviso', html: '<p>Hola</p>', text: 'Hola' });
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(spy).not.toHaveBeenCalled();
    expect(await waitForMessageTo(to)).toHaveLength(1);
  });

  it('CA-000-09: un mensaje con la dirección manipulada se rechaza y no llega a la bandeja', async () => {
    const marker = `x-${randomUUID()}@ejemplo.com`;

    await expect(
      mail.send({
        to: `a@ejemplo.com>\r\nRCPT TO:<${marker}`,
        subject: 'Aviso',
        html: '<p>Hola</p>',
        text: 'Hola',
      }),
    ).rejects.toBeInstanceOf(InvalidMailMessageError);

    const { messages } = await mailpitJson<{ messages: MailpitSummary[] }>(
      `/api/v1/search?query=${encodeURIComponent(`to:${marker}`)}`,
    );
    expect(messages).toEqual([]);
  });

  it('CA-000-09: si la bandeja no responde, send lanza MailDeliveryError', async () => {
    const { SmtpMailService } = await import('../src/shared/mail/smtp-mail.service.js');
    const { SystemClock } = await import('../src/shared/clock/system-clock.js');
    const unreachable = new SmtpMailService(
      { host: '127.0.0.1', port: 1, from: { address: 'no-reply@vaquita.local' } },
      new SystemClock(),
    );

    await expect(
      unreachable.send({
        to: 'ana@ejemplo.com',
        subject: 'Aviso',
        html: '<p>Hola</p>',
        text: 'Hola',
      }),
    ).rejects.toBeInstanceOf(MailDeliveryError);
  });
});
