import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getMyReputation, type ReputationDetail } from '@/services/reputation';
import { MOCK_REPUTATION } from '@/services/reputation.mock';
import { ApiError } from '@/services/http';
import { ReputationView } from './reputation-view';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/perfil/reputacion',
}));
jest.mock('@/services/reputation', () => ({ getMyReputation: jest.fn() }));

const mocked = jest.mocked(getMyReputation);

beforeEach(() => {
  mocked.mockReset();
  replace.mockReset();
  window.history.replaceState(null, '', '/perfil/reputacion');
});

async function renderWith(detail: ReputationDetail) {
  mocked.mockResolvedValue(detail);
  render(<ReputationView />);
  await screen.findByRole('heading', { level: 2, name: 'Tu calificación' });
}

const statValue = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling;

describe('/perfil/reputacion: cargando, error y vacío', () => {
  it('RF-007-04: mientras llega la respuesta muestra el esqueleto de carga', () => {
    mocked.mockReturnValue(new Promise(() => {}));
    render(<ReputationView />);
    const skeleton = screen.getByText('Cargando tu reputación…').closest('[role="status"]');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('heading', { name: 'Tu calificación' })).not.toBeInTheDocument();
  });

  it('RF-007-04: un error general muestra el aviso y Reintentar vuelve a pedir los datos', async () => {
    mocked
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'interno'))
      .mockResolvedValueOnce(MOCK_REPUTATION.hostEligible);
    const actor = userEvent.setup();
    render(<ReputationView />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar tu reputación.');
    expect(alert).not.toHaveTextContent('interno');
    await actor.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Tu calificación' })).toBeInTheDocument();
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it('RF-007-04: sin conexión muestra el aviso de conexión', async () => {
    mocked.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'x'));
    render(<ReputationView />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sin conexión.');
    expect(alert).toHaveTextContent('Revisa tu internet y vuelve a intentarlo.');
  });

  it('RF-007-03: sin cobros recientes muestra el texto vacío', async () => {
    await renderWith({ ...MOCK_REPUTATION.hostEligible, recent: [] });
    expect(screen.getByText('Todavía no tienes cobros para mostrar.')).toBeInTheDocument();
  });

  it('RF-007-04: con 401 redirige a /ingresar con la ruta de la reputación', async () => {
    mocked.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    render(<ReputationView />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fperfil%2Freputacion'),
    );
  });
});

describe('/perfil/reputacion: calificación y detalle', () => {
  it('CA-007-02: con datos muestra «4,5 de 5», el nivel Bueno y el detalle de cobros', async () => {
    await renderWith(MOCK_REPUTATION.hostEligible);
    expect(screen.getByText('4,5 de 5')).toBeInTheDocument();
    expect(screen.getByText('Bueno')).toBeInTheDocument();
    expect(statValue('Cobros considerados')).toHaveTextContent('10');
    expect(statValue('Puntuales')).toHaveTextContent('9');
    expect(statValue('Tardíos')).toHaveTextContent('1');
    expect(statValue('Racha actual')).toHaveTextContent('2');
  });

  it('CA-007-01: con menos de 3 cobros considerados el nivel es «Nuevo» y dice cuántos faltan', async () => {
    await renderWith(MOCK_REPUTATION.newUser);
    expect(screen.getByText('Nuevo')).toBeInTheDocument();
    expect(screen.queryByText(/de 5/)).not.toBeInTheDocument();
    expect(screen.getByText(/Todavía no tienes calificación/)).toHaveTextContent(
      'Te faltan 1 cobro considerado para tener estrellas.',
    );
  });

  it('CA-007-16: la explicación de la fórmula muestra el texto y el ejemplo que entrega la API', async () => {
    await renderWith(MOCK_REPUTATION.hostEligible);
    const formula = MOCK_REPUTATION.hostEligible.formula;
    expect(screen.getByText('¿Cómo se calcula?')).toBeInTheDocument();
    expect(screen.getByText(formula.text)).toBeInTheDocument();
    expect(screen.getByText(formula.example)).toBeInTheDocument();
  });

  it('CA-007-22: un cobro de ingreso sale como «No cuenta para tu calificación» y los demás no', async () => {
    await renderWith(MOCK_REPUTATION.hostEligible);
    const list = screen.getByRole('list', { name: 'Últimos cobros' });
    const items = within(list).getAllByRole('listitem');
    const ingreso = items.find((item) => item.textContent?.includes('Spotify depa'));
    expect(ingreso).toHaveTextContent('No cuenta para tu calificación');
    expect(items.filter((item) => item.textContent?.includes('No cuenta'))).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Disney+ primos');
    expect(items[0]).toHaveTextContent('Puntual');
    expect(items[0]).toHaveTextContent('Vencía el 15 oct 2026');
  });
});

describe('/perfil/reputacion: habilitación como titular', () => {
  it('CA-007-20: habilitado por calificación muestra las estrellas y los cobros considerados que tiene', async () => {
    await renderWith(MOCK_REPUTATION.hostEligible);
    expect(screen.getByText('Estás habilitado para crear suscripciones.')).toBeInTheDocument();
    expect(
      screen.getByText(/Tienes 4,5 de 5 con 10 cobros considerados\. Se piden 4,5 y al menos 6\./),
    ).toBeInTheDocument();
  });

  it('CA-007-20: sin habilitación lista lo que falta, construido desde missing', async () => {
    await renderWith(MOCK_REPUTATION.notEligible);
    const missing = screen.getByRole('list', { name: 'Lo que falta para ser titular' });
    expect(within(missing).getByText('Necesitas 4,5 estrellas')).toBeInTheDocument();
    expect(within(missing).getByText('Te faltan 3 cobros considerados')).toBeInTheDocument();
    expect(
      screen.queryByText('Estás habilitado para crear suscripciones.'),
    ).not.toBeInTheDocument();
  });

  it('RF-007-17: habilitado por un administrador lo dice sin mostrar la calificación como causa', async () => {
    const byAdmin: ReputationDetail = {
      ...MOCK_REPUTATION.notEligible,
      host: { ...MOCK_REPUTATION.notEligible.host, eligible: true, source: 'manual', missing: [] },
    };
    await renderWith(byAdmin);
    expect(screen.getByText('Un administrador te habilitó como titular.')).toBeInTheDocument();
  });
});

describe('/perfil/reputacion: enlace a insignias', () => {
  it('RF-007-07: la pantalla enlaza a «Mis insignias» en /perfil/insignias', async () => {
    await renderWith(MOCK_REPUTATION.hostEligible);
    expect(screen.getByRole('link', { name: 'Ver mis insignias' })).toHaveAttribute(
      'href',
      '/perfil/insignias',
    );
  });
});
