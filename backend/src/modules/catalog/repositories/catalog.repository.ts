import { Injectable } from '@nestjs/common';
import type { Queryable } from '../../../shared/db/db.service.js';
import type { Category } from '../domain/categories.js';
import type { ServiceCursor } from '../domain/catalog-cursor.js';

export interface ServiceRow {
  id: string;
  slug: string;
  name: string;
  category: Category;
  logo_url: string | null;
  brand_color: string | null;
  is_active: boolean;
}

export interface PlanRow {
  id: string;
  slug: string;
  name: string;
  price_cents: string;
  currency: 'USD' | 'BS';
  max_slots: number;
  individual_price_cents: string | null;
  verified_on: string | null;
  is_active: boolean;
}

export interface ListedServiceRow extends ServiceRow {
  from_price_cents: string;
  from_currency: 'USD' | 'BS';
  plans_count: number;
}

export interface ActivePlanRow extends PlanRow {
  service_id: string;
  service_slug: string;
  service_name: string;
  service_logo_url: string | null;
  service_brand_color: string | null;
  service_is_active: boolean;
}

const SERVICE_COLUMNS = `s.id, s.slug, s.name, s.category, s.logo_url, s.brand_color, s.is_active`;
const PLAN_COLUMNS = `p.id, p.slug, p.name, p.price_cents::text AS price_cents, p.currency, p.max_slots,
  p.individual_price_cents::text AS individual_price_cents,
  to_char(p.verified_on, 'YYYY-MM-DD') AS verified_on, p.is_active`;

/** Único lugar con SQL sobre `catalog_services` y `catalog_plans` (0020_catalog.sql). Solo lectura. */
@Injectable()
export class CatalogRepository {
  async findServiceBySlug(q: Queryable, slug: string): Promise<ServiceRow | null> {
    const result = await q.query<ServiceRow>(
      `SELECT ${SERVICE_COLUMNS} FROM catalog_services s WHERE s.slug = $1`,
      [slug],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Planes activos del servicio, del más barato al más caro (CA-004-04). Si el servicio mezcla
   * monedas se ordena por moneda y luego por precio (`data-model.md` §1, notas).
   */
  async listActivePlans(q: Queryable, serviceId: string): Promise<PlanRow[]> {
    const result = await q.query<PlanRow>(
      `SELECT ${PLAN_COLUMNS}
         FROM catalog_plans p
        WHERE p.service_id = $1 AND p.is_active
        ORDER BY p.currency, p.price_cents, p.sort_order, p.slug`,
      [serviceId],
    );
    return result.rows;
  }

  /** Plan con su servicio; `null` si el plan no existe. Los indicadores `is_active` los evalúa el servicio. */
  async findPlanWithService(q: Queryable, planSlug: string): Promise<ActivePlanRow | null> {
    const result = await q.query<ActivePlanRow>(
      `SELECT ${PLAN_COLUMNS}, s.id AS service_id, s.slug AS service_slug, s.name AS service_name,
              s.logo_url AS service_logo_url, s.brand_color AS service_brand_color,
              s.is_active AS service_is_active
         FROM catalog_plans p
         JOIN catalog_services s ON s.id = p.service_id
        WHERE p.slug = $1`,
      [planSlug],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Servicios activos con al menos un plan activo (RN-004-05), alfabéticos por `(name, id)`.
   * `likePattern` ya viene normalizado y con `%`/`_` escapados; busca en nombre y categoría.
   * El precio «desde» sale de la moneda del primer plan por `sort_order`.
   * Pide `limit + 1` filas al llamador: él decide si hay página siguiente.
   */
  async listServices(
    q: Queryable,
    options: {
      category: Category | null;
      likePattern: string | null;
      limit: number;
      cursor: ServiceCursor | null;
    },
  ): Promise<ListedServiceRow[]> {
    const result = await q.query<ListedServiceRow>(
      `SELECT ${SERVICE_COLUMNS}, cheapest.price_cents::text AS from_price_cents,
              cheapest.currency AS from_currency, cheapest.plans_count::int AS plans_count
         FROM catalog_services s
         CROSS JOIN LATERAL (
           SELECT p.price_cents, p.currency, count(*) OVER () AS plans_count
             FROM catalog_plans p
            WHERE p.service_id = s.id AND p.is_active
            ORDER BY (p.currency = (
                        SELECT f.currency FROM catalog_plans f
                         WHERE f.service_id = s.id AND f.is_active
                         ORDER BY f.sort_order, f.slug LIMIT 1)) DESC,
                     p.price_cents, p.sort_order, p.slug
            LIMIT 1
         ) cheapest
        WHERE s.is_active
          AND ($1::text IS NULL OR s.category = $1)
          AND ($2::text IS NULL OR EXISTS (
                SELECT 1 FROM catalog_service_search k
                 WHERE k.id = s.id
                   AND (k.name_key LIKE $2 ESCAPE '\\' OR k.category_key LIKE $2 ESCAPE '\\')))
          AND ($3::text IS NULL OR (s.name, s.id) > ($3::text, $4::uuid))
        ORDER BY s.name, s.id
        LIMIT $5`,
      [
        options.category,
        options.likePattern,
        options.cursor?.name ?? null,
        options.cursor?.id ?? null,
        options.limit,
      ],
    );
    return result.rows;
  }

  /** Servicios ofrecidos por categoría (solo las que tienen alguno). */
  async countServicesByCategory(q: Queryable): Promise<Map<string, number>> {
    const result = await q.query<{ category: string; total: string }>(
      `SELECT s.category, count(*) AS total
         FROM catalog_services s
        WHERE s.is_active
          AND EXISTS (SELECT 1 FROM catalog_plans p WHERE p.service_id = s.id AND p.is_active)
        GROUP BY s.category`,
    );
    return new Map(result.rows.map((row) => [row.category, Number(row.total)]));
  }
}
