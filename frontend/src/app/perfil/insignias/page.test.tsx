import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import { myBadges } from '@/services/__fixtures__/reputation';
import { ApiError } from '@/services/http';
import { getMyBadges } from '@/services/reputation';
import BadgesPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/perfil/insignias',
}));
jest.mock('@/services/reputation', () => ({ getMyBadges: jest.fn() }));

const mocked = jest.mocked(getMyBadges);

function renderPage() {
  const user = userEvent.setup();
  render(<BadgesPage />);
  return user;
}

beforeEach(() => {
  replace.mockReset();
  mocked.mockReset();
  mocked.mockResolvedValue(myBadges());
});

describe('/perfil/insignias (spec 007 T021)', () => {
  it('RF-007-07: el título es «Mis insignias», la ruta es protegida y está en el menú del perfil', async () => {
    expect(metadata.title).toBe('Mis insignias');
    expect(isPublicPath('/perfil/insignias')).toBe(false);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Mis insignias' })).toBeVisible();
    const nav = screen.getByRole('navigation', { name: 'Secciones del perfil' });
    expect(within(nav).getByRole('link', { name: 'Mis insignias' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await screen.findByRole('list', { name: 'Insignias obtenidas' });
    expect(mocked).toHaveBeenCalledWith();
  });

  it('CA-007-08: la insignia «Racha 3» obtenida se ve con su descripción y fecha en La Paz', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 2, name: 'Obtenidas (2)' })).toBeVisible();
    const earned = screen.getByRole('list', { name: 'Insignias obtenidas' });
    const streak = within(earned).getByRole('article', { name: 'Racha 3' });
    expect(streak).toHaveTextContent('3 pagos puntuales seguidos.');
    // 16 may 03:30 UTC es el 15 may 23:30 en La Paz.
    expect(streak).toHaveTextContent('Obtenida el 15 may 2026');
  });

  it('CA-007-09: con la racha reiniciada, la insignia se conserva y la pendiente muestra su avance', async () => {
    renderPage();
    const earned = await screen.findByRole('list', { name: 'Insignias obtenidas' });
    expect(within(earned).getByRole('article', { name: 'Racha 3' })).toBeVisible();
    const pending = screen.getByRole('list', { name: 'Insignias por obtener' });
    const twelve = within(pending).getByRole('article', { name: 'Racha 12' });
    expect(twelve).toHaveTextContent('Paga a tiempo 12 cobros seguidos.');
    const bar = within(twelve).getByRole('progressbar', { name: 'Avance de Racha 12' });
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '12');
    expect(bar).toHaveAttribute('aria-valuetext', '2 de 12');
    expect(twelve).toHaveTextContent('2 de 12');
  });

  it('RNF-007-06: obtenidas y pendientes se distinguen por texto e icono, no solo por color', async () => {
    renderPage();
    const earned = await screen.findByRole('list', { name: 'Insignias obtenidas' });
    const pending = screen.getByRole('list', { name: 'Insignias por obtener' });
    const earnedTag = within(earned).getAllByText('Obtenida')[0];
    const pendingTag = within(pending).getByText('Por obtener');
    const earnedIcon = earnedTag.querySelector('svg path')?.getAttribute('d');
    const pendingIcon = pendingTag.querySelector('svg path')?.getAttribute('d');
    expect(earnedIcon).toBeTruthy();
    expect(earnedIcon).not.toBe(pendingIcon);
  });

  it('RF-007-07: sin insignias obtenidas ni pendientes lo dice con un mensaje', async () => {
    mocked.mockResolvedValue({ earned: [], pending: [] });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Obtenidas (0)' })).toBeVisible();
    expect(screen.getByText(/Todavía no tienes insignias/)).toBeVisible();
    expect(screen.getByText('Ya obtuviste todas las insignias disponibles.')).toBeVisible();
  });

  it('RF-007-07: los textos de la API se muestran como texto y no como HTML', async () => {
    mocked.mockResolvedValue(
      myBadges({
        earned: [
          {
            code: 'x',
            name: '<i>Primer pago</i>',
            description: '<script>alert(1)</script>',
            earnedAt: '2026-03-06T14:00:00.000Z',
          },
        ],
      }),
    );
    renderPage();
    expect(await screen.findByText('<i>Primer pago</i>')).toBeVisible();
    expect(screen.getByText('<script>alert(1)</script>')).toBeVisible();
    expect(document.querySelector('i')).toBeNull();
  });

  it('RF-007-07: mientras carga muestra el esqueleto; con error ofrece Reintentar', async () => {
    mocked
      .mockReturnValueOnce(new Promise(() => {}))
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'x'))
      .mockResolvedValue(myBadges());
    const { unmount } = render(<BadgesPage />);
    expect(screen.getByText('Cargando tus insignias…')).toBeInTheDocument();
    unmount();
    const user = renderPage();
    expect(await screen.findByText('No pudimos cargar tus insignias.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Insignias obtenidas' })).toBeVisible();
  });

  it('RF-003-08: un 401 lleva a /ingresar con la ruta actual', async () => {
    mocked.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'x'));
    renderPage();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fperfil%2Finsignias'),
    );
  });
});
