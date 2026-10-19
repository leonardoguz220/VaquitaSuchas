import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';

export type ReceiptStatus = 'vigente' | 'reemplazado' | 'rechazado' | 'confirmado';
export type ReceiptMime = 'image/jpeg' | 'image/png' | 'application/pdf';
export type PaymentMethod = 'qr' | 'transferencia';

export interface ReceiptRecord {
  id: string;
  chargeId: string;
  uploadedBy: string;
  uploadedAt: Date;
  fileKey: string;
  mime: ReceiptMime;
  sizeBytes: number;
  method: PaymentMethod;
  reference: string;
  status: ReceiptStatus;
  fileDeletedAt: Date | null;
}

export interface NewReceipt {
  chargeId: string;
  uploadedBy: string;
  fileKey: string;
  mime: ReceiptMime;
  sizeBytes: number;
  method: PaymentMethod;
  reference: string;
}

interface ReceiptRow {
  id: string;
  charge_id: string;
  uploaded_by: string;
  uploaded_at: Date;
  file_key: string;
  mime: ReceiptMime;
  size_bytes: number;
  method: PaymentMethod;
  reference: string;
  status: ReceiptStatus;
  file_deleted_at: Date | null;
}

const COLUMNS = `id, charge_id, uploaded_by, uploaded_at, file_key, mime, size_bytes, method,
  reference, status, file_deleted_at`;

const toRecord = (row: ReceiptRow): ReceiptRecord => ({
  id: row.id,
  chargeId: row.charge_id,
  uploadedBy: row.uploaded_by,
  uploadedAt: row.uploaded_at,
  fileKey: row.file_key,
  mime: row.mime,
  sizeBytes: row.size_bytes,
  method: row.method,
  reference: row.reference,
  status: row.status,
  fileDeletedAt: row.file_deleted_at,
});

/** Único lugar con SQL sobre `receipts` (0042_receipts.sql); el archivo vive en `FileStorage`. */
@Injectable()
export class ReceiptsRepository {
  /**
   * Inserta un comprobante `vigente`. Falla (índice único parcial) si el cobro ya tiene otro
   * vigente: el servicio debe marcarlo `reemplazado` antes (RF-002-08).
   */
  async insert(q: Queryable, input: NewReceipt): Promise<ReceiptRecord> {
    const result = await q.query<ReceiptRow>(
      `INSERT INTO receipts (charge_id, uploaded_by, file_key, mime, size_bytes, method, reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [
        input.chargeId,
        input.uploadedBy,
        input.fileKey,
        input.mime,
        input.sizeBytes,
        input.method,
        input.reference,
      ],
    );
    return toRecord(result.rows[0] as ReceiptRow);
  }

  async findById(q: Queryable, id: string): Promise<ReceiptRecord | null> {
    const result = await q.query<ReceiptRow>(`SELECT ${COLUMNS} FROM receipts WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /** Comprobante vigente del cobro, si hay. */
  async findActiveByCharge(q: Queryable, chargeId: string): Promise<ReceiptRecord | null> {
    const result = await q.query<ReceiptRow>(
      `SELECT ${COLUMNS} FROM receipts WHERE charge_id = $1 AND status = 'vigente'`,
      [chargeId],
    );
    const row = result.rows[0];
    return row ? toRecord(row) : null;
  }

  /** Todos los comprobantes del cobro, el más reciente primero. */
  async listByCharge(q: Queryable, chargeId: string): Promise<ReceiptRecord[]> {
    const result = await q.query<ReceiptRow>(
      `SELECT ${COLUMNS} FROM receipts WHERE charge_id = $1 ORDER BY uploaded_at DESC, id`,
      [chargeId],
    );
    return result.rows.map(toRecord);
  }

  /** Cambia el estado de un comprobante; solo cambia `status` (el archivo es inmutable). */
  async setStatus(q: Queryable, id: string, status: ReceiptStatus): Promise<boolean> {
    const result = await q.query(`UPDATE receipts SET status = $2 WHERE id = $1`, [id, status]);
    return (result.rowCount ?? 0) > 0;
  }

  /** Marca el archivo como borrado del almacén (retención, RN-002-06); la fila se conserva. */
  async markFileDeleted(q: Queryable, id: string, now: Date): Promise<boolean> {
    const result = await q.query(
      `UPDATE receipts SET file_deleted_at = $2 WHERE id = $1 AND file_deleted_at IS NULL`,
      [id, now],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
