import { Injectable } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';

/** SQL de limpieza de cuentas sin verificar (los tokens se van en cascada). */
@Injectable()
export class UnverifiedUsersRepository {
  constructor(private readonly db: DbService) {}

  async deleteCreatedBefore(cutoff: Date): Promise<number> {
    const result = await this.db.query(
      'DELETE FROM users WHERE verified_at IS NULL AND created_at < $1',
      [cutoff],
    );
    return result.rowCount ?? 0;
  }
}
