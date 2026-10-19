import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import {
  newcomerReputation,
  recentCharge,
  reputationDetail,
} from '@/services/__fixtures__/reputation';
import { ApiError } from '@/services/http';
import { getMyReputation } from '@/services/reputation';
import ReputationPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/perfil/reputacion',
}));
jest.mock('@/services/reputation', () => ({ getMyReputation: jest.fn() }));

const mocked = jest.mocked(getMyReputation);

function renderPage() {
  const user = userEvent.setup();
  render(<ReputationPage />);
  return user;
}

beforeEach(() => {
  replace.mockReset();
  mocked.mockReset();
  mocked.mockResolvedValue(reputationDetail());
});

describe('/perfil/reputacion (spec 007 T015)', () => {
  it('RNF-007-04: el título es «Mi reputación», la ruta es protegida y pide solo la propia', async () => {
    expect(metadata.title).toBe('Mi reputación');
    expect(isPublicPath('/perfil/reputacion')).toBe(false);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Mi reputación' })).toBeVisible();
    await screen.findByText('4,5 de 5');
    expect(mocked).toHaveBeenCalledWith();
    const nav = screen.getByRole('navigation', { name: 'Secciones del perfil' });
    expect(within(nav).getByRole('link', { name: 'Mi reputación' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Mis datos' })).toHaveAttribute('href', '/perfil');
  });

  it('CA-007-01: 10 considerados y 9 puntuales se ven como «4,5 de 5», nivel Bueno y el detalle', async () => {
    renderPage();
    expect(await screen.findByText('4,5 de 5')).toBeVisible();
    expect(screen.getByText('Nivel: Bueno')).toBeVisible();
    const details = screen.getByText('Considerados').closest('dl') as HTMLElement;
    const values = within(details)
      .getAllByRole('definition')
      .map((item) => item.textContent);
    expect(values).toEqual(['10', '9', '1', '2']);
    expect(
      within(details)
        .getAllByRole('term')
        .map((item) => item.textContent),
    ).toEqual(['Considerados', 'Puntuales', 'Tardíos', 'Racha actual']);
    expect(screen.getByText(/Valor exacto: 4,5 de 5/)).toBeVisible();
  });

  it('CA-007-19: el valor exacto de la API (4.3750) se explica junto a la calificación mostrada', async () => {
    mocked.mockResolvedValue(
      reputationDetail({ stars: 4.5, starsLabel: '4,5 de 5', exactStars: '4.3750' }),
    );
    renderPage();
    expect(await screen.findByText(/Valor exacto: 4,375 de 5/)).toBeVisible();
  });

  it('CA-007-02: con 2 cobros considerados muestra «Nuevo», sin estrellas y cuántos se necesitan', async () => {
    mocked.mockResolvedValue(newcomerReputation());
    renderPage();
    expect(await screen.findByText('Sin estrellas todavía')).toBeVisible();
    expect(screen.getByText('Nuevo')).toBeVisible();
    expect(screen.queryByText(/de 5$/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Todavía no tienes estrellas: tienes 2 cobros considerados y se necesitan al menos 3 para calcular tu calificación.',
      ),
    ).toBeVisible();
  });

  it('CA-007-20: habilitado por calificación, lo dice con el umbral y ofrece crear', async () => {
    renderPage();
    const host = (
      await screen.findByRole('heading', { name: 'Puedes crear suscripciones' })
    ).closest('section') as HTMLElement;
    expect(within(host).getByText('Habilitado como titular')).toBeVisible();
    expect(host).toHaveTextContent(
      'Tienes 4,5 de 5 con 10 cobros considerados (se piden 4,5 estrellas y al menos 6).',
    );
    expect(within(host).getByRole('link', { name: 'Crear una suscripción' })).toHaveAttribute(
      'href',
      '/grupos/nuevo',
    );
  });

  it('CA-007-20: sin habilitar muestra los requisitos y lo que falta según la API', async () => {
    mocked.mockResolvedValue(newcomerReputation());
    renderPage();
    const host = (
      await screen.findByRole('heading', { name: 'Todavía no puedes crear suscripciones' })
    ).closest('section') as HTMLElement;
    expect(within(host).getByText('Sin habilitar')).toBeVisible();
    expect(host).toHaveTextContent(
      'Para ser titular necesitas 4,5 estrellas o más con al menos 6 cobros considerados',
    );
    const missing = within(host).getByRole('list', { name: 'Lo que te falta' });
    expect(
      within(missing)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Te faltan 4 cobros considerados', 'Necesitas 4,5 estrellas']);
    expect(within(host).queryByRole('link')).not.toBeInTheDocument();
  });

  it('CA-007-23: con habilitación manual lo explica aunque la calificación sea baja', async () => {
    mocked.mockResolvedValue(
      reputationDetail({
        level: 'Regular',
        stars: 3,
        starsLabel: '3 de 5',
        host: {
          eligible: true,
          source: 'manual',
          minStars: 4.5,
          minConsideredCharges: 6,
          missing: [],
        },
      }),
    );
    renderPage();
    expect(await screen.findByText(/Un administrador te habilitó como titular/)).toBeVisible();
  });

  it('RF-007-04: los últimos cobros muestran resultado, período y vencimiento en La Paz', async () => {
    mocked.mockResolvedValue(
      reputationDetail({
        recent: [
          recentCharge(),
          recentCharge({
            chargeId: 'c2',
            groupName: 'Paramount+ del curso',
            serviceName: 'Paramount+',
            period: '2026-09',
            result: 'tardio',
            dueAt: '2026-09-09T04:00:00.000Z',
            countsForRating: false,
          }),
        ],
      }),
    );
    renderPage();
    const list = await screen.findByRole('list', { name: 'Últimos cobros' });
    const [first, second] = within(list).getAllByRole('listitem');
    expect(within(first).getByRole('link', { name: 'Disney+ primos' })).toHaveAttribute(
      'href',
      '/cobros/c1',
    );
    expect(first).toHaveTextContent('Disney+ · Octubre 2026 · Vencía el 15 oct 2026, 23:59');
    expect(within(first).getByText('Puntual')).toBeVisible();
    expect(second).toHaveTextContent('Septiembre 2026 · Vencía el 8 sep 2026, 23:59');
    expect(within(second).getByText('Tarde')).toBeVisible();
    expect(within(second).getByText('Excluido, no cuenta')).toBeVisible();
  });

  it('RF-007-04: sin cobros considerados lo dice con un mensaje', async () => {
    mocked.mockResolvedValue(newcomerReputation({ consideredCount: 0, recent: [] }));
    renderPage();
    expect(
      await screen.findByText(/Todavía no tienes cobros considerados\. Aparecerán aquí/),
    ).toBeVisible();
  });

  it('RNF-007-01: explica la fórmula con el ejemplo y la versión, como texto y no HTML', async () => {
    mocked.mockResolvedValue(
      reputationDetail({
        formula: {
          text: '<b>5 × puntuales</b> ÷ considerados',
          example: '9 de 10 = 4,5.',
          version: 2,
        },
      }),
    );
    renderPage();
    const formula = (await screen.findByRole('heading', { name: '¿Cómo se calcula?' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(formula).getByText('<b>5 × puntuales</b> ÷ considerados')).toBeVisible();
    expect(formula.querySelector('b')).toBeNull();
    expect(formula).toHaveTextContent('Ejemplo: 9 de 10 = 4,5.');
    expect(formula).toHaveTextContent('reglas versión 2');
  });

  it('RF-007-01: mientras carga muestra el esqueleto; con error ofrece Reintentar', async () => {
    mocked
      .mockReturnValueOnce(new Promise(() => {}))
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
      .mockResolvedValue(reputationDetail());
    const { unmount } = render(<ReputationPage />);
    expect(screen.getByText('Cargando tu reputación…')).toBeInTheDocument();
    unmount();
    const user = renderPage();
    expect(await screen.findByText('No pudimos cargar tu reputación.')).toBeVisible();
    expect(screen.getByText('No se pudo contactar con el servidor.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('4,5 de 5')).toBeVisible();
  });

  it('RF-003-08: un 401 lleva a /ingresar con la ruta actual', async () => {
    mocked.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'x'));
    renderPage();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fperfil%2Freputacion'),
    );
  });
});
