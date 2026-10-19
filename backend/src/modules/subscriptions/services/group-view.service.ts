import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { GroupDetail } from '../domain/group-detail.js';
import {
  buildGroupSummary,
  decodeGroupCursor,
  encodeGroupCursor,
  type GroupSummary,
} from '../domain/group-summary.js';
import { GroupsRepository } from '../repositories/groups.repository.js';
import { GroupsService } from './groups.service.js';

export const DEFAULT_GROUPS_PAGE_SIZE = 20;
export const MAX_GROUPS_PAGE_SIZE = 100;

export interface ListGroupsQuery {
  role?: 'titular' | 'miembro';
  status?: 'activo' | 'cerrado';
  limit?: number;
  cursor?: string;
}

export interface GroupPage {
  items: GroupSummary[];
  nextCursor: string | null;
}

/**
 * Lectura de grupos (spec 001, US3): «Mis suscripciones» y el detalle. Solo devuelve grupos donde
 * la persona es miembro activo (RNF-001-01); el resto es `404`. Las cuotas salen del dominio
 * (RF-001-13) y el `inviteCode` solo se incluye para el titular (RF-001-06).
 */
@Injectable()
export class GroupViewService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly groups: GroupsRepository,
    private readonly groupsService: GroupsService,
  ) {}

  /** `GET /groups` (RF-001-19, CA-001-20). */
  async list(userId: string, query: ListGroupsQuery): Promise<GroupPage> {
    const limit = query.limit ?? DEFAULT_GROUPS_PAGE_SIZE;
    const after = query.cursor === undefined ? undefined : decodeGroupCursor(query.cursor);
    if (after === null) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
        fields: { cursor: ['INVALID_CURSOR'] },
      });
    }
    const rows = await this.groups.listForUser(this.db, userId, {
      ...(query.role && { role: query.role }),
      ...(query.status && { status: query.status }),
      ...(after && { after }),
      limit,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const now = this.clock.now();
    return {
      items: page.map((row) =>
        buildGroupSummary(
          {
            id: row.id,
            name: row.name,
            status: row.status,
            frozenReason: row.frozen_reason,
            serviceName: row.service_name_snapshot,
            logoUrl: row.logo_url_snapshot,
            brandColor: row.brand_color_snapshot,
            totalSlots: row.total_slots,
            priceCents: Number(row.price_cents),
            currency: row.currency,
            exchangeRate: row.exchange_rate,
            billingDay: row.billing_day,
            memberCount: row.member_count,
            role: row.role,
          },
          now,
        ),
      ),
      nextCursor:
        rows.length > limit && last
          ? encodeGroupCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** `GET /groups/:id` (RF-001-13): `404` si no es miembro activo (CA-001-10). */
  detail(userId: string, groupId: string): Promise<GroupDetail> {
    return this.groupsService.detail(this.db, groupId, userId);
  }
}
