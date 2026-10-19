import { apiRequest } from './http';
import {
  applyCatalogImport,
  createCatalogPlan,
  createCatalogService,
  previewCatalogImport,
  setCatalogPlanActive,
  setCatalogServiceActive,
  updateCatalogPlan,
  updateCatalogService,
} from './admin-catalog';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

beforeEach(() => {
  mockedRequest.mockReset();
  mockedRequest.mockResolvedValue({});
});

const service = {
  slug: 'crunchyroll',
  name: 'Crunchyroll',
  category: 'video' as const,
  logoUrl: null,
  brandColor: '#F47521',
};

describe('services/admin-catalog (contrato 009 § Catálogo)', () => {
  it('CA-009-02: crea servicio y plan con POST', async () => {
    await createCatalogService(service);
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/catalog/services', {
      method: 'POST',
      body: service,
    });
    const plan = {
      serviceId: 's1',
      slug: 'crunchyroll-mega',
      name: 'Mega Fan',
      priceCents: 799,
      currency: 'USD' as const,
      maxSlots: 4,
      individualPriceCents: null,
      verifiedOn: null,
    };
    await createCatalogPlan(plan);
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/admin/catalog/plans', {
      method: 'POST',
      body: plan,
    });
  });

  it('CA-009-04: edita con PATCH por id', async () => {
    await updateCatalogService('s/1', { name: 'Crunchyroll' });
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/catalog/services/s%2F1', {
      method: 'PATCH',
      body: { name: 'Crunchyroll' },
    });
    await updateCatalogPlan('p1', { priceCents: 999 });
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/admin/catalog/plans/p1', {
      method: 'PATCH',
      body: { priceCents: 999 },
    });
  });

  it('CA-009-05: activa y desactiva servicios y planes', async () => {
    await setCatalogServiceActive('s1', false);
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/catalog/services/s1/deactivate', {
      method: 'POST',
    });
    await setCatalogServiceActive('s1', true);
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/admin/catalog/services/s1/activate', {
      method: 'POST',
    });
    await setCatalogPlanActive('p1', false);
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/admin/catalog/plans/p1/deactivate', {
      method: 'POST',
    });
  });

  it('CA-009-06: la importación manda el archivo a la vista previa y aplica con el token', async () => {
    const file = new File(['slug,name'], 'catalogo.csv', { type: 'text/csv' });
    await previewCatalogImport(file);
    const [path, options] = mockedRequest.mock.calls[0] as [
      string,
      { method: string; formData: FormData },
    ];
    expect(path).toBe('/api/admin/catalog/import/preview');
    expect(options.method).toBe('POST');
    expect(options.formData.get('file')).toBe(file);
    await applyCatalogImport('tok1');
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/admin/catalog/import/apply', {
      method: 'POST',
      body: { token: 'tok1' },
    });
  });
});
