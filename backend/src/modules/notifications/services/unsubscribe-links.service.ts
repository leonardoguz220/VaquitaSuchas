import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NotificationCategory } from '../domain/catalog.js';
import {
  signUnsubscribe,
  verifyUnsubscribe,
  type UnsubscribePayload,
} from '../domain/unsubscribe-token.js';

/**
 * Firma y verifica los tokens de desactivación (RF-005-18). La clave sale de `FINGERPRINT_KEY`
 * (variable de entorno) con una etiqueta propia, así este uso no comparte clave con otros HMAC.
 */
@Injectable()
export class UnsubscribeLinksService {
  private readonly key: Buffer;
  readonly appUrl: string;

  constructor(config: ConfigService) {
    this.key = createHmac('sha256', config.getOrThrow<string>('FINGERPRINT_KEY'))
      .update('vaquita:notifications:unsubscribe:v1')
      .digest();
    this.appUrl = (config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );
  }

  /** Enlace a la página que confirma con `POST` (el `GET` no cambia nada). */
  urlFor(userId: string, category: NotificationCategory): string {
    const token = signUnsubscribe(this.key, { userId, category, channel: 'email' });
    return `${this.appUrl}/avisos/desactivar?token=${encodeURIComponent(token)}`;
  }

  verify(token: string): UnsubscribePayload | null {
    return verifyUnsubscribe(this.key, token);
  }
}
