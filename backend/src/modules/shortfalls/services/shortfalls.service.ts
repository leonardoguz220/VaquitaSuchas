import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type Queryable } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import type { ShortfallOpened } from '../../../shared/events/shortfall-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import {
  GroupsRepository,
  type GroupRow,
} from '../../subscriptions/repositories/groups.repository.js';
import { MembersRepository } from '../../subscriptions/repositories/members.repository.js';
import { assertGroupWritable } from '../../subscriptions/services/group-errors.js';
import { computeRoundDeadlines } from '../domain/deadlines.js';
import { quoteShortfall } from '../domain/shortfall-quote.js';
import { transitionRound } from '../domain/state.js';
import { ShortfallsRepository } from '../repositories/shortfalls.repository.js';
import { ShortfallViewService } from './shortfall-view.service.js';
import type { MyShortfallView, ShortfallQuoteView, ShortfallRoundView } from './shortfall-views.js';

const MAX_ROUNDS_PER_PERIOD = 2;

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);
const forbidden = (): DomainError =>
  new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);

const businessError = (code: string, message: string, rule: string): DomainError =>
  new DomainError(code, 422, message, { rule });

export const noShortfall = (): DomainError =>
  businessError(
    'NO_SHORTFALL',
    'No hay una diferencia que repartir entre los miembros.',
    'RF-011-03',
  );

/** Cotización, apertura y consulta de rondas de faltante (spec 011, RF-011-01 a RF-011-07). */
@Injectable()
export class ShortfallsService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly bus: TxEventBus,
    private readonly groups: GroupsRepository,
    private readonly members: MembersRepository,
    private readonly repo: ShortfallsRepository,
    private readonly views: ShortfallViewService,
  ) {}

  /** `GET /groups/:groupId/shortfall/preview` (titular; RF-011-01, CA-011-01 y 02). */
  async preview(userId: string, groupId: string): Promise<ShortfallQuoteView> {
    const group = await this.requireOwner(this.db, groupId, userId);
    return this.quote(this.db, group);
  }

  /** `POST /groups/:groupId/shortfall` (titular; RF-011-04, 05 y 07; CA-011-03, 04 y 14). */
  async open(userId: string, groupId: string): Promise<ShortfallRoundView> {
    const now = this.clock.now();
    return this.db.withTransaction(async (tx) => {
      const locked = await this.groups.findByIdForUpdate(tx, groupId);
      if (!locked) throw notFound();
      await this.requireOwner(tx, groupId, userId);
      assertGroupWritable(locked);
      if ((await this.repo.findOpenRoundId(tx, groupId)) !== null) {
        throw businessError(
          'ROUND_ALREADY_OPEN',
          'Ya hay una ronda abierta en este grupo.',
          'RF-011-05',
        );
      }
      const quote = await this.quote(tx, locked);
      if (quote.shortfallCents === 0) throw noShortfall();
      const rounds = await this.repo.countRoundsInPeriod(tx, groupId, quote.period);
      if (rounds >= MAX_ROUNDS_PER_PERIOD) {
        throw businessError(
          'ROUND_LIMIT_REACHED',
          'Ya se usaron las dos rondas permitidas para este período.',
          'RF-011-05',
        );
      }
      const deadlines = computeRoundDeadlines(now);
      const round = await this.repo.insertRound(tx, {
        groupId,
        cycleId: quote.cycleId,
        period: quote.period,
        roundNumber: rounds + 1,
        totalBsCents: quote.totalBsCents,
        memberCountAfter: quote.memberCountAfter,
        baseShareCents: quote.baseShareCents,
        ownerShareCents: quote.ownerShareCents,
        shortfallCents: quote.shortfallCents,
        openedBy: userId,
        openedAt: now,
        respondBy: deadlines.respondBy,
        payBy: deadlines.payBy,
      });
      await this.repo.insertEvent(tx, {
        roundId: round.id,
        type: 'ronda_abierta',
        actorId: userId,
        metadata: { shortfallCents: quote.shortfallCents, affected: quote.rows.length },
        occurredAt: now,
      });
      for (const row of quote.rows) {
        const rowId = await this.repo.insertRow(tx, {
          roundId: round.id,
          userId: row.userId,
          paidCents: row.paidCents,
          extraDueCents: row.extraDueCents,
        });
        const event: ShortfallOpened = {
          type: 'shortfalls.opened',
          roundId: round.id,
          groupId,
          hostId: locked.owner_id,
          rowId,
          userId: row.userId,
          rowVersion: 1,
          extraDueCents: row.extraDueCents,
          respondBy: deadlines.respondBy,
        };
        await this.bus.publish(tx, event);
      }
      return this.views.round(tx, round, locked.owner_id, userId, now);
    });
  }

  /**
   * `GET /groups/:groupId/shortfall`: la ronda abierta o, si no hay, la última (RF-011-04). El
   * titular la ve completa; un afectado, solo su fila; otro miembro recibe `403` (CA-011-13).
   */
  async current(userId: string, groupId: string): Promise<ShortfallRoundView | null> {
    const group = await this.groups.findById(this.db, groupId);
    if (!group) throw notFound();
    const round = await this.repo.findLatestRound(this.db, groupId);
    if (group.owner_id !== userId) {
      const member = await this.members.findActive(this.db, groupId, userId);
      const rows = round ? await this.repo.listRows(this.db, round.id) : [];
      const affected = rows.some((row) => row.userId === userId);
      if (!member && !affected) throw notFound();
      if (round && !affected) throw forbidden();
    }
    if (!round) return null;
    return this.views.round(this.db, round, group.owner_id, userId, this.clock.now());
  }

  /** `POST /shortfall-rounds/:roundId/cancel` (titular; RF-011-06). */
  async cancel(userId: string, roundId: string): Promise<ShortfallRoundView> {
    const now = this.clock.now();
    const peek = await this.repo.findRound(this.db, roundId);
    if (!peek) throw notFound();
    return this.db.withTransaction(async (tx) => {
      const group = await this.groups.findByIdForUpdate(tx, peek.groupId);
      if (!group) throw notFound();
      await this.requireOwner(tx, peek.groupId, userId);
      const round = await this.repo.findRound(tx, roundId, true);
      if (!round) throw notFound();
      const rows = await this.repo.listRows(tx, roundId);
      if (rows.some((row) => row.choice !== 'pendiente')) {
        throw businessError(
          'ROUND_HAS_RESPONSES',
          'La ronda ya tiene respuestas y no se puede cancelar.',
          'RF-011-06',
        );
      }
      transitionRound(round.status, 'cancel');
      await this.repo.closeRound(tx, roundId, 'cancelada', now);
      await this.repo.insertEvent(tx, {
        roundId,
        type: 'ronda_cancelada',
        actorId: userId,
        occurredAt: now,
      });
      const updated = (await this.repo.findRound(tx, roundId)) ?? round;
      return this.views.round(tx, updated, group.owner_id, userId, now);
    });
  }

  /** `GET /me/shortfalls` (HU-011-02): las filas de la persona, más recientes primero. */
  async mine(userId: string): Promise<MyShortfallView[]> {
    const now = this.clock.now();
    const items = await this.repo.listForUser(this.db, userId);
    const out: MyShortfallView[] = [];
    for (const { round, row } of items) {
      const group = await this.groups.findById(this.db, round.groupId);
      if (!group) continue;
      out.push({
        groupId: group.id,
        groupName: group.name,
        round: {
          id: round.id,
          period: round.period,
          status: round.status,
          respondBy: round.respondBy.toISOString(),
          payBy: round.payBy.toISOString(),
        },
        row: await this.views.row(this.db, round, row, group.owner_id, userId, now),
      });
    }
    return out;
  }

  /** Solo el titular; un miembro activo recibe `403` y cualquier otra persona, `404`. */
  private async requireOwner(q: Queryable, groupId: string, userId: string): Promise<GroupRow> {
    const group = await this.groups.findById(q, groupId);
    if (!group) throw notFound();
    if (group.owner_id === userId) return group;
    if (await this.members.findActive(q, groupId, userId)) throw forbidden();
    throw notFound();
  }

  private async quote(q: Queryable, group: GroupRow): Promise<ShortfallQuoteView> {
    const cycle = await this.repo.latestCycle(q, group.id);
    if (!cycle) throw noShortfall();
    const [paid, memberCountAfter] = await Promise.all([
      this.repo.paidByActiveMembers(q, group.id, cycle.period),
      this.members.countActive(q, group.id),
    ]);
    const quote = quoteShortfall({ totalBsCents: cycle.totalBsCents, memberCountAfter, paid });
    return {
      groupId: group.id,
      cycleId: cycle.id,
      period: cycle.period,
      totalBsCents: cycle.totalBsCents,
      memberCountAfter,
      baseShareCents: quote.baseShareCents,
      ownerShareCents: quote.ownerShareCents,
      shortfallCents: quote.shortfallCents,
      rows: quote.rows.map((row) => ({
        userId: row.userId,
        fullName: row.fullName,
        paidCents: row.paidCents,
        extraDueCents: row.extraDueCents,
      })),
    };
  }
}
