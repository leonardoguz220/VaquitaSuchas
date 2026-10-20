import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { RetentionService } from '../src/modules/billing/services/retention.service.js';
import { StorageError } from '../src/shared/ports/file-storage.js';
import { JobRunner } from '../src/shared/jobs/job-runner.js';
import { BillingHarness, NOW, type TestGroup } from './support/billing-harness.js';

// Retención de comprobantes (spec 002, T040, RN-002-06, CA-002-33): dos meses después de cerrar
// un grupo se borran del almacén los archivos y se conserva todo lo demás. PostgreSQL real; el
// reloj fijo es 2026-10-16T15:00Z, así que el límite es 2026-08-16T15:00Z.
describe('Retención de comprobantes', () => {
  const harness = new BillingHarness();
  let runner: JobRunner;
  let retention: RetentionService;

  const get = (userId: string, url: string): request.Test =>
    request(harness.app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${harness.token(userId)}`);

  async function closeGroup(group: TestGroup, closedAt: string): Promise<void> {
    await harness.pool.query(
      `UPDATE groups SET status = 'cerrado', closed_at = $2, accepting_members = false WHERE id = $1`,
      [group.id, closedAt],
    );
  }

  /** Grupo con un cobro y un comprobante guardado en el almacén. */
  async function groupWithReceipt(
    reference: string,
    status: 'pendiente' | 'pagado' = 'pagado',
  ): Promise<{ group: TestGroup; chargeId: string; receiptId: string; fileKey: string }> {
    const group = await harness.createGroup({ members: 1 });
    const payer = group.memberIds[0] as string;
    const chargeId = await harness.insertCharge(group, payer);
    const receipt = await harness.insertReceipt(chargeId, payer, { reference });
    // La retención solo alcanza cobros ya saldados (pagado o cancelado).
    await setChargeStatus(chargeId, status);
    return { group, chargeId, receiptId: receipt.id, fileKey: receipt.fileKey };
  }

  const deletedAt = async (receiptId: string): Promise<Date | null> =>
    (
      await harness.pool.query<{ file_deleted_at: Date | null }>(
        `SELECT file_deleted_at FROM receipts WHERE id = $1`,
        [receiptId],
      )
    ).rows[0]?.file_deleted_at ?? null;

  beforeAll(async () => {
    await harness.start();
    runner = harness.app.get(JobRunner, { strict: false });
    retention = harness.app.get(RetentionService, { strict: false });
  }, 60_000);

  afterAll(async () => {
    await harness.stop();
  }, 30_000);

  beforeEach(async () => {
    // Las pruebas comparten base: lo que dejaron las anteriores no debe contarse en esta.
    await harness.pool.query(
      `UPDATE receipts SET file_deleted_at = now() WHERE file_deleted_at IS NULL`,
    );
    harness.storage.files.clear();
    harness.storage.deleted.length = 0;
  });

  it('CA-002-33: un grupo cerrado hace más de 2 meses pierde sus archivos y conserva montos y estados', async () => {
    const old = await groupWithReceipt('REF-VIEJA');
    await closeGroup(old.group, '2026-08-10T12:00:00Z');

    const results = await runner.runAll('manual', {
      job: 'billing.retention',
      ignoreInterval: true,
    });

    expect(results).toEqual([
      expect.objectContaining({ job: 'billing.retention', status: 'ok', processed: 1 }),
    ]);
    expect(harness.storage.files.has(old.fileKey)).toBe(false);
    expect((await deletedAt(old.receiptId))?.toISOString()).toBe(NOW);
    // La fila del comprobante y el cobro siguen: solo desaparece el archivo.
    const kept = await harness.pool.query(
      `SELECT r.reference, r.status, c.amount_cents::int AS amount, c.status AS charge_status
         FROM receipts r JOIN charges c ON c.id = r.charge_id WHERE r.id = $1`,
      [old.receiptId],
    );
    expect(kept.rows).toEqual([
      { reference: 'REF-VIEJA', status: 'vigente', amount: 3333, charge_status: 'pagado' },
    ]);
    const titular = old.group.ownerId;
    const history = await get(titular, `/groups/${old.group.id}/charges`).expect(200);
    expect(history.body.items).toEqual([
      expect.objectContaining({
        id: old.chargeId,
        amountCents: 3333,
        status: 'pagado',
        receipts: [expect.objectContaining({ id: old.receiptId, fileAvailable: false })],
      }),
    ]);
    const file = await get(
      titular,
      `/charges/${old.chargeId}/receipts/${old.receiptId}/file`,
    ).expect(410);
    expect(file.body.code).toBe('FILE_DELETED');
  });

  it('RN-002-06: un grupo activo, o cerrado hace menos de 2 meses, conserva sus comprobantes', async () => {
    const active = await groupWithReceipt('REF-ACTIVO');
    const recent = await groupWithReceipt('REF-RECIENTE');
    await closeGroup(recent.group, '2026-08-20T12:00:00Z');

    const outcome = await retention.purgeExpiredReceipts(new Date(NOW));

    expect(outcome).toEqual({ deleted: 0, failed: 0 });
    for (const kept of [active, recent]) {
      expect(harness.storage.files.has(kept.fileKey)).toBe(true);
      expect(await deletedAt(kept.receiptId)).toBeNull();
    }
    expect(harness.storage.deleted).toEqual([]);
  });

  it('RN-002-06: el límite es exacto, cerrado justo hace 2 meses aún se conserva', async () => {
    const edge = await groupWithReceipt('REF-LIMITE');
    await closeGroup(edge.group, '2026-08-16T15:00:00Z');
    expect((await retention.purgeExpiredReceipts(new Date(NOW))).deleted).toBe(0);

    const later = new Date('2026-10-16T15:00:01Z');
    expect((await retention.purgeExpiredReceipts(later)).deleted).toBe(1);
    expect(harness.storage.files.has(edge.fileKey)).toBe(false);
  });

  /** Cobro extra del grupo, con comprobante, en el estado indicado. */
  async function extraCharge(
    old: { group: TestGroup },
    period: string,
    status: 'pendiente' | 'en_revision' | 'atrasado' | 'pagado' | 'cancelado',
  ): Promise<{ chargeId: string; receiptId: string; fileKey: string }> {
    const payer = old.group.memberIds[0] as string;
    const chargeId = await harness.insertCharge(old.group, payer, {
      period,
      dueAt: `${period}-19T04:00:00.000Z`,
    });
    const receipt = await harness.insertReceipt(chargeId, payer, { reference: `REF-${status}` });
    await setChargeStatus(chargeId, status);
    return { chargeId, receiptId: receipt.id, fileKey: receipt.fileKey };
  }

  /** Deja el cobro en el estado indicado cumpliendo las restricciones de la tabla. */
  async function setChargeStatus(chargeId: string, status: string): Promise<void> {
    await harness.pool.query(
      `UPDATE charges SET status = $2,
              paid_at = CASE WHEN $2 = 'pagado' THEN $3::timestamptz END,
              settled_by = CASE WHEN $2 = 'pagado' THEN user_id END,
              settlement = CASE WHEN $2 = 'pagado' THEN 'manual' END,
              cancelled_at = CASE WHEN $2 = 'cancelado' THEN $3::timestamptz END,
              cancelled_by = CASE WHEN $2 = 'cancelado' THEN user_id END,
              cancel_reason = CASE WHEN $2 = 'cancelado' THEN 'Cobro de prueba' END
        WHERE id = $1`,
      [chargeId, status, NOW],
    );
  }

  it('CA-002-33: en un grupo cerrado no se borran los comprobantes de cobros pendiente, en_revision ni atrasado', async () => {
    const old = await groupWithReceipt('REF-PEND', 'pendiente');
    await closeGroup(old.group, '2026-06-01T12:00:00Z');
    const review = await extraCharge(old, '2026-09', 'en_revision');
    const late = await extraCharge(old, '2026-08', 'atrasado');

    const outcome = await retention.purgeExpiredReceipts(new Date(NOW));

    expect(outcome).toEqual({ deleted: 0, failed: 0 });
    for (const kept of [old, review, late]) {
      expect(harness.storage.files.has(kept.fileKey)).toBe(true);
      expect(await deletedAt(kept.receiptId)).toBeNull();
    }
    expect(harness.storage.deleted).toEqual([]);
  });

  it('CA-002-33: un cobro en_revision que luego se paga o se cancela pierde su archivo en la siguiente corrida', async () => {
    const old = await groupWithReceipt('REF-PEND', 'pendiente');
    await closeGroup(old.group, '2026-06-01T12:00:00Z');
    const toPay = await extraCharge(old, '2026-09', 'en_revision');
    const toCancel = await extraCharge(old, '2026-08', 'en_revision');
    expect((await retention.purgeExpiredReceipts(new Date(NOW))).deleted).toBe(0);

    await setChargeStatus(toPay.chargeId, 'pagado');
    // Un cobro en revisión solo se cancela tras ser rechazado (vuelve a pendiente).
    await setChargeStatus(toCancel.chargeId, 'pendiente');
    expect((await retention.purgeExpiredReceipts(new Date(NOW))).deleted).toBe(1);
    await setChargeStatus(toCancel.chargeId, 'cancelado');
    const outcome = await retention.purgeExpiredReceipts(new Date('2026-10-17T15:00:00Z'));

    expect(outcome).toEqual({ deleted: 1, failed: 0 });
    expect(harness.storage.files.has(toPay.fileKey)).toBe(false);
    expect(harness.storage.files.has(toCancel.fileKey)).toBe(false);
    expect(await deletedAt(toPay.receiptId)).not.toBeNull();
    expect(await deletedAt(toCancel.receiptId)).not.toBeNull();
    // El cobro que sigue pendiente conserva su archivo.
    expect(harness.storage.files.has(old.fileKey)).toBe(true);
    expect(await deletedAt(old.receiptId)).toBeNull();
  });

  it('CA-002-33: los cobros pagado y cancelado de un grupo cerrado hace más de 2 meses se siguen borrando', async () => {
    const old = await groupWithReceipt('REF-PEND', 'pendiente');
    await closeGroup(old.group, '2026-06-01T12:00:00Z');
    const paid = await extraCharge(old, '2026-09', 'pagado');
    const cancelled = await extraCharge(old, '2026-08', 'cancelado');

    const outcome = await retention.purgeExpiredReceipts(new Date(NOW));

    expect(outcome).toEqual({ deleted: 2, failed: 0 });
    expect(harness.storage.files.has(paid.fileKey)).toBe(false);
    expect(harness.storage.files.has(cancelled.fileKey)).toBe(false);
    expect(harness.storage.files.has(old.fileKey)).toBe(true);
  });

  it('RN-002-06: el límite estricto de 2 meses también aplica a cobros pagados', async () => {
    const edge = await groupWithReceipt('REF-PEND', 'pendiente');
    await closeGroup(edge.group, '2026-08-16T15:00:00Z');
    const paid = await extraCharge(edge, '2026-09', 'pagado');

    expect((await retention.purgeExpiredReceipts(new Date(NOW))).deleted).toBe(0);
    expect(harness.storage.files.has(paid.fileKey)).toBe(true);
    expect((await retention.purgeExpiredReceipts(new Date('2026-10-16T15:00:01Z'))).deleted).toBe(
      1,
    );
    expect(harness.storage.files.has(paid.fileKey)).toBe(false);
  });

  it('CA-002-33: la tarea es idempotente, la segunda pasada no borra nada', async () => {
    const old = await groupWithReceipt('REF-IDEM');
    await closeGroup(old.group, '2026-07-01T12:00:00Z');

    expect((await retention.purgeExpiredReceipts(new Date(NOW))).deleted).toBe(1);
    expect(await retention.purgeExpiredReceipts(new Date('2026-10-17T15:00:00Z'))).toEqual({
      deleted: 0,
      failed: 0,
    });
    expect(harness.storage.deleted).toEqual([old.fileKey]);
  });

  it('CA-002-33: borra los comprobantes de todos los cobros del grupo, también los reemplazados', async () => {
    const old = await groupWithReceipt('REF-A');
    const payer = old.group.memberIds[0] as string;
    const other = await harness.insertCharge(old.group, payer, {
      period: '2026-09',
      dueAt: '2026-09-19T04:00:00.000Z',
    });
    const second = await harness.insertReceipt(other, payer, { reference: 'REF-B' });
    await setChargeStatus(other, 'cancelado');
    await harness.pool.query(`UPDATE receipts SET status = 'reemplazado' WHERE id = $1`, [
      second.id,
    ]);
    await closeGroup(old.group, '2026-06-01T12:00:00Z');

    const outcome = await retention.purgeExpiredReceipts(new Date(NOW));

    expect(outcome.deleted).toBe(2);
    expect(harness.storage.files.size).toBe(0);
    expect(await deletedAt(old.receiptId)).not.toBeNull();
    expect(await deletedAt(second.id)).not.toBeNull();
  });

  it('CA-002-33: si el almacén falla no se marca la fecha, la tarea queda en error y el siguiente tick reintenta', async () => {
    const failing = await groupWithReceipt('REF-FALLA');
    const healthy = await groupWithReceipt('REF-SANA');
    await closeGroup(failing.group, '2026-06-01T12:00:00Z');
    await closeGroup(healthy.group, '2026-06-02T12:00:00Z');
    const errorLog = jest.spyOn(Logger.prototype, 'error');
    errorLog.mockClear();
    const realDelete = harness.storage.delete.bind(harness.storage);
    const spy = jest
      .spyOn(harness.storage, 'delete')
      .mockImplementation((key: string) =>
        key === failing.fileKey
          ? Promise.reject(new StorageError(`falla simulada de ${key}`))
          : realDelete(key),
      );

    try {
      const first = await runner.runAll('manual', {
        job: 'billing.retention',
        ignoreInterval: true,
      });
      expect(first).toEqual([
        expect.objectContaining({ job: 'billing.retention', status: 'error' }),
      ]);
      expect(await deletedAt(failing.receiptId)).toBeNull();
      expect(harness.storage.files.has(failing.fileKey)).toBe(true);
      // El resto sí se procesó.
      expect(await deletedAt(healthy.receiptId)).not.toBeNull();
      // Ni la clave del archivo ni el mensaje del almacén llegan al log.
      const logged = JSON.stringify(errorLog.mock.calls);
      expect(logged).not.toContain(failing.fileKey);
      expect(logged).not.toContain('falla simulada');
    } finally {
      spy.mockRestore();
    }

    const second = await runner.runAll('manual', {
      job: 'billing.retention',
      ignoreInterval: true,
    });
    expect(second).toEqual([
      expect.objectContaining({ job: 'billing.retention', status: 'ok', processed: 1 }),
    ]);
    expect(await deletedAt(failing.receiptId)).not.toBeNull();
    expect(harness.storage.files.has(failing.fileKey)).toBe(false);
  });

  it('CA-002-33: un archivo que ya no existe en el almacén igual se marca como borrado', async () => {
    const old = await groupWithReceipt('REF-HUERFANA');
    await closeGroup(old.group, '2026-06-01T12:00:00Z');
    harness.storage.files.delete(old.fileKey);

    const outcome = await retention.purgeExpiredReceipts(new Date(NOW));

    expect(outcome).toEqual({ deleted: 1, failed: 0 });
    expect(await deletedAt(old.receiptId)).not.toBeNull();
  });
});
