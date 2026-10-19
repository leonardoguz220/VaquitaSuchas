import { MailDeliveryError, type MailMessage, MailService } from '../ports/mail.service.js';
import { validateMailMessage, type Mailbox } from './domain/mail-message.js';

// Modo `prod` de MailService (RF-000-12, research.md R4): API HTTPS del proveedor, porque Render
// bloquea SMTP. Resend es el proveedor por defecto y Brevo la alternativa gratuita (MAIL_PROVIDER).

export type FetchFn = typeof fetch;

export interface HttpMailOptions {
  readonly apiKey: string;
  readonly from: Mailbox;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export const RESEND_URL = 'https://api.resend.com/emails';
export const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

abstract class HttpMailService extends MailService {
  constructor(
    protected readonly options: HttpMailOptions,
    private readonly fetchFn: FetchFn,
  ) {
    super();
  }

  protected abstract readonly url: string;
  protected abstract headers(): Record<string, string>;
  protected abstract body(message: MailMessage): unknown;

  async send(message: MailMessage): Promise<void> {
    validateMailMessage(message);
    let response: Response;
    try {
      response = await this.fetchFn(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers() },
        body: JSON.stringify(this.body(message)),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch {
      throw new MailDeliveryError('No se pudo conectar con el proveedor de correo.');
    }
    if (!response.ok) {
      // Solo el estado: el cuerpo de la respuesta del proveedor puede repetir la dirección o el texto.
      throw new MailDeliveryError(
        `El proveedor de correo rechazó el envío (HTTP ${response.status}).`,
      );
    }
  }
}

function resendFrom({ name, address }: Mailbox): string {
  return name ? `${name} <${address}>` : address;
}

export class ResendMailService extends HttpMailService {
  protected readonly url = RESEND_URL;

  protected headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.options.apiKey}` };
  }

  protected body({ to, subject, html, text }: MailMessage): unknown {
    return { from: resendFrom(this.options.from), to: [to], subject, html, text };
  }
}

export class BrevoMailService extends HttpMailService {
  protected readonly url = BREVO_URL;

  protected headers(): Record<string, string> {
    return { 'api-key': this.options.apiKey };
  }

  protected body({ to, subject, html, text }: MailMessage): unknown {
    const { name, address } = this.options.from;
    return {
      sender: name ? { name, email: address } : { email: address },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    };
  }
}
