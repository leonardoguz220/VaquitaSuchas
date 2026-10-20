import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { NotificationCategory, NotificationType } from '../domain/catalog.js';
import type { DeliveryDecision, SkipReason } from '../domain/delivery-rules.js';
import { PREFERENCE_COLUMNS, toPreferences, type PreferenceRow } from './preferences.repository.js';
import type { DeliveryPreferences } from '../domain/delivery-rules.js';

export interface DueDelivery {
  id: string;
  attempts: number;
  respectWindow: boolean;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  link: string | null;
  userId: string;
  userEmail: string;
  userStatus: string;
  prefs: DeliveryPreferences;
}

type DueRow = PreferenceRow & {
  id: string;
  attempts: number;
  respect_window: boolean;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  link: string | null;
  user_id: string;
  email: string;
  user_status: string;
};

/** Único lugar con SQL sobre `notification_deliveries` (0072): el buzón de salida por canal. */
@Injectable()
export class DeliveriesRepository {
  /** Un envío por canal decidido por `deliveryPlan`, en la transacción del aviso (RNF-005-04). */
  async insertPlan(
    q: Queryable,
    notificationId: string,
    decisions: readonly DeliveryDecision[],
    now: Date,
  ): Promise<void> {
    for (const d of decisions) {
      await q.query(
        `INSERT INTO notification_deliveries
           (notification_id, channel, status, respect_window, next_attempt_at, skip_reason)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (notification_id, channel) DO NOTHING`,
        [
          notificationId,
          d.channel,
          d.status,
          d.respectWindow,
          now,
          d.status === 'skipped' ? d.reason : null,
        ],
      );
    }
  }

  /** Lote de correos pendientes que ya tocan, bloqueados para esta transacción (RF-005-19). */
  async claimDueEmails(q: Queryable, now: Date, limit: number): Promise<DueDelivery[]> {
    const result = await q.query<DueRow>(
      `SELECT d.id, d.attempts, d.respect_window, n.type, n.category, n.title, n.body, n.link,
              n.user_id, u.email, u.status AS user_status, ${PREFERENCE_COLUMNS}
         FROM notification_deliveries d
         JOIN notifications n ON n.id = d.notification_id
         JOIN users u ON u.id = n.user_id
         LEFT JOIN notification_preferences p ON p.user_id = n.user_id
        WHERE d.status = 'pending' AND d.channel = 'email' AND d.next_attempt_at <= $1
        ORDER BY d.next_attempt_at, d.id
        LIMIT $2
          FOR UPDATE OF d SKIP LOCKED`,
      [now, limit],
    );
    return result.rows.map((r) => ({
      id: r.id,
      attempts: r.attempts,
      respectWindow: r.respect_window,
      type: r.type,
      category: r.category,
      title: r.title,
      body: r.body,
      link: r.link,
      userId: r.user_id,
      userEmail: r.email,
      userStatus: r.user_status,
      prefs: toPreferences(r),
    }));
  }

  async markSent(q: Queryable, id: string, now: Date, attempts: number): Promise<void> {
    await q.query(
      `UPDATE notification_deliveries SET status = 'sent', sent_at = $2, attempts = $3,
              last_error = NULL WHERE id = $1`,
      [id, now, attempts],
    );
  }

  async markSkipped(q: Queryable, id: string, reason: SkipReason): Promise<void> {
    await q.query(
      `UPDATE notification_deliveries SET status = 'skipped', skip_reason = $2 WHERE id = $1`,
      [id, reason],
    );
  }

  /** Espera la siguiente ventana sin gastar un intento. */
  async defer(q: Queryable, id: string, nextAttemptAt: Date): Promise<void> {
    await q.query('UPDATE notification_deliveries SET next_attempt_at = $2 WHERE id = $1', [
      id,
      nextAttemptAt,
    ]);
  }

  /** `error` es solo el nombre del error: nunca la dirección ni el texto del aviso. */
  async markAttemptFailed(
    q: Queryable,
    id: string,
    attempts: number,
    next: { status: 'pending'; nextAttemptAt: Date } | { status: 'failed' },
    error: string,
  ): Promise<void> {
    await q.query(
      `UPDATE notification_deliveries
          SET status = $2, attempts = $3, last_error = $4,
              next_attempt_at = COALESCE($5, next_attempt_at)
        WHERE id = $1`,
      [
        id,
        next.status,
        attempts,
        error.slice(0, 200),
        next.status === 'pending' ? next.nextAttemptAt : null,
      ],
    );
  }
}
