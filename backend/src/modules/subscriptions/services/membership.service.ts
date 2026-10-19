import { Inject, Injectable } from '@nestjs/common';
import { DbService, type DbTransaction } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type {
  MemberAdded,
  MemberRemoved,
  MemberRemovedReason,
} from '../../../shared/events/group-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import { canLeave } from '../domain/group-rules.js';
import { OPEN_CHARGES_PORT, type OpenChargesPort } from '../ports/open-charges.port.js';
import { GroupsRepository, type GroupRow } from '../repositories/groups.repository.js';
import { MembersRepository, type MemberRow } from '../repositories/members.repository.js';

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

  /** Un grupo cerrado o congelado es de solo lectura para el titular (RN-001-07); mora y baneo son del sistema. */
  private assertCanRemove(group: GroupRow, reason: RemovalReason): void {
    if (reason !== 'quitado') return;
    if (group.status === 'cerrado') throw groupClosed();
    if (group.frozen_at !== null) throw groupFrozen();
  }
}
