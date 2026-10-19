import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import {
  FileStorage,
  StorageError,
  StorageObjectNotFoundError,
} from '../../../shared/ports/file-storage.js';
import { decodeChargeCursor, encodeChargeCursor } from '../domain/charge-cursor.js';
import { resolveAccess, type ChargeAccess } from '../domain/access.js';
import type { ChargeStatus } from '../domain/charge-state.js';
import { RECEIPT_URL_TTL_SECONDS } from '../domain/receipt-file.js';
import { ChargeReadRepository, type GroupBrief } from '../repositories/charge-read.repository.js';
import { ChargesRepository, type ChargeRecord } from '../repositories/charges.repository.js';
import { ChargeEventsRepository } from '../repositories/events.repository.js';
import { ReceiptsRepository } from '../repositories/receipts.repository.js';
import { ChargeAccessService, notFound } from './charge-access.service.js';
import { personIdsOf, presentCharge } from './charge-presenter.js';
import type { ChargeView, MyChargesPage, MyChargeView } from './charge-views.js';

export interface MyChargesQuery {
  statuses: readonly ChargeStatus[];
  period: string | null;
  groupId: string | null;
  limit: number;
  cursor: string | null;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/**
 * Lectura de cobros para el frontend y para otros módulos (specs 006 y 007 usan `BillingReadService`
 * y `ChargeFactsPort`). Aquí no hay escritura ni reglas: el acceso lo decide `ChargeAccessService`
 * y las acciones permitidas salen de `domain/access.ts`.
 */
@Injectable()
export class BillingReadService {
  private readonly logger = new Logger(BillingReadService.name);

  constructor(
    private readonly db: DbService,
    private readonly access: ChargeAccessService,
    private readonly charges: ChargesRepository,
    private readonly events: ChargeEventsRepository,
    private readonly receipts: ReceiptsRepository,
    private readonly reads: ChargeReadRepository,
    private readonly storage: FileStorage,
  ) {}

  /** `GET /charges/:chargeId` (RF-002-09, RNF-002-01). */
  async getCharge(userId: string, chargeId: string): Promise<ChargeView> {
    const { charge, access } = await this.access.resolve(this.db, userId, chargeId);
    const groups = await this.reads.findGroupBriefs(this.db, [charge.groupId]);
    const [item] = await this.compose([{ charge, access }], groups);
    if (!item) throw notFound();
    const { group: _group, ...view } = item;
    void _group;
    return view;
  }

  /** `GET /me/charges` (RF-002-15, CA-002-32). */
  async listMine(userId: string, query: MyChargesQuery): Promise<MyChargesPage> {
    const after = query.cursor === null ? null : decodeChargeCursor(query.cursor);
    if (query.cursor !== null && after === null) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
        fields: { cursor: ['INVALID_CURSOR'] },
      });
    }
    const limit = Math.min(Math.max(query.limit, 1), MAX_PAGE_SIZE);
    const rows = await this.charges.listMine(this.db, {
      userId,
      statuses: query.statuses,
      period: query.period,
      groupId: query.groupId,
      limit: limit + 1,
      after,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > limit && last ? encodeChargeCursor({ dueAt: last.dueAt, id: last.id }) : null;

    const groups = await this.reads.findGroupBriefs(this.db, [
      ...new Set(page.map((charge) => charge.groupId)),
    ]);
    const active = await this.activeMembers(page);
    const entries: { charge: ChargeRecord; access: ChargeAccess }[] = [];
    for (const charge of page) {
      const group = groups.get(charge.groupId);
      if (!group) continue;
      // Son cobros propios: quien consulta es el dueño (o, si es el titular, resolveAccess lo dice).
      const access = resolveAccess({
        user: { id: userId },
        charge: { userId: charge.userId, status: charge.status },
        group: { ownerId: group.ownerId },
        membership: active.has(`${charge.groupId}:${userId}`) ? { active: true } : null,
      });
      if (access === 'ninguno' || access === 'miembro') continue;
      entries.push({ charge, access });
    }
    const items = await this.compose(entries, groups);
    return { items: items.map(({ receipts: _receipts, ...item }) => item), nextCursor };
  }

  /** Arma las vistas completas de los cobros, con una consulta por tipo de dato (sin N+1). */
  private async compose(
    entries: readonly { charge: ChargeRecord; access: ChargeAccess }[],
    groups: ReadonlyMap<string, GroupBrief>,
  ): Promise<(ChargeView & { group: MyChargeView['group'] })[]> {
    if (entries.length === 0) return [];
    const charges = entries.map((entry) => entry.charge);
    const ids = charges.map((charge) => charge.id);
    const [events, receipts, active] = await Promise.all([
      this.events.listByCharges(this.db, ids),
      this.receipts.listByCharges(this.db, ids),
      this.activeMembers(charges),
    ]);
    const personIds = new Set<string>();
    for (const charge of charges) {
      const ofCharge = (row: { chargeId: string }): boolean => row.chargeId === charge.id;
      for (const id of personIdsOf(charge, events.filter(ofCharge), receipts.filter(ofCharge))) {
        personIds.add(id);
      }
    }
    const names = await this.reads.findUserNames(this.db, [...personIds]);

    const qrUrls = new Map<string, string | null>();
    const views: (ChargeView & { group: MyChargeView['group'] })[] = [];
    for (const { charge, access } of entries) {
      const group = groups.get(charge.groupId);
      if (!group) continue;
      const open = charge.status === 'pendiente' || charge.status === 'atrasado';
      const showsQr = (access === 'dueno' || access === 'dueno_retirado') && open;
      if (showsQr && !qrUrls.has(group.id)) qrUrls.set(group.id, await this.signQr(group));
      const ofCharge = (row: { chargeId: string }): boolean => row.chargeId === charge.id;
      const view = presentCharge({
        charge,
        group,
        access,
        memberActive: active.has(`${charge.groupId}:${charge.userId}`),
        events: events.filter(ofCharge),
        receipts: receipts.filter(ofCharge),
        names,
        qrUrl: showsQr ? (qrUrls.get(group.id) ?? null) : null,
      });
      views.push({
        ...view,
        group: {
          id: group.id,
          name: group.name,
          serviceName: group.serviceName,
          logoUrl: group.logoUrl,
        },
      });
    }
    return views;
  }

  private async activeMembers(charges: readonly ChargeRecord[]): Promise<Set<string>> {
    const active = new Set<string>();
    const byUser = new Map<string, Set<string>>();
    for (const charge of charges) {
      const groups = byUser.get(charge.userId) ?? new Set<string>();
      groups.add(charge.groupId);
      byUser.set(charge.userId, groups);
    }
    for (const [userId, groupIds] of byUser) {
      const found = await this.reads.findActiveGroupIds(this.db, userId, [...groupIds]);
      for (const groupId of found) active.add(`${groupId}:${userId}`);
    }
    return active;
  }

  private async signQr(group: GroupBrief): Promise<string | null> {
    if (!group.paymentQrKey) return null;
    try {
      return await this.storage.signedUrl(group.paymentQrKey, RECEIPT_URL_TTL_SECONDS);
    } catch (error) {
      // El QR es un complemento: si el almacén falla se muestra el texto de pago sin él.
      if (!(error instanceof StorageObjectNotFoundError) && !(error instanceof StorageError)) {
        throw error;
      }
      this.logger.warn('No se pudo firmar el QR de pago de un grupo.');
      return null;
    }
  }
}
