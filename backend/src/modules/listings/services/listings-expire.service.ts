import { Injectable, Logger } from '@nestjs/common';
import type { DbTransaction } from '../../../shared/db/db.service.js';
import { DbService } from '../../../shared/db/db.service.js';
import type { JobContext, ScheduledJob } from '../../../shared/jobs/scheduled-job.js';
import { JoinRequestsService } from '../../join-requests/services/join-requests.service.js';
import { reconcileAction, type ReconcileAction } from '../domain/listing-lifecycle.js';
import {
  ListingsRepository,
  type ListingRecord,
  type LockedGroup,
} from '../repositories/listings.repository.js';
import { ListingsSearchRepository } from '../repositories/listings-search.repository.js';

const BATCH = 500;

/**
 * Vencimiento, cierre y reparación de publicaciones (spec 008 US5; RF-008-05, RN-008-04,
 * CA-008-14, CA-008-16). `reconcile` es la única regla: la usan la tarea `listings.expire` y los
 * manejadores de eventos, con el orden de bloqueo grupo → publicación (RNF-008-03).
 */
@Injectable()
export class ListingsExpireService {
  private readonly logger = new Logger(ListingsExpireService.name);

  constructor(
    private readonly db: DbService,
    private readonly listings: ListingsRepository,
    private readonly search: ListingsSearchRepository,
    private readonly joinRequests: JoinRequestsService,
  ) {}

  /**
   * Aplica la acción que corresponde a la publicación con el grupo y la publicación ya
   * bloqueados. Idempotente: si ya está al día no escribe nada.
   */
  async reconcile(
    tx: DbTransaction,
    group: LockedGroup,
    listing: ListingRecord,
    now: Date,
  ): Promise<ReconcileAction> {
    const action = reconcileAction({
      listing,
      group: {
        status: group.status,
        frozen: group.frozen,
        totalSlots: group.totalSlots,
        members: await this.listings.countActiveMembers(tx, group.id),
      },
      ownerBanned: (await this.search.accountStatus(tx, group.ownerId)) === 'baneado',
      now,
    });
    switch (action.kind) {
      case 'none':
        break;
      case 'expire':
        await this.listings.update(tx, listing.id, { status: 'expirada' });
        break;
      case 'adjust':
        await this.listings.update(tx, listing.id, { slotsOffered: action.slotsOffered });
        break;
      case 'close':
        await this.close(tx, listing, action.reason, now);
        // Las solicitudes de un grupo cerrado o congelado las rechaza la spec 010.
        if (action.reason === 'grupo_lleno') {
          await this.joinRequests.rejectOpenForListing(tx, listing.id, 'sin_cupo');
        }
        break;
    }
    return action;
  }

  /** Cierra la publicación (`activa`/`oculta` → `cerrada`) con el motivo dado. */
  async close(tx: DbTransaction, listing: ListingRecord, reason: string, now: Date): Promise<void> {
    await this.listings.update(tx, listing.id, {
      status: 'cerrada',
      slotsOffered: 0,
      endedAt: now,
      endReason: reason,
      hiddenAt: null,
    });
  }

  /**
   * Un barrido de la tarea: cada publicación en su propia transacción y con `SKIP LOCKED`, de
   * modo que lo que otra transacción está usando se salta y se repite en el próximo tick.
   * Devuelve cuántas publicaciones cambió y cuántas fallaron.
   */
  async sweep(now: Date): Promise<{ changed: number; failed: number }> {
    let changed = 0;
    let failed = 0;
    for (const candidate of await this.listings.listNeedingAttention(this.db, now, BATCH)) {
      try {
        const action = await this.db.withTransaction(async (tx) => {
          const group = await this.listings.lockGroupSkipLocked(tx, candidate.groupId);
          if (!group) return null;
          const listing = await this.listings.findByIdForUpdateSkipLocked(tx, candidate.id);
          if (!listing) return null;
          return this.reconcile(tx, group, listing, now);
        });
        if (action && action.kind !== 'none') changed += 1;
      } catch {
        failed += 1;
        this.logger.error(`listings.expire: no se pudo procesar la publicación ${candidate.id}.`);
      }
    }
    return { changed, failed };
  }
}

/** `listings.expire` (contracts/api.md): en cada tick; idempotente por el estado de la base. */
export class ListingsExpireJob implements ScheduledJob {
  readonly name = 'listings.expire';
  readonly intervalSeconds = 0;

  constructor(private readonly expire: ListingsExpireService) {}

  async run(ctx: JobContext): Promise<number> {
    const { changed, failed } = await this.expire.sweep(ctx.now);
    if (failed > 0) throw new Error(`listings.expire no pudo procesar ${failed} publicación(es).`);
    return changed;
  }
}
