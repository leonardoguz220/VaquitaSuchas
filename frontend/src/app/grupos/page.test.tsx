import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import {
  getHostEligibility,
  listGroups,
  type GroupSummary,
  type HostEligibility,
} from '@/services/groups';
import { ApiError } from '@/services/http';
import GroupsPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/grupos',
}));
jest.mock('@/services/groups', () => ({
  listGroups: jest.fn(),
  getHostEligibility: jest.fn(),
}));

const mockedList = jest.mocked(listGroups);
const mockedEligibility = jest.mocked(getHostEligibility);

// Datos simulados que respetan el contrato 001 (GroupSummary).
const owned: GroupSummary = {
  id: 'g1',
  name: 'Netflix de la familia',
  serviceName: 'Netflix',
  logoUrl: null,
  brandColor: '#E50914',
  role: 'titular',
  status: 'activo',
  frozenReason: null,
  memberCount: 3,
  totalSlots: 4,
  myShareCents: 3000,
  myShareIsReference: true,
  billingDay: 1,
  nextCutDate: '2026-11-01',
};
const joined: GroupSummary = {
  ...owned,
  id: 'g2',
  name: 'Spotify depa',
  serviceName: 'Spotify',
  brandColor: '#1DB954',
  role: 'miembro',
  memberCount: 6,
  totalSlots: 6,
  myShareCents: 1980,
  myShareIsReference: false,
  billingDay: 18,
  nextCutDate: '2026-11-18',
};

const eligible: HostEligibility = {
  eligible: true,
  source: 'manual',
  activeGroups: 1,
  maxActiveGroups: 5,
  canCreateMore: true,
  requirement: { minStars: 4.5, minConsideredCharges: 6, windowMonths: 12 },
  current: { stars: 4.0, consideredCharges: 3, level: 'Bueno' },
};

const card = (name: RegExp) => screen.getByRole('link', { name });

beforeEach(() => {
  replace.mockReset();
  mockedList.mockReset();
  mockedEligibility.mockReset();
  mockedEligibility.mockResolvedValue(eligible);
  window.history.replaceState(null, '', '/grupos');
});

describe('/grupos (spec 001 T020)', () => {
  it('RF-001-19: el título es "Mis suscripciones" y la ruta es protegida', async () => {
    mockedList.mockResolvedValue({ items: [owned], nextCursor: null });
    expect(metadata.title).toBe('Mis suscripciones');
    expect(isPublicPath('/grupos')).toBe(false);
    render(<GroupsPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mis suscripciones' }),
    ).toBeInTheDocument();
    await screen.findByRole('link', { name: /Netflix de la familia/ });
  });

  it('RNF-001-04: mientras carga muestra el esqueleto', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    render(<GroupsPage />);
    expect(screen.getByText('Cargando tus suscripciones…')).toBeInTheDocument();
  });

  it('RF-001-19: cada tarjeta muestra rol, cuota o cuota de referencia, cupos y próximo corte', async () => {
    mockedList.mockResolvedValue({ items: [owned, joined], nextCursor: null });
    render(<GroupsPage />);

    const ownedCard = await screen.findByRole('link', { name: /Netflix de la familia/ });
    expect(ownedCard).toHaveAttribute('href', '/grupos/g1');
    expect(ownedCard).toHaveTextContent('Titular');
    expect(ownedCard).toHaveTextContent('Cuota de referenciaBs 30,00');
    expect(ownedCard).toHaveTextContent('3 de 4 cupos');
    expect(ownedCard).toHaveTextContent('Próximo corte: 1 nov 2026');
    expect(within(ownedCard).getByTestId('service-logo')).toHaveTextContent('N');

    const joinedCard = card(/Spotify depa/);
    expect(joinedCard).toHaveTextContent('Miembro');
    expect(joinedCard).toHaveTextContent('Tu cuotaBs 19,80');
    expect(joinedCard).toHaveTextContent('6 de 6 cupos');
    expect(joinedCard).toHaveTextContent('Próximo corte: 18 nov 2026');
    expect(mockedList).toHaveBeenCalledWith({ limit: 50 });
  });

  it('RF-001-18: un grupo cerrado o con titular baneado lo dice con texto, no solo con color', async () => {
    mockedList.mockResolvedValue({
      items: [
        { ...owned, status: 'cerrado' },
        { ...joined, frozenReason: 'titular_baneado' },
      ],
      nextCursor: null,
    });
    render(<GroupsPage />);
    const closed = await screen.findByRole('link', { name: /Netflix de la familia/ });
    expect(closed).toHaveTextContent('Cerrado');
    expect(closed).not.toHaveTextContent('Próximo corte');
    expect(card(/Spotify depa/)).toHaveTextContent('Titular baneado');
  });

  it('RF-001-19: el filtro por rol lo pide a la API y marca el elegido', async () => {
    mockedList
      .mockResolvedValueOnce({ items: [owned, joined], nextCursor: null })
      .mockResolvedValueOnce({ items: [owned], nextCursor: null });
    const actor = userEvent.setup();
    render(<GroupsPage />);
    await screen.findByRole('link', { name: /Spotify depa/ });

    const filters = screen.getByRole('group', { name: 'Filtrar por rol' });
    expect(within(filters).getByRole('button', { name: 'Todas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await actor.click(within(filters).getByRole('button', { name: 'Soy titular' }));
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith({ role: 'titular', limit: 50 }),
    );
    expect(await screen.findByRole('link', { name: /Netflix de la familia/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Spotify depa/ })).not.toBeInTheDocument();
    expect(within(filters).getByRole('button', { name: 'Soy titular' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('RF-001-19: con un filtro sin resultados lo dice', async () => {
    mockedList
      .mockResolvedValueOnce({ items: [joined], nextCursor: null })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const actor = userEvent.setup();
    render(<GroupsPage />);
    await screen.findByRole('link', { name: /Spotify depa/ });
    await actor.click(screen.getByRole('button', { name: 'Soy titular' }));
    expect(await screen.findByText('No eres titular de ningún grupo.')).toBeInTheDocument();
  });

  it('RF-001-19: sin grupos muestra el vacío con Crear y Entrar con un código', async () => {
    mockedList.mockResolvedValue({ items: [], nextCursor: null });
    render(<GroupsPage />);

    const empty = await screen.findByRole('region', { name: 'Aún no estás en ningún grupo' });
    await waitFor(() =>
      expect(within(empty).getByRole('link', { name: 'Crear suscripción' })).toHaveAttribute(
        'href',
        '/grupos/nuevo',
      ),
    );
    expect(within(empty).getByRole('link', { name: 'Entrar con un código' })).toHaveAttribute(
      'href',
      '/unirse',
    );
  });

  it('RF-001-21: sin habilitación el vacío no ofrece Crear y el botón de arriba abre el panel', async () => {
    mockedList.mockResolvedValue({ items: [], nextCursor: null });
    mockedEligibility.mockResolvedValue({ ...eligible, eligible: false, source: null });
    const actor = userEvent.setup();
    render(<GroupsPage />);

    const empty = await screen.findByRole('region', { name: 'Aún no estás en ningún grupo' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Crear suscripción' })).toBeInTheDocument(),
    );
    expect(
      within(empty).queryByRole('link', { name: 'Crear suscripción' }),
    ).not.toBeInTheDocument();

    await actor.click(screen.getByRole('button', { name: 'Crear suscripción' }));
    const dialog = screen.getByRole('dialog', { name: 'Todavía no puedes crear suscripciones' });
    expect(dialog).toHaveTextContent('4,5 estrellas o más');
    await actor.click(within(dialog).getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('RF-001-19: si falla muestra el error con Reintentar', async () => {
    mockedList
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'))
      .mockResolvedValueOnce({ items: [owned], nextCursor: null });
    const actor = userEvent.setup();
    render(<GroupsPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar tus suscripciones.');
    expect(alert).toHaveTextContent('No se pudo contactar con el servidor.');
    await actor.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('link', { name: /Netflix de la familia/ })).toBeInTheDocument();
  });

  it('RF-001-19: con nextCursor muestra "Ver más suscripciones"', async () => {
    mockedList
      .mockResolvedValueOnce({ items: [owned], nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [joined], nextCursor: null });
    const actor = userEvent.setup();
    render(<GroupsPage />);
    await actor.click(await screen.findByRole('button', { name: 'Ver más suscripciones' }));
    expect(await screen.findByRole('link', { name: /Spotify depa/ })).toBeInTheDocument();
    expect(mockedList).toHaveBeenLastCalledWith({ limit: 50, cursor: 'c2' });
  });

  it('RF-003-08: con 401 redirige a /ingresar?next=/grupos', async () => {
    mockedList.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    render(<GroupsPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos'));
  });
});
