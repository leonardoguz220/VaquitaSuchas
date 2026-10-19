import type { DbTransaction } from '../../../shared/db/db.service.js';

export interface AuditEntry {
  actorId: string;
  /** Por ejemplo `dispute.evidence.open` o `dispute.resolve`. */
  action: string;
  targetType: string;
  targetId: string;
  /** Sin texto de mensajes, referencias ni datos personales. */
  metadata?: Record<string, unknown>;
}

/**
 * Registro de auditoría de administración (CA-010-29, RNF-010-08). Lo define la spec 010 y lo
 * implementa la spec 009; hasta que exista, el adaptador por defecto no registra nada.
 */
export interface AuditPort {
  record(tx: DbTransaction, entry: AuditEntry): Promise<void>;
}

export const AUDIT_PORT = Symbol('AUDIT_PORT');
