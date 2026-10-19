import { parseMailbox, type Mailbox } from './mail-message.js';

// Interpreta las variables de entorno del correo (RF-000-12). validateEnv ya comprobó que existen;
// aquí se convierten en una configuración tipada. Los errores nombran la variable, nunca su valor.

export type MailProvider = 'resend' | 'brevo';

export type MailSettings =
  | { readonly mode: 'dev'; readonly host: string; readonly port: number; readonly from: Mailbox }
  | {
      readonly mode: 'prod';
      readonly provider: MailProvider;
      readonly apiKey: string;
      readonly from: Mailbox;
    };

export const DEFAULT_SMTP_HOST = 'localhost';
export const DEFAULT_SMTP_PORT = 1025;
const DEFAULT_DEV_FROM = 'Vaquita <no-reply@vaquita.local>';

type EnvReader = (name: string) => string | undefined;

function readFrom(read: EnvReader, fallback?: string): Mailbox {
  const raw = read('MAIL_FROM')?.trim() || fallback;
  const from = raw === undefined ? null : parseMailbox(raw);
  if (!from) throw new Error('MAIL_FROM: debe ser «correo@dominio» o «Nombre <correo@dominio>».');
  return from;
}

function readRequired(read: EnvReader, name: string): string {
  const value = read(name)?.trim();
  if (!value) throw new Error(`${name}: falta (obligatoria con MAIL_MODE=prod).`);
  return value;
}

export function readMailSettings(read: EnvReader): MailSettings {
  if (read('MAIL_MODE') !== 'prod') {
    const port = Number(read('SMTP_PORT')?.trim() || DEFAULT_SMTP_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('SMTP_PORT: debe ser un puerto entre 1 y 65535.');
    }
    return {
      mode: 'dev',
      host: read('SMTP_HOST')?.trim() || DEFAULT_SMTP_HOST,
      port,
      from: readFrom(read, DEFAULT_DEV_FROM),
    };
  }

  const provider: MailProvider = read('MAIL_PROVIDER')?.trim() === 'brevo' ? 'brevo' : 'resend';
  return {
    mode: 'prod',
    provider,
    apiKey: readRequired(read, provider === 'brevo' ? 'BREVO_API_KEY' : 'RESEND_API_KEY'),
    from: readFrom(read),
  };
}
