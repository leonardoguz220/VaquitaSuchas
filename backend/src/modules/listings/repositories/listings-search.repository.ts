import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { ListingSort, SearchCursor } from '../domain/search-cursor.js';

export interface SearchFilters {
  serviceId?: string;
  /** Texto en el nombre del servicio, sin distinguir mayúsculas ni tildes. */
  q?: string;
  category?: string;
  minShareCents?: number;
  maxShareCents?: number;
}

export interface SearchParams {
  userId: string;
  now: Date;
  filters: SearchFilters;
  sort: ListingSort;
  cursor: SearchCursor | null;
  limit: number;
}

/** Fila de búsqueda: solo lo necesario para `ListingView`; nada de miembros ni datos de pago. */
export interface ListingSearchRow {
  id: string;
  groupId: string;
  ownerId: string;
  ownerName: string;
  serviceName: string;
  planName: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  category: string | null;
  billingDay: number;
  groupCreatedAt: Date;
  totalBsCents: number;
  members: number;
  /** `min(ofrecidos, libres − reservados)` (RN-008-04), nunca negativo. */
  offered: number;
  description: string | null;
  conditions: string | null;
  publishedAt: Date;
  expiresAt: Date;
  /** `published_at` con microsegundos para el cursor. */
  publishedAtCursor: string;
  /** Cuota estimada en SQL: misma fórmula que `estimatedShare`, para filtrar y ordenar. */
  shareCents: number;
  sortKey: number;
}

interface Row {
  id: string;
  group_id: string;
  owner_id: string;
  owner_name: string;
  service_name: string;
  plan_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
  category: string | null;
  billing_day: number;
  group_created_at: Date;
  total_bs_cents: string;
  members: number;
  offered: number;
  description: string | null;
  conditions: string | null;
  published_at: Date;
  expires_at: Date;
  published_at_cursor: string;
  share_cents: string;
  sort_key: string;
}

const KEY_EXPR: Record<ListingSort, string> = {
  fecha: '0',
  cuota: 's.share',
  // Estrellas mostradas en medias estrellas; «Nuevo» (sin estrellas) al final.
  puntualidad: 'coalesce(ur.displayed_half_stars, -1)',
};

const ORDER: Record<ListingSort, string> = {
  fecha: 'l.published_at DESC, l.id DESC',
  cuota: 's.share ASC, l.published_at DESC, l.id DESC',
  puntualidad: 'coalesce(ur.displayed_half_stars, -1) DESC, l.published_at DESC, l.id DESC',
};

// Una publicación es visible en la búsqueda si está activa, vigente, su grupo recibe miembros y
// su titular no está suspendido ni baneado (contrato 008, GET /listings). Mismo conjunto para
// el detalle; los cupos disponibles (`offered >= 1`) solo se exigen en la lista.
const FROM = `
  FROM listings l
  JOIN groups g ON g.id = l.group_id
  JOIN users u ON u.id = g.owner_id
  LEFT JOIN catalog_plans cp ON cp.id = g.catalog_plan_id
  LEFT JOIN catalog_services cs ON cs.id = cp.service_id
  LEFT JOIN user_reputation ur ON ur.user_id = g.owner_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS members FROM group_members gm
     WHERE gm.group_id = g.id AND gm.left_at IS NULL
  ) m
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS reserved FROM join_requests jr
     WHERE jr.group_id = g.id
       AND ((jr.status = 'esperando_pago' AND jr.pay_deadline_at > $1)
         OR (jr.status = 'pago_informado' AND jr.decision_deadline_at > $1))
  ) r
  CROSS JOIN LATERAL (
    SELECT greatest(0, least(l.slots_offered, g.total_slots - m.members - r.reserved)) AS offered
  ) e
  CROSS JOIN LATERAL (
    SELECT g.total_bs_cents / (m.members + e.offered) AS share
  ) s`;

const VISIBLE = `
  l.status = 'activa' AND l.expires_at > $1
  AND g.status = 'activo' AND g.frozen_at IS NULL AND g.accepting_members
  AND u.status = 'activo'
  AND g.owner_id <> $2
  AND NOT EXISTS (
    SELECT 1 FROM group_members mine
     WHERE mine.group_id = g.id AND mine.user_id = $2 AND mine.left_at IS NULL
  )`;

const SELECT = `
  SELECT l.id, g.id AS group_id, g.owner_id, u.full_name AS owner_name,
         g.service_name_snapshot AS service_name, g.plan_name_snapshot AS plan_name,
         g.logo_url_snapshot AS logo_url, g.brand_color_snapshot AS brand_color,
         cs.category, g.billing_day, g.created_at AS group_created_at, g.total_bs_cents::text,
         m.members, e.offered, l.description, l.conditions, l.published_at, l.expires_at,
         to_char(l.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
           AS published_at_cursor,
         s.share::text AS share_cents`;

const toRow = (row: Row): ListingSearchRow => ({
  id: row.id,
  groupId: row.group_id,
  ownerId: row.owner_id,
  ownerName: row.owner_name,
  serviceName: row.service_name,
  planName: row.plan_name,
  logoUrl: row.logo_url,
  brandColor: row.brand_color,
  category: row.category,
  billingDay: row.billing_day,
  groupCreatedAt: row.group_created_at,
  totalBsCents: Number(row.total_bs_cents),
  members: row.members,
  offered: row.offered,
  description: row.description,
  conditions: row.conditions,
  publishedAt: row.published_at,
  expiresAt: row.expires_at,
  publishedAtCursor: row.published_at_cursor,
  shareCents: Number(row.share_cents),
  sortKey: Number(row.sort_key),
});

/** Escapa `%`, `_` y `\` para usar el texto buscado dentro de un `LIKE`. */
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Lecturas de la búsqueda de cupos libres (RF-008-07 a 09, RNF-008-02): solo SQL con parámetros. */
@Injectable()
export class ListingsSearchRepository {
  async search(q: Queryable, p: SearchParams): Promise<ListingSearchRow[]> {
    const params: unknown[] = [p.now, p.userId];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };
    const where: string[] = [VISIBLE, 'e.offered >= 1'];
    const { filters } = p;
    if (filters.serviceId) where.push(`cp.service_id = ${bind(filters.serviceId)}::uuid`);
    if (filters.category) where.push(`cs.category = ${bind(filters.category)}`);
    if (filters.q) {
      where.push(
        `immutable_unaccent(lower(g.service_name_snapshot)) LIKE '%' || immutable_unaccent(lower(${bind(escapeLike(filters.q))})) || '%' ESCAPE '\\'`,
      );
    }
    if (filters.minShareCents !== undefined)
      where.push(`s.share >= ${bind(filters.minShareCents)}`);
    if (filters.maxShareCents !== undefined)
      where.push(`s.share <= ${bind(filters.maxShareCents)}`);
    if (p.cursor) {
      const published = bind(p.cursor.publishedAt);
      const id = bind(p.cursor.id);
      const cmp = p.sort === 'cuota' ? '>' : '<';
      const tie = `(l.published_at, l.id) < (${published}::timestamptz, ${id}::uuid)`;
      if (p.sort === 'fecha') where.push(tie);
      else {
        const key = bind(p.cursor.key);
        where.push(
          `(${KEY_EXPR[p.sort]} ${cmp} ${key} OR (${KEY_EXPR[p.sort]} = ${key} AND ${tie}))`,
        );
      }
    }
    const limit = bind(p.limit);
    const result = await q.query<Row>(
      `${SELECT}, ${KEY_EXPR[p.sort]}::text AS sort_key
       ${FROM}
       WHERE ${where.join('\n AND ')}
       ORDER BY ${ORDER[p.sort]}
       LIMIT ${limit}`,
      params,
    );
    return result.rows.map(toRow);
  }

  /** Vista previa del titular: la publicación `activa` y vigente, sin exclusiones por persona. */
  async findForPreview(
    q: Queryable,
    listingId: string,
    now: Date,
  ): Promise<ListingSearchRow | null> {
    const result = await q.query<Row>(
      `${SELECT}, 0::text AS sort_key
       ${FROM}
       WHERE l.status = 'activa' AND l.expires_at > $1 AND l.id = $2`,
      [now, listingId],
    );
    const row = result.rows[0];
    return row ? toRow(row) : null;
  }

  /** Una publicación visible para la persona (404 si no es activa, es propia o de su grupo). */
  async findVisible(
    q: Queryable,
    listingId: string,
    userId: string,
    now: Date,
  ): Promise<ListingSearchRow | null> {
    const result = await q.query<Row>(
      `${SELECT}, 0::text AS sort_key
       ${FROM}
       WHERE ${VISIBLE} AND l.id = $3`,
      [now, userId, listingId],
    );
    const row = result.rows[0];
    return row ? toRow(row) : null;
  }

  /** Solicitudes activas propias en esos grupos (`myRequest`). */
  async myActiveRequests(
    q: Queryable,
    userId: string,
    groupIds: readonly string[],
  ): Promise<Map<string, { id: string; status: string }>> {
    if (groupIds.length === 0) return new Map();
    const result = await q.query<{ id: string; group_id: string; status: string }>(
      `SELECT id, group_id, status FROM join_requests
        WHERE applicant_id = $1 AND group_id = ANY($2::uuid[])
          AND status IN ('abierta', 'esperando_pago', 'pago_informado')`,
      [userId, groupIds],
    );
    return new Map(result.rows.map((row) => [row.group_id, { id: row.id, status: row.status }]));
  }

  /** Cobros no pagados de la persona en esos grupos (RN-010-13, p. ej. si ya salió con deuda). */
  async openChargesByGroup(
    q: Queryable,
    userId: string,
    groupIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (groupIds.length === 0) return new Map();
    const result = await q.query<{ group_id: string; n: string }>(
      `SELECT group_id, count(*)::text AS n FROM charges
        WHERE user_id = $1 AND group_id = ANY($2::uuid[])
          AND status IN ('pendiente', 'en_revision', 'atrasado')
        GROUP BY group_id`,
      [userId, groupIds],
    );
    return new Map(result.rows.map((row) => [row.group_id, Number(row.n)]));
  }

  async countActiveRequests(q: Queryable, userId: string): Promise<number> {
    const result = await q.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM join_requests
        WHERE applicant_id = $1 AND status IN ('abierta', 'esperando_pago', 'pago_informado')`,
      [userId],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  async accountStatus(
    q: Queryable,
    userId: string,
  ): Promise<'activo' | 'suspendido' | 'baneado' | null> {
    const result = await q.query<{ status: 'activo' | 'suspendido' | 'baneado' }>(
      'SELECT status FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0]?.status ?? null;
  }
}
