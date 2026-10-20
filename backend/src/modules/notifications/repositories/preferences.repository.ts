import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '../domain/catalog.js';
import {
  DEFAULT_PREFERENCES,
  type CategorySwitches,
  type DeliveryChannel,
  type DeliveryPreferences,
} from '../domain/delivery-rules.js';

/** Columnas de `notification_preferences` con alias `p`, para leerlas junto a otras tablas. */
export const PREFERENCE_COLUMNS = `p.email_recordatorios, p.email_resoluciones, p.email_titular,
  p.email_grupo, p.telegram_recordatorios, p.telegram_resoluciones, p.telegram_titular,
  p.telegram_grupo, p.telegram_blocked_at, p.email_bounced_at`;

export interface PreferenceRow {
  email_recordatorios: boolean | null;
  email_resoluciones: boolean | null;
  email_titular: boolean | null;
  email_grupo: boolean | null;
  telegram_recordatorios: boolean | null;
  telegram_resoluciones: boolean | null;
  telegram_titular: boolean | null;
  telegram_grupo: boolean | null;
  telegram_blocked_at: Date | null;
  email_bounced_at: Date | null;
}

const switches = (row: PreferenceRow, channel: DeliveryChannel): CategorySwitches => {
  const result = { ...DEFAULT_PREFERENCES[channel] };
  for (const category of NOTIFICATION_CATEGORIES) {
    const value = row[`${channel}_${category}`];
    if (value !== null && value !== undefined) result[category] = value;
  }
  return result;
};

/** Sin fila (todo `null` por el `LEFT JOIN`) rige el valor por defecto: todo encendido. */
export function toPreferences(row: PreferenceRow): DeliveryPreferences {
  return {
    email: switches(row, 'email'),
    telegram: switches(row, 'telegram'),
    telegramBlockedAt: row.telegram_blocked_at ?? null,
    emailBouncedAt: row.email_bounced_at ?? null,
  };
}

export type PreferencesPatch = Partial<Record<DeliveryChannel, Partial<CategorySwitches>>>;

/** Único lugar con SQL sobre `notification_preferences` (0071): una fila por usuario. */
@Injectable()
export class PreferencesRepository {
  /** Crea la fila con los valores por defecto si no existe (RF-005-17). */
  async ensure(q: Queryable, userId: string): Promise<void> {
    await q.query(
      'INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [userId],
    );
  }

  /** Preferencias del usuario y su estado de cuenta; las crea si aún no existen. */
  async ensureAndGet(
    q: Queryable,
    userId: string,
  ): Promise<{ prefs: DeliveryPreferences; userStatus: string; telegramLinked: boolean } | null> {
    await this.ensure(q, userId);
    const result = await q.query<
      PreferenceRow & { status: string; telegram_user_id: string | null }
    >(
      `SELECT u.status, u.telegram_user_id, ${PREFERENCE_COLUMNS}
         FROM users u LEFT JOIN notification_preferences p ON p.user_id = u.id
        WHERE u.id = $1`,
      [userId],
    );
    const row = result.rows[0];
    return row
      ? {
          prefs: toPreferences(row),
          userStatus: row.status,
          telegramLinked: row.telegram_user_id !== null,
        }
      : null;
  }

  async get(q: Queryable, userId: string): Promise<DeliveryPreferences> {
    return (await this.ensureAndGet(q, userId))?.prefs ?? DEFAULT_PREFERENCES;
  }

  /** Aplica solo los interruptores enviados; los nombres de columna salen de listas fijas. */
  async update(q: Queryable, userId: string, patch: PreferencesPatch): Promise<void> {
    await this.ensure(q, userId);
    const sets: string[] = [];
    const params: unknown[] = [userId];
    for (const channel of ['email', 'telegram'] as const) {
      for (const category of NOTIFICATION_CATEGORIES) {
        const value = patch[channel]?.[category];
        if (value === undefined) continue;
        params.push(value);
        sets.push(`${channel}_${category} = $${params.length}`);
      }
    }
    if (sets.length === 0) return;
    await q.query(
      `UPDATE notification_preferences SET ${sets.join(', ')} WHERE user_id = $1`,
      params,
    );
  }

  async disableEmail(q: Queryable, userId: string, category: NotificationCategory): Promise<void> {
    await this.update(q, userId, { email: { [category]: false } });
  }

  /** RF-005-28: la persona bloqueó el bot; se corta el canal hasta que lo reactive. */
  async markTelegramBlocked(q: Queryable, telegramUserId: number, now: Date): Promise<void> {
    await q.query(
      `INSERT INTO notification_preferences (user_id, telegram_blocked_at)
       SELECT id, $2 FROM users WHERE telegram_user_id = $1
       ON CONFLICT (user_id) DO UPDATE
         SET telegram_blocked_at = COALESCE(notification_preferences.telegram_blocked_at, $2)`,
      [telegramUserId, now],
    );
  }

  /** CA-005-33: vuelve a permitir los avisos por Telegram (el celular sigue verificado). */
  async clearTelegramBlocked(q: Queryable, userId: string): Promise<void> {
    await this.ensure(q, userId);
    await q.query(
      'UPDATE notification_preferences SET telegram_blocked_at = NULL WHERE user_id = $1',
      [userId],
    );
  }

  /** RF-005-17: rebote permanente del correo; se deja de enviar. */
  async markEmailBounced(q: Queryable, userId: string, now: Date): Promise<void> {
    await this.ensure(q, userId);
    await q.query(
      `UPDATE notification_preferences SET email_bounced_at = COALESCE(email_bounced_at, $2)
        WHERE user_id = $1`,
      [userId, now],
    );
  }
}
