import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { NotificationCategory } from '../domain/catalog.js';
import type { CategorySwitches } from '../domain/delivery-rules.js';
import {
  PreferencesRepository,
  type PreferencesPatch,
} from '../repositories/preferences.repository.js';
import { UnsubscribeLinksService } from './unsubscribe-links.service.js';

export interface PreferencesView {
  email: CategorySwitches;
  /** `blocked`: el usuario bloqueó el bot de Telegram (RF-005-28). */
  telegram: CategorySwitches & { blocked: boolean };
  /** Correo con rebote permanente: se dejó de enviar (RF-005-17). */
  emailProblem: boolean;
  /** Informativo: los correos de seguridad no se desactivan (RF-005-17). */
  securityEmailsAlwaysOn: true;
}

/** Preferencias de aviso del usuario y desactivación desde el correo (RF-005-17, RF-005-18). */
@Injectable()
export class PreferencesService {
  constructor(
    private readonly db: DbService,
    private readonly repository: PreferencesRepository,
    private readonly links: UnsubscribeLinksService,
    private readonly clock: Clock,
  ) {}

  async get(userId: string): Promise<PreferencesView> {
    return this.view(userId);
  }

  /** CA-005-11: solo cambian los interruptores enviados; la app y la seguridad no se desactivan. */
  async update(userId: string, patch: PreferencesPatch): Promise<PreferencesView> {
    await this.repository.update(this.db, userId, patch);
    return this.view(userId);
  }

  /** CA-005-13: desactiva el correo de la categoría del token. `400` si el token no es válido. */
  async unsubscribe(token: string): Promise<{ category: NotificationCategory }> {
    const payload = this.links.verify(token);
    if (!payload) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
        fields: { token: ['INVALID_TOKEN'] },
      });
    }
    try {
      await this.repository.disableEmail(this.db, payload.userId, payload.category);
    } catch {
      // Usuario inexistente (token firmado de una cuenta que ya no está): mismo error opaco.
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
        fields: { token: ['INVALID_TOKEN'] },
      });
    }
    return { category: payload.category };
  }

  private async view(userId: string): Promise<PreferencesView> {
    const prefs = await this.repository.get(this.db, userId);
    return {
      email: prefs.email,
      telegram: { ...prefs.telegram, blocked: prefs.telegramBlockedAt !== null },
      emailProblem: prefs.emailBouncedAt !== null,
      securityEmailsAlwaysOn: true,
    };
  }
}
