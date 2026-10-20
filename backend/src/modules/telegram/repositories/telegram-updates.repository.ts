import { Injectable } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';

/** Único lugar con SQL sobre `telegram_updates` (0004_telegram_updates.sql). */
@Injectable()
export class TelegramUpdatesRepository {
  constructor(private readonly db: DbService) {}

  /** Registra el `update_id`. Devuelve `false` si ya se había recibido. */
  async insertIfNew(updateId: number, receivedAt: Date): Promise<boolean> {
    const result = await this.db.query(
      `INSERT INTO telegram_updates (update_id, received_at)
       VALUES ($1, $2)
       ON CONFLICT (update_id) DO NOTHING`,
      [updateId, receivedAt],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
