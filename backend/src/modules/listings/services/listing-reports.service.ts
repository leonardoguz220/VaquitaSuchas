import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { NotificationService } from '../../notifications/services/notification.service.js';
import { isExpired, nextStatus } from '../domain/listing-lifecycle.js';
import { normalizePlainText } from '../domain/plain-text.js';
import { shouldHide } from '../domain/report-rules.js';
import {
  ListingReportsRepository,
  type ReportReason,
} from '../repositories/listing-reports.repository.js';
import { ListingsRepository } from '../repositories/listings.repository.js';
import { ListingsSearchRepository } from '../repositories/listings-search.repository.js';

export const MAX_REPORT_COMMENT = 300;
export const MAX_REPORTS_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const listingNotFound = (): DomainError =>
  new DomainError('LISTING_NOT_FOUND', 404, 'No se encontró la publicación.');

/**
 * Reportes de publicaciones (spec 008 US4, RF-008-17 y RF-008-18). Todo ocurre en una transacción
 * con el orden de bloqueo grupo → publicación (RNF-008-03): inserta, cuenta reportes distintos
 * desde la última restauración, oculta al tercero y avisa al titular.
 */
@Injectable()
export class ListingReportsService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly listings: ListingsRepository,
    private readonly reports: ListingReportsRepository,
    private readonly search: ListingsSearchRepository,
    private readonly notifications: NotificationService,
  ) {}

  /** `POST /listings/:id/reports` (CA-008-17, CA-008-18, CA-008-22). */
  async report(
    userId: string,
    listingId: string,
    input: { reason: ReportReason; comment?: string | null },
  ): Promise<void> {
    let comment: string | null = null;
    if (input.comment !== undefined && input.comment !== null) {
      const normalized = normalizePlainText(input.comment, MAX_REPORT_COMMENT);
      if (!normalized.ok) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
          fields: { comment: [normalized.reason] },
        });
      }
      comment = normalized.value;
    }

    await this.db.withTransaction(async (tx) => {
      const now = this.clock.now();
      const found = await this.listings.findById(tx, listingId);
      if (!found) throw listingNotFound();
      const group = await this.listings.lockGroup(tx, found.groupId);
      if (!group) throw listingNotFound();
      const listing = await this.listings.findByIdForUpdate(tx, listingId);
      if (!listing || listing.status !== 'activa' || isExpired(listing.expiresAt, now)) {
        throw listingNotFound();
      }
      if (group.ownerId === userId) {
        throw new DomainError(
          ErrorCode.BUSINESS_RULE,
          422,
          'No puedes reportar tu propia publicación.',
          { rule: 'CANNOT_REPORT_OWN_LISTING' },
        );
      }
      if (await this.listings.isActiveMember(tx, group.id, userId)) throw listingNotFound();
      if ((await this.search.accountStatus(tx, userId)) !== 'activo') {
        throw new DomainError(
          'ACCOUNT_RESTRICTED',
          403,
          'Tu cuenta está restringida y no puede reportar publicaciones.',
          { rule: 'RF-009-10' },
        );
      }
      const today = await this.reports.countByReporterSince(
        tx,
        userId,
        new Date(now.getTime() - DAY_MS),
      );
      if (today >= MAX_REPORTS_PER_DAY) {
        throw new DomainError(
          ErrorCode.RATE_LIMITED,
          429,
          'Alcanzaste el límite de reportes por día. Inténtalo más tarde.',
          { rule: 'RNF-008-04' },
        );
      }
      const inserted = await this.reports.insert(tx, {
        listingId,
        reporterId: userId,
        reason: input.reason,
        comment,
        createdAt: now,
      });
      if (!inserted) {
        throw new DomainError('ALREADY_REPORTED', 409, 'Ya reportaste esta publicación.', {
          rule: 'RF-008-17',
        });
      }

      const all = await this.reports.listByListing(tx, listingId);
      if (!shouldHide(all, listing.moderationClearedAt)) return;
      if (!nextStatus(listing.status, 'hide')) return;
      await this.listings.update(tx, listingId, { status: 'oculta', hiddenAt: now });
      await this.notifications.notify(tx, {
        userId: group.ownerId,
        type: 'publicacion_oculta',
        entity: { type: 'listing', id: listingId },
        period: now.toISOString(),
        data: {
          groupId: group.id,
          groupName: (await this.listings.groupName(tx, group.id)) ?? '',
          reason: 'recibió reportes de otros usuarios',
        },
      });
    });
  }
}
