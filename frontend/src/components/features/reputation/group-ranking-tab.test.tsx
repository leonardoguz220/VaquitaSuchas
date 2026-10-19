import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getGroupRanking, type GroupRanking } from '@/services/reputation';
import {
  getGroupRanking as fakeGroupRanking,
  MOCK_RANKING_GROUP_ID,
  MOCK_UNRANKED_GROUP_ID,
} from '@/services/reputation.mock';
import { ApiError } from '@/services/http';
import { GroupRankingTab } from './group-ranking-tab';
import { RANKING_MESSAGES } from './ranking-messages';

jest.mock('@/services/reputation', () => ({ getGroupRanking: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/grupos/abc',
}));

const mocked = jest.mocked(getGroupRanking);

beforeEach(() => {
  mocked.mockReset();
});

/** Respuesta con calificación empatada: en el orden de la API, la racha es lo que desempata. */
const TIED: GroupRanking = {
  items: [
    {
      position: 1,
      user: { userId: 'u-1', fullName: 'Persona Uno' },
      rating: { level: 'Bueno', stars: 4.5, starsLabel: '4,5 de 5' },
      streak: 5,
    },
    {
      position: 2,
      user: { userId: 'u-2', fullName: 'Persona Dos' },
      rating: { level: 'Bueno', stars: 4.5, starsLabel: '4,5 de 5' },
      streak: 2,
    },
  ],
  unranked: [
    {
      user: { userId: 'u-3', fullName: 'Persona Tres' },
      rating: { level: 'Nuevo', stars: null, starsLabel: null },
    },
  ],
};

function rankedList() {
  return screen.getByRole('list', { name: 'Ranking del grupo' });
}

async function renderWith(data: GroupRanking) {
  mocked.mockResolvedValue(data);
  render(<GroupRankingTab groupId={MOCK_RANKING_GROUP_ID} />);
  await screen.findByRole('list', { name: 'Ranking del grupo' });
}

describe('pestaña Ranking: orden y posiciones', () => {
  it('CA-007-10: muestra las posiciones y el orden que entrega la API, sin reordenar', async () => {
    await renderWith(TIED);
    const rows = within(rankedList()).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Persona Uno');
    expect(rows[1]).toHaveTextContent('Persona Dos');
    expect(screen.getByText(/Posición 1/)).toBeInTheDocument();
    expect(screen.getByText(/Posición 2/)).toBeInTheDocument();
  });

  it('CA-007-10: la racha desempata y se muestra junto a cada miembro con posición', async () => {
    await renderWith(TIED);
    const [first, second] = within(rankedList()).getAllByRole('listitem');
    expect(first).toHaveTextContent('Racha de 5 cobros');
    expect(second).toHaveTextContent('Racha de 2 cobros');
  });

  it('CA-007-10: si el orden llega invertido, la pantalla lo respeta (no calcula el ranking)', async () => {
    await renderWith({ ...TIED, items: [...TIED.items].reverse() });
    const rows = within(rankedList()).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Persona Dos');
  });

  it('RNF-007-06: muestra el valor «4,5 de 5» y el nivel en texto, no solo estrellas', async () => {
    await renderWith(TIED);
    expect(within(rankedList()).getAllByText('4,5 de 5')).toHaveLength(2);
    expect(within(rankedList()).getAllByText('Bueno')).toHaveLength(2);
  });
});

describe('pestaña Ranking: «Nuevo» sin posición', () => {
  it('CA-007-11: los «Nuevo» van después de la lista con posición y sin número de posición', async () => {
    await renderWith(TIED);
    const heading = screen.getByRole('heading', { name: 'Sin posición todavía' });
    const unrankedRow = screen.getByText('Persona Tres').closest('li');
    expect(
      rankedList().compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(unrankedRow).not.toHaveTextContent('Posición');
    expect(unrankedRow).not.toHaveTextContent('Racha');
    expect(unrankedRow).toHaveTextContent('Nuevo');
  });

  it('CA-007-11: un grupo sin miembros rankeables muestra el aviso vacío y solo los «Nuevo»', async () => {
    mocked.mockImplementation((groupId) => fakeGroupRanking(groupId));
    render(<GroupRankingTab groupId={MOCK_UNRANKED_GROUP_ID} />);
    expect(await screen.findByText('Aún no hay miembros con calificación')).toBeInTheDocument();
    expect(screen.getByText('Sara Ticona Flores')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Ranking del grupo' })).not.toBeInTheDocument();
  });
});

describe('pestaña Ranking: sin montos ni comprobantes', () => {
  it('CA-007-12: la pestaña no muestra montos ni comprobantes', async () => {
    mocked.mockImplementation((groupId) => fakeGroupRanking(groupId));
    const { container } = render(<GroupRankingTab groupId={MOCK_RANKING_GROUP_ID} />);
    await screen.findByRole('list', { name: 'Ranking del grupo' });
    // El aviso «No se muestran montos ni comprobantes» no cuenta: es la declaración, no un dato.
    const text = (container.textContent ?? '').replace(RANKING_MESSAGES.intro, '');
    expect(text).not.toMatch(/\bBs\b/);
    expect(text).not.toMatch(/\$/);
    expect(text).not.toMatch(/comprobante|recibo|cuota/i);
  });
});

describe('pestaña Ranking: estados', () => {
  it('cargando: muestra el esqueleto con aria-busy mientras llega la respuesta', () => {
    mocked.mockReturnValue(new Promise(() => {}));
    render(<GroupRankingTab groupId={MOCK_RANKING_GROUP_ID} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Cargando el ranking…')).toBeInTheDocument();
  });

  it('error general: muestra el aviso y Reintentar vuelve a pedir el ranking', async () => {
    mocked
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'detalle interno'))
      .mockResolvedValueOnce(TIED);
    const actor = userEvent.setup();
    render(<GroupRankingTab groupId={MOCK_RANKING_GROUP_ID} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar el ranking.');
    expect(alert).not.toHaveTextContent('detalle interno');
    await actor.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('list', { name: 'Ranking del grupo' });
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it('sin conexión: muestra el aviso de conexión', async () => {
    mocked.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'x'));
    render(<GroupRankingTab groupId={MOCK_RANKING_GROUP_ID} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión con el servidor.');
  });

  it('404: muestra «Grupo no encontrado»', async () => {
    mocked.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    render(<GroupRankingTab groupId={MOCK_RANKING_GROUP_ID} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Grupo no encontrado');
  });

  it('403: un no miembro ve el aviso de que no es miembro', async () => {
    mocked.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    render(<GroupRankingTab groupId={MOCK_RANKING_GROUP_ID} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No eres miembro de este grupo');
  });

  it('vacío: sin miembros con calificación muestra «Aún no hay miembros con calificación»', async () => {
    mocked.mockResolvedValue({ items: [], unranked: [] });
    render(<GroupRankingTab groupId={MOCK_RANKING_GROUP_ID} />);
    expect(await screen.findByText('Aún no hay miembros con calificación')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
