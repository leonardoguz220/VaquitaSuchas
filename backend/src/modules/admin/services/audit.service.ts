import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type DbTransaction } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { AuditEntry, AuditPort } from '../../join-requests/ports/audit.port.js';
import { decodeAuditCursor } from '../domain/audit-cursor.js';
import {
  normalizeAction,
  normalizeTargetType,
  sanitizeMetadata,
  type AdminAuditAction,
  type AuditTargetType,
} from '../domain/audit-entry.js';
import {
  AuditRepository,
  type AuditFilters,
  type AuditRecord,
} from '../repositories/audit.repository.js';

export const AUDIT_DEFAULT_LIMIT = 20;
export const AUDIT_MAX_LIMIT = 100;

export interface AuditEntryView {
  id: string;
  adminId: string;
  action: AdminAuditAction;
  targetType: AuditTargetType;
  targetId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface AuditPage {
  items: AuditEntryView[];
  nextCursor: string | null;
}

export interface AuditListQuery extends AuditFilters {
  limit?: number;
  cursor?: string;
}

const toView = (record: AuditRecord): AuditEntryView => ({
  id: record.id,
  adminId: record.adminId,
  action: record.action,
  targetType: record.targetType,
  targetId: record.targetId,
  reason: record.reason,
  metadata: record.metadata,
  occurredAt: record.occurredAt.toISOString(),
});

/**
 * Registro de auditoría de administración (RF-009-18). `record` escribe con la transacción de la
 * acción: si la acción se revierte, el registro también, y una acción confirmada nunca queda sin
 * registro. Los metadatos se limpian de datos sensibles (RNF-009-03). Solo anexa: no hay
 * operaciones de edición ni de borrado (RNF-009-05).
 */
@Injectable()
export class AuditService implements AuditPort {
  constructor(
    private readonly repository: AuditRepository,
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  async record(tx: DbTransaction, entry: AuditEntry): Promise<void> {
    const action = normalizeAction(entry.action);
    const targetType = normalizeTargetType(entry.targetType);
    if (!action || !targetType) {
      // Error de programación, no de la persona usuaria: el filtro global responde 500 genérico.
      throw new Error('Entrada de auditoría con acción o tipo de objetivo no permitido.');
    }
    await this.repository.insert(tx, {
      adminId: entry.actorId,
      action,
      targetType,
      targetId: entry.targetId,
      reason: entry.reason ?? null,
      metadata: sanitizeMetadata(action, entry.metadata),
      occurredAt: this.clock.now(),
    });
  }

  /** `GET /admin/audit-log` (RF-009-18; CA-009-18, CA-009-19). */
  async list(query: AuditListQuery): Promise<AuditPage> {
    const limit = Math.min(Math.max(query.limit ?? AUDIT_DEFAULT_LIMIT, 1), AUDIT_MAX_LIMIT);
    const after = query.cursor === undefined ? null : decodeAuditCursor(query.cursor);
    if (query.cursor !== undefined && after === null) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
        fields: { cursor: ['INVALID_CURSOR'] },
      });
    }
    if (query.from && query.to && query.from > query.to) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
        fields: { from: ['FROM_AFTER_TO'] },
      });
    }
    const { items, nextCursor } = await this.repository.list(
      this.db,
      {
        adminId: query.adminId,
        action: query.action,
        targetType: query.targetType,
        targetId: query.targetId,
        from: query.from,
        to: query.to,
      },
      { limit, after },
    );
    return { items: items.map(toView), nextCursor };
  }
}
