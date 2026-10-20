import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService, type DbTransaction } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import type {
  ChargeCancelled,
  ChargeConfirmed,
  ChargeRejected,
} from '../../../shared/events/charge-events.js';
import { TxEventBus } from '../../../shared/events/tx-event-bus.js';
import { transition, type ChargeAction, type ChargeStatus } from '../domain/charge-state.js';
import { entryChargeDraft, type EntrySnapshot } from '../domain/entry-charge.js';
import { resolveManualPaidAt } from '../domain/manual-payment.js';
import { GroupsRepository } from '../../subscriptions/repositories/groups.repository.js';
import { ChargesRepository, type ChargeRecord } from '../repositories/charges.repository.js';
import { CyclesRepository } from '../repositories/cycles.repository.js';
import { ChargeEventsRepository } from '../repositories/events.repository.js';
import {
  ReceiptsRepository,
  type PaymentMethod,
  type ReceiptMime,
} from '../repositories/receipts.repository.js';
import { BillingCyclesService } from './billing-cycles.service.js';
import { BillingReadService } from './billing-read.service.js';
import { ChargeAccessService, forbidden, type ChargeContext } from './charge-access.service.js';
import type { ChargeView } from './charge-views.js';
import { OverdueService } from './overdue.service.js';
import { PaymentReferenceService } from './payment-reference.service.js';

export interface ReviewInput {
  /** Versión del cobro que el titular tenía en pantalla (control de concurrencia opcional). */
  version: number | null;
}
export interface RejectInput extends ReviewInput {
  reason: string;
  invalidReceipt: boolean;
}
export interface ManualPaymentInput extends ReviewInput {
  note: string | null;
  paidAt: Date | null;
}
export interface CancelInput extends ReviewInput {
  reason: string;
}

/** Comprobante de la solicitud de ingreso que pasa a ser el del cobro (RF-002-19). */
export interface EntryProof {
  /** Clave ya copiada al espacio de comprobantes del cobro por la spec 010. */
  fileKey: string;
  mime: ReceiptMime;
  sizeBytes: number;
  method: PaymentMethod;
  reference: string;
  uploadedAt: Date;
}

export interface EntryChargeInput {
  groupId: string;
  userId: string;
  joinRequestId: string;
  /** Cuota cotizada en la solicitud, en centavos de Bs. */
  amountCents: number;
  snapshot: EntrySnapshot;
  /** `null` si el titular registró el pago en efectivo (sin comprobante). */
  proof: EntryProof | null;
}

export interface EntryChargeResult {
  charge: ChargeRecord;
  /** `false` si la persona ya tenía un cobro no cancelado en el período y no se creó otro. */
  created: boolean;
}

const groupFrozen = (): DomainError =>
  new DomainError(
    'GROUP_FROZEN',
    422,
    'El grupo está congelado: por ahora solo se puede consultar.',
  );

const staleState = (): DomainError =>
  new DomainError(
    'STALE_STATE',
    409,
    'El cobro cambió mientras lo veías. Recarga e intenta de nuevo.',
  );

type Tx = DbTransaction;

/**
 * Acciones del titular sobre un cobro (spec 002, US3 y US4): confirmar, rechazar, pago manual y
 * cancelar. Cada una corre en UNA transacción que bloquea el cobro `FOR UPDATE` (RNF-002-03), valida
 * acceso (solo el titular), grupo congelado y versión, aplica `transition` y escribe el evento y la
 * publicación. Un grupo `cerrado` sigue admitiéndolas (research R5).
 */
@Injectable()
export class ChargesService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly bus: TxEventBus,
    private readonly access: ChargeAccessService,
    private readonly charges: ChargesRepository,
    private readonly receipts: ReceiptsRepository,
    private readonly events: ChargeEventsRepository,
    private readonly references: PaymentReferenceService,
    private readonly reads: BillingReadService,
    private readonly groups: GroupsRepository,
    private readonly cycles: CyclesRepository,
    private readonly billingCycles: BillingCyclesService,
    private readonly overdue: OverdueService,
  ) {}

  /**
   * Cobro de ingreso para la spec 010 (RF-002-19, RN-002-10). Corre en la transacción del llamador
   * (la aceptación de la solicitud) y no abre otra. Antes de crear el cobro llama a
   * `ensureCurrentCycle`, así el período existe y la generación no le crea un segundo cobro
   * (CA-002-24); el llamador debe haberlo hecho ANTES de dar de alta al miembro (plan §2). El cobro
   * nace `pagado` (`origin = settlement = 'ingreso'`), liquidado por el titular. Si la persona ya
   * tiene un cobro no cancelado en ese período no se crea otro y se devuelve el existente.
   */
  async createEntryCharge(tx: Tx, input: EntryChargeInput): Promise<EntryChargeResult> {
    const now = this.clock.now();
    const group = await this.groups.findById(tx, input.groupId);
    if (!group) throw new Error('El grupo del cobro de ingreso no existe.');
    await this.billingCycles.ensureCurrentCycle(tx, input.groupId, now);
    const cycle = await this.cycles.findLatest(tx, input.groupId);
    if (!cycle) throw new Error('El grupo no tiene ciclo para el cobro de ingreso.');

    const existing = await this.charges.findActiveByMemberPeriod(
      tx,
      input.groupId,
      input.userId,
      cycle.period,
    );
    if (existing) return { charge: existing, created: false };

    const draft = entryChargeDraft({
      userId: input.userId,
      period: cycle.period,
      amountCents: input.amountCents,
      snapshot: input.snapshot,
      now,
    });
    const charge = await this.charges.insertEntry(
      tx,
      input.groupId,
      cycle.id,
      input.joinRequestId,
      group.owner_id,
      draft,
    );
    if (!charge) {
      // Carrera con la generación: otra transacción creó el cobro del período entre medias.
      const winner = await this.charges.findActiveByMemberPeriod(
        tx,
        input.groupId,
        input.userId,
        cycle.period,
      );
      if (!winner) throw new Error('No se pudo crear el cobro de ingreso.');
      return { charge: winner, created: false };
    }

    let receiptId: string | null = null;
    if (input.proof) {
      const receipt = await this.receipts.insert(tx, {
        chargeId: charge.id,
        uploadedBy: input.userId,
        fileKey: input.proof.fileKey,
        mime: input.proof.mime,
        sizeBytes: input.proof.sizeBytes,
        method: input.proof.method,
        reference: input.proof.reference,
        uploadedAt: input.proof.uploadedAt,
      });
      await this.receipts.setStatus(tx, receipt.id, 'confirmado');
      receiptId = receipt.id;
    }
    await this.events.append(tx, {
      chargeId: charge.id,
      groupId: input.groupId,
      type: 'ingreso_registrado',
      actorId: group.owner_id,
      fromStatus: null,
      toStatus: 'pagado',
      metadata: {
        joinRequestId: input.joinRequestId,
        method: input.proof ? 'comprobante' : 'efectivo',
        ...(receiptId && { receiptId }),
      },
      occurredAt: now,
    });
    return { charge, created: true };
  }

  /** `POST /charges/:id/confirm` (RF-002-10, CA-002-06). */
  async confirm(userId: string, chargeId: string, input: ReviewInput): Promise<ChargeView> {
    await this.db.withTransaction(async (tx) => {
      const { charge } = await this.open(tx, userId, chargeId);
      const now = this.clock.now();
      const to = this.apply(charge, 'confirm', now, input.version);
      const receipt = await this.receipts.findActiveByCharge(tx, charge.id);
      if (receipt) await this.receipts.setStatus(tx, receipt.id, 'confirmado');
      await this.charges.updateStatus(tx, charge.id, to, {
        paidAt: now,
        settledBy: userId,
        settlement: 'comprobante',
      });
      await this.events.append(tx, {
        chargeId: charge.id,
        groupId: charge.groupId,
        type: 'confirmado',
        actorId: userId,
        fromStatus: charge.status,
        toStatus: to,
        metadata: receipt ? { receiptId: receipt.id } : {},
        occurredAt: now,
      });
      const event: ChargeConfirmed = {
        type: 'billing.charge-confirmed',
        chargeId: charge.id,
        groupId: charge.groupId,
        userId: charge.userId,
        confirmedBy: userId,
        settlement: 'comprobante',
      };
      await this.bus.publish(tx, event);
    });
    return this.reads.getCharge(userId, chargeId);
  }

  /** `POST /charges/:id/reject` (RF-002-11, CA-002-07, CA-002-30): nunca retira al miembro. */
  async reject(userId: string, chargeId: string, input: RejectInput): Promise<ChargeView> {
    await this.db.withTransaction(async (tx) => {
      const { charge } = await this.open(tx, userId, chargeId);
      const now = this.clock.now();
      const to = this.apply(charge, 'reject', now, input.version);
      const receipt = await this.receipts.findActiveByCharge(tx, charge.id);
      if (receipt) {
        await this.receipts.setStatus(tx, receipt.id, 'rechazado');
        // La referencia queda libre para volver a usarla (CA-002-27).
        await this.references.release(tx, 'receipt', receipt.id, now);
      }
      await this.charges.updateStatus(tx, charge.id, to);
      await this.events.append(tx, {
        chargeId: charge.id,
        groupId: charge.groupId,
        type: 'rechazado',
        actorId: userId,
        fromStatus: charge.status,
        toStatus: to,
        reason: input.reason,
        metadata: {
          invalidReceipt: input.invalidReceipt,
          ...(receipt && { receiptId: receipt.id }),
        },
        occurredAt: now,
      });
      const event: ChargeRejected = {
        type: 'billing.charge-rejected',
        chargeId: charge.id,
        groupId: charge.groupId,
        userId: charge.userId,
        rejectedBy: userId,
        reason: input.reason,
        invalidReceipt: input.invalidReceipt,
        toStatus: to === 'atrasado' ? 'atrasado' : 'pendiente',
      };
      await this.bus.publish(tx, event);
    });
    return this.reads.getCharge(userId, chargeId);
  }

  /** `POST /charges/:id/manual-payment` (RF-002-12, RN-002-08, CA-002-14). */
  async manualPayment(
    userId: string,
    chargeId: string,
    input: ManualPaymentInput,
  ): Promise<ChargeView> {
    await this.db.withTransaction(async (tx) => {
      const { charge } = await this.open(tx, userId, chargeId);
      const now = this.clock.now();
      const to = this.apply(charge, 'manualPayment', now, input.version);
      const paidAt = resolveManualPaidAt({ now, issuedAt: charge.issuedAt, paidAt: input.paidAt });
      await this.charges.updateStatus(tx, charge.id, to, {
        paidAt,
        settledBy: userId,
        settlement: 'manual',
        manualNote: input.note,
      });
      await this.events.append(tx, {
        chargeId: charge.id,
        groupId: charge.groupId,
        type: 'pago_manual',
        actorId: userId,
        fromStatus: charge.status,
        toStatus: to,
        reason: input.note,
        metadata: { paidAt: paidAt.toISOString() },
        occurredAt: now,
      });
      const event: ChargeConfirmed = {
        type: 'billing.charge-confirmed',
        chargeId: charge.id,
        groupId: charge.groupId,
        userId: charge.userId,
        confirmedBy: userId,
        settlement: 'manual',
      };
      await this.bus.publish(tx, event);
    });
    return this.reads.getCharge(userId, chargeId);
  }

  /** `POST /charges/:id/cancel` (RF-002-13, RN-002-07, CA-002-15). */
  async cancel(userId: string, chargeId: string, input: CancelInput): Promise<ChargeView> {
    await this.db.withTransaction(async (tx) => {
      const { charge } = await this.open(tx, userId, chargeId);
      const now = this.clock.now();
      const to = this.apply(charge, 'cancel', now, input.version);
      // Defensa: si quedara una reserva activa de un comprobante, se libera (RF-002-13).
      const receipt = await this.receipts.findActiveByCharge(tx, charge.id);
      if (receipt) await this.references.release(tx, 'receipt', receipt.id, now);
      await this.charges.updateStatus(tx, charge.id, to, {
        cancelledAt: now,
        cancelledBy: userId,
        cancelReason: input.reason,
      });
      await this.events.append(tx, {
        chargeId: charge.id,
        groupId: charge.groupId,
        type: 'cancelado',
        actorId: userId,
        fromStatus: charge.status,
        toStatus: to,
        reason: input.reason,
        metadata: {},
        occurredAt: now,
      });
      const event: ChargeCancelled = {
        type: 'billing.charge-cancelled',
        chargeId: charge.id,
        groupId: charge.groupId,
        userId: charge.userId,
        cancelledBy: userId,
        reason: input.reason,
      };
      await this.bus.publish(tx, event);
    });
    return this.reads.getCharge(userId, chargeId);
  }

  /**
   * Bloquea el cobro y valida quién puede actuar. Solo el titular revisa (CA-002-12: el dueño y
   * quien ya se retiró reciben 403); el grupo congelado no admite escrituras.
   */
  private async open(tx: Tx, userId: string, chargeId: string): Promise<ChargeContext> {
    // Antes de leer el cobro, un vencimiento aún no barrido se marca `atrasado` (research R2).
    await this.overdue.sweepForCharge(chargeId, this.clock.now(), tx);
    const context = await this.access.resolve(tx, userId, chargeId, { lock: true });
    if (context.access !== 'titular') throw forbidden();
    if (context.group.frozen_at !== null) throw groupFrozen();
    return context;
  }

  /** Transición del dominio y, después, control de versión: un estado final siempre dice 409 INVALID. */
  private apply(
    charge: ChargeContext['charge'],
    action: ChargeAction,
    now: Date,
    version: number | null,
  ): ChargeStatus {
    const to = transition(charge.status, action, { now, dueAt: charge.dueAt });
    if (version !== null && version !== charge.version) throw staleState();
    return to;
  }
}
