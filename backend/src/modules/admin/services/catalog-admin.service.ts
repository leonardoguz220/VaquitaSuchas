import { Inject, Injectable } from '@nestjs/common';
import { DbService } from '../../../shared/db/db.service.js';
import { DomainError } from '../../../shared/errors/domain-error.js';
import { DEFAULT_MESSAGES, ErrorCode } from '../../../shared/errors/error-codes.js';
import { AUDIT_PORT, type AuditPort } from '../../join-requests/ports/audit.port.js';
import { validatePlan, validateService, type RowError } from '../domain/catalog-validation.js';
import {
  CatalogAdminRepository,
  type PlanView,
  type ServiceView,
} from '../repositories/catalog-admin.repository.js';

export const EDIT_WARNING = 'No cambia las suscripciones existentes';

export type WithWarning<T> = T & { warning?: string };

const notFound = (): DomainError =>
  new DomainError(ErrorCode.NOT_FOUND, 404, DEFAULT_MESSAGES.NOT_FOUND);

function invalid(errors: readonly RowError[]): DomainError {
  const fields: Record<string, string[]> = {};
  for (const e of errors) (fields[e.field] ??= []).push(e.message);
  return new DomainError(ErrorCode.VALIDATION_ERROR, 400, DEFAULT_MESSAGES.VALIDATION_ERROR, {
    fields,
  });
}

/** Altas, ediciones y (des)activaciones del catálogo (spec 009, US5), todas con auditoría en la misma transacción. */
const CATALOG_LIST_LIMIT = 500;

@Injectable()
export class CatalogAdminService {
  constructor(
    private readonly db: DbService,
    private readonly catalog: CatalogAdminRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  /** `GET /admin/catalog`: todo el catálogo con planes inactivos incluidos (tope de 500 servicios). */
  list(): Promise<(ServiceView & { plans: PlanView[] })[]> {
    return this.catalog.listWithPlans(this.db, CATALOG_LIST_LIMIT);
  }

  async createService(adminId: string, body: Record<string, unknown>): Promise<ServiceView> {
    const checked = validateService(1, body);
    if ('errors' in checked) throw invalid(checked.errors);
    return this.db.withTransaction(async (tx) => {
      const saved = await this.catalog.insertService(tx, checked.value);
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'catalogo_crear',
        targetType: 'catalog_service',
        targetId: saved.id,
        metadata: { slug: saved.slug },
      });
      return saved;
    });
  }

  async updateService(
    adminId: string,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<WithWarning<ServiceView>> {
    return this.db.withTransaction(async (tx) => {
      const current = await this.catalog.findService(tx, id);
      if (!current) throw notFound();
      // El slug no se edita: es la clave pública del servicio.
      const merged = {
        name: current.name,
        category: current.category,
        logoUrl: current.logoUrl,
        brandColor: current.brandColor,
        ...patch,
        slug: current.slug,
      };
      const checked = validateService(1, merged);
      if ('errors' in checked) throw invalid(checked.errors);
      const saved = (await this.catalog.updateService(tx, id, checked.value)) as ServiceView;
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'catalogo_editar',
        targetType: 'catalog_service',
        targetId: id,
        metadata: { slug: saved.slug },
      });
      return saved;
    });
  }

  async setServiceActive(adminId: string, id: string, active: boolean): Promise<ServiceView> {
    return this.db.withTransaction(async (tx) => {
      const saved = await this.catalog.setServiceActive(tx, id, active);
      if (!saved) throw notFound();
      await this.audit.record(tx, {
        actorId: adminId,
        action: active ? 'catalogo_activar' : 'catalogo_desactivar',
        targetType: 'catalog_service',
        targetId: id,
        metadata: { slug: saved.slug },
      });
      return saved;
    });
  }

  async createPlan(adminId: string, body: Record<string, unknown>): Promise<PlanView> {
    const serviceId = typeof body['serviceId'] === 'string' ? body['serviceId'] : null;
    return this.db.withTransaction(async (tx) => {
      const service = serviceId ? await this.catalog.findService(tx, serviceId) : null;
      if (!service) {
        throw invalid([{ row: 1, field: 'serviceId', message: 'El servicio no existe.' }]);
      }
      const checked = validatePlan(1, { ...body, serviceSlug: service.slug });
      if ('errors' in checked) throw invalid(checked.errors);
      const saved = await this.catalog.insertPlan(tx, service.id, checked.value);
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'catalogo_crear',
        targetType: 'catalog_plan',
        targetId: saved.id,
        metadata: { slug: saved.slug, serviceId: service.id },
      });
      return saved;
    });
  }

  async updatePlan(
    adminId: string,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<WithWarning<PlanView>> {
    return this.db.withTransaction(async (tx) => {
      const current = await this.catalog.findPlan(tx, id);
      if (!current) throw notFound();
      const service = (await this.catalog.findService(tx, current.serviceId)) as ServiceView;
      const merged: Record<string, unknown> = {
        name: current.name,
        priceCents: current.priceCents,
        currency: current.currency,
        maxSlots: current.maxSlots,
        individualPriceCents: current.individualPriceCents,
        verifiedOn: current.verifiedOn,
        verifiedSource: current.verifiedSource,
        ...patch,
        slug: current.slug,
        serviceSlug: service.slug,
      };
      const checked = validatePlan(1, merged);
      if ('errors' in checked) throw invalid(checked.errors);
      const saved = (await this.catalog.updatePlan(tx, id, checked.value)) as PlanView;
      await this.audit.record(tx, {
        actorId: adminId,
        action: 'catalogo_editar',
        targetType: 'catalog_plan',
        targetId: id,
        metadata: { slug: saved.slug },
      });
      const touchesTerms = ['priceCents', 'currency', 'maxSlots', 'individualPriceCents'].some(
        (key) =>
          key in patch && patch[key] !== (current as unknown as Record<string, unknown>)[key],
      );
      return touchesTerms ? { ...saved, warning: EDIT_WARNING } : saved;
    });
  }

  async setPlanActive(adminId: string, id: string, active: boolean): Promise<PlanView> {
    return this.db.withTransaction(async (tx) => {
      const saved = await this.catalog.setPlanActive(tx, id, active);
      if (!saved) throw notFound();
      await this.audit.record(tx, {
        actorId: adminId,
        action: active ? 'catalogo_activar' : 'catalogo_desactivar',
        targetType: 'catalog_plan',
        targetId: id,
        metadata: { slug: saved.slug },
      });
      return saved;
    });
  }
}
