import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.js';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { AUDIT_PORT, type AuditPort } from '../../join-requests/ports/audit.port.js';
import {
  validateCatalogRows,
  type CatalogPlanRow,
  type CatalogRow,
  type CatalogServiceRow,
  type RawCatalogRow,
  type RowError,
} from '../domain/catalog-validation.js';
import { csvToCatalogRows } from '../domain/csv-parse.js';
import { CatalogAdminRepository } from '../repositories/catalog-admin.repository.js';

export const IMPORT_TOKEN_TTL_MS = 15 * 60 * 1000;
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_CHARS = 500_000;

export interface ImportChange {
  row: number;
  kind: 'servicio' | 'plan';
  slug: string;
  action: 'crear' | 'actualizar';
}

export interface ImportPreview {
  token: string | null;
  changes: ImportChange[];
  errors: RowError[];
}

interface PendingImport {
  adminId: string;
  rows: CatalogRow[];
  expiresAt: number;
}

const bad = (field: string, message: string): DomainError =>
  new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
    fields: { [field]: [message] },
  });

/** Filas de un JSON `{ services: [...], plans: [...] }` o de un arreglo con `type` por fila. */
function jsonToRows(content: string): RawCatalogRow[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw bad('content', 'El JSON no es válido.');
  }
  const asRows = (
    items: unknown,
    kind?: string,
  ): { kind?: unknown; fields: Record<string, unknown> }[] => {
    if (!Array.isArray(items)) throw bad('content', 'Se esperaba una lista.');
    return items.map((item) => {
      const fields =
        item && typeof item === 'object' ? { ...(item as Record<string, unknown>) } : {};
      const itemKind = kind ?? fields['type'];
      delete fields['type'];
      return { kind: itemKind, fields };
    });
  };
  const list =
    data && typeof data === 'object' && !Array.isArray(data)
      ? [
          ...asRows((data as Record<string, unknown>)['services'] ?? [], 'service'),
          ...asRows((data as Record<string, unknown>)['plans'] ?? [], 'plan'),
        ]
      : asRows(data);
  return list.map((item, index) => ({ row: index + 1, ...item }));
}

/**
 * Importación del catálogo en dos pasos (RF-009-06, CA-009-06): la vista previa valida todo y
 * entrega un token de 15 minutos (en memoria, ligado a quien lo pidió); aplicar escribe todo o nada.
 */
@Injectable()
export class CatalogImportService {
  private readonly pending = new Map<string, PendingImport>();

  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly catalog: CatalogAdminRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  private sweep(now: number): void {
    for (const [token, entry] of this.pending)
      if (entry.expiresAt <= now) this.pending.delete(token);
  }

  async preview(adminId: string, format: 'csv' | 'json', content: string): Promise<ImportPreview> {
    if (content.length > MAX_IMPORT_CHARS) throw bad('content', 'El archivo es demasiado grande.');
    const raw = format === 'csv' ? csvToCatalogRows(content) : jsonToRows(content);
    if (raw.length === 0) throw bad('content', 'El archivo no tiene filas.');
    if (raw.length > MAX_IMPORT_ROWS)
      throw bad('content', `Máximo ${MAX_IMPORT_ROWS} filas por importación.`);
    const { rows, errors } = validateCatalogRows(raw);

    const services = rows.filter((r): r is CatalogServiceRow => r.kind === 'service');
    const plans = rows.filter((r): r is CatalogPlanRow => r.kind === 'plan');
    const fileServiceSlugs = new Set(services.map((s) => s.slug));
    const existingServices = await this.catalog.existingSlugs(this.db, 'service', [
      ...new Set([...services.map((s) => s.slug), ...plans.map((p) => p.serviceSlug)]),
    ]);
    const existingPlans = await this.catalog.existingSlugs(
      this.db,
      'plan',
      plans.map((p) => p.slug),
    );
    for (const plan of plans) {
      if (!fileServiceSlugs.has(plan.serviceSlug) && !existingServices.has(plan.serviceSlug)) {
        errors.push({
          row: plan.row,
          field: 'serviceSlug',
          message: 'El servicio del plan no existe.',
        });
      }
    }
    errors.sort((a, b) => a.row - b.row);

    const changes: ImportChange[] = [
      ...services.map((s) => ({
        row: s.row,
        kind: 'servicio' as const,
        slug: s.slug,
        action: existingServices.has(s.slug) ? ('actualizar' as const) : ('crear' as const),
      })),
      ...plans.map((p) => ({
        row: p.row,
        kind: 'plan' as const,
        slug: p.slug,
        action: existingPlans.has(p.slug) ? ('actualizar' as const) : ('crear' as const),
      })),
    ].sort((a, b) => a.row - b.row);

    if (errors.length > 0) return { token: null, changes, errors };
    const now = this.clock.now().getTime();
    this.sweep(now);
    const token = randomUUID();
    this.pending.set(token, { adminId, rows, expiresAt: now + IMPORT_TOKEN_TTL_MS });
    return { token, changes, errors };
  }

  /** Aplica todo o nada; el token es de un solo uso y solo lo canjea quien hizo la vista previa. */
  async apply(adminId: string, token: string): Promise<{ created: number; updated: number }> {
    const now = this.clock.now().getTime();
    this.sweep(now);
    const entry = this.pending.get(token);
    if (!entry || entry.adminId !== adminId) {
      throw new DomainError(
        'IMPORT_TOKEN_INVALID',
        422,
        'La vista previa venció o no existe. Vuelve a cargar el archivo.',
      );
    }
    this.pending.delete(token);
    const counts = { created: 0, updated: 0 };
    await this.db.withTransaction(async (tx) => {
      for (const row of entry.rows) {
        if (row.kind !== 'service') continue;
        counts[(await this.catalog.upsertService(tx, row)) === 'created' ? 'created' : 'updated'] +=
          1;
      }
      for (const row of entry.rows) {
        if (row.kind !== 'plan') continue;
        const serviceId = await this.catalog.serviceIdBySlug(tx, row.serviceSlug);
        if (!serviceId) throw bad('serviceSlug', 'El servicio del plan no existe.');
        counts[
          (await this.catalog.upsertPlan(tx, serviceId, row)) === 'created' ? 'created' : 'updated'
        ] += 1;
      }
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'catalogo_importar',
        targetType: 'catalog_service',
        targetId: randomUUID(),
        metadata: { ...counts, rows: entry.rows.length },
      });
    });
    return counts;
  }
}
