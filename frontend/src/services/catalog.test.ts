import {
  CATALOG_PAGE_SIZE,
  getService,
  listCategories,
  listServices,
  type CatalogCategoriesResponse,
  type CatalogServiceDetail,
  type CatalogServicesPage,
} from './catalog';
import { apiRequest } from './http';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);

const page: CatalogServicesPage = {
  items: [
    {
      id: '3f1c2a4e-0000-4000-8000-000000000001',
      slug: 'netflix',
      name: 'Netflix',
      category: 'video',
      categoryLabel: 'Video',
      logoUrl: 'https://cdn.example.com/logos/netflix.svg',
      brandColor: '#E50914',
      fromPriceCents: 799,
      fromCurrency: 'USD',
      plansCount: 3,
    },
  ],
  nextCursor: null,
};

describe('services/catalog (contrato 004)', () => {
  beforeEach(() => mockedRequest.mockReset());

  it('RF-004-04: listServices sin filtros pide GET /api/catalog/services con el límite máximo y devuelve el cuerpo tal cual', async () => {
    mockedRequest.mockResolvedValue(page);

    await expect(listServices()).resolves.toEqual(page);
    expect(mockedRequest).toHaveBeenCalledWith(`/api/catalog/services?limit=${CATALOG_PAGE_SIZE}`, {
      signal: undefined,
    });
    // El backend recorta `limit` a 50 (MAX_CATALOG_PAGE_SIZE): nunca pedimos más.
    expect(CATALOG_PAGE_SIZE).toBe(20);
    expect(CATALOG_PAGE_SIZE).toBeLessThanOrEqual(50);
  });

  it('RF-004-04: listServices envía category, q (sin espacios sobrantes), cursor y limit en la query', async () => {
    mockedRequest.mockResolvedValue(page);
    const controller = new AbortController();

    await listServices(
      { category: 'musica', q: '  música  ', cursor: 'abc/123=', limit: 20 },
      { signal: controller.signal },
    );

    expect(mockedRequest).toHaveBeenCalledWith(
      '/api/catalog/services?limit=20&category=musica&q=m%C3%BAsica&cursor=abc%2F123%3D',
      { signal: controller.signal },
    );
  });

  it('RF-004-04: listServices omite q vacío', async () => {
    mockedRequest.mockResolvedValue(page);
    await listServices({ q: '   ' });
    expect(mockedRequest).toHaveBeenCalledWith(`/api/catalog/services?limit=${CATALOG_PAGE_SIZE}`, {
      signal: undefined,
    });
  });

  it('RF-004-05: getService pide GET /api/catalog/services/:slug con el slug codificado', async () => {
    const detail: CatalogServiceDetail = { service: page.items[0], plans: [] };
    mockedRequest.mockResolvedValue(detail);

    await expect(getService('netflix')).resolves.toEqual(detail);
    expect(mockedRequest).toHaveBeenCalledWith('/api/catalog/services/netflix', {
      signal: undefined,
    });

    await getService('a/b');
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/catalog/services/a%2Fb', {
      signal: undefined,
    });
  });

  it('RF-004-03: listCategories pide GET /api/catalog/categories', async () => {
    const body: CatalogCategoriesResponse = {
      items: [{ value: 'video', label: 'Video', servicesCount: 4 }],
    };
    mockedRequest.mockResolvedValue(body);

    await expect(listCategories()).resolves.toEqual(body);
    expect(mockedRequest).toHaveBeenCalledWith('/api/catalog/categories', { signal: undefined });
  });
});
