import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { MembersRepository } from '../../subscriptions/repositories/members.repository.js';
import { inviteMessage, reminderMessage } from '../domain/share-text.js';
import { ShareRepository } from '../repositories/share.repository.js';

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);

/**
 * Textos para abrir WhatsApp desde el cliente (RF-005-15, RF-005-16; CA-005-17, CA-005-18).
 * El servidor solo arma el texto: no llama a ningún servicio de envío. El teléfono viaja solo en
 * la respuesta, nunca en registros.
 */
@Injectable()
export class ShareService {
  private readonly appUrl: string;

  constructor(
    config: ConfigService,
    private readonly db: DbService,
    private readonly share: ShareRepository,
    private readonly members: MembersRepository,
  ) {
    this.appUrl = (config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );
  }

  /** El llamador ya comprobó que es el titular (`GroupOwnerGuard`). */
  async invitationShare(groupId: string): Promise<{ inviteUrl: string; text: string }> {
    const group = await this.share.inviteFacts(this.db, groupId);
    if (!group) throw notFound();
    const inviteUrl = `${this.appUrl}/unirse?codigo=${encodeURIComponent(group.inviteCode)}`;
    return {
      inviteUrl,
      text: inviteMessage({ groupName: group.name, inviteUrl, code: group.inviteCode }),
    };
  }

  async reminderShare(userId: string, chargeId: string): Promise<{ phone: string; text: string }> {
    const charge = UUID.test(chargeId) ? await this.share.reminderFacts(this.db, chargeId) : null;
    if (!charge) throw notFound();
    const me = await this.members.findActive(this.db, charge.groupId, userId);
    if (!me) throw notFound();
    if (me.role !== 'titular') {
      throw new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);
    }
    const collectable =
      (charge.status === 'pendiente' || charge.status === 'atrasado') &&
      charge.memberIsActive &&
      charge.userId !== userId &&
      charge.phone !== null;
    if (!collectable || charge.phone === null) {
      throw new DomainError(
        ErrorCode.BUSINESS_RULE,
        422,
        'Este cobro no se puede recordar por WhatsApp.',
        { code: 'CHARGE_NOT_COLLECTABLE' },
      );
    }
    return {
      phone: charge.phone,
      text: reminderMessage({
        memberName: charge.memberName ?? 'amigo',
        groupName: charge.groupName,
        amountCents: charge.amountCents,
        period: charge.period,
        dueAt: charge.dueAt,
      }),
    };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
