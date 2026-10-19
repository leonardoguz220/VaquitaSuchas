import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

/** Datos del grupo que acompañan a un cobro (lectura, sin reglas). */
export interface GroupBrief {
  id: string;
  ownerId: string;
  name: string;
  serviceName: string;
  logoUrl: string | null;
  status: 'activo' | 'cerrado';
  frozen: boolean;
  paymentInfoText: string | null;
  paymentQrKey: string | null;
}

interface GroupBriefRow {
  id: string;
  owner_id: string;
  name: string;
  service_name_snapshot: string;
  logo_url_snapshot: string | null;
  status: 'activo' | 'cerrado';
  frozen_at: Date | null;
  payment_info_text: string | null;
  payment_qr_key: string | null;
}

/**
 * Lecturas de apoyo para armar la vista de un cobro: grupo, nombres y membresías. Es SQL de solo
 * lectura sobre `groups`, `users` y `group_members`; no decide nada (las reglas viven en `domain`).
 */
@Injectable()
export class ChargeReadRepository {
  async findGroupBriefs(
    q: Queryable,
    groupIds: readonly string[],
  ): Promise<Map<string, GroupBrief>> {
    const briefs = new Map<string, GroupBrief>();
    if (groupIds.length === 0) return briefs;
    const result = await q.query<GroupBriefRow>(
      `SELECT id, owner_id, name, service_name_snapshot, logo_url_snapshot, status, frozen_at,
              payment_info_text, payment_qr_key
         FROM groups WHERE id = ANY($1::uuid[])`,
      [[...groupIds]],
    );
    for (const row of result.rows) {
      briefs.set(row.id, {
        id: row.id,
        ownerId: row.owner_id,
        name: row.name,
        serviceName: row.service_name_snapshot,
        logoUrl: row.logo_url_snapshot,
        status: row.status,
        frozen: row.frozen_at !== null,
        paymentInfoText: row.payment_info_text,
        paymentQrKey: row.payment_qr_key,
      });
    }
    return briefs;
  }

  /** Nombre completo por persona (línea de tiempo, comprobantes y miembro del cobro). */
  async findUserNames(q: Queryable, userIds: readonly string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (userIds.length === 0) return names;
    const result = await q.query<{ id: string; full_name: string }>(
      `SELECT id, full_name FROM users WHERE id = ANY($1::uuid[])`,
      [[...userIds]],
    );
    for (const row of result.rows) names.set(row.id, row.full_name);
    return names;
  }

  /** De esos grupos, cuáles tienen a la persona como miembro activo. */
  async findActiveGroupIds(
    q: Queryable,
    userId: string,
    groupIds: readonly string[],
  ): Promise<Set<string>> {
    if (groupIds.length === 0) return new Set();
    const result = await q.query<{ group_id: string }>(
      `SELECT group_id FROM group_members
        WHERE user_id = $1 AND group_id = ANY($2::uuid[]) AND left_at IS NULL`,
      [userId, [...groupIds]],
    );
    return new Set(result.rows.map((row) => row.group_id));
  }
}
