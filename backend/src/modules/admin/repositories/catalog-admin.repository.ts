import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { CatalogPlanRow, CatalogServiceRow } from '../domain/catalog-validation.js';

export interface ServiceView {
  id: string;
  slug: string;
  name: string;
  category: string;
  logoUrl: string | null;
  brandColor: string | null;
  isActive: boolean;
}

export interface PlanView {
  id: string;
  serviceId: string;
  slug: string;
  name: string;
  priceCents: number;
  currency: 'USD' | 'BS';
  maxSlots: number;
  individualPriceCents: number | null;
  verifiedOn: string | null;
  verifiedSource: string | null;
  isActive: boolean;
}

interface ServiceDb {
  id: string;
  slug: string;
  name: string;
  category: string;
  logo_url: string | null;
  brand_color: string | null;
  is_active: boolean;
}

interface PlanDb {
  id: string;
  service_id: string;
  slug: string;
  name: string;
  price_cents: string;
  currency: 'USD' | 'BS';
  max_slots: number;
  individual_price_cents: string | null;
  verified_on: string | null;
  verified_source: string | null;
  is_active: boolean;
}

const SERVICE_COLUMNS = 'id, slug, name, category, logo_url, brand_color, is_active';
const PLAN_COLUMNS = `id, service_id, slug, name, price_cents, currency, max_slots,
  individual_price_cents, verified_on::text AS verified_on, verified_source, is_active`;

const toService = (r: ServiceDb): ServiceView => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  category: r.category,
  logoUrl: r.logo_url,
  brandColor: r.brand_color,
  isActive: r.is_active,
});

const toPlan = (r: PlanDb): PlanView => ({
  id: r.id,
  serviceId: r.service_id,
  slug: r.slug,
  name: r.name,
  priceCents: Number(r.price_cents),
  currency: r.currency,
  maxSlots: r.max_slots,
  individualPriceCents: r.individual_price_cents === null ? null : Number(r.individual_price_cents),
  verifiedOn: r.verified_on,
  verifiedSource: r.verified_source,
  isActive: r.is_active,
});

/** SQL de escritura del catálogo (spec 009, US5) sobre `catalog_services` y `catalog_plans` (0020). */
@Injectable()
export class CatalogAdminRepository {
  async findService(q: Queryable, id: string): Promise<ServiceView | null> {
    const result = await q.query<ServiceDb>(
      `SELECT ${SERVICE_COLUMNS} FROM catalog_services WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? toService(result.rows[0]) : null;
  }

  async findPlan(q: Queryable, id: string): Promise<PlanView | null> {
    const result = await q.query<PlanDb>(
      `SELECT ${PLAN_COLUMNS} FROM catalog_plans WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? toPlan(result.rows[0]) : null;
  }

  async serviceIdBySlug(q: Queryable, slug: string): Promise<string | null> {
    const result = await q.query<{ id: string }>(
      `SELECT id FROM catalog_services WHERE slug = $1`,
      [slug],
    );
    return result.rows[0]?.id ?? null;
  }

  /** Slugs que ya existen, para marcar «crear» o «actualizar» en la vista previa. */
  async existingSlugs(
    q: Queryable,
    kind: 'service' | 'plan',
    slugs: readonly string[],
  ): Promise<Set<string>> {
    if (slugs.length === 0) return new Set();
    const table = kind === 'service' ? 'catalog_services' : 'catalog_plans';
    const result = await q.query<{ slug: string }>(
      `SELECT slug FROM ${table} WHERE slug = ANY($1::text[])`,
      [[...slugs]],
    );
    return new Set(result.rows.map((r) => r.slug));
  }

  async insertService(q: Queryable, row: CatalogServiceRow): Promise<ServiceView> {
    const result = await q.query<ServiceDb>(
      `INSERT INTO catalog_services (slug, name, category, logo_url, brand_color)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${SERVICE_COLUMNS}`,
      [row.slug, row.name, row.category, row.logoUrl, row.brandColor],
    );
    return toService(result.rows[0] as ServiceDb);
  }

  async updateService(
    q: Queryable,
    id: string,
    row: CatalogServiceRow,
  ): Promise<ServiceView | null> {
    const result = await q.query<ServiceDb>(
      `UPDATE catalog_services SET name = $2, category = $3, logo_url = $4, brand_color = $5
        WHERE id = $1 RETURNING ${SERVICE_COLUMNS}`,
      [id, row.name, row.category, row.logoUrl, row.brandColor],
    );
    return result.rows[0] ? toService(result.rows[0]) : null;
  }

  async setServiceActive(q: Queryable, id: string, active: boolean): Promise<ServiceView | null> {
    const result = await q.query<ServiceDb>(
      `UPDATE catalog_services SET is_active = $2 WHERE id = $1 RETURNING ${SERVICE_COLUMNS}`,
      [id, active],
    );
    return result.rows[0] ? toService(result.rows[0]) : null;
  }

  async insertPlan(q: Queryable, serviceId: string, row: CatalogPlanRow): Promise<PlanView> {
    const result = await q.query<PlanDb>(
      `INSERT INTO catalog_plans (service_id, slug, name, price_cents, currency, max_slots,
                                  individual_price_cents, verified_on, verified_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${PLAN_COLUMNS}`,
      [
        serviceId,
        row.slug,
        row.name,
        row.priceCents,
        row.currency,
        row.maxSlots,
        row.individualPriceCents,
        row.verifiedOn,
        row.verifiedSource,
      ],
    );
    return toPlan(result.rows[0] as PlanDb);
  }

  async updatePlan(q: Queryable, id: string, row: CatalogPlanRow): Promise<PlanView | null> {
    const result = await q.query<PlanDb>(
      `UPDATE catalog_plans
          SET name = $2, price_cents = $3, currency = $4, max_slots = $5,
              individual_price_cents = $6, verified_on = $7, verified_source = $8
        WHERE id = $1 RETURNING ${PLAN_COLUMNS}`,
      [
        id,
        row.name,
        row.priceCents,
        row.currency,
        row.maxSlots,
        row.individualPriceCents,
        row.verifiedOn,
        row.verifiedSource,
      ],
    );
    return result.rows[0] ? toPlan(result.rows[0]) : null;
  }

  async setPlanActive(q: Queryable, id: string, active: boolean): Promise<PlanView | null> {
    const result = await q.query<PlanDb>(
      `UPDATE catalog_plans SET is_active = $2 WHERE id = $1 RETURNING ${PLAN_COLUMNS}`,
      [id, active],
    );
    return result.rows[0] ? toPlan(result.rows[0]) : null;
  }

  /** Importación: crea o actualiza por `slug` (el servicio de un plan no cambia al actualizar). */
  async upsertService(q: Queryable, row: CatalogServiceRow): Promise<'created' | 'updated'> {
    const result = await q.query<{ created: boolean }>(
      `INSERT INTO catalog_services (slug, name, category, logo_url, brand_color)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name, category = EXCLUDED.category,
             logo_url = EXCLUDED.logo_url, brand_color = EXCLUDED.brand_color
       RETURNING (xmax = 0) AS created`,
      [row.slug, row.name, row.category, row.logoUrl, row.brandColor],
    );
    return result.rows[0]?.created ? 'created' : 'updated';
  }

  async upsertPlan(
    q: Queryable,
    serviceId: string,
    row: CatalogPlanRow,
  ): Promise<'created' | 'updated'> {
    const result = await q.query<{ created: boolean }>(
      `INSERT INTO catalog_plans (service_id, slug, name, price_cents, currency, max_slots,
                                  individual_price_cents, verified_on, verified_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name, price_cents = EXCLUDED.price_cents,
             currency = EXCLUDED.currency, max_slots = EXCLUDED.max_slots,
             individual_price_cents = EXCLUDED.individual_price_cents,
             verified_on = EXCLUDED.verified_on, verified_source = EXCLUDED.verified_source
       RETURNING (xmax = 0) AS created`,
      [
        serviceId,
        row.slug,
        row.name,
        row.priceCents,
        row.currency,
        row.maxSlots,
        row.individualPriceCents,
        row.verifiedOn,
        row.verifiedSource,
      ],
    );
    return result.rows[0]?.created ? 'created' : 'updated';
  }
}
