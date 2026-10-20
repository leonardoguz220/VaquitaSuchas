/**
 * Datos simulados del catálogo de administración (spec 009, RF-009-04 a RF-009-07). El estado vive
 * en memoria para que cada cambio se vea en la pantalla. Las validaciones (slug único, cupos de 2 a
 * 20, montos positivos) imitan lo que respondería el servidor. Nombres y precios inventados.
 */
import type {
  AdminCatalogPlan,
  AdminCatalogService,
  CatalogImportApplied,
  CatalogImportFormat,
  CatalogImportPreview,
  PlanInput,
  PlanSaveResult,
  ServiceInput,
} from './admin-catalog';
import {
  CATALOG_EDIT_WARNING,
  CATALOG_MAX_SLOTS,
  CATALOG_MIN_SLOTS,
} from './admin-catalog.constants';
import { ApiError } from './http';

const LATENCY_MS = 350;

/** Copia profunda de datos simples (el mock no usa structuredClone para correr también en jsdom). */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function delay<T>(value: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(value());
      } catch (error) {
        reject(error);
      }
    }, LATENCY_MS);
  });
}

function seedCatalog(): AdminCatalogService[] {
  return [
    {
      id: 'svc-netflix',
      slug: 'netflix',
      name: 'Netflix',
      category: 'video',
      active: true,
      plans: [
        {
          id: 'plan-netflix-estandar',
          serviceId: 'svc-netflix',
          slug: 'netflix-estandar',
          name: 'Estándar',
          priceCents: 1466,
          currency: 'USD',
          maxSlots: 4,
          individualPriceCents: 1466,
          verifiedOn: '2026-10-01',
          active: true,
        },
        {
          id: 'plan-netflix-premium',
          serviceId: 'svc-netflix',
          slug: 'netflix-premium',
          name: 'Premium',
          priceCents: 2299,
          currency: 'USD',
          maxSlots: 4,
          individualPriceCents: 2299,
          verifiedOn: null,
          active: true,
        },
      ],
    },
    {
      id: 'svc-spotify',
      slug: 'spotify',
      name: 'Spotify',
      category: 'musica',
      active: true,
      plans: [
        {
          id: 'plan-spotify-familiar',
          serviceId: 'svc-spotify',
          slug: 'spotify-familiar',
          name: 'Familiar',
          priceCents: 1707,
          currency: 'USD',
          maxSlots: 6,
          individualPriceCents: null,
          verifiedOn: '2026-09-15',
          active: true,
        },
      ],
    },
    {
      id: 'svc-max',
      slug: 'max',
      name: 'Max',
      category: 'video',
      active: true,
      plans: [
        {
          id: 'plan-max-estandar',
          serviceId: 'svc-max',
          slug: 'max-estandar',
          name: 'Estándar',
          priceCents: 8400,
          currency: 'BS',
          maxSlots: 4,
          individualPriceCents: null,
          verifiedOn: '2026-10-05',
          active: true,
        },
      ],
    },
    {
      id: 'svc-prime',
      slug: 'prime-video',
      name: 'Prime Video',
      category: 'video',
      active: true,
      plans: [
        {
          id: 'plan-prime-anuncios',
          serviceId: 'svc-prime',
          slug: 'prime-video-anuncios',
          name: 'Con anuncios',
          priceCents: 899,
          currency: 'USD',
          maxSlots: 3,
          individualPriceCents: null,
          verifiedOn: '2026-08-20',
          active: false,
        },
      ],
    },
  ];
}

let services: AdminCatalogService[] = seedCatalog();

/** Vuelve a los datos iniciales (pruebas). */
export function resetCatalogMock() {
  services = seedCatalog();
}

const allSlugs = (exceptId?: string): string[] => {
  const slugs: string[] = [];
  for (const service of services) {
    if (service.id !== exceptId) slugs.push(service.slug);
    for (const plan of service.plans) {
      if (plan.id !== exceptId) slugs.push(plan.slug);
    }
  }
  return slugs;
};

function assertSlugFree(slug: string, exceptId?: string) {
  if (allSlugs(exceptId).includes(slug)) {
    throw new ApiError(409, 'CONFLICT', 'Ya existe un servicio o plan con ese slug.');
  }
}

function assertServiceInput(input: ServiceInput) {
  if (!input.name.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'Escribe el nombre.');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.slug)) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'El slug solo puede tener letras, números y guiones.',
    );
  }
}

function assertPlanInput(input: PlanInput) {
  if (!input.name.trim())
    throw new ApiError(400, 'VALIDATION_ERROR', 'Escribe el nombre del plan.');
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'El precio debe ser mayor que cero.');
  }
  if (
    input.individualPriceCents !== null &&
    (!Number.isInteger(input.individualPriceCents) || input.individualPriceCents <= 0)
  ) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'El precio individual debe ser mayor que cero.');
  }
  if (
    !Number.isInteger(input.maxSlots) ||
    input.maxSlots < CATALOG_MIN_SLOTS ||
    input.maxSlots > CATALOG_MAX_SLOTS
  ) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `Los cupos van de ${CATALOG_MIN_SLOTS} a ${CATALOG_MAX_SLOTS}.`,
    );
  }
}

const findService = (id: string): AdminCatalogService => {
  const found = services.find((item) => item.id === id);
  if (!found) throw new ApiError(404, 'NOT_FOUND', 'Servicio no encontrado.');
  return found;
};

const findPlan = (id: string): { service: AdminCatalogService; plan: AdminCatalogPlan } => {
  for (const service of services) {
    const plan = service.plans.find((item) => item.id === id);
    if (plan) return { service, plan };
  }
  throw new ApiError(404, 'NOT_FOUND', 'Plan no encontrado.');
};

export function listCatalog(): Promise<AdminCatalogService[]> {
  return delay(() => clone(services));
}

export function createService(input: ServiceInput): Promise<AdminCatalogService> {
  return delay(() => {
    assertServiceInput(input);
    assertSlugFree(input.slug);
    const created: AdminCatalogService = {
      id: `svc-${input.slug}`,
      slug: input.slug,
      name: input.name.trim(),
      category: input.category,
      active: true,
      plans: [],
    };
    services.push(created);
    return clone(created);
  });
}

export function updateService(id: string, input: ServiceInput): Promise<AdminCatalogService> {
  return delay(() => {
    assertServiceInput(input);
    const service = findService(id);
    assertSlugFree(input.slug, id);
    service.name = input.name.trim();
    service.slug = input.slug;
    service.category = input.category;
    return clone(service);
  });
}

export function setServiceActive(id: string, active: boolean): Promise<AdminCatalogService> {
  return delay(() => {
    const service = findService(id);
    service.active = active;
    return clone(service);
  });
}

export function createPlan(serviceId: string, input: PlanInput): Promise<PlanSaveResult> {
  return delay(() => {
    assertPlanInput(input);
    const service = findService(serviceId);
    assertSlugFree(input.slug);
    const plan: AdminCatalogPlan = {
      id: `plan-${input.slug}`,
      serviceId,
      slug: input.slug,
      name: input.name.trim(),
      priceCents: input.priceCents,
      currency: input.currency,
      maxSlots: input.maxSlots,
      individualPriceCents: input.individualPriceCents,
      verifiedOn: null,
      active: true,
    };
    service.plans.push(plan);
    return { plan: clone(plan), warning: null };
  });
}

export function updatePlan(id: string, input: PlanInput): Promise<PlanSaveResult> {
  return delay(() => {
    assertPlanInput(input);
    const { plan } = findPlan(id);
    assertSlugFree(input.slug, id);
    // El aviso solo aparece si cambian precio o cupos (RF-009-05).
    const touchesPriceOrSlots =
      plan.priceCents !== input.priceCents ||
      plan.maxSlots !== input.maxSlots ||
      plan.currency !== input.currency;
    Object.assign(plan, {
      name: input.name.trim(),
      slug: input.slug,
      priceCents: input.priceCents,
      currency: input.currency,
      maxSlots: input.maxSlots,
      individualPriceCents: input.individualPriceCents,
    });
    return {
      plan: clone(plan),
      warning: touchesPriceOrSlots ? CATALOG_EDIT_WARNING : null,
    };
  });
}

export function setPlanActive(id: string, active: boolean): Promise<AdminCatalogPlan> {
  return delay(() => {
    const { plan } = findPlan(id);
    plan.active = active;
    return clone(plan);
  });
}

const DEMO_TOKEN = 'token-demo-catalogo';

/** Vista previa simulada: un archivo con la palabra «invalida» trae un error por fila (CA-009-06). */
export function previewImport(
  format: CatalogImportFormat,
  content: string,
): Promise<CatalogImportPreview> {
  return delay(() => {
    if (content.includes('invalida')) {
      return {
        token: null,
        changes: [{ row: 1, kind: 'plan' as const, slug: 'hbo-basico', action: 'crear' as const }],
        errors: [{ row: 1, field: 'priceCents', message: 'El precio debe ser un monto positivo.' }],
      };
    }
    return {
      token: DEMO_TOKEN,
      changes: [{ row: 1, kind: 'servicio' as const, slug: 'hbo', action: 'crear' as const }],
      errors: [],
    };
  });
}

/** Aplicación simulada: solo acepta el token que entrega la vista previa válida. */
export function applyImport(token: string): Promise<CatalogImportApplied> {
  return delay(() => {
    if (token !== DEMO_TOKEN) {
      throw new ApiError(
        422,
        'IMPORT_TOKEN_INVALID',
        'La vista previa ya no es válida. Súbela de nuevo.',
      );
    }
    return { created: 1, updated: 0 };
  });
}
