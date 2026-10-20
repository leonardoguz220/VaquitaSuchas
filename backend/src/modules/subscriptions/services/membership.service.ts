import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type DbTransaction } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type {
  GroupClosed,
  MemberAdded,
  MemberRemoved,
  MemberRemovedReason,
  OwnerChanged,
} from '../../../shared/events/group-events.js';
import { AUDIT_PORT, type AuditPort } from '../../join-requests/ports/audit.port.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import type { GroupDetail } from '../domain/group-detail.js';
import { canLeave, canReceiveOwnership } from '../domain/group-rules.js';
import { HOST_ELIGIBILITY_PORT, type HostEligibilityPort } from '../ports/host-eligibility.port.js';
import {
  OWNERSHIP_BLOCKERS_PORT,
  type OwnershipBlockersPort,
} from '../ports/ownership-blockers.port.js';
import { OPEN_CHARGES_PORT, type OpenChargesPort } from '../ports/open-charges.port.js';
import { GroupsRepository, type GroupRow } from '../repositories/groups.repository.js';
import { MembersRepository, type MemberRow } from '../repositories/members.repository.js';
import { GroupsService } from './groups.service.js';

/** Motivos con los que se retira a alguien; `abandono` es de `leave`. */
export type RemovalReason = Exclude<MemberRemovedReason, 'abandono'>;

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);

const groupClosed = (): DomainError =>
  new DomainError('GROUP_CLOSED', 422, 'El grupo está cerrado y solo se puede consultar.', {
    rule: 'RN-001-07',
  });

const groupFrozen = (): DomainError =>
  new DomainError('GROUP_FROZEN', 422, 'El grupo está congelado y solo se puede consultar.', {
    rule: 'RF-009-22',
  });

/** Altas y bajas de miembros de un grupo (spec 001 US4). */
@Injectable()
export class MembershipService {
  constructor(
    private readonly db: DbService,
    private readonly bus: TxEventBus,
    private readonly groups: GroupsRepository,
    private readonly members: MembersRepository,
    @Inject(OPEN_CHARGES_PORT) private readonly openCharges: OpenChargesPort,
    @Inject(HOST_ELIGIBILITY_PORT) private readonly eligibility: HostEligibilityPort,
    @Inject(OWNERSHIP_BLOCKERS_PORT) private readonly blockers: OwnershipBlockersPort,
    private readonly clock: Clock,
    private readonly groupsService: GroupsService,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  /**
   * Agrega un miembro dentro de la transacción del llamador (la spec 010 al aceptar una solicitud).
   * Bloquea el grupo, comprueba estado, duplicado y capacidad —con mensajes claros; el disparador
   * `group_members_capacity` lo garantiza ante carreras (CA-001-19)— y publica `MemberAdded`.
   */
  async addMemberTx(
    tx: DbTransaction,
    groupId: string,
    userId: string,
    source: 'creacion' | 'solicitud',
    joinRequestId: string | null,
  ): Promise<MemberRow> {
    const group = await this.groups.findByIdForUpdate(tx, groupId);
    if (!group) throw notFound();
    if (group.status === 'cerrado') throw groupClosed();
    if (group.frozen_at !== null) throw groupFrozen();
    if (await this.members.findActive(tx, groupId, userId)) {
      throw new DomainError(ErrorCode.BUSINESS_RULE, 422, 'Ya perteneces a este grupo.', {
        rule: 'RN-001-05',
      });
    }
    if ((await this.members.countActive(tx, groupId)) >= group.total_slots) {
      throw new DomainError(ErrorCode.BUSINESS_RULE, 422, 'No hay cupos disponibles.', {
        rule: 'RN-001-09',
      });
    }
    const member = await this.members.insert(tx, {
      groupId,
      userId,
      role: 'miembro',
      joinSource: source,
      joinRequestId,
    });
    const event: MemberAdded = { type: 'groups.member-added', groupId, userId };
    await this.bus.publish(tx, event);
    return member;
  }

  /**
   * Retira a un miembro activo (RF-001-15, RF-001-23). Sus cobros se conservan; devuelve cuántos
   * sigue debiendo para que el titular decida cancelarlos (spec 002, RF-002-13). Publica
   * `MemberRemoved(reason)`, que recalcula las cuotas de los demás. Quién puede pedirlo
   * (titular) lo decide el controlador; `mora` y `baneo` los llaman procesos del sistema.
   */
  async removeMember(
    groupId: string,
    userId: string,
    reason: RemovalReason,
  ): Promise<{ removedUserId: string; openCharges: number }> {
    return this.db.withTransaction((tx) => this.removeMemberTx(tx, groupId, userId, reason));
  }

  /**
   * Igual que `removeMember` pero dentro de la transacción del llamador (la tarea de atrasos de la
   * spec 002 retira por `mora` en la misma transacción que marca el cobro). No abre otra.
   */
  async removeMemberTx(
    tx: DbTransaction,
    groupId: string,
    userId: string,
    reason: RemovalReason,
  ): Promise<{ removedUserId: string; openCharges: number }> {
    const group = await this.groups.findByIdForUpdate(tx, groupId);
    if (!group) throw notFound();
    this.assertCanRemove(group, reason);
    const member = await this.members.findActive(tx, groupId, userId);
    if (!member) throw notFound();
    if (member.role === 'titular') {
      throw new DomainError(
        ErrorCode.BUSINESS_RULE,
        422,
        'No se puede quitar al titular: transfiere la titularidad o cierra el grupo.',
        { rule: 'RN-001-08', hint: 'TRANSFER_OR_CLOSE' },
      );
    }
    const openCharges = await this.openCharges.countOpenCharges(tx, groupId, userId);
    await this.members.markLeft(tx, groupId, userId, reason);
    const event: MemberRemoved = { type: 'groups.member-removed', groupId, userId, reason };
    await this.bus.publish(tx, event);
    return { removedUserId: userId, openCharges };
  }

  /**
   * El miembro abandona el grupo (RF-001-16, RN-001-08). `canLeave` decide: el titular no (debe
   * transferir o cerrar) y con cobros `pendiente`, `en_revision` o `atrasado` tampoco, contados
   * por `OpenChargesPort`. Un grupo cerrado o congelado es de solo lectura. Guarda `left_at` y
   * `left_reason = 'abandono'` y publica `MemberRemoved`.
   */
  async leave(groupId: string, userId: string): Promise<void> {
    await this.db.withTransaction(async (tx) => {
      const group = await this.groups.findByIdForUpdate(tx, groupId);
      if (!group) throw notFound();
      const member = await this.members.findActive(tx, groupId, userId);
      if (!member) throw notFound();
      const openCharges = await this.openCharges.countOpenCharges(tx, groupId, userId);
      const blocked = canLeave(member.role, openCharges);
      if (blocked === 'owner_must_transfer_or_close') {
        throw new DomainError(
          ErrorCode.BUSINESS_RULE,
          422,
          'El titular no puede abandonar el grupo: transfiere la titularidad o cierra el grupo.',
          { rule: 'RN-001-08', hint: 'TRANSFER_OR_CLOSE' },
        );
      }
      if (blocked === 'open_charges') {
        throw new DomainError(
          ErrorCode.BUSINESS_RULE,
          422,
          'Tienes cobros sin pagar: salda o pide al titular que los cancele antes de abandonar.',
          { rule: 'RF-001-16', openCharges },
        );
      }
      if (group.status === 'cerrado') throw groupClosed();
      if (group.frozen_at !== null) throw groupFrozen();
      await this.members.markLeft(tx, groupId, userId, 'abandono');
      const event: MemberRemoved = {
        type: 'groups.member-removed',
        groupId,
        userId,
        reason: 'abandono',
      };
      await this.bus.publish(tx, event);
    });
  }

  /**
   * El titular transfiere la titularidad a otro miembro activo (RF-001-17) en una transacción:
   * cambia los dos `role` y `groups.owner_id` y publica `OwnerChanged`. El destinatario debe ser
   * miembro activo, titular habilitado (CA-001-30) y tener menos de 5 grupos activos (RN-001-14);
   * `OwnershipBlockersPort` informa de solicitudes en pago (RN-010-09). Devuelve el grupo con el
   * rol de quien llamó, ya como miembro.
   */
  async transferOwnership(
    groupId: string,
    currentOwnerId: string,
    toUserId: string,
  ): Promise<GroupDetail> {
    return this.db.withTransaction(async (tx) => {
      const group = await this.requireWritableGroup(tx, groupId);
      if (group.owner_id !== currentOwnerId) {
        throw new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);
      }
      await this.reassignOwner(tx, groupId, currentOwnerId, toUserId);
      return this.groupsService.detail(tx, groupId, currentOwnerId);
    });
  }

  /**
   * Transferencia por un administrador (RF-009-24, CA-009-35): solo con el titular `suspendido`.
   * Mismas reglas del destinatario que la transferencia del titular; la auditoría se escribe en la
   * misma transacción.
   */
  async transferByAdmin(
    adminId: string,
    groupId: string,
    toUserId: string,
    reason: string,
  ): Promise<{ groupId: string; fromUserId: string; toUserId: string }> {
    return this.db.withTransaction(async (tx) => {
      const group = await this.requireWritableGroup(tx, groupId);
      const ownerStatus = await this.groups.userStatus(tx, group.owner_id);
      if (ownerStatus !== 'suspendido') {
        throw new DomainError(
          ErrorCode.BUSINESS_RULE,
          422,
          'Solo se puede transferir la titularidad si el titular está suspendido.',
          { rule: 'RF-009-24' },
        );
      }
      await this.reassignOwner(tx, groupId, group.owner_id, toUserId);
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'titularidad_transferir',
        targetType: 'group',
        targetId: groupId,
        reason,
        metadata: { groupId, fromUserId: group.owner_id, toUserId },
      });
      return { groupId, fromUserId: group.owner_id, toUserId };
    });
  }

  /** Validaciones y cambio de titular compartidos por el titular y por administración (RF-001-17, RF-009-24). */
  private async reassignOwner(
    tx: DbTransaction,
    groupId: string,
    currentOwnerId: string,
    toUserId: string,
  ): Promise<void> {
    if (toUserId === currentOwnerId) {
      throw new DomainError(
        ErrorCode.BUSINESS_RULE,
        422,
        'Elige a otro miembro del grupo como nuevo titular.',
        { rule: 'RF-001-17' },
      );
    }
    await this.assertNoBlockers(tx, groupId);

    // Serializa las altas y transferencias del destinatario antes de contar sus grupos.
    await this.groups.lockOwner(tx, toUserId);
    const target = await this.members.findActive(tx, groupId, toUserId);
    const eligibility = target ? await this.eligibility.check(tx, toUserId) : null;
    const broken = canReceiveOwnership({
      isActiveMember: target !== null,
      isHostEligible: eligibility?.eligible ?? false,
      activeOwnedGroups: await this.groups.countActiveOwned(tx, toUserId),
    });
    if (broken.includes('not_active_member')) {
      throw new DomainError(
        ErrorCode.BUSINESS_RULE,
        422,
        'La persona elegida no es miembro activo del grupo.',
        { rule: 'RF-001-17' },
      );
    }
    if (broken.includes('not_host_eligible')) {
      throw new DomainError(
        'NOT_HOST_ELIGIBLE',
        422,
        'La persona elegida aún no está habilitada para ser titular.',
        { rule: 'RF-001-21', ...eligibility },
      );
    }
    if (broken.includes('too_many_active_groups')) {
      throw new DomainError(
        'TOO_MANY_ACTIVE_GROUPS',
        422,
        'La persona elegida ya tiene el máximo de grupos activos como titular.',
        { rule: 'RN-001-14' },
      );
    }

    // Primero baja al titular actual: el índice único permite un solo titular activo.
    await this.members.updateRole(tx, groupId, currentOwnerId, 'miembro');
    await this.members.updateRole(tx, groupId, toUserId, 'titular');
    await this.groups.setOwner(tx, groupId, toUserId);
    const event: OwnerChanged = {
      type: 'groups.owner-changed',
      groupId,
      previousOwnerId: currentOwnerId,
      newOwnerId: toUserId,
    };
    await this.bus.publish(tx, event);
  }

  /**
   * El titular cierra el grupo (RF-001-18, RN-001-07): queda de solo lectura, los miembros siguen
   * activos y no se generan más cobros. `OwnershipBlockersPort` puede impedirlo (RN-010-09).
   * Publica `GroupClosed` (la spec 010 rechaza las solicitudes activas).
   */
  async close(groupId: string, ownerId: string): Promise<GroupDetail> {
    return this.db.withTransaction(async (tx) => {
      const group = await this.requireWritableGroup(tx, groupId);
      if (group.owner_id !== ownerId) {
        throw new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);
      }
      await this.assertNoBlockers(tx, groupId);
      await this.groups.close(tx, groupId, this.clock.now());
      const event: GroupClosed = { type: 'groups.closed', groupId };
      await this.bus.publish(tx, event);
      return this.groupsService.detail(tx, groupId, ownerId);
    });
  }

  /** Grupo bloqueado, existente y que admite cambios (ni cerrado ni congelado). */
  private async requireWritableGroup(tx: DbTransaction, groupId: string): Promise<GroupRow> {
    const group = await this.groups.findByIdForUpdate(tx, groupId);
    if (!group) throw notFound();
    if (group.status === 'cerrado') throw groupClosed();
    if (group.frozen_at !== null) throw groupFrozen();
    return group;
  }

  private async assertNoBlockers(tx: DbTransaction, groupId: string): Promise<void> {
    const blockers = await this.blockers.blockers(tx, groupId);
    if (blockers.length > 0) {
      throw new DomainError(
        ErrorCode.BUSINESS_RULE,
        422,
        'Hay solicitudes de ingreso en pago: espera a que se resuelvan.',
        { rule: 'RN-010-09', blockers },
      );
    }
  }

  /** Un grupo cerrado o congelado es de solo lectura para el titular (RN-001-07); mora y baneo son del sistema. */
  private assertCanRemove(group: GroupRow, reason: RemovalReason): void {
    if (reason !== 'quitado') return;
    if (group.status === 'cerrado') throw groupClosed();
    if (group.frozen_at !== null) throw groupFrozen();
  }
}
