import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { ExclusionsRepository, type ChargeScope } from '../repositories/exclusions.repository.js';
import { ReputationService } from './reputation.service.js';

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);
const forbidden = (): DomainError =>
  new DomainError(ErrorCode.FORBIDDEN, 403, DEFAULT_MESSAGES.FORBIDDEN);

/** Reporte del dueño y exclusión del titular de un cobro mal calificado (spec 007, US4, RF-007-14). */
@Injectable()
export class ReportsService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly exclusions: ExclusionsRepository,
    private readonly reputation: ReputationService,
  ) {}

  /** Un cobro ajeno de un grupo propio es `403`; de un grupo ajeno, `404` (no revela que existe). */
  private async deny(scope: ChargeScope, userId: string): Promise<never> {
    throw (await this.exclusions.isActiveMember(this.db, scope.groupId, userId))
      ? forbidden()
      : notFound();
  }

  /** `POST /charges/:id/reputation-report`: solo el dueño del cobro. */
  async report(userId: string, chargeId: string, comment: string): Promise<void> {
    const scope = await this.exclusions.findChargeScope(this.db, chargeId);
    if (!scope) throw notFound();
    if (scope.userId !== userId) return this.deny(scope, userId);
    if (await this.exclusions.isExcluded(this.db, chargeId)) {
      throw new DomainError(
        ErrorCode.BUSINESS_RULE,
        422,
        'Este cobro ya fue excluido de tu calificación.',
        {
          code: 'CHARGE_ALREADY_EXCLUDED',
        },
      );
    }
    if (await this.exclusions.reportExists(this.db, chargeId, userId)) {
      throw new DomainError(ErrorCode.BUSINESS_RULE, 422, 'Ya reportaste este cobro.', {
        code: 'REPORT_ALREADY_SENT',
      });
    }
    await this.exclusions.insertReport(this.db, chargeId, userId, comment);
  }

  /**
   * `POST /charges/:id/reputation-exclusion`: solo el titular del grupo. Deja registrado quién y
   * cuándo, cierra los reportes abiertos y recalcula al dueño en la misma transacción.
   */
  async exclude(userId: string, chargeId: string, reason: string): Promise<void> {
    const scope = await this.exclusions.findChargeScope(this.db, chargeId);
    if (!scope) throw notFound();
    if (scope.groupOwnerId !== userId) return this.deny(scope, userId);
    await this.db.withTransaction(async (tx) => {
      if (await this.exclusions.isExcluded(tx, chargeId)) {
        throw new DomainError(ErrorCode.BUSINESS_RULE, 422, 'Este cobro ya está excluido.', {
          code: 'CHARGE_ALREADY_EXCLUDED',
        });
      }
      const now = this.clock.now();
      await this.exclusions.insertExclusion(tx, chargeId, reason, userId);
      await this.exclusions.closeOpenReports(tx, chargeId, userId, reason, now);
      await this.reputation.recomputeUser(tx, scope.userId, now);
    });
  }
}
