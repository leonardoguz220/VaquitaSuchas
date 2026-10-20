import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

/** SQL de la limpieza diaria (RF-005-21): notificaciones viejas y direcciones de invitaciones. */
@Injectable()
export class PurgeRepository {
  /**
   * Borra primero los envíos (FK RESTRICT) y luego las notificaciones creadas antes de `cutoff`.
   * Devuelve cuántas notificaciones se eliminaron.
   */
  async deleteNotificationsBefore(q: Queryable, cutoff: Date): Promise<number> {
    await q.query(
      `DELETE FROM notification_deliveries
        WHERE notification_id IN (SELECT id FROM notifications WHERE created_at < $1)`,
      [cutoff],
    );
    const result = await q.query('DELETE FROM notifications WHERE created_at < $1', [cutoff]);
    return result.rowCount ?? 0;
  }

  /**
   * `recipient_email` es NOT NULL (0073) y es dato de un tercero: se borra la fila entera.
   * Devuelve cuántas invitaciones se eliminaron.
   */
  async deleteInvitationsBefore(q: Queryable, cutoff: Date): Promise<number> {
    const result = await q.query('DELETE FROM group_invitations WHERE created_at < $1', [cutoff]);
    return result.rowCount ?? 0;
  }
}
