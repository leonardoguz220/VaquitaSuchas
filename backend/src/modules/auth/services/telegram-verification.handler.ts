import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import {
  TelegramGateway,
  type TelegramUpdateHandler,
} from '../../telegram/ports/telegram.gateway.js';
import type { ParsedUpdate } from '../../telegram/domain/telegram-update.js';
import { IdentityService } from '../../users/services/identity.service.js';
import { normalizeBolivianPhone } from '../domain/phone.js';
import { decideContact, type VerificationOutcome } from '../domain/phone-verification.js';
import { hashToken, tokenIsUsable } from '../domain/tokens.js';
import {
  PhoneTokensRepository,
  type PhoneTokenRow,
} from '../repositories/phone-tokens.repository.js';
import { RegistrationRepository } from '../repositories/registration.repository.js';

const HELP = 'Para verificar tu celular abre el enlace que te dio Vaquita al registrarte.';
const STALE = 'Este enlace venció o ya se usó. Vuelve a Vaquita y pide uno nuevo.';
const BUSY = 'Este enlace ya lo inició otra cuenta de Telegram. Vuelve a Vaquita y pide uno nuevo.';
const ASK_CONTACT = 'Toca el botón para compartir tu contacto y verificar tu celular.';
const DONE = 'Listo, vuelve a Vaquita.';
const REJECTIONS: Record<Exclude<VerificationOutcome, 'verificado'>, string> = {
  rechazado_no_boliviano: 'Solo se aceptan celulares de Bolivia.',
  rechazado_contacto_ajeno: 'Comparte tu propio contacto, no el de otra persona.',
  rechazado_bloqueado: 'No es posible crear la cuenta con estos datos.',
  rechazado_duplicado: 'Ya existe una cuenta con ese celular o esa cuenta de Telegram.',
};

/** Verificación del celular con el bot (RF-003-21): «Iniciar» con el token y luego el contacto. */
@Injectable()
export class TelegramVerificationHandler implements TelegramUpdateHandler {
  private readonly logger = new Logger(TelegramVerificationHandler.name);

  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly gateway: TelegramGateway,
    private readonly identity: IdentityService,
    private readonly tokens: PhoneTokensRepository,
    private readonly users: RegistrationRepository,
  ) {}

  async handle(update: ParsedUpdate): Promise<void> {
    const { command, telegramUserId, chatId } = update;
    if (telegramUserId === undefined || chatId === undefined) return;
    if (command.type === 'bot_status') return;
    let reply: string;
    let withContactButton = false;
    if (command.type === 'start' && command.token) {
      const started = await this.start(command.token, telegramUserId);
      reply = started === 'ok' ? ASK_CONTACT : started === 'busy' ? BUSY : STALE;
      withContactButton = started === 'ok';
    } else if (command.type === 'contact') {
      reply = await this.contact(command, telegramUserId);
    } else {
      reply = HELP;
    }
    try {
      await this.gateway.sendMessage(chatId, {
        text: reply,
        ...(withContactButton
          ? { buttons: [{ text: 'Compartir mi contacto', requestContact: true }] }
          : {}),
      });
    } catch {
      // Solo el nombre: el mensaje del error puede traer datos de la cuenta.
      this.logger.warn('No se pudo responder en Telegram.');
    }
  }

  private async start(token: string, telegramUserId: number): Promise<'ok' | 'busy' | 'stale'> {
    return this.db.withTransaction(async (tx) => {
      const now = this.clock.now();
      const row = await this.tokens.findByHashForUpdate(tx, hashToken(token));
      if (!row || tokenIsUsable(asToken(row), now) !== 'usable') return 'stale';
      // Quien pulsó Iniciar primero retiene el enlace: otra cuenta no puede secuestrarlo.
      if (row.started_by_telegram_id && row.started_by_telegram_id !== String(telegramUserId)) {
        return 'busy';
      }
      await this.tokens.markStarted(tx, row.id, telegramUserId, now);
      return 'ok';
    });
  }

  private async contact(
    command: { phoneNumber: string; contactUserId?: number },
    telegramUserId: number,
  ): Promise<string> {
    return this.db.withTransaction(async (tx) => {
      const now = this.clock.now();
      const row = await this.tokens.findOpenStartedBy(tx, telegramUserId);
      if (!row) return HELP;
      if (tokenIsUsable(asToken(row), now) !== 'usable') return STALE;

      // Si el celular no es boliviano, decideContact lo rechaza antes de mirar bloqueos o duplicados.
      const phone = normalizeBolivianPhone(command.phoneNumber);
      const decision = decideContact({
        fromTelegramId: telegramUserId,
        contactUserId: command.contactUserId,
        phoneNumber: command.phoneNumber,
        blocked: phone ? await this.identity.isBlocked(tx, { phone, telegramUserId }) : false,
        phoneTaken: phone ? await this.users.phoneTaken(tx, phone, row.user_id) : false,
        telegramTaken: await this.users.telegramTaken(tx, telegramUserId, row.user_id),
      });

      await this.tokens.markUsed(tx, row.id, decision.outcome, now);
      if (decision.outcome !== 'verificado') return REJECTIONS[decision.outcome];
      if (row.purpose === 'cambio_celular') {
        await this.users.changePhone(tx, row.user_id, decision.phone!, telegramUserId);
      } else {
        await this.users.markVerified(tx, row.user_id, decision.phone!, telegramUserId, now);
      }
      return DONE;
    });
  }
}

function asToken(row: PhoneTokenRow): { expiresAt: Date; usedAt: Date | null } {
  return { expiresAt: row.expires_at, usedAt: row.used_at };
}
