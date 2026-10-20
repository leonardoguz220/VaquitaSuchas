import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import {
  GroupsRepository,
  type GroupRow,
} from '../../subscriptions/repositories/groups.repository.js';
import { MembersRepository } from '../../subscriptions/repositories/members.repository.js';
import { resolveAccess, type ChargeAccess } from '../domain/access.js';
import { ChargesRepository, type ChargeRecord } from '../repositories/charges.repository.js';

export interface ChargeContext {
  charge: ChargeRecord;
  group: GroupRow;
  /** `titular`, `dueno` o `dueno_retirado`: los demás nunca llegan aquí. */
  access: Exclude<ChargeAccess, 'miembro' | 'ninguno'>;
}

export const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);

export const forbidden = (): DomainError =>
  new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);

/**
 * Tabla de acceso del contrato (plan §7, RNF-002-01, RNF-002-07): titular y dueño ven el cobro;
 * otro miembro activo recibe 403 (CA-002-13); cualquier otra persona, 404 (CA-002-23).
 */
@Injectable()
export class ChargeAccessService {
  constructor(
    private readonly charges: ChargesRepository,
    private readonly groups: GroupsRepository,
    private readonly members: MembersRepository,
  ) {}

  /** Con `lock` el cobro se bloquea `FOR UPDATE` (solo dentro de una transacción). */
  async resolve(
    q: Queryable,
    userId: string,
    chargeId: string,
    options: { lock?: boolean } = {},
  ): Promise<ChargeContext> {
    const charge = options.lock
      ? await this.charges.findByIdForUpdate(q, chargeId)
      : await this.charges.findById(q, chargeId);
    if (!charge) throw notFound();
    const group = await this.groups.findById(q, charge.groupId);
    if (!group) throw notFound();
    const membership = await this.members.findActive(q, charge.groupId, userId);
    const access = resolveAccess({
      user: { id: userId },
      charge: { userId: charge.userId, status: charge.status },
      group: { ownerId: group.owner_id },
      membership: membership ? { active: true } : null,
    });
    if (access === 'ninguno') throw notFound();
    if (access === 'miembro') throw forbidden();
    return { charge, group, access };
  }
}
