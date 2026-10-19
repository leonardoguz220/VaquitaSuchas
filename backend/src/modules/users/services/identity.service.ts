import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queryable } from '../../../shared/db/db.service.js';
import { canonicalEmailForBan } from '../../auth/domain/email.js';
import {
  BannedIdentitiesRepository,
  type BannedFingerprint,
  type IdentityKind,
} from '../repositories/banned-identities.repository.js';
import { UsersRepository } from '../repositories/users.repository.js';

export const CI_KEY_VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** Clave de 32 bytes en hexadecimal (64 caracteres) o base64. */
export function parseKey(raw: string): Buffer {
  return Buffer.from(raw, /^[0-9a-fA-F]{64}$/.test(raw) ? 'hex' : 'base64');
}

/** AES-256-GCM: [versión de clave (1 byte)][iv (12)][etiqueta (16)][texto cifrado]. */
export function encryptCi(ci: string, key: Buffer, version = CI_KEY_VERSION): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(ci, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([version]), iv, cipher.getAuthTag(), body]);
}

/** `keys` asocia cada versión de clave con su clave; falla si la versión no existe o la etiqueta no cuadra. */
export function decryptCi(data: Buffer, keys: ReadonlyMap<number, Buffer>): string {
  const key = keys.get(data[0] ?? -1);
  if (!key || data.length < 1 + IV_LENGTH + TAG_LENGTH) throw new Error('CI cifrada no válida');
  const iv = data.subarray(1, 1 + IV_LENGTH);
  const tag = data.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(data.subarray(1 + IV_LENGTH + TAG_LENGTH)),
    decipher.final(),
  ]).toString('utf8');
}

/** HMAC-SHA256(clave del servidor, "kind:valor") en hex (RF-003-19). */
export function fingerprint(kind: IdentityKind, value: string, key: string): string {
  return createHmac('sha256', key).update(`${kind}:${value}`).digest('hex');
}

export interface IdentityCandidates {
  email?: string;
  phone?: string;
  ci?: string;
  telegramUserId?: string | number;
}

@Injectable()
export class IdentityService {
  private readonly ciKey: Buffer;
  private readonly fingerprintKey: string;

  constructor(
    config: ConfigService,
    private readonly users: UsersRepository,
    private readonly banned: BannedIdentitiesRepository,
  ) {
    this.ciKey = parseKey(config.getOrThrow<string>('CI_ENCRYPTION_KEY'));
    this.fingerprintKey = config.getOrThrow<string>('FINGERPRINT_KEY');
  }

  encryptCi(ci: string): Buffer {
    return encryptCi(ci, this.ciKey);
  }

  decryptCi(data: Buffer): string {
    return decryptCi(data, new Map([[CI_KEY_VERSION, this.ciKey]]));
  }

  fingerprint(kind: IdentityKind, value: string): string {
    return fingerprint(kind, value, this.fingerprintKey);
  }

  /** Huella del correo canónico (Gmail sin puntos ni alias). */
  emailFingerprint(email: string): string {
    return this.fingerprint('email', canonicalEmailForBan(email));
  }

  /** ¿Alguno de los datos tiene la huella bloqueada? */
  async isBlocked(q: Queryable, candidates: IdentityCandidates): Promise<boolean> {
    const items: BannedFingerprint[] = [];
    if (candidates.email)
      items.push({ kind: 'email', fingerprint: this.emailFingerprint(candidates.email) });
    if (candidates.phone)
      items.push({ kind: 'phone', fingerprint: this.fingerprint('phone', candidates.phone) });
    if (candidates.ci)
      items.push({ kind: 'ci', fingerprint: this.fingerprint('ci', candidates.ci) });
    if (candidates.telegramUserId !== undefined) {
      items.push({
        kind: 'telegram',
        fingerprint: this.fingerprint('telegram', String(candidates.telegramUserId)),
      });
    }
    return this.banned.existsAny(q, items);
  }

  /** Inserta las huellas de la cuenta (correo canónico, celular, CI, Telegram) sin descifrar la CI. */
  async blockIdentities(tx: Queryable, userId: string, banId: string): Promise<void> {
    const row = await this.users.findIdentityById(tx, userId);
    if (!row) return;
    const items: BannedFingerprint[] = [
      { kind: 'email', fingerprint: row.email_fingerprint },
      { kind: 'ci', fingerprint: row.ci_fingerprint },
    ];
    if (row.phone_e164)
      items.push({ kind: 'phone', fingerprint: this.fingerprint('phone', row.phone_e164) });
    if (row.telegram_user_id) {
      items.push({
        kind: 'telegram',
        fingerprint: this.fingerprint('telegram', row.telegram_user_id),
      });
    }
    await this.banned.insertMany(tx, banId, items);
  }

  async releaseIdentities(tx: Queryable, banId: string): Promise<void> {
    await this.banned.deleteByBanRef(tx, banId);
  }
}
