import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type DbTransaction, type Queryable } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { AUDIT_PORT, type AuditPort } from '../../join-requests/ports/audit.port.js';
import {
  REPUTATION_QUERY_PORT,
  type ReputationQueryPort,
} from '../../join-requests/ports/reputation-query.port.js';
import { MailOutbox } from '../../auth/services/mail-outbox.js';
import { maskCi } from '../../users/domain/ci-mask.js';
import { IdentityService } from '../../users/services/identity.service.js';
import { UserAccountService } from '../../users/services/user-account.service.js';
import {
  canActOnUser,
  canRemoveAdminRole,
  type AccountRole,
  type AccountStatus,
  type AdminUserRef,
} from '../domain/admin-rules.js';
import { decodeAuditCursor, encodeAuditCursor } from '../domain/audit-cursor.js';
import { buildSuspensionMail } from '../domain/suspension-mail.js';
import {
  USER_GROUP_COUNTS_PORT,
  type UserGroupCountsPort,
} from '../ports/user-group-counts.port.js';
import { BansRepository } from '../repositories/bans.repository.js';
import { HostEnablementsRepository } from '../repositories/host-enablements.repository.js';
import { SuspensionsRepository } from '../repositories/suspensions.repository.js';
import {
  UsersAdminRepository,
  type AdminUserDetailRow,
  type AdminUserListRow,
  type UserListFilters,
} from '../repositories/users-admin.repository.js';
import { requireReason, ruleError, userNotFound } from './admin-errors.js';

export const USERS_DEFAULT_LIMIT = 20;
export const USERS_MAX_LIMIT = 100;

export interface AdminUserRowView {
  id: string;
  fullName: string;
  email: string;
  role: AccountRole;
  status: AccountStatus;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserView extends AdminUserRowView {
  phone: string | null;
  ciMasked: string;
  groupsAsHost: number;
  groupsAsMember: number;
  /** Sin la spec 007 todo es «Sin calificación» y 0 cobros considerados (adaptador por defecto). */
  reputation: { level: string | null; stars: number | null; consideredCharges: number };
  /** Sin la spec 007 (reportes) no hay origen de datos: 0 por defecto. */
  reportsReceived: number;
  ban: {
    id: string;
    reason: string;
    source: string;
    disputeId: string | null;
    bannedBy: string;
    bannedAt: string;
  } | null;
  suspension: { reason: string; suspendedBy: string; suspendedAt: string } | null;
  hostEnablement: { reason: string; enabledBy: string; enabledAt: string } | null;
}

export interface UserListQuery extends UserListFilters {
  limit?: number;
  cursor?: string;
}

const toRowView = (row: AdminUserListRow): AdminUserRowView => ({
  id: row.id,
  fullName: row.fullName,
  email: row.email,
  role: row.role,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
});

const refOf = (row: Pick<AdminUserDetailRow, 'id' | 'role' | 'status'>): AdminUserRef => ({
  id: row.id,
  role: row.role,
  status: row.status,
});

/** Usuarios en administración (RF-009-03, 08, 09, 10; RN-009-01..04). Cada acción audita en su transacción. */
@Injectable()
export class UsersAdminService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly config: ConfigService,
    private readonly repository: UsersAdminRepository,
    private readonly bans: BansRepository,
    private readonly suspensions: SuspensionsRepository,
    private readonly enablements: HostEnablementsRepository,
    private readonly account: UserAccountService,
    private readonly identity: IdentityService,
    private readonly mail: MailOutbox,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(REPUTATION_QUERY_PORT) private readonly reputation: ReputationQueryPort,
    @Inject(USER_GROUP_COUNTS_PORT) private readonly groupCounts: UserGroupCountsPort,
  ) {}

  /** `GET /admin/users` (CA-009-07). */
  async list(
    query: UserListQuery,
  ): Promise<{ items: AdminUserRowView[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(query.limit ?? USERS_DEFAULT_LIMIT, 1), USERS_MAX_LIMIT);
    const after = query.cursor === undefined ? null : decodeAuditCursor(query.cursor);
    if (query.cursor !== undefined && after === null) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
        fields: { cursor: ['INVALID_CURSOR'] },
      });
    }
    const { items, next } = await this.repository.list(
      this.db,
      { q: query.q, status: query.status, role: query.role },
      { limit, after },
    );
    return { items: items.map(toRowView), nextCursor: next ? encodeAuditCursor(next) : null };
  }

  /** `GET /admin/users/:userId` (CA-009-08, CA-009-36): sin contraseña, CI completa ni comprobantes. */
  async getDetail(userId: string, q: Queryable = this.db): Promise<AdminUserView> {
    const row = await this.repository.findDetail(q, userId);
    if (!row) throw userNotFound();
    const [counts, reputations, ban, suspension, enablement] = await Promise.all([
      this.groupCounts.count(q, userId),
      this.reputation.getMany(q, [userId]),
      this.bans.findActiveByUser(q, userId),
      this.suspensions.findOpenByUser(q, userId),
      this.enablements.findActiveByUser(q, userId),
    ]);
    const stars = reputations.get(userId);
    return {
      ...toRowView(row),
      phone: row.phone,
      ciMasked: maskCi(this.identity.decryptCi(row.ciEncrypted)),
      groupsAsHost: counts.asHost,
      groupsAsMember: counts.asMember,
      reputation: {
        level: stars?.level ?? null,
        stars: stars?.stars ?? null,
        consideredCharges: 0,
      },
      reportsReceived: 0,
      ban: ban
        ? {
            id: ban.id,
            reason: ban.reason,
            source: ban.source,
            disputeId: ban.disputeId,
            bannedBy: ban.bannedBy,
            bannedAt: ban.bannedAt.toISOString(),
          }
        : null,
      suspension: suspension
        ? {
            reason: suspension.reason,
            suspendedBy: suspension.suspendedBy,
            suspendedAt: suspension.suspendedAt.toISOString(),
          }
        : null,
      hostEnablement: enablement
        ? {
            reason: enablement.reason,
            enabledBy: enablement.enabledBy,
            enabledAt: enablement.enabledAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * Suspende dentro de la transacción de quien llama (también la usa la moderación de
   * publicaciones, RF-009-13) y devuelve el correo de la persona para avisarle después de confirmar.
   */
  async suspendWithin(
    tx: DbTransaction,
    adminId: string,
    userId: string,
    reason: string,
  ): Promise<string> {
    const { actor, target } = await this.lockActorAndTarget(tx, adminId, userId);
    const verdict = canActOnUser({
      actor: refOf(actor),
      target: refOf(target),
      action: 'suspend',
    });
    if (!verdict.ok) throw ruleError(verdict);
    await this.suspensions.insert(tx, {
      userId,
      reason,
      suspendedBy: adminId,
      suspendedAt: this.clock.now(),
    });
    await this.account.setStatus(tx, userId, 'suspendido');
    await this.audit.record(tx, {
      actorId: adminId,
      action: 'usuario_suspender',
      targetType: 'user',
      targetId: userId,
      reason,
      metadata: { previousStatus: target.status },
    });
    return target.email;
  }

  /** RF-009-11: si el envío falla, MailOutbox lo deja en reintentos y la suspensión se mantiene. */
  async sendSuspensionMail(email: string, reason: string): Promise<void> {
    await this.mail.send(
      buildSuspensionMail({
        to: email,
        reason,
        appealEmail: this.config.get<string>('APPEAL_EMAIL'),
      }),
    );
  }

  /** `POST …/suspend` (CA-009-09, 10, 13). El correo sale después de confirmar y no puede deshacerla. */
  async suspend(adminId: string, userId: string, reasonInput: unknown): Promise<AdminUserView> {
    const reason = requireReason(reasonInput);
    const email = await this.db.withTransaction((tx) =>
      this.suspendWithin(tx, adminId, userId, reason),
    );
    await this.sendSuspensionMail(email, reason);
    return this.getDetail(userId);
  }

  /** `POST …/reactivate` (CA-009-11, 24): solo desde `suspendido`; un baneo no se deshace aquí. */
  async reactivate(adminId: string, userId: string, reasonInput: unknown): Promise<AdminUserView> {
    const reason =
      reasonInput === undefined || reasonInput === null || reasonInput === ''
        ? null
        : requireReason(reasonInput);
    await this.db.withTransaction(async (tx) => {
      const { actor, target } = await this.lockActorAndTarget(tx, adminId, userId);
      const verdict = canActOnUser({
        actor: refOf(actor),
        target: refOf(target),
        action: 'reactivate',
      });
      if (!verdict.ok) throw ruleError(verdict);
      await this.suspensions.closeOpen(tx, {
        userId,
        reactivatedBy: adminId,
        reactivatedAt: this.clock.now(),
      });
      await this.account.setStatus(tx, userId, 'activo');
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'usuario_reactivar',
        targetType: 'user',
        targetId: userId,
        reason: reason ?? undefined,
        metadata: { previousStatus: target.status },
      });
    });
    return this.getDetail(userId);
  }

  /** `POST …/role` (CA-009-12, RN-009-01): promover o quitar el rol; cierra las sesiones del afectado. */
  async changeRole(
    adminId: string,
    userId: string,
    role: AccountRole,
    reasonInput: unknown,
  ): Promise<AdminUserView> {
    const reason = requireReason(reasonInput);
    await this.db.withTransaction(async (tx) => {
      const { actor, target } = await this.lockActorAndTarget(tx, adminId, userId);
      if (target.role === role) {
        throw ruleError({ ok: false, code: 'INVALID_TRANSITION', rule: 'RN-009-03' });
      }
      if (role === 'usuario') {
        // El último administrador se rechaza con LAST_ADMIN antes que por «uno mismo».
        const last = canRemoveAdminRole({
          activeAdmins: await this.repository.countActiveAdmins(tx),
          target: refOf(target),
        });
        if (!last.ok) throw ruleError(last);
        const verdict = canActOnUser({
          actor: refOf(actor),
          target: refOf(target),
          action: 'remove_role',
        });
        if (!verdict.ok) throw ruleError(verdict);
      }
      await this.account.setRole(tx, userId, role);
      await this.audit.record(tx, {
        actorId: adminId,
        action: role === 'admin' ? 'rol_promover' : 'rol_quitar',
        targetType: 'user',
        targetId: userId,
        reason,
        metadata: { fromRole: target.role, toRole: role },
      });
    });
    return this.getDetail(userId);
  }

  private async lockActorAndTarget(
    tx: DbTransaction,
    adminId: string,
    userId: string,
  ): Promise<{ actor: AdminUserDetailRow; target: AdminUserDetailRow }> {
    const target = await this.repository.findDetail(tx, userId, true);
    if (!target) throw userNotFound();
    const actor = adminId === userId ? target : await this.repository.findDetail(tx, adminId);
    if (!actor) throw userNotFound();
    return { actor, target };
  }
}
