import {
  applyCatalogImport,
  createCatalogPlan,
  createCatalogService,
  listAdminCatalog,
  previewCatalogImport,
  setCatalogPlanActive,
  updateCatalogPlan,
  type PlanInput,
} from './admin-catalog';
import { apiRequest } from './http';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);

const SERVICE_ID = '6b1d3f0e-0000-4000-8000-0000000000s1';
const PLAN_ID = '6b1d3f0e-0000-4000-8000-0000000000p1';

const PLAN_INPUT: PlanInput = {
  name: 'Estándar',
  slug: 'netflix-estandar',
  priceCents: 1466,
  currency: 'USD',
  maxSlots: 4,
  individualPriceCents: null,
};

/** Plan con la forma que devuelve el backend (`PlanView`). */
function apiPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    serviceId: SERVICE_ID,
    slug: 'netflix-estandar',
    name: 'Estándar',
    priceCents: 1466,
    currency: 'USD',
    maxSlots: 4,
    individualPriceCents: null,
    verifiedOn: null,
    verifiedSource: null,
    isActive: true,
    ...overrides,
  };
}

function lastCall() {
  const call = mockedRequest.mock.calls.at(-1);
  if (!call) throw new Error('apiRequest no se llamó');
  return { path: call[0], options: call[1] ?? {} };
}

describe('services/admin-catalog.ts conectado al backend (spec 009 T029)', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
  });

  it('CA-009-02: GET /admin/catalog trae servicios con planes activos e inactivos y los expone como `active`', async () => {
    mockedRequest.mockResolvedValueOnce([
      {
        id: SERVICE_ID,
        slug: 'netflix',
        name: 'Netflix',
        category: 'video',
        logoUrl: null,
        brandColor: null,
        isActive: false,
        plans: [apiPlan(), apiPlan({ id: 'otro', isActive: false })],
      },
    ]);

    const services = await listAdminCatalog();

    expect(lastCall().path).toBe('/api/admin/catalog');
    expect(services[0]).toMatchObject({ slug: 'netflix', active: false });
    expect(services[0]!.plans.map((plan) => plan.active)).toEqual([true, false]);
    expect(services[0]!.plans[0]).not.toHaveProperty('isActive');
  });

  it('CA-009-02: crear un servicio hace POST a /services con el cuerpo tal cual', async () => {
    mockedRequest.mockResolvedValueOnce({
      id: SERVICE_ID,
      slug: 'hbo',
      name: 'HBO',
      category: 'video',
      logoUrl: null,
      brandColor: null,
      isActive: true,
    });

    const service = await createCatalogService({ name: 'HBO', slug: 'hbo', category: 'video' });

    expect(lastCall().path).toBe('/api/admin/catalog/services');
    expect(lastCall().options).toMatchObject({
      method: 'POST',
      body: { name: 'HBO', slug: 'hbo', category: 'video' },
    });
    expect(service).toMatchObject({ id: SERVICE_ID, active: true, plans: [] });
  });

  it('CA-009-02: crear un plan envía el servicio en el cuerpo, no en la ruta', async () => {
    mockedRequest.mockResolvedValueOnce(apiPlan());

    const saved = await createCatalogPlan(SERVICE_ID, PLAN_INPUT);

    expect(lastCall().path).toBe('/api/admin/catalog/plans');
    expect(lastCall().options).toMatchObject({
      method: 'POST',
      body: { serviceId: SERVICE_ID, ...PLAN_INPUT },
    });
    expect(saved).toEqual({
      plan: expect.objectContaining({ id: PLAN_ID, active: true }),
      warning: null,
    });
  });

  it('CA-009-03: un slug repetido llega como error de la API y no se guarda nada', async () => {
    const conflict = new Error('CONFLICT');
    mockedRequest.mockRejectedValueOnce(conflict);

    await expect(
      createCatalogService({ name: 'Netflix', slug: 'netflix', category: 'video' }),
    ).rejects.toBe(conflict);
  });

  it('CA-009-04: editar precio devuelve el aviso de la API; sin cambios de precio no hay aviso', async () => {
    mockedRequest.mockResolvedValueOnce(
      apiPlan({ priceCents: 1800, warning: 'No cambia las suscripciones existentes' }),
    );
    const withWarning = await updateCatalogPlan(PLAN_ID, { ...PLAN_INPUT, priceCents: 1800 });
    expect(lastCall().options).toMatchObject({ method: 'PATCH' });
    expect(withWarning.warning).toBe('No cambia las suscripciones existentes');
    expect(withWarning.plan).not.toHaveProperty('warning');

    mockedRequest.mockResolvedValueOnce(apiPlan());
    const withoutWarning = await updateCatalogPlan(PLAN_ID, PLAN_INPUT);
    expect(withoutWarning.warning).toBeNull();
  });

  it('CA-009-05: desactivar un plan hace POST a /plans/:id/deactivate', async () => {
    mockedRequest.mockResolvedValueOnce(apiPlan({ isActive: false }));

    const plan = await setCatalogPlanActive(PLAN_ID, false);

    expect(lastCall().path).toBe(`/api/admin/catalog/plans/${PLAN_ID}/deactivate`);
    expect(lastCall().options).toMatchObject({ method: 'POST' });
    expect(plan.active).toBe(false);
  });

  it('CA-009-06: la vista previa envía el archivo y devuelve errores por fila sin token', async () => {
    mockedRequest.mockResolvedValueOnce({
      token: null,
      changes: [],
      errors: [{ row: 3, field: 'priceCents', message: 'El precio debe ser un monto positivo.' }],
    });

    const preview = await previewCatalogImport('csv', 'slug,name\nhbo,HBO');

    expect(lastCall().path).toBe('/api/admin/catalog/import/preview');
    expect(lastCall().options).toMatchObject({
      method: 'POST',
      body: { format: 'csv', content: 'slug,name\nhbo,HBO' },
    });
    expect(preview.token).toBeNull();
    expect(preview.errors[0]).toEqual({
      row: 3,
      field: 'priceCents',
      message: 'El precio debe ser un monto positivo.',
    });
  });

  it('CA-009-06: aplicar la importación envía el token de la vista previa', async () => {
    mockedRequest.mockResolvedValueOnce({ created: 2, updated: 1 });

    const applied = await applyCatalogImport('token-valido');

    expect(lastCall().path).toBe('/api/admin/catalog/import/apply');
    expect(lastCall().options).toMatchObject({ method: 'POST', body: { token: 'token-valido' } });
    expect(applied).toEqual({ created: 2, updated: 1 });
  });
});
