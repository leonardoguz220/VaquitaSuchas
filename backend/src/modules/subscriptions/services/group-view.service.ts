import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { decodeGroupListCursor, encodeGroupListCursor } from '../domain/group-list-cursor.js';
import type { GroupDetail } from '../domain/group-detail.js';
import { buildGroupSummary, type GroupSummary } from '../domain/group-summary.js';
import { GroupsRepository } from '../repositories/groups.repository.js';
import { fieldsError } from './group-errors.js';
import { GroupsService } from './groups.service.js';

export const DEFAULT_GROUP_PAGE_SIZE = 20;
export const MAX_GROUP_PAGE_SIZE = 100;

export interface ListGroupsQuery {
  role?: 'titular' | 'miembro';
  /** Sin indicarlo, solo los activos. */
  status?: 'activo' | 'cerrado';
  limit?: number;
  cursor?: string;
}

/** Consultas de grupos de la persona: «Mis suscripciones» y el detalle (spec 001, US3). */
@Injectable()
export class GroupViewService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly groups: GroupsRepository,
    private readonly groupsService: GroupsService,
  ) {}

  /** `GET /groups`: solo los grupos donde la persona es miembro activo (CA-001-20). */
  async list(
    userId: string,
    query: ListGroupsQuery,
  ): Promise<{ items: GroupSummary[]; nextCursor: string | null }> {
    const after = query.cursor === undefined ? undefined : decodeGroupListCursor(query.cursor);
    if (after === null) throw fieldsError({ cursor: ['INVALID_CURSOR'] });
    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_GROUP_PAGE_SIZE, 1),
      MAX_GROUP_PAGE_SIZE,
    );
    const rows = await this.groups.listForUser(this.db, userId, {
      ...(query.role && { role: query.role }),
      status: query.status ?? 'activo',
      ...(after && { after }),
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const now = this.clock.now();
    return {
      items: page.map((row) =>
        buildGroupSummary({
          group: {
            id: row.id,
            name: row.name,
            serviceName: row.service_name_snapshot,
            logoUrl: row.logo_url_snapshot,
            brandColor: row.brand_color_snapshot,
            status: row.status,
            frozenReason: row.frozen_reason,
            totalSlots: row.total_slots,
            billingDay: row.billing_day,
            priceCents: Number(row.price_cents),
            currency: row.currency,
            exchangeRate: row.exchange_rate,
          },
          role: row.my_role,
          memberCount: Number(row.member_count),
          now,
        }),
      ),
      nextCursor:
        rows.length > limit && last
          ? encodeGroupListCursor({ joinedAt: last.my_joined_at, groupId: last.id })
          : null,
    };
  }

  /** `GET /groups/:id`: 404 si la persona no es miembro activo (CA-001-10). */
  detail(groupId: string, userId: string): Promise<GroupDetail> {
    return this.db.withTransaction((tx) => this.groupsService.detail(tx, groupId, userId));
  }
}
