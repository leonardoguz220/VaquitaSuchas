import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { groupRanking } from '@/services/__fixtures__/reputation';
import { ApiError } from '@/services/http';
import { getGroupRanking } from '@/services/reputation';
import { GroupRankingTab } from './group-ranking-tab';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/grupos/g2',
}));
jest.mock('@/services/reputation', () => ({ getGroupRanking: jest.fn() }));

const mocked = jest.mocked(getGroupRanking);

function renderTab() {
  const user = userEvent.setup();
  render(<GroupRankingTab groupId="g2" />);
  return user;
}

beforeEach(() => {
  replace.mockReset();
  mocked.mockReset();
  mocked.mockResolvedValue(groupRanking());
});

describe('Pestaña Ranking del grupo (spec 007 T026)', () => {
  it('CA-007-10: muestra el orden de la API y el «Nuevo» al final sin posición', async () => {
    renderTab();
    const ranked = await screen.findByRole('list', { name: 'Ranking del grupo' });
    expect(mocked).toHaveBeenCalledWith('g2');
    expect(ranked.tagName).toBe('OL');
    const rows = within(ranked).getAllByRole('listitem');
    expect(
      rows.map((row) => within(row).getByText(/Puesto \d+:/).parentElement?.textContent),
    ).toEqual(['Puesto 1: Sofía Mamani', 'Puesto 2: Ana Quispe Mamani', 'Puesto 3: Bruno Paz']);
    const unranked = screen.getByRole('list', { name: 'Sin posición' });
    const [newcomer] = within(unranked).getAllByRole('listitem');
    expect(newcomer).toHaveTextContent('Sin posición: Iván Céspedes');
    expect(within(newcomer).getByText('Nuevo')).toBeVisible();
    expect(within(newcomer).getByText('Sin estrellas todavía')).toBeVisible();
    expect(newcomer).not.toHaveTextContent(/Puesto/);
  });

  it('RF-007-10: cada fila muestra nivel, estrellas con su valor y racha en texto', async () => {
    renderTab();
    const ranked = await screen.findByRole('list', { name: 'Ranking del grupo' });
    const [first, second] = within(ranked).getAllByRole('listitem');
    expect(within(first).getByText('5 de 5')).toBeVisible();
    expect(within(first).getByText('Nivel: Excelente')).toBeVisible();
    expect(within(first).getByText('Racha: 11')).toBeVisible();
    expect(within(second).getByText('4,5 de 5')).toBeVisible();
    expect(within(second).getByText('Nivel: Bueno')).toBeVisible();
    expect(within(second).getByText('Racha: 2')).toBeVisible();
  });

  it('CA-007-11: no muestra montos ni comprobantes', async () => {
    renderTab();
    const section = (await screen.findByRole('list', { name: 'Ranking del grupo' })).closest(
      'section',
    ) as HTMLElement;
    expect(section).toHaveTextContent('No se muestran montos ni comprobantes.');
    expect(section).not.toHaveTextContent(/Bs\s?\d/);
    // Sin enlaces a cobros ni a comprobantes.
    expect(within(section).queryAllByRole('link')).toHaveLength(0);
  });

  it('CA-007-12: con 404 dice que no encontró el ranking, sin Reintentar', async () => {
    mocked.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    renderTab();
    expect(await screen.findByText('No encontramos el ranking de este grupo.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });

  it('RF-007-09: sin personas en el ranking lo dice con un mensaje', async () => {
    mocked.mockResolvedValue({ items: [], unranked: [] });
    renderTab();
    expect(
      await screen.findByText('Todavía nadie en el grupo tiene cobros para el ranking.'),
    ).toBeVisible();
  });

  it('RF-007-09: solo «Nuevo» muestra la lista sin posición y no la del ranking', async () => {
    mocked.mockResolvedValue(groupRanking({ items: [] }));
    renderTab();
    expect(await screen.findByRole('list', { name: 'Sin posición' })).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Ranking del grupo' })).toBeNull();
  });

  it('RF-007-09: mientras carga muestra el esqueleto; con error ofrece Reintentar', async () => {
    mocked
      .mockReturnValueOnce(new Promise(() => {}))
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
      .mockResolvedValue(groupRanking());
    const { unmount } = render(<GroupRankingTab groupId="g2" />);
    expect(screen.getByText('Cargando el ranking…')).toBeInTheDocument();
    unmount();
    const user = renderTab();
    expect(await screen.findByText('No pudimos cargar el ranking.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Ranking del grupo' })).toBeVisible();
  });

  it('RF-003-08: un 401 lleva a /ingresar con la ruta actual', async () => {
    mocked.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'x'));
    renderTab();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos%2Fg2'));
  });
});
