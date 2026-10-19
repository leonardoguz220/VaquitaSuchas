import {
  getCatalogService,
  listCatalogCategories,
  listCatalogServices,
  type CatalogServiceDetail,
  type CatalogServicesPage,
} from './catalog';
import { ApiError, apiRequest } from './http';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

const netflix = {
  id: 'b7a1c0de-0000-4000-8000-000000000001',
  slug: 'netflix',
  name: 'Netflix',
  category: 'video' as const,
  categoryLabel: 'Video',
  logoUrl: 'https://cdn.vaquita.test/logos/netflix.svg',
  brandColor: '#E50914',
};

beforeEach(() => mockedRequest.mockReset());

describe('services/catalog (contrato 004)', () => {
  it('RF-004-04: listCatalogServices sin filtros hace GET /api/catalog/services', async () => {
    const page: CatalogServicesPage = {
      items: [{ ...netflix, fromPriceCents: 699, fromCurrency: 'USD', plansCount: 3 }],
      nextCursor: null,
    };
    mockedRequest.mockResolvedValue(page);

    await expect(listCatalogServices()).resolves.toEqual(page);
    expect(mockedRequest).toHaveBeenCalledWith('/api/catalog/services');
  });

  it('RF-004-04: listCatalogServices pasa category, q, limit y cursor en la query', async () => {
    mockedRequest.mockResolvedValue({ items: [], nextCursor: null });
    await listCatalogServices({ category: 'musica', q: 'música en casa', limit: 50, cursor: 'c1' });
    expect(mockedRequest).toHaveBeenCalledWith(
      '/api/catalog/services?category=musica&q=m%C3%BAsica+en+casa&limit=50&cursor=c1',
    );
  });

  it('RF-004-05: getCatalogService hace GET /api/catalog/services/:slug con el slug codificado', async () => {
    const detail: CatalogServiceDetail = { service: netflix, plans: [] };
    mockedRequest.mockResolvedValue(detail);

    await expect(getCatalogService('netflix')).resolves.toEqual(detail);
    expect(mockedRequest).toHaveBeenCalledWith('/api/catalog/services/netflix');

    await getCatalogService('a/b');
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/catalog/services/a%2Fb');
  });

  it('RF-004-05: getCatalogService propaga el 404 NOT_FOUND sin transformarlo', async () => {
    const error = new ApiError(404, 'NOT_FOUND', 'No encontrado.');
    mockedRequest.mockRejectedValue(error);
    await expect(getCatalogService('viejo')).rejects.toBe(error);
  });

  it('RF-004-03: listCatalogCategories hace GET /api/catalog/categories', async () => {
    const response = { items: [{ value: 'video', label: 'Video', servicesCount: 4 }] };
    mockedRequest.mockResolvedValue(response);
    await expect(listCatalogCategories()).resolves.toEqual(response);
    expect(mockedRequest).toHaveBeenCalledWith('/api/catalog/categories');
  });
});
