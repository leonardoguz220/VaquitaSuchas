import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { ListingStatus } from '../domain/listing-lifecycle.js';

export interface ListingRecord {
  id: string;
  groupId: string;
  slotsOffered: number;
  description: string | null;
  conditions: string | null;
  status: ListingStatus;
  publishedAt: Date;
  expiresAt: Date;
  renewedAt: Date | null;
  hiddenAt: Date | null;
  moderationClearedAt: Date | null;
  endedAt: Date | null;
  endReason: string | null;
  version: number;
}

interface Row {
  id: string;
  group_id: string;
  slots_offered: number;
  description: string | null;
  conditions: string | null;
  status: ListingStatus;
  published_at: Date;
  expires_at: Date;
  renewed_at: Date | null;
  hidden_at: Date | null;
  moderation_cleared_at: Date | null;
  ended_at: Date | null;
  end_reason: string | null;
  version: number;
}

const COLUMNS = `l.id, l.group_id, l.slots_offered, l.description, l.conditions, l.status,
  l.published_at, l.expires_at, l.renewed_at, l.hidden_at, l.moderation_cleared_at, l.ended_at,
  l.end_reason, l.version`;

const toRecord = (row: Row): ListingRecord => ({
  id: row.id,
  groupId: row.group_id,
  slotsOffered: row.slots_offered,
  description: row.description,
  conditions: row.conditions,
  status: row.status,
  publishedAt: row.published_at,
  expiresAt: row.expires_at,
  renewedAt: row.renewed_at,
  hiddenAt: row.hidden_at,
  moderationClearedAt: row.moderation_cleared_at,
  endedAt: row.ended_at,
  endReason: row.end_reason,
  version: row.version,
});

export interface NewListing {
  groupId: string;
  slotsOffered: number;
  description: string | null;
  conditions: string | null;
  publishedAt: Date;
  expiresAt: Date;
}

export interface ListingChanges {
  slotsOffered?: number;
  description?: string | null;
  conditions?: string | null;
  status?: ListingStatus;
  expiresAt?: Date;
  renewedAt?: Date | null;
  hiddenAt?: Date | null;
  moderationClearedAt?: Date | null;
  endedAt?: Date | null;
  endReason?: string | null;
}

const SET_COLUMNS: Record<keyof ListingChanges, string> = {
  slotsOffered: 'slots_offered',
  description: 'description',
  conditions: 'conditions',
  status: 'status',
  expiresAt: 'expires_at',
  renewedAt: 'renewed_at',
  hiddenAt: 'hidden_at',
  moderationClearedAt: 'moderation_cleared_at',
  endedAt: 'ended_at',
  endReason: 'end_reason',
};

/**
 * Única capa con SQL de `listings` (0080). Orden de bloqueo en toda transacción:
 * solicitud → grupo → publicación (RNF-008-03); `lockGroup` va antes de `findByIdForUpdate`.
 */
@Injectable()
export class ListingsRepository {
  /** Bloquea el grupo y devuelve sus datos de capacidad; `null` si no existe. */
  async lockGroup(q: Queryable, groupId: string): Promise<LockedGroup | null> {
    const result = await q.query<{
      id: string;
      owner_id: string;
      status: 'activo' | 'cerrado';
      frozen_at: Date | null;
      accepting_members: boolean;
      total_slots: number;
    }>(
      `SELECT id, owner_id, status, frozen_at, accepting_members, total_slots
         FROM groups WHERE id = $1 FOR UPDATE`,
      [groupId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          ownerId: row.owner_id,
          status: row.status,
          frozen: row.frozen_at !== null,
          acceptingMembers: row.accepting_members,
          totalSlots: row.total_slots,
        }
      : null;
  }

  /** Como `lockGroup` pero salta el grupo si otra transacción lo tiene bloqueado (tarea diaria). */
  async lockGroupSkipLocked(q: Queryable, groupId: string): Promise<LockedGroup | null> {
    const result = await q.query<{
      id: string;
      owner_id: string;
      status: 'activo' | 'cerrado';
      frozen_at: Date | null;
      accepting_members: boolean;
      total_slots: number;
    }>(
      `SELECT id, owner_id, status, frozen_at, accepting_members, total_slots
         FROM groups WHERE id = $1 FOR UPDATE SKIP LOCKED`,
      [groupId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          ownerId: row.owner_id,
          status: row.status,
          frozen: row.frozen_at !== null,
          acceptingMembers: row.accepting_members,
          totalSlots: row.total_slots,
        }
      : null;
  }

  /** El grupo sin bloquearlo (lecturas); `null` si no existe. */
  async findGroup(q: Queryable, groupId: string): Promise<LockedGroup | null> {
    const result = await q.query<{
      id: string;
      owner_id: string;
      status: 'activo' | 'cerrado';
      frozen_at: Date | null;
      accepting_members: boolean;
      total_slots: number;
    }>(
      `SELECT id, owner_id, status, frozen_at, accepting_members, total_slots
         FROM groups WHERE id = $1`,
      [groupId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          ownerId: row.owner_id,
          status: row.status,
          frozen: row.frozen_at !== null,
          acceptingMembers: row.accepting_members,
          totalSlots: row.total_slots,
        }
      : null;
  }

  async groupName(q: Queryable, groupId: string): Promise<string | null> {
    const result = await q.query<{ name: string }>('SELECT name FROM groups WHERE id = $1', [
      groupId,
    ]);
    return result.rows[0]?.name ?? null;
  }

  async isActiveMember(q: Queryable, groupId: string, userId: string): Promise<boolean> {
    const result = await q.query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 AND left_at IS NULL',
      [groupId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Solicitudes activas originadas en la publicación (`OwnerListing.openRequests`). */
  async countActiveRequests(q: Queryable, listingId: string): Promise<number> {
    const result = await q.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM join_requests
        WHERE listing_id = $1 AND status IN ('abierta', 'esperando_pago', 'pago_informado')`,
      [listingId],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  async countActiveMembers(q: Queryable, groupId: string): Promise<number> {
    const result = await q.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM group_members WHERE group_id = $1 AND left_at IS NULL',
      [groupId],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  async insert(q: Queryable, input: NewListing): Promise<ListingRecord> {
    const result = await q.query<Row>(
      `INSERT INTO listings AS l (group_id, slots_offered, description, conditions, published_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
      [
        input.groupId,
        input.slotsOffered,
        input.description,
        input.conditions,
        input.publishedAt,
        input.expiresAt,
      ],
    );
    return toRecord(result.rows[0] as Row);
  }

  async findById(q: Queryable, id: string): Promise<ListingRecord | null> {
    const result = await q.query<Row>(`SELECT ${COLUMNS} FROM listings l WHERE l.id = $1`, [id]);
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  async findByIdForUpdate(q: Queryable, id: string): Promise<ListingRecord | null> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM listings l WHERE l.id = $1 FOR UPDATE OF l`,
      [id],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  async findByIdForUpdateSkipLocked(q: Queryable, id: string): Promise<ListingRecord | null> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM listings l WHERE l.id = $1 FOR UPDATE OF l SKIP LOCKED`,
      [id],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /**
   * Publicaciones vivas (`activa`/`oculta`) que necesitan una acción: vencidas, de un grupo
   * cerrado o congelado, de un titular baneado o con más cupos ofrecidos que libres (RN-008-04).
   */
  async listNeedingAttention(
    q: Queryable,
    now: Date,
    limit: number,
  ): Promise<{ id: string; groupId: string }[]> {
    const result = await q.query<{ id: string; group_id: string }>(
      `SELECT l.id, l.group_id
         FROM listings l
         JOIN groups g ON g.id = l.group_id
         JOIN users u ON u.id = g.owner_id
        WHERE l.status IN ('activa', 'oculta')
          AND ((l.status = 'activa' AND l.expires_at <= $1)
               OR g.status = 'cerrado' OR g.frozen_at IS NOT NULL OR u.status = 'baneado'
               OR l.slots_offered > g.total_slots - (
                    SELECT count(*) FROM group_members m
                     WHERE m.group_id = g.id AND m.left_at IS NULL))
        ORDER BY l.id LIMIT $2`,
      [now, limit],
    );
    return result.rows.map((row) => ({ id: row.id, groupId: row.group_id }));
  }

  /** Publicaciones vivas de los grupos del titular, por grupo (orden de bloqueo estable). */
  async listLiveByOwner(q: Queryable, ownerId: string): Promise<{ id: string; groupId: string }[]> {
    const result = await q.query<{ id: string; group_id: string }>(
      `SELECT l.id, l.group_id FROM listings l JOIN groups g ON g.id = l.group_id
        WHERE g.owner_id = $1 AND l.status IN ('activa', 'oculta') ORDER BY l.group_id`,
      [ownerId],
    );
    return result.rows.map((row) => ({ id: row.id, groupId: row.group_id }));
  }

  /** La publicación `activa` u `oculta` del grupo (a lo sumo una: `listings_group_active_uq`). */
  async findLiveByGroup(
    q: Queryable,
    groupId: string,
    forUpdate = false,
  ): Promise<ListingRecord | null> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM listings l
        WHERE l.group_id = $1 AND l.status IN ('activa', 'oculta')
        ${forUpdate ? 'FOR UPDATE OF l' : ''}`,
      [groupId],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /** La más reciente `activa`, `oculta` o `expirada` del grupo (vista del titular). */
  async findLatestVisibleByGroup(q: Queryable, groupId: string): Promise<ListingRecord | null> {
    const result = await q.query<Row>(
      `SELECT ${COLUMNS} FROM listings l
        WHERE l.group_id = $1 AND l.status IN ('activa', 'oculta', 'expirada')
        ORDER BY l.created_at DESC, l.id DESC LIMIT 1`,
      [groupId],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /**
   * Cambia campos y sube `version` en 1. Con `expectedVersion` falla (`null`) si otro cambio se
   * adelantó. Un solo `UPDATE`: los disparadores de 0082 validan la transición.
   */
  async update(
    q: Queryable,
    id: string,
    changes: ListingChanges,
    expectedVersion?: number,
  ): Promise<ListingRecord | null> {
    const keys = (Object.keys(changes) as (keyof ListingChanges)[]).filter(
      (key) => changes[key] !== undefined,
    );
    const params: unknown[] = [id];
    const sets = keys.map((key) => {
      params.push(changes[key]);
      return `${SET_COLUMNS[key]} = $${params.length}`;
    });
    sets.push('version = version + 1');
    let versionClause = '';
    if (expectedVersion !== undefined) {
      params.push(expectedVersion);
      versionClause = ` AND version = $${params.length}`;
    }
    const result = await q.query<Row>(
      `UPDATE listings l SET ${sets.join(', ')} WHERE l.id = $1${versionClause} RETURNING ${COLUMNS}`,
      params,
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /**
   * Cupos que todavía se ofrecen (`ListingQuotaPort.remainingOffered`). Solo `cerrada` tiene 0
   * (0080): una publicación oculta, vencida o retirada conserva sus cupos para las solicitudes
   * que ya están en curso (spec 010 sigue su flujo).
   */
  async remainingOffered(q: Queryable, listingId: string): Promise<number> {
    const result = await q.query<{ slots_offered: number }>(
      `SELECT slots_offered FROM listings WHERE id = $1`,
      [listingId],
    );
    return result.rows[0]?.slots_offered ?? 0;
  }

  /** Ids de publicaciones `activa` vencidas (`listings_search_idx`), en orden de id. */
  async listExpiredActiveIds(q: Queryable, now: Date, limit: number): Promise<string[]> {
    const result = await q.query<{ id: string }>(
      `SELECT id FROM listings WHERE status = 'activa' AND expires_at <= $1 ORDER BY id LIMIT $2`,
      [now, limit],
    );
    return result.rows.map((row) => row.id);
  }
}

export interface LockedGroup {
  id: string;
  ownerId: string;
  status: 'activo' | 'cerrado';
  frozen: boolean;
  acceptingMembers: boolean;
  totalSlots: number;
}
