import {
  createCatalogPlan,
  createCatalogService,
  listAdminCatalog,
  setCatalogPlanActive,
  updateCatalogPlan,
  CATALOG_EDIT_WARNING,
  type PlanInput,
} from './admin-catalog';
import { resetCatalogMock } from './admin-catalog.mock';
import { ApiError } from './http';

async function run<T>(promise: Promise<T>): Promise<T> {
  await jest.advanceTimersByTimeAsync(400);
  return promise;
}

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  const outcome = promise.then(
    () => null,
    (error: unknown) => error as ApiError,
  );
  await jest.advanceTimersByTimeAsync(400);
  const error = await outcome;
  if (!error) throw new Error('Se esperaba un error y llegó una respuesta.');
  return error;
}

const PLAN: PlanInput = {
  name: 'Estándar',
  slug: 'netflix-estandar-2',
  priceCents: 1466,
  currency: 'USD',
  maxSlots: 4,
  individualPriceCents: null,
};

describe('services/admin-catalog.ts (spec 009 T029)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetCatalogMock();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('CA-009-02: crear un servicio y un plan válidos los deja en el catálogo', async () => {
    const service = await run(
      createCatalogService({ name: 'Canva', slug: 'canva', category: 'otras' }),
    );
    await run(createCatalogPlan(service.id, { ...PLAN, slug: 'canva-pro', name: 'Pro' }));

    const catalog = await run(listAdminCatalog());
    const canva = catalog.find((item) => item.slug === 'canva');
    expect(canva?.plans.map((plan) => plan.slug)).toEqual(['canva-pro']);
  });

  it('CA-009-03: un slug repetido se rechaza con 409 y no crea nada', async () => {
    const error = await failureOf(
      createCatalogService({ name: 'Otro Netflix', slug: 'netflix', category: 'video' }),
    );
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');

    const catalog = await run(listAdminCatalog());
    expect(catalog.filter((item) => item.slug === 'netflix')).toHaveLength(1);
  });

  it('RF-009-07: los cupos deben estar entre 2 y 20', async () => {
    const service = await run(
      createCatalogService({ name: 'Canva', slug: 'canva-2', category: 'otras' }),
    );
    const error = await failureOf(
      createCatalogPlan(service.id, { ...PLAN, slug: 'canva-cupos', maxSlots: 21 }),
    );
    expect(error.statusCode).toBe(400);
  });

  it('CA-009-04: cambiar el precio de un plan devuelve el aviso de que no cambia las suscripciones', async () => {
    const result = await run(
      updateCatalogPlan('plan-netflix-estandar', {
        ...PLAN,
        slug: 'netflix-estandar',
        priceCents: 1599,
      }),
    );
    expect(result.warning).toBe(CATALOG_EDIT_WARNING);
    expect(result.plan.priceCents).toBe(1599);
  });

  it('CA-009-04: editar solo el nombre no muestra el aviso', async () => {
    const result = await run(
      updateCatalogPlan('plan-netflix-estandar', {
        ...PLAN,
        slug: 'netflix-estandar',
        priceCents: 1466,
        name: 'Estándar HD',
      }),
    );
    expect(result.warning).toBeNull();
  });

  it('CA-009-05: un plan desactivado queda inactivo en el catálogo', async () => {
    const plan = await run(setCatalogPlanActive('plan-netflix-premium', false));
    expect(plan.active).toBe(false);
  });

  it('RF-009-07: un monto no positivo se rechaza', async () => {
    const error = await failureOf(
      createCatalogPlan('svc-netflix', { ...PLAN, slug: 'netflix-gratis', priceCents: 0 }),
    );
    expect(error.statusCode).toBe(400);
  });
});
