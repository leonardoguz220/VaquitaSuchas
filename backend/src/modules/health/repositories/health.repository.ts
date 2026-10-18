import { Injectable } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';

@Injectable()
export class HealthRepository {
  constructor(private readonly db: DbService) {}

  /** Comprueba que la base responde. Rechaza con el error original de pg; el servicio lo traduce. */
  async ping(): Promise<void> {
    await this.db.query('SELECT 1');
  }
}
