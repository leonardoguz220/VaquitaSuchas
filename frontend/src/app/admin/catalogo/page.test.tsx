import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN_CATALOG_PATH, isAdminPath } from '@/lib/routes';
import {
  applyCatalogImport,
  createCatalogPlan,
  createCatalogService,
  previewCatalogImport,
  setCatalogPlanActive,
  setCatalogServiceActive,
  updateCatalogPlan,
} from '@/services/admin-catalog';
import {
  getCatalogService,
  listCatalogServices,
  type CatalogPlan,
  type CatalogService,
} from '@/services/catalog';
import { ApiError } from '@/services/http';
import AdminCatalogPage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/catalogo',
}));
jest.mock('@/services/catalog', () => ({
  ...jest.requireActual('@/services/catalog'),
  listCatalogServices: jest.fn(),
  getCatalogService: jest.fn(),
}));
jest.mock('@/services/admin-catalog', () => ({
  ...jest.requireActual('@/services/admin-catalog'),
  createCatalogService: jest.fn(),
  updateCatalogService: jest.fn(),
  setCatalogServiceActive: jest.fn(),
  createCatalogPlan: jest.fn(),
  updateCatalogPlan: jest.fn(),
  setCatalogPlanActive: jest.fn(),
  previewCatalogImport: jest.fn(),
  applyCatalogImport: jest.fn(),
}));

const mockedList = jest.mocked(listCatalogServices);
const mockedDetail = jest.mocked(getCatalogService);
const mockedCreateService = jest.mocked(createCatalogService);
const mockedServiceActive = jest.mocked(setCatalogServiceActive);
const mockedCreatePlan = jest.mocked(createCatalogPlan);
const mockedUpdatePlan = jest.mocked(updateCatalogPlan);
const mockedPlanActive = jest.mocked(setCatalogPlanActive);
const mockedPreview = jest.mocked(previewCatalogImport);
const mockedApply = jest.mocked(applyCatalogImport);

const netflix: CatalogService = {
  id: 's1',
  slug: 'netflix',
  name: 'Netflix',
  category: 'video',
  categoryLabel: 'Video',
  logoUrl: null,
  brandColor: '#E50914',
  plansCount: 1,
};

const standard: CatalogPlan = {
  id: 'p1',
  slug: 'netflix-estandar',
  name: 'Estándar',
  priceCents: 1466,
  currency: 'USD',
  maxSlots: 4,
  individualPriceCents: 999,
  verifiedOn: '2026-10-01',
};

function renderPage() {
  const user = userEvent.setup();
  render(<AdminCatalogPage />);
  return user;
}

function dialog() {
  return screen.getByRole('dialog');
}

async function openPlans(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('list', { name: 'Servicios del catálogo' });
  await user.click(screen.getByRole('button', { name: 'Ver planes' }));
  return screen.findByRole('list', { name: 'Planes de Netflix' });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedList.mockResolvedValue({ items: [netflix], nextCursor: null });
  mockedDetail.mockResolvedValue({ service: netflix, plans: [standard] });
  mockedServiceActive.mockResolvedValue({});
  mockedPlanActive.mockResolvedValue({});
});

describe('/admin/catalogo (spec 009 T029)', () => {
  it('RF-009-04: la ruta es de administración y lista servicios con sus planes', async () => {
    expect(metadata.title).toBe('Catálogo');
    expect(isAdminPath(ADMIN_CATALOG_PATH)).toBe(true);
    const user = renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Catálogo de servicios' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Catálogo' })).toHaveAttribute('aria-current', 'page');
    const plans = await openPlans(user);
    expect(mockedList).toHaveBeenCalledWith({ limit: 50 });
    expect(screen.getByText('Video · netflix · 1 plan')).toBeVisible();
    expect(mockedDetail).toHaveBeenCalledWith('netflix');
    expect(plans).toHaveTextContent('Estándar');
    expect(plans).toHaveTextContent(
      'USD 14,66 · 4 cupos · individual USD 9,99 · verificado el 1 oct 2026',
    );
  });

  it('CA-009-02: crear un servicio envía sus datos y avisa', async () => {
    mockedCreateService.mockResolvedValue({
      ...netflix,
      id: 's2',
      slug: 'crunchyroll',
      name: 'Crunchyroll',
    });
    const user = renderPage();
    await screen.findByRole('list', { name: 'Servicios del catálogo' });
    await user.click(screen.getByRole('button', { name: 'Nuevo servicio' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog()).getByText('Escribe un nombre de 2 a 60 caracteres.')).toBeVisible();
    expect(mockedCreateService).not.toHaveBeenCalled();
    await user.type(within(dialog()).getByLabelText('Nombre'), 'Crunchyroll');
    await user.type(within(dialog()).getByLabelText('Código (slug)'), 'crunchyroll');
    await user.type(within(dialog()).getByLabelText('Color de marca (opcional)'), '#F47521');
    await user.click(within(dialog()).getByRole('button', { name: 'Guardar' }));
    expect(mockedCreateService).toHaveBeenCalledWith({
      name: 'Crunchyroll',
      slug: 'crunchyroll',
      category: 'video',
      logoUrl: null,
      brandColor: '#F47521',
    });
    expect(await screen.findByText('Creaste el servicio Crunchyroll.')).toBeVisible();
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
  });

  it('CA-009-03: un slug repetido se muestra junto al código', async () => {
    mockedCreateService.mockRejectedValue(new ApiError(409, 'CONFLICT', 'x'));
    const user = renderPage();
    await screen.findByRole('list', { name: 'Servicios del catálogo' });
    await user.click(screen.getByRole('button', { name: 'Nuevo servicio' }));
    await user.type(within(dialog()).getByLabelText('Nombre'), 'Netflix 2');
    await user.type(within(dialog()).getByLabelText('Código (slug)'), 'netflix');
    await user.click(within(dialog()).getByRole('button', { name: 'Guardar' }));
    expect(
      await within(dialog()).findByText('Ya existe un servicio o un plan con ese código.'),
    ).toBeVisible();
    expect(within(dialog()).getByLabelText('Código (slug)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('RF-009-07: el plan pide cupos de 2 a 20 y montos positivos antes de enviar', async () => {
    mockedCreatePlan.mockResolvedValue({ ...standard, id: 'p2', name: 'Básico' });
    const user = renderPage();
    await openPlans(user);
    await user.click(screen.getByRole('button', { name: 'Nuevo plan' }));
    expect(dialog()).not.toHaveTextContent('no modifica las suscripciones');
    await user.type(within(dialog()).getByLabelText('Nombre del plan'), 'Básico');
    await user.type(within(dialog()).getByLabelText('Código (slug)'), 'netflix-basico');
    await user.type(within(dialog()).getByLabelText('Precio de referencia'), '-3');
    await user.type(within(dialog()).getByLabelText('Cupos máximos'), '25');
    await user.click(within(dialog()).getByRole('button', { name: 'Guardar' }));
    expect(
      within(dialog()).getByText('Escribe un monto positivo, por ejemplo 14,66.'),
    ).toBeVisible();
    expect(within(dialog()).getByText('Los cupos van de 2 a 20, titular incluido.')).toBeVisible();
    expect(mockedCreatePlan).not.toHaveBeenCalled();
    await user.clear(within(dialog()).getByLabelText('Precio de referencia'));
    await user.type(within(dialog()).getByLabelText('Precio de referencia'), '6,99');
    await user.clear(within(dialog()).getByLabelText('Cupos máximos'));
    await user.type(within(dialog()).getByLabelText('Cupos máximos'), '2');
    await user.click(within(dialog()).getByRole('button', { name: 'Guardar' }));
    expect(mockedCreatePlan).toHaveBeenCalledWith({
      serviceId: 's1',
      name: 'Básico',
      slug: 'netflix-basico',
      priceCents: 699,
      currency: 'USD',
      maxSlots: 2,
      individualPriceCents: null,
      verifiedOn: null,
    });
    expect(await screen.findByText('Creaste el plan Básico.')).toBeVisible();
  });

  it('CA-009-04: editar el precio de un plan avisa que no cambia las suscripciones existentes', async () => {
    mockedUpdatePlan.mockResolvedValue({
      ...standard,
      priceCents: 1599,
      warning: 'No cambia las suscripciones existentes',
    });
    const user = renderPage();
    await openPlans(user);
    await user.click(screen.getByRole('button', { name: 'Editar el plan Estándar' }));
    expect(dialog()).toHaveTextContent(
      'Cambiar el catálogo no modifica las suscripciones que ya existen: cada una guarda su propia copia del plan.',
    );
    expect(within(dialog()).getByLabelText('Precio de referencia')).toHaveValue('14,66');
    await user.clear(within(dialog()).getByLabelText('Precio de referencia'));
    await user.type(within(dialog()).getByLabelText('Precio de referencia'), '15,99');
    await user.click(within(dialog()).getByRole('button', { name: 'Guardar' }));
    expect(mockedUpdatePlan).toHaveBeenCalledWith('p1', {
      slug: 'netflix-estandar',
      name: 'Estándar',
      priceCents: 1599,
      currency: 'USD',
      maxSlots: 4,
      individualPriceCents: 999,
      verifiedOn: '2026-10-01',
    });
    expect(
      await screen.findByText(
        'Guardaste los cambios del plan Estándar. No cambia las suscripciones existentes.',
      ),
    ).toBeVisible();
  });

  it('CA-009-05: desactivar un plan pide confirmación, no borra nada y se puede deshacer', async () => {
    const user = renderPage();
    await openPlans(user);
    await user.click(screen.getByRole('button', { name: 'Desactivar el plan Estándar' }));
    expect(dialog()).toHaveTextContent(
      'Las suscripciones existentes no cambian y no se borra nada.',
    );
    await user.click(within(dialog()).getByRole('button', { name: 'Desactivar' }));
    expect(mockedPlanActive).toHaveBeenCalledWith('p1', false);
    expect(await screen.findByText(/Desactivaste Netflix · Estándar/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(mockedPlanActive).toHaveBeenLastCalledWith('p1', true);
    expect(
      await screen.findByText('Activaste Netflix · Estándar. Vuelve a ofrecerse.'),
    ).toBeVisible();
  });

  it('RF-009-04: desactivar un servicio llama a deactivate', async () => {
    const user = renderPage();
    await screen.findByRole('list', { name: 'Servicios del catálogo' });
    await user.click(screen.getByRole('button', { name: 'Desactivar el servicio Netflix' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Desactivar' }));
    expect(mockedServiceActive).toHaveBeenCalledWith('s1', false);
  });

  it('CA-009-06: una importación con una fila inválida muestra el error y no deja aplicar', async () => {
    mockedPreview.mockResolvedValue({
      token: 'tok1',
      changes: [
        {
          row: 2,
          entity: 'plan',
          action: 'actualizar',
          slug: 'netflix-estandar',
          name: 'Estándar',
        },
      ],
      errors: [{ row: 7, field: 'priceCents', message: 'el precio no puede ser negativo' }],
    });
    const user = renderPage();
    await screen.findByRole('list', { name: 'Servicios del catálogo' });
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    expect(screen.getByText('Elige un archivo CSV o JSON.')).toBeVisible();
    const file = new File(['slug,name'], 'catalogo.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Archivo del catálogo'), file);
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    expect(mockedPreview).toHaveBeenCalledWith(file);
    expect(await screen.findByText('Hay 1 filas con errores.')).toBeVisible();
    expect(screen.getByRole('list', { name: 'Errores por fila' })).toHaveTextContent(
      'Fila 7 (priceCents): el precio no puede ser negativo',
    );
    expect(screen.getByRole('button', { name: 'Aplicar cambios' })).toBeDisabled();
    expect(mockedApply).not.toHaveBeenCalled();
  });

  it('RF-009-06: una vista previa válida se aplica con su token', async () => {
    mockedPreview.mockResolvedValue({
      token: 'tok1',
      changes: [
        { row: 2, entity: 'servicio', action: 'crear', slug: 'crunchyroll', name: 'Crunchyroll' },
        { row: 3, entity: 'plan', action: 'sin_cambios', slug: 'netflix-estandar' },
      ],
      errors: [],
    });
    mockedApply.mockResolvedValue({});
    const user = renderPage();
    await screen.findByRole('list', { name: 'Servicios del catálogo' });
    await user.upload(
      screen.getByLabelText('Archivo del catálogo'),
      new File(['{}'], 'catalogo.json', { type: 'application/json' }),
    );
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    expect(
      await screen.findByText(/Todas las filas son válidas: 1 cambio por aplicar/),
    ).toBeVisible();
    expect(screen.getByRole('list', { name: 'Cambios de la vista previa' })).toHaveTextContent(
      'Fila 2: Servicio Crunchyroll (crunchyroll) se crea',
    );
    await user.click(screen.getByRole('button', { name: 'Aplicar cambios' }));
    expect(mockedApply).toHaveBeenCalledWith('tok1');
    expect(await screen.findByText(/Importación aplicada/)).toBeVisible();
  });

  it('RF-009-06: una vista previa vencida pide volver a cargar el archivo', async () => {
    mockedPreview.mockResolvedValue({
      token: 'tok1',
      changes: [{ row: 2, entity: 'servicio', action: 'crear', slug: 'x' }],
      errors: [],
    });
    mockedApply.mockRejectedValue(new ApiError(410, 'GONE', 'x'));
    const user = renderPage();
    await screen.findByRole('list', { name: 'Servicios del catálogo' });
    await user.upload(screen.getByLabelText('Archivo del catálogo'), new File(['a'], 'c.csv'));
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    await user.click(await screen.findByRole('button', { name: 'Aplicar cambios' }));
    expect(
      await screen.findByText('La vista previa venció o ya se usó. Vuelve a cargar el archivo.'),
    ).toBeVisible();
  });

  it('RF-009-04: cargando, vacío y 403', async () => {
    mockedList.mockResolvedValueOnce({ items: [], nextCursor: null });
    const { unmount } = render(<AdminCatalogPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando catálogo…');
    expect(await screen.findByText(/El catálogo no tiene servicios activos/)).toBeVisible();
    unmount();
    mockedList.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tienes acceso al panel de administración.',
    );
  });
});
