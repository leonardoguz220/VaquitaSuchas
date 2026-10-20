import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getMyBadges, type BadgesResponse } from '@/services/reputation';
import { MOCK_BADGES } from '@/services/reputation.mock';
import { ApiError } from '@/services/http';
import { BadgesView } from './badges-view';
import { progressPercent } from './badges-messages';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/perfil/insignias',
}));
jest.mock('@/services/reputation', () => ({ getMyBadges: jest.fn() }));

const mocked = jest.mocked(getMyBadges);

beforeEach(() => {
  mocked.mockReset();
  replace.mockReset();
});

async function renderWith(data: BadgesResponse) {
  mocked.mockResolvedValue(data);
  render(<BadgesView />);
  await screen.findByRole('heading', { level: 2, name: /Obtenidas/ });
}

describe('/perfil/insignias: cargando, error, vacío y sin conexión', () => {
  it('RF-007-07: mientras llega la respuesta muestra el esqueleto de carga', () => {
    mocked.mockReturnValue(new Promise(() => {}));
    render(<BadgesView />);
    const skeleton = screen.getByText('Cargando tus insignias…').closest('[role="status"]');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('heading', { name: /Obtenidas/ })).not.toBeInTheDocument();
  });

  it('RF-007-07: un error general muestra el aviso y Reintentar vuelve a pedir las insignias', async () => {
    mocked
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'interno'))
      .mockResolvedValueOnce(MOCK_BADGES.withBadges);
    const actor = userEvent.setup();
    render(<BadgesView />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar tus insignias.');
    expect(alert).not.toHaveTextContent('interno');
    await actor.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: /Obtenidas/ })).toBeInTheDocument();
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it('RF-007-07: sin conexión muestra el aviso de conexión', async () => {
    mocked.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'x'));
    render(<BadgesView />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sin conexión.');
    expect(alert).toHaveTextContent('Revisa tu internet y vuelve a intentarlo.');
  });

  it('RF-007-07: sin insignias muestra «Aún no tienes insignias» y no muestra pendientes', async () => {
    await renderWith(MOCK_BADGES.empty);
    expect(screen.getByText('Aún no tienes insignias')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Obtenidas (0)' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Por obtener' })).not.toBeInTheDocument();
  });

  it('RF-007-07: con 401 redirige a /ingresar con la ruta de las insignias', async () => {
    mocked.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    render(<BadgesView />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fperfil%2Finsignias'),
    );
  });
});

describe('/perfil/insignias: obtenidas', () => {
  it('CA-007-08: cada insignia obtenida muestra su nombre, su descripción y la fecha en La Paz', async () => {
    await renderWith(MOCK_BADGES.withBadges);
    expect(screen.getByRole('heading', { name: 'Obtenidas (2)' })).toBeInTheDocument();
    const first = screen.getByText('Primer cobro puntual').closest('article');
    expect(first).toHaveTextContent('Pagaste a tiempo tu primer cobro.');
    expect(first).toHaveTextContent('Obtenida el 18 ago 2026');
    const second = screen.getByText('Racha de 3').closest('article');
    expect(second).toHaveTextContent('Obtenida el 15 sep 2026');
  });

  it('CA-007-08: una fecha de obtención inválida muestra un guion y no rompe la pantalla', async () => {
    await renderWith({
      ...MOCK_BADGES.withBadges,
      earned: [{ ...MOCK_BADGES.withBadges.earned[0], earnedAt: 'no-es-fecha' }],
      pending: [],
    });
    expect(screen.getByText('Primer cobro puntual').closest('article')).toHaveTextContent(
      'Obtenida el —',
    );
  });
});

describe('/perfil/insignias: pendientes', () => {
  it('CA-007-09: una pendiente muestra su condición, el avance «2 de 10» y una barra con ese valor', async () => {
    await renderWith(MOCK_BADGES.withBadges);
    const card = screen.getByText('Racha de 10').closest('article');
    expect(card).toHaveTextContent('Paga 10 cobros seguidos a tiempo.');
    expect(card).toHaveTextContent('Pendiente: 2 de 10');
    const bar = within(card as HTMLElement).getByRole('progressbar', { name: 'Racha de 10' });
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '10');
    expect(bar.firstElementChild).toHaveStyle({ width: '20%' });
  });

  it('CA-007-09: una pendiente casi completa muestra su avance y la barra llena en proporción', async () => {
    await renderWith(MOCK_BADGES.withBadges);
    const card = screen.getByText('Seis meses sin atrasos').closest('article');
    expect(card).toHaveTextContent('Pendiente: 5 de 6');
    const bar = within(card as HTMLElement).getByRole('progressbar', {
      name: 'Seis meses sin atrasos',
    });
    expect(bar.firstElementChild).toHaveStyle({ width: `${(5 / 6) * 100}%` });
  });

  it('CA-007-09: el avance que no pasa de 0 a 100 se acota en la barra', () => {
    expect(progressPercent(12, 10)).toBe(100);
    expect(progressPercent(-1, 10)).toBe(0);
    expect(progressPercent(3, 0)).toBe(0);
  });

  it('RF-007-07: el estado de cada insignia se dice con texto e ícono, no solo con color', async () => {
    await renderWith(MOCK_BADGES.withBadges);
    const earned = screen.getByText('Primer cobro puntual').closest('article') as HTMLElement;
    expect(earned.querySelectorAll('svg')).not.toHaveLength(0);
    earned
      .querySelectorAll('svg')
      .forEach((icon) => expect(icon).toHaveAttribute('aria-hidden', 'true'));
    expect(earned).toHaveTextContent('Obtenida el');
    const pending = screen.getByText('Racha de 10').closest('article') as HTMLElement;
    pending
      .querySelectorAll('svg')
      .forEach((icon) => expect(icon).toHaveAttribute('aria-hidden', 'true'));
    expect(pending).toHaveTextContent('Pendiente');
  });
});
