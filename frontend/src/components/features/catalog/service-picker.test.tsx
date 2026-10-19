import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listCatalogServices, type CatalogService } from '@/services/catalog';
import { ApiError } from '@/services/http';
import { ServicePicker, type ServicePickerProps } from './service-picker';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/grupos/nuevo',
}));
jest.mock('@/services/catalog', () => ({ listCatalogServices: jest.fn() }));

const mockedList = jest.mocked(listCatalogServices);

// Datos simulados que respetan el contrato 004 (CatalogService del listado).
const netflix: CatalogService = {
  id: 'svc-1',
  slug: 'netflix',
  name: 'Netflix',
  category: 'video',
  categoryLabel: 'Video',
  logoUrl: 'https://cdn.vaquita.test/logos/netflix.svg',
  brandColor: '#E50914',
  fromPriceCents: 699,
  fromCurrency: 'USD',
  plansCount: 3,
};
const tigoMusic: CatalogService = {
  id: 'svc-2',
  slug: 'tigo-music',
  name: 'Tigo Music',
  category: 'musica',
  categoryLabel: 'Música',
  logoUrl: null,
  brandColor: '#00377B',
  fromPriceCents: 2500,
  fromCurrency: 'BS',
  plansCount: 1,
};

function renderPicker(props: Partial<ServicePickerProps> = {}) {
  const handlers = { onSelectService: jest.fn(), onSelectCustom: jest.fn() };
  render(<ServicePicker selectedSlug={null} customSelected={false} {...handlers} {...props} />);
  return handlers;
}

const card = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  replace.mockReset();
  mockedList.mockReset();
  window.history.replaceState(null, '', '/grupos/nuevo');
});

describe('ServicePicker (spec 004 T011)', () => {
  it('RNF-004-02: mientras carga muestra esqueletos', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    renderPicker();
    expect(screen.getByText('Cargando servicios…').closest('[role="status"]')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByRole('list', { name: 'Servicios' })).not.toBeInTheDocument();
  });

  it('RF-004-05: muestra cada servicio con categoría y "desde" en la moneda del plan, sin convertir', async () => {
    mockedList.mockResolvedValue({ items: [netflix, tigoMusic], nextCursor: null });
    renderPicker();

    expect(await screen.findByRole('button', { name: /Netflix/ })).toHaveTextContent(
      'Video · desde USD 6,99',
    );
    expect(card(/Tigo Music/)).toHaveTextContent('Música · desde Bs 25,00');
    expect(mockedList).toHaveBeenCalledWith({ category: undefined, q: undefined, limit: 50 });
  });

  it('CA-004-12: la tarjeta usa ServiceLogo y cae a la inicial sobre el color de marca', async () => {
    mockedList.mockResolvedValue({ items: [netflix, tigoMusic], nextCursor: null });
    renderPicker();

    const netflixLogo = within(await screen.findByRole('button', { name: /Netflix/ })).getByTestId(
      'service-logo',
    );
    const img = netflixLogo.querySelector('img')!;
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    fireEvent.error(img);
    expect(within(card(/Netflix/)).getByTestId('service-logo')).toHaveTextContent('N');
    expect(within(card(/Netflix/)).getByTestId('service-logo')).toHaveStyle({
      backgroundColor: '#E50914',
    });

    // Sin logo: la inicial desde el principio.
    expect(within(card(/Tigo Music/)).getByTestId('service-logo')).toHaveTextContent('T');
  });

  it('RF-004-05: al tocar un servicio lo entrega y marca el seleccionado con aria-pressed', async () => {
    mockedList.mockResolvedValue({ items: [netflix, tigoMusic], nextCursor: null });
    const actor = userEvent.setup();
    const { onSelectService } = renderPicker({ selectedSlug: 'tigo-music' });

    await actor.click(await screen.findByRole('button', { name: /Netflix/ }));
    expect(onSelectService).toHaveBeenCalledWith(netflix);
    expect(card(/Tigo Music/)).toHaveAttribute('aria-pressed', 'true');
    expect(card(/Netflix/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('RF-004-09: la última tarjeta ofrece crear un servicio personalizado', async () => {
    mockedList.mockResolvedValue({ items: [netflix], nextCursor: null });
    const actor = userEvent.setup();
    const { onSelectCustom } = renderPicker();

    const items = within(await screen.findByRole('list', { name: 'Servicios' })).getAllByRole(
      'listitem',
    );
    expect(items.at(-1)).toHaveTextContent('¿No está tu servicio?Crear uno personalizado');
    await actor.click(card(/Crear uno personalizado/));
    expect(onSelectCustom).toHaveBeenCalledTimes(1);
  });

  it('RF-004-09: sin servicios muestra el vacío con la sugerencia de personalizado', async () => {
    mockedList.mockResolvedValue({ items: [], nextCursor: null });
    renderPicker();

    expect(await screen.findByText('Todavía no hay servicios en el catálogo.')).toBeInTheDocument();
    expect(
      screen.getByText('Puedes crear tu suscripción como un servicio personalizado.'),
    ).toBeInTheDocument();
    expect(card(/Crear uno personalizado/)).toBeInTheDocument();
  });

  it('RNF-004-02: si falla muestra el error con Reintentar, que vuelve a pedir la lista', async () => {
    mockedList
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'))
      .mockResolvedValueOnce({ items: [netflix], nextCursor: null });
    const actor = userEvent.setup();
    renderPicker();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar los servicios.');
    expect(alert).toHaveTextContent('No se pudo contactar con el servidor.');
    // Aun con error se puede seguir con un servicio personalizado.
    expect(card(/Crear uno personalizado/)).toBeInTheDocument();

    await actor.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: /Netflix/ })).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('RF-004-04: con nextCursor muestra "Ver más servicios" y agrega la página siguiente', async () => {
    mockedList
      .mockResolvedValueOnce({ items: [netflix], nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [tigoMusic], nextCursor: null });
    const actor = userEvent.setup();
    renderPicker();

    await actor.click(await screen.findByRole('button', { name: 'Ver más servicios' }));
    expect(await screen.findByRole('button', { name: /Tigo Music/ })).toBeInTheDocument();
    expect(card(/Netflix/)).toBeInTheDocument();
    expect(mockedList).toHaveBeenLastCalledWith({
      category: undefined,
      q: undefined,
      limit: 50,
      cursor: 'c2',
    });
    expect(screen.queryByRole('button', { name: 'Ver más servicios' })).not.toBeInTheDocument();
  });

  it('RF-003-08: con 401 redirige a /ingresar?next=/grupos/nuevo', async () => {
    mockedList.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    renderPicker();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos%2Fnuevo'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
