import { Injectable } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { ShortfallsRepository } from '../repositories/shortfalls.repository.js';

const QUEUE_LIMIT = 100;

export interface DisputedRefundView {
  rowId: string;
  groupId: string;
  groupName: string;
  period: string;
  memberName: string;
  hostName: string;
  refundAmountCents: number;
  refundMethod: 'qr' | 'transferencia' | 'efectivo' | null;
  refundReference: string | null;
  disputeReason: string;
  disputedAt: string;
}

/**
 * Cola de devoluciones disputadas para administración (spec 011 T017). Solo lectura: Vaquita no
 * mueve dinero, así que el administrador consulta el caso y lo media fuera de la app.
 */
@Injectable()
export class ShortfallDisputesService {
  constructor(
    private readonly db: DbService,
    private readonly repo: ShortfallsRepository,
  ) {}

  async list(): Promise<{ items: DisputedRefundView[] }> {
    const rows = await this.repo.listDisputedRefunds(this.db, QUEUE_LIMIT);
    return { items: rows.map((row) => ({ ...row, disputedAt: row.disputedAt.toISOString() })) };
  }
}
