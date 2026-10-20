import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { PurgeRepository } from '../repositories/purge.repository.js';

export const NOTIFICATION_RETENTION_DAYS = 90;
export const INVITATION_RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Tarea `notifications.purge` (RF-005-21, CA-005-23): las notificaciones se conservan 90 días y las
 * direcciones de correo de las invitaciones 30. Idempotente: decide por la fecha de cada fila.
 */
@Injectable()
export class PurgeService {
  private readonly logger = new Logger(PurgeService.name);

  constructor(
    private readonly db: DbService,
    private readonly purgeRepo: PurgeRepository,
  ) {}

  /** Devuelve cuántas filas eliminó en total. */
  async run(now: Date): Promise<number> {
    const notificationsCutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * MS_PER_DAY);
    const invitationsCutoff = new Date(now.getTime() - INVITATION_RETENTION_DAYS * MS_PER_DAY);
    const counts = await this.db.withTransaction(async (tx) => ({
      notifications: await this.purgeRepo.deleteNotificationsBefore(tx, notificationsCutoff),
      invitations: await this.purgeRepo.deleteInvitationsBefore(tx, invitationsCutoff),
    }));
    if (counts.notifications + counts.invitations > 0) {
      this.logger.log(
        `Limpieza: ${counts.notifications} avisos y ${counts.invitations} invitaciones eliminados.`,
      );
    }
    return counts.notifications + counts.invitations;
  }
}
