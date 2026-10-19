import { Injectable } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { decodeServiceCursor, encodeServiceCursor } from '../domain/catalog-cursor.js';
import { CATEGORIES, categoryLabel, type Category } from '../domain/categories.js';
import {
  CatalogRepository,
  type ListedServiceRow,
  type PlanRow,
  type ServiceRow,
} from '../repositories/catalog.repository.js';

export type CatalogCurrency = 'USD' | 'BS';

/** `CatalogService` de `contracts/api.md` (spec 004). */
export interface CatalogServiceView {
  id: string;
  slug: string;
  name: string;
  category: Category;
  categoryLabel: string;
  logoUrl: string | null;
  brandColor: string | null;
  fromPriceCents?: number;
  fromCurrency?: CatalogCurrency;
  plansCount?: number;
}

export interface CatalogPlanView {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  currency: CatalogCurrency;
  maxSlots: number;
  individualPriceCents: number | null;
  verifiedOn: string | null;
}

/**
 * Plan activo con su servicio, con todo lo que la spec 001 copia al crear un grupo (RF-004-08):
 * nombre del servicio y del plan, logo, color, cupos máximos y precio individual con su moneda.
 */
export interface ActiveSubscriptionPlan {
  plan: CatalogPlanView & { individualPriceCurrency: CatalogCurrency | null };
  service: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    brandColor: string | null;
  };
}

export interface CatalogPage {
  items: CatalogServiceView[];
  nextCursor: string | null;
}

export const DEFAULT_CATALOG_PAGE_SIZE = 20;
export const MAX_CATALOG_PAGE_SIZE = 50;

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);

function toServiceView(row: ServiceRow): CatalogServiceView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    categoryLabel: categoryLabel(row.category),
    logoUrl: row.logo_url,
    brandColor: row.brand_color,
  };
}

function toPlanView(row: PlanRow): CatalogPlanView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    priceCents: Number(row.price_cents),
    currency: row.currency,
    maxSlots: row.max_slots,
    individualPriceCents:
      row.individual_price_cents === null ? null : Number(row.individual_price_cents),
    verifiedOn: row.verified_on,
  };
}

function toListedView(row: ListedServiceRow): CatalogServiceView {
  return {
    ...toServiceView(row),
    fromPriceCents: Number(row.from_price_cents),
    fromCurrency: row.from_currency,
    plansCount: row.plans_count,
  };
}

/** Lectura del catálogo (spec 004). Las escrituras son de la spec 009. */
@Injectable()
export class CatalogService {
  constructor(
    private readonly db: DbService,
    private readonly catalog: CatalogRepository,
  ) {}

  /** Detalle con planes activos por precio (CA-004-04); 404 si no existe, está inactivo o sin planes activos. */
  async getService(
    slug: string,
  ): Promise<{ service: CatalogServiceView; plans: CatalogPlanView[] }> {
    const service = await this.catalog.findServiceBySlug(this.db, slug);
    if (!service?.is_active) throw notFound();
    const plans = await this.catalog.listActivePlans(this.db, service.id);
    if (plans.length === 0) throw notFound();
    return { service: toServiceView(service), plans: plans.map(toPlanView) };
  }

  /**
   * Plan con su servicio para validar y copiar al crear un grupo (spec 001). `null` si el plan no
   * existe o si el plan o el servicio están inactivos (CA-004-08).
   */
  async getActivePlanForSubscription(planSlug: string): Promise<ActiveSubscriptionPlan | null> {
    const row = await this.catalog.findPlanWithService(this.db, planSlug);
    if (!row?.is_active || !row.service_is_active) return null;
    const plan = toPlanView(row);
    return {
      plan: {
        ...plan,
        individualPriceCurrency: plan.individualPriceCents === null ? null : plan.currency,
      },
      service: {
        id: row.service_id,
        slug: row.service_slug,
        name: row.service_name,
        logoUrl: row.service_logo_url,
        brandColor: row.service_brand_color,
      },
    };
  }

  /** Servicios ofrecidos, alfabéticos, con paginación por cursor (CA-004-01). Un cursor inválido lanza 400. */
  async listServices(options: {
    category?: Category | null;
    limit?: number;
    cursor?: string | null;
  }): Promise<CatalogPage> {
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_CATALOG_PAGE_SIZE, 1),
      MAX_CATALOG_PAGE_SIZE,
    );
    const cursor = options.cursor ? decodeServiceCursor(options.cursor) : null;
    if (options.cursor && !cursor) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
        fields: { cursor: ['INVALID_CURSOR'] },
      });
    }
    const rows = await this.catalog.listServices(this.db, {
      category: options.category ?? null,
      limit: limit + 1,
      cursor,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toListedView),
      nextCursor:
        rows.length > limit && last ? encodeServiceCursor({ name: last.name, id: last.id }) : null,
    };
  }

  /** Las seis categorías con cuántos servicios ofrecidos tiene cada una (RF-004-03). */
  async listCategories(): Promise<{
    items: { value: Category; label: string; servicesCount: number }[];
  }> {
    const counts = await this.catalog.countServicesByCategory(this.db);
    return {
      items: CATEGORIES.map((c) => ({
        value: c.value,
        label: c.label,
        servicesCount: counts.get(c.value) ?? 0,
      })),
    };
  }
}
