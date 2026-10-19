import type { DbTransaction } from '../../../shared/db/db.service.js';

/**
 * Baneo de una cuenta (RN-010-08, `research.md` R5). Lo define la spec 010 y lo implementa la
 * spec 009; hasta que exista, el adaptador por defecto de `app-adapters/` no hace nada.
 */
export interface BanPort {
  ban(
    tx: DbTransaction,
    userId: string,
    context: { source: 'dispute'; disputeId: string },
  ): Promise<void>;
}

export const BAN_PORT = Symbol('BAN_PORT');
