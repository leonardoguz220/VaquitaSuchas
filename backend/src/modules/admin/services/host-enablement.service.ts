import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { ErrorCode } from '../../../shared/errors/error-codes.js';
import { AUDIT_PORT, type AuditPort } from '../../join-requests/ports/audit.port.js';
import {
  HostEnablementsRepository,
  type HostEnablement,
} from '../repositories/host-enablements.repository.js';
import { UsersAdminRepository } from '../repositories/users-admin.repository.js';
import { requireReason, userNotFound } from './admin-errors.js';

export const HOST_ENABLEMENTS_LIMIT = 200;

export interface HostEnablementView {
  id: string;
  userId: string;
  reason: string;
  enabledBy: string;
  enabledAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

const toView = (e: HostEnablement): HostEnablementView => ({
  id: e.id,
  userId: e.userId,
  reason: e.reason,
  enabledBy: e.enabledBy,
  enabledAt: e.enabledAt.toISOString(),
  revokedAt: e.revokedAt?.toISOString() ?? null,
  revokedBy: e.revokedBy,
  revokeReason: e.revokeReason,
});

const conflict = (message: string): DomainError =>
  new DomainError(ErrorCode.CONFLICT, 409, message, { rule: 'RF-009-21' });

/**
 * Habilitación manual para ser titular (RF-009-21, RF-007-17): independiente de la calificación.
 * Cada cambio y su registro de auditoría van en la misma transacción.
 */
@Injectable()
export class HostEnablementService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly enablements: HostEnablementsRepository,
    private readonly users: UsersAdminRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async enable(adminId: string, userId: string, reasonInput: unknown): Promise<HostEnablementView> {
    const reason = requireReason(reasonInput);
    return this.db.withTransaction(async (tx) => {
      if (!(await this.users.findDetail(tx, userId, true))) throw userNotFound();
      if (await this.enablements.findActiveByUser(tx, userId)) {
        throw conflict('La persona ya tiene una habilitación vigente.');
      }
      const saved = await this.enablements.insert(tx, {
        userId,
        reason,
        enabledBy: adminId,
        enabledAt: this.clock.now(),
      });
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'titular_habilitar',
        targetType: 'user',
        targetId: userId,
        reason,
        metadata: { enablementId: saved.id },
      });
      return toView(saved);
    });
  }

  async revoke(adminId: string, userId: string, reasonInput: unknown): Promise<HostEnablementView> {
    const reason = requireReason(reasonInput);
    return this.db.withTransaction(async (tx) => {
      if (!(await this.users.findDetail(tx, userId, true))) throw userNotFound();
      const active = await this.enablements.findActiveByUser(tx, userId);
      if (!active) throw conflict('La persona no tiene una habilitación vigente.');
      const revoked = await this.enablements.revokeActive(tx, {
        userId,
        revokedBy: adminId,
        revokeReason: reason,
        revokedAt: this.clock.now(),
      });
      if (!revoked) throw conflict('La persona no tiene una habilitación vigente.');
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'titular_quitar_habilitacion',
        targetType: 'user',
        targetId: userId,
        reason,
        metadata: { enablementId: active.id },
      });
      return toView({
        ...active,
        revokedAt: this.clock.now(),
        revokedBy: adminId,
        revokeReason: reason,
      });
    });
  }

  /** `GET /admin/host-enablements`: por omisión solo las vigentes (`active=true`). */
  async list(activeOnly: boolean): Promise<{ items: HostEnablementView[] }> {
    const rows = await this.enablements.list(this.db, {
      activeOnly,
      limit: HOST_ENABLEMENTS_LIMIT,
    });
    return { items: rows.map(toView) };
  }
}
