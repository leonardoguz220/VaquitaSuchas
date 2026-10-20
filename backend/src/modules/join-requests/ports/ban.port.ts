import type { DbTransaction } from '../../../shared/db/db.service.js';

export interface BanInput {
  adminId: string;
  userId: string;
  /** 10 a 300 caracteres, ya recortado o por recortar (lo valida quien implementa). */
  reason: string;
  /** Reclamo que origina el baneo; `null` si lo decide un administrador sin reclamo. */
  disputeId: string | null;
}

/**
 * Baneo completo de una cuenta (RN-010-08, RF-009-19). Lo define la spec 010 y lo implementa la
 * spec 009 (`BanService`); el adaptador nulo de `app-adapters/` queda solo para pruebas sin la 009.
 * Corre en la transacción de quien llama; devuelve el baneo creado (`null` en el adaptador nulo).
 */
export interface BanPort {
  ban(tx: DbTransaction, input: BanInput): Promise<{ banId: string } | null>;
}

export const BAN_PORT = Symbol('BAN_PORT');
