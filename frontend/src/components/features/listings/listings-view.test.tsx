import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/services/http';
import { listListings, type ListingView, type ListingsPage } from '@/services/listings';
import { ListingsView } from './listings-view';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => '/cupos',
}));
jest.mock('@/services/listings', () => ({
  ...jest.requireActual('@/services/listings'),
  listListings: jest.fn(),
}));

const mockedList = jest.mocked(listListings);

function listing(overrides: Partial<ListingView> = {}): ListingView {
  return {
    id: 'l1',
    service: {
      name: 'Prime Video',
      planName: 'Estándar',
      logoUrl: null,
      brandColor: '#0F5E8C',
      category: 'video',
    },
    slotsOffered: 2,
    estimatedShareCents: 930,
    estimatedShareLabel: 'estimada',
    billingDay: 18,
    owner: { fullName: 'Valeria Choque', level: 'Excelente' },
    description: null,
    conditions: null,
    publishedAt: '2026-10-15T14:00:00.000Z',
    expiresAt: '2026-10-29T14:00:00.000Z',
    entryWindow: { isOpen: true, opensAt: null, closesAt: '2026-10-21T03:59:00.000Z' },
    myRequest: null,
    canRequest: true,
    cannotRequestReason: null,
    ...overrides,
  };
}

const page = (items: ListingView[], nextCursor: string | null = null): ListingsPage => ({
  items,
  nextCursor,
});

beforeEach(() => {
  mockedList.mockReset();
  mockReplace.mockReset();
});

describe('/cupos "Cupos libres" (spec 008 T015)', () => {
  it('RF-008-07: mientras carga muestra el esqueleto', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    render(<ListingsView />);
    expect(screen.getByText('Cargando cupos libres…')).toBeInTheDocument();
  });

  it('RF-008-07: cada tarjeta muestra servicio, cupos, día de cobro, titular con su nivel y la ventana', async () => {
    mockedList.mockResolvedValue(page([listing()]));
    render(<ListingsView />);
    const link = await screen.findByRole('link', { name: /Prime Video · Estándar/ });
    expect(link).toHaveAttribute('href', '/cupos/l1');
    expect(within(link).getByText('2 cupos libres · cobro el día 18')).toBeVisible();
    expect(link).toHaveTextContent('Titular: Valeria Choque');
    expect(within(link).getByText('Excelente')).toBeVisible();
    expect(within(link).getByText('Abierta hasta el 20 oct 2026')).toBeVisible();
  });

  it('RN-008-07: la cuota se rotula «estimada» y se muestra tal como llega, sin la palabra «cotizada»', async () => {
    mockedList.mockResolvedValue(page([listing()]));
    render(<ListingsView />);
    const link = await screen.findByRole('link', { name: /Prime Video/ });
    expect(within(link).getByText('Cuota estimada')).toBeVisible();
    expect(within(link).getByText('Bs 9,30')).toBeVisible();
    expect(screen.queryByText(/cotizad/i)).not.toBeInTheDocument();
  });

  it('RF-008-07: una ventana cerrada muestra la fecha en que se abre; el nivel va con texto e ícono', async () => {
    mockedList.mockResolvedValue(
      page([
        listing({
          id: 'l2',
          entryWindow: { isOpen: false, opensAt: '2026-11-01T04:00:00.000Z', closesAt: null },
          owner: { fullName: 'Marco Vargas', level: 'En riesgo' },
        }),
      ]),
    );
    render(<ListingsView />);
    const link = await screen.findByRole('link', { name: /Prime Video/ });
    expect(within(link).getByText('Se abre el 1 nov 2026')).toBeVisible();
    const level = within(link).getByText('En riesgo');
    expect(level.closest('span')?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('RF-008-07: sin publicaciones muestra el estado vacío', async () => {
    mockedList.mockResolvedValue(page([]));
    render(<ListingsView />);
    expect(await screen.findByText('No hay cupos libres por ahora')).toBeVisible();
  });

  it('RF-008-07: con un error muestra Reintentar y vuelve a pedir', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'x'));
    const actor = userEvent.setup();
    render(<ListingsView />);
    expect(await screen.findByText('No pudimos cargar los cupos libres.')).toBeVisible();
    mockedList.mockResolvedValue(page([listing()]));
    await actor.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('link', { name: /Prime Video/ })).toBeVisible();
  });

  it('RF-008-07: sin conexión muestra el aviso de conexión', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'));
    render(<ListingsView />);
    expect(await screen.findByText('Sin conexión.')).toBeVisible();
    expect(screen.getByText('Revisa tu internet y vuelve a intentarlo.')).toBeVisible();
  });

  it('RF-008-07: un 401 lleva a iniciar sesión y vuelve a esta ruta', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(401, 'UNAUTHORIZED', 'x'));
    render(<ListingsView />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/ingresar?next=%2Fcupos'));
  });

  it('RF-008-07: «Cargar más» sigue el cursor de la API', async () => {
    mockedList.mockResolvedValueOnce(page([listing()], 'c1'));
    mockedList.mockResolvedValueOnce(
      page([listing({ id: 'l9', service: { ...listing().service, name: 'Disney+' } })]),
    );
    const actor = userEvent.setup();
    render(<ListingsView />);
    await actor.click(await screen.findByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByRole('link', { name: /Disney\+/ })).toBeVisible();
    expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c1' }));
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('RF-008-09 (CA-008-06): escribir «Netflix» en Servicio pide las publicaciones con q=Netflix', async () => {
    mockedList.mockResolvedValue(page([]));
    const actor = userEvent.setup();
    render(<ListingsView />);
    await screen.findByText('No hay cupos libres por ahora');
    await actor.type(screen.getByLabelText('Servicio'), 'Netflix');
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'Netflix', sort: 'cuota', limit: 6 }),
      ),
    );
  });

  it('RF-008-09: el filtro de categoría envía la categoría del catálogo', async () => {
    mockedList.mockResolvedValue(page([]));
    const actor = userEvent.setup();
    render(<ListingsView />);
    await screen.findByText('No hay cupos libres por ahora');
    await actor.selectOptions(screen.getByLabelText('Categoría'), 'musica');
    expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'musica' }));
  });

  it('RF-008-09: el rango de cuota envía los centavos del tramo elegido', async () => {
    mockedList.mockResolvedValue(page([]));
    const actor = userEvent.setup();
    render(<ListingsView />);
    await screen.findByText('No hay cupos libres por ahora');
    await actor.selectOptions(screen.getByLabelText('Cuota'), 'hasta-15');
    expect(mockedList).toHaveBeenLastCalledWith(
      expect.objectContaining({ minShareCents: null, maxShareCents: 1500 }),
    );
    await actor.selectOptions(screen.getByLabelText('Cuota'), 'entre-15-25');
    expect(mockedList).toHaveBeenLastCalledWith(
      expect.objectContaining({ minShareCents: 1500, maxShareCents: 2500 }),
    );
  });

  it('RF-008-09: el orden por defecto es menor cuota y se puede cambiar a mejor puntualidad', async () => {
    mockedList.mockResolvedValue(page([]));
    const actor = userEvent.setup();
    render(<ListingsView />);
    await screen.findByText('No hay cupos libres por ahora');
    expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'cuota' }));
    await actor.selectOptions(screen.getByLabelText('Ordenar por'), 'puntualidad');
    expect(mockedList).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'puntualidad' }));
  });

  it('RF-008-09: al cambiar un filtro se vuelve a la primera página sin cursor', async () => {
    mockedList.mockResolvedValueOnce(page([listing()], 'c1'));
    mockedList.mockResolvedValue(page([]));
    const actor = userEvent.setup();
    render(<ListingsView />);
    await screen.findByRole('link', { name: /Prime Video/ });
    await actor.selectOptions(screen.getByLabelText('Categoría'), 'video');
    expect(await screen.findByText('No hay cupos libres por ahora')).toBeVisible();
    expect(mockedList).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ cursor: expect.anything() }),
    );
  });
});
