import { Inject, Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import {
  CHARGE_FACTS_PORT,
  type ChargeFact as BillingFact,
  type ChargeFactsPort,
} from '../../billing/ports/charge-facts.port.js';
import type { ChargeFact } from '../domain/facts.js';
import { RULES_VERSION } from '../domain/rules-version.js';
import { computeReputation, windowStart, type Reputation } from '../domain/score.js';
import { ReputationRepository } from '../repositories/reputation.repository.js';

export function toFact(fact: BillingFact, excluded: boolean): ChargeFact {
  return {
    chargeId: fact.chargeId,
    status: fact.status,
    origin: fact.origin,
    dueAt: fact.dueAt,
    firstSubmittedAt: fact.firstSubmittedAt,
    lastUploadAt: fact.lastSubmittedAt,
    paidAt: fact.paidAt,
    settlement: fact.settlement,
    invalidReceipt: fact.hadInvalidReceiptRejection,
    groupFrozenByBan: fact.groupFrozenByBan,
    excluded,
  };
}

/**
 * Calcula y guarda la calificación (spec 007). Solo mira los cobros de la propia persona: nunca
 * mezcla datos de otras (RN-007-08). Las fechas salen del servidor, no del cliente (RNF-007-05).
 */
@Injectable()
export class ReputationService {
  constructor(
    @Inject(CHARGE_FACTS_PORT) private readonly facts: ChargeFactsPort,
    private readonly repository: ReputationRepository,
  ) {}

  /** Hechos de los últimos 12 meses de una persona, con las exclusiones aplicadas. */
  async loadFacts(q: Queryable, userId: string, now: Date): Promise<ChargeFact[]> {
    const raw = await this.facts.listForUsers(q, [userId], windowStart(now));
    const excluded = await this.repository.excludedChargeIds(
      q,
      raw.map((fact) => fact.chargeId),
    );
    return raw.map((fact) => toFact(fact, excluded.has(fact.chargeId)));
  }

  /** Calificación calculada en el momento, sin guardar. */
  async computeNow(q: Queryable, userId: string, now: Date): Promise<Reputation> {
    return computeReputation(await this.loadFacts(q, userId, now), now);
  }

  /** Recalcula y guarda `user_reputation` dentro de la transacción del hecho (RF-007-05). */
  async recomputeUser(tx: Queryable, userId: string, now: Date): Promise<Reputation> {
    const reputation = await this.computeNow(tx, userId, now);
    await this.repository.upsert(tx, userId, reputation, RULES_VERSION, now);
    return reputation;
  }
}
