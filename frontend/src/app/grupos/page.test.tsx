import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  closedSummary,
  eligibleHost,
  frozenSummary,
  fullHost,
  memberSummary,
  notEligibleHost,
  ownerSummary,
} from '@/components/features/groups/__fixtures__/groups';
import { isPublicPath } from '@/lib/routes';
import { getHostEligibility, listGroups } from '@/services/groups';
import { ApiError } from '@/services/http';
import GroupsPage, { metadata } from './page';

jest.mock('@/services/groups', () => ({
  listGroups: jest.fn(),
  getHostEligibility: jest.fn(),
}));

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/grupos',
}));

const mockedList = jest.mocked(listGroups);
const mockedEligibility = jest.mocked(getHostEligibility);

beforeEach(() => {
  mockedList.mockReset();
  mockedEligibility.mockReset();
  replace.mockReset();
  window.history.replaceState(null, '', '/grupos');
  mockedList.mockResolvedValue({
    items: [ownerSummary, memberSummary, closedSummary, frozenSummary],
    nextCursor: null,
  });
  mockedEligibility.mockResolvedValue(eligibleHost);
});

async function findCard(name: string) {
  const link = await screen.findByRole('link', { name: new RegExp(name) });
  return link;
}

describe('/grupos, Mis suscripciones (T020, RF-001-19)', () => {
  it('RF-001-19: la pestaña se titula «Mis suscripciones» y la ruta exige sesión', () => {
    expect(metadata.title).toBe('Mis suscripciones');
    expect(isPublicPath('/grupos')).toBe(false);
  });

  it('RNF-001-04: mientras carga muestra esqueletos', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    render(<GroupsPage />);
    expect(screen.getByText('Cargando tus suscripciones…')).toBeInTheDocument();
    expect(screen.getAllByTestId('group-skeleton')).toHaveLength(3);
  });

  it('CA-001-20: muestra solo los grupos de la API con su rol, su cuota, miembros y próximo corte', async () => {
    render(<GroupsPage />);
    const list = await screen.findByRole('list', { name: 'Tus grupos' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);

    const member = await findCard('Spotify depa');
    expect(member).toHaveAttribute('href', `/grupos/${memberSummary.id}`);
    expect(within(member).getByText('Miembro')).toBeVisible();
    expect(within(member).getByText('Tu cuota')).toBeVisible();
    expect(within(member).getByText('Bs 19,80')).toBeVisible();
    expect(within(member).getByText('6/6')).toBeVisible();
    expect(within(member).getByText('18 nov 2026')).toBeVisible();
    expect(within(member).getByText('Activo')).toBeVisible();
    expect(mockedList).toHaveBeenCalledWith({}, { signal: expect.any(AbortSignal) });
  });

  it('CA-001-21: el titular ve su cuota como «Cuota de referencia»', async () => {
    render(<GroupsPage />);
    const owner = await findCard('Prime Video de la casa');
    expect(within(owner).getByText('Titular')).toBeVisible();
    expect(within(owner).getByText('Cuota de referencia')).toBeVisible();
    expect(within(owner).queryByText('Tu cuota')).not.toBeInTheDocument();
    expect(within(owner).getByText('Bs 20,87')).toBeVisible();
    expect(within(owner).getByText('3/4')).toBeVisible();
  });

  it('RF-001-19: los grupos cerrados y con el titular baneado lo dicen con texto', async () => {
    render(<GroupsPage />);
    const closed = await findCard('YouTube de la U');
    expect(within(closed).getByText('Cerrado')).toBeVisible();
    expect(within(closed).queryByText(/Próximo corte/)).not.toBeInTheDocument();
    const frozen = await findCard('Disney\\+ primos');
    expect(within(frozen).getByText('Titular baneado')).toBeVisible();
  });

  it('CA-001-20: el filtro por rol pide GET /groups con la query role', async () => {
    const user = userEvent.setup();
    render(<GroupsPage />);
    await screen.findByRole('list', { name: 'Tus grupos' });
    const filters = screen.getByRole('group', { name: 'Filtrar por rol' });
    expect(within(filters).getByRole('button', { name: 'Todas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    mockedList.mockResolvedValue({ items: [ownerSummary], nextCursor: null });
    await user.click(within(filters).getByRole('button', { name: 'Soy titular' }));
    expect(within(filters).getByRole('button', { name: 'Soy titular' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith(
        { role: 'titular' },
        { signal: expect.any(AbortSignal) },
      ),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Tus grupos' })).getAllByRole('listitem'),
      ).toHaveLength(1),
    );

    await user.click(within(filters).getByRole('button', { name: 'Soy miembro' }));
    expect(mockedList).toHaveBeenLastCalledWith(
      { role: 'miembro' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('RF-001-19: un filtro sin resultados lo dice y permite volver a todas', async () => {
    const user = userEvent.setup();
    render(<GroupsPage />);
    await screen.findByRole('list', { name: 'Tus grupos' });
    mockedList.mockResolvedValue({ items: [], nextCursor: null });
    await user.click(screen.getByRole('button', { name: 'Soy titular' }));
    expect(await screen.findByText('No eres titular de ningún grupo.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Ver todas' }));
    expect(mockedList).toHaveBeenLastCalledWith({}, { signal: expect.any(AbortSignal) });
  });

  it('RF-001-19: sin grupos muestra «Aún no estás en ningún grupo» con Crear y Entrar con un código', async () => {
    mockedList.mockResolvedValue({ items: [], nextCursor: null });
    render(<GroupsPage />);
    const empty = await screen.findByRole('region', { name: 'Aún no estás en ningún grupo' });
    await waitFor(() =>
      expect(within(empty).getByRole('link', { name: 'Crear' })).toHaveAttribute(
        'href',
        '/grupos/nuevo',
      ),
    );
    expect(within(empty).getByRole('link', { name: 'Entrar con un código' })).toHaveAttribute(
      'href',
      '/unirse',
    );
  });

  it('CA-001-24: si no está habilitado, «Crear» abre el panel de qué falta', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue({ items: [], nextCursor: null });
    mockedEligibility.mockResolvedValue(notEligibleHost);
    render(<GroupsPage />);
    const empty = await screen.findByRole('region', { name: 'Aún no estás en ningún grupo' });
    const create = await within(empty).findByRole('button', { name: 'Crear' });
    await user.click(create);
    expect(
      screen.getByRole('dialog', { name: 'Todavía no puedes crear suscripciones' }),
    ).toBeVisible();
  });

  it('CA-001-28: con el máximo de grupos, «Crear suscripción» abre el panel del límite', async () => {
    const user = userEvent.setup();
    mockedEligibility.mockResolvedValue(fullHost);
    render(<GroupsPage />);
    await user.click(await screen.findByRole('button', { name: 'Crear suscripción' }));
    expect(screen.getByRole('dialog', { name: 'Llegaste al límite de grupos' })).toBeVisible();
  });

  it('RNF-001-04: un error se muestra con «Reintentar» y vuelve a pedir la lista', async () => {
    const user = userEvent.setup();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'x'));
    render(<GroupsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar tus suscripciones.',
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Tus grupos' })).toBeVisible();
  });

  it('RNF-001-04: sin conexión lo dice de forma distinta', async () => {
    mockedList.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'x'));
    render(<GroupsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión con el servidor.');
  });

  it('un 401 redirige a /ingresar?next=/grupos', async () => {
    mockedList.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    render(<GroupsPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos'));
  });
});
