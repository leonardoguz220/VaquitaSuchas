import { Injectable, Logger } from '@nestjs/common';
import type { MailMessage } from '../../../shared/ports/mail.service.js';
import { MailService } from '../../../shared/ports/mail.service.js';
import { MAX_MAIL_ATTEMPTS } from '../domain/password-reset.js';

interface Pending {
  message: MailMessage;
  attempts: number;
}

/**
 * Envía los correos de la cuenta después de confirmar la transacción. Si el envío falla, el
 * mensaje queda en memoria y la tarea `auth.retry_mail` lo reintenta hasta 3 veces en total. Se
 * pierde si el proceso se reinicia: la persona puede pedir otro enlace (spec 003, bordes).
 */
@Injectable()
export class MailOutbox {
  private readonly logger = new Logger(MailOutbox.name);
  private pending: Pending[] = [];

  constructor(private readonly mail: MailService) {}

  async send(message: MailMessage): Promise<void> {
    try {
      await this.mail.send(message);
    } catch (error) {
      // Solo el nombre del error: el mensaje o la dirección pueden ser datos personales.
      this.logger.warn(`Falló el envío de un correo (${(error as Error).name}); se reintentará.`);
      this.pending.push({ message, attempts: 1 });
    }
  }

  /** Reintenta los pendientes; devuelve cuántos se enviaron o se descartaron. */
  async retryPending(): Promise<number> {
    const batch = this.pending;
    this.pending = [];
    let processed = 0;
    for (const item of batch) {
      try {
        await this.mail.send(item.message);
        processed += 1;
      } catch (error) {
        const attempts = item.attempts + 1;
        if (attempts >= MAX_MAIL_ATTEMPTS) {
          this.logger.error(
            `Se descartó un correo tras ${attempts} intentos (${(error as Error).name}).`,
          );
          processed += 1;
        } else {
          this.pending.push({ message: item.message, attempts });
        }
      }
    }
    return processed;
  }

  pendingCount(): number {
    return this.pending.length;
  }
}
