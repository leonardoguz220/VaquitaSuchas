import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import { listingView } from '@/services/__fixtures__/listings';
import { listCatalogCategories, listCatalogServices } from '@/services/catalog';
import { ApiError } from '@/services/http';
import { listListings } from '@/services/listings';
import ListingsPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/cupos',
}));
jest.mock('@/services/listings', () => ({
  ...jest.requireActual('@/services/listings'),
  listListings: jest.fn(),
}));
jest.mock('@/services/catalog', () => ({
  ...jest.requireActual('@/services/catalog'),
  listCatalogServices: jest.fn(),
  listCatalogCategories: jest.fn(),
}));

const mocked = jest.mocked(listListings);
const mockedServices = jest.mocked(listCatalogServices);
const mockedCategories = jest.mocked(listCatalogCategories);

const prime = listingView();
const spotify = listingView({
  id: 'l2',
  service: {
    name: 'Spotify',
    planName: 'Familiar',
    logoUrl: null,
    brandColor: '#1DB954',
    category: 'musica',
  },
  slotsOffered: 1,
  estimatedShareCents: 1940,
  billingDay: 17,
  owner: { fullName: 'Rodrigo Salazar', level: 'Bueno' },
  entryWindow: { isOpen: false, opensAt: '2026-11-17T04:00:00.000Z', closesAt: null },
  canRequest: false,
  cannotRequestReason: 'VENTANA_CERRADA',
});

function renderPage() {
  const user = userEvent.setup();
  render(<ListingsPage />);
  return user;
}

beforeEach(() => {
  replace.mockReset();
  mocked.mockReset();
  mocked.mockResolvedValue({ items: [prime, spotify], nextCursor: null });
  mockedServices.mockResolvedValue({
    items: [
      {
        id: 's-netflix',
        slug: 'netflix',
        name: 'Netflix',
        category: 'video',
        categoryLabel: 'Video',
        logoUrl: null,
        brandColor: null,
      },
    ],
    nextCursor: null,
  });
  mockedCategories.mockResolvedValue({
    items: [{ value: 'video', label: 'Video', servicesCount: 4 }],
  });
});

describe('/cupos (spec 008 T015)', () => {
  it('RF-008-07: el título es «Cupos libres», la ruta es protegida y pide la primera página', async () => {
    expect(metadata.title).toBe('Cupos libres');
    expect(isPublicPath('/cupos')).toBe(false);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Cupos libres' })).toBeVisible();
    await screen.findByRole('list', { name: 'Publicaciones' });
    expect(mocked).toHaveBeenCalledWith({ sort: 'fecha', limit: 20 });
  });

  it('RF-008-03: cada tarjeta muestra servicio, cupos, cuota «estimada», día, titular con nivel y ventana', async () => {
    renderPage();
    const list = await screen.findByRole('list', { name: 'Publicaciones' });
    const [first, second] = within(list).getAllByRole('article');
    expect(within(first).getByRole('link', { name: 'Prime Video · Estándar' })).toHaveAttribute(
      'href',
      '/cupos/l1',
    );
    expect(first).toHaveTextContent('2 cupos · Cobro el día 18');
    expect(first).toHaveTextContent('Cuota estimadaBs 9,30');
    expect(first).toHaveTextContent('Titular: Valeria Choque');
    expect(within(first).getByText('Nivel: Excelente')).toBeVisible();
    expect(first).toHaveTextContent('Abierta hasta el 20 oct 2026, 23:59');
    expect(second).toHaveTextContent('1 cupo · Cobro el día 17');
    expect(second).toHaveTextContent('Bs 19,40');
    expect(second).toHaveTextContent('Se abre el 17 nov 2026');
  });

  it('CA-008-05: las tarjetas no muestran miembros, datos de pago ni código', async () => {
    renderPage();
    const list = await screen.findByRole('list', { name: 'Publicaciones' });
    expect(list).not.toHaveTextContent(/miembros|código|QR|cuenta/i);
  });

  it('CA-008-06: elegir «Netflix» pide a la API solo ese servicio', async () => {
    const user = renderPage();
    await screen.findByRole('list', { name: 'Publicaciones' });
    const service = screen.getByLabelText('Servicio');
    await screen.findByRole('option', { name: 'Netflix' });
    await user.selectOptions(service, 's-netflix');
    await waitFor(() =>
      expect(mocked).toHaveBeenLastCalledWith({ serviceId: 's-netflix', sort: 'fecha', limit: 20 }),
    );
  });

  it('RF-008-07: filtra por categoría y cuota, y ordena por cuota', async () => {
    const user = renderPage();
    await screen.findByRole('list', { name: 'Publicaciones' });
    await screen.findByRole('option', { name: 'Video' });
    await user.selectOptions(screen.getByLabelText('Categoría'), 'video');
    await user.selectOptions(screen.getByLabelText('Cuota estimada'), '1500');
    expect(screen.getByRole('option', { name: 'Hasta Bs 15,00' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'cuota');
    await waitFor(() =>
      expect(mocked).toHaveBeenLastCalledWith({
        category: 'video',
        maxShareCents: 1500,
        sort: 'cuota',
        limit: 20,
      }),
    );
  });

  it('RF-008-09: «Cargar más» pide la siguiente página con el cursor', async () => {
    mocked
      .mockResolvedValueOnce({ items: [prime], nextCursor: 'k2' })
      .mockResolvedValueOnce({ items: [spotify], nextCursor: null });
    const user = renderPage();
    await screen.findByRole('list', { name: 'Publicaciones' });
    await user.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(mocked).toHaveBeenLastCalledWith({ sort: 'fecha', limit: 20, cursor: 'k2' });
    const list = screen.getByRole('list', { name: 'Publicaciones' });
    await waitFor(() => expect(within(list).getAllByRole('article')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
  });

  it('RF-008-07: sin publicaciones muestra el estado vacío; con filtros ofrece quitarlos', async () => {
    mocked.mockResolvedValue({ items: [], nextCursor: null });
    const user = renderPage();
    expect(await screen.findByText('Por ahora no hay cupos libres publicados.')).toBeVisible();
    await screen.findByRole('option', { name: 'Video' });
    await user.selectOptions(screen.getByLabelText('Categoría'), 'video');
    expect(await screen.findByText('No hay cupos libres con esos filtros.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(await screen.findByText('Por ahora no hay cupos libres publicados.')).toBeVisible();
    expect(screen.getByLabelText('Categoría')).toHaveValue('');
  });

  it('RF-008-07: mientras carga muestra el esqueleto; con error ofrece Reintentar', async () => {
    mocked
      .mockReturnValueOnce(new Promise(() => {}))
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
      .mockResolvedValue({ items: [prime], nextCursor: null });
    const { unmount } = render(<ListingsPage />);
    expect(screen.getByText('Cargando cupos libres…')).toBeInTheDocument();
    unmount();
    const user = renderPage();
    expect(await screen.findByText('No pudimos cargar los cupos libres.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Publicaciones' })).toBeVisible();
  });

  it('RF-003-08: un 401 lleva a /ingresar con la ruta actual', async () => {
    mocked.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'x'));
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fcupos'));
  });
});
