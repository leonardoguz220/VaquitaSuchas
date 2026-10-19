import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN_MODERATION_PATH, isAdminPath } from '@/lib/routes';
import { reportedListing } from '@/services/__fixtures__/admin';
import { listReportedListings, moderateListing } from '@/services/admin-listings';
import { ApiError } from '@/services/http';
import AdminModerationPage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/moderacion',
}));
jest.mock('@/services/admin-listings', () => ({
  ...jest.requireActual('@/services/admin-listings'),
  listReportedListings: jest.fn(),
  moderateListing: jest.fn(),
}));

const mockedList = jest.mocked(listReportedListings);
const mockedModerate = jest.mocked(moderateListing);

const REASON = 'Los reportes no se sostienen tras revisar el grupo.';

const hidden = reportedListing();
const visible = reportedListing({
  id: 'l2',
  status: 'activa',
  service: { name: 'YouTube Premium', planName: 'Familiar' },
  slotsOffered: 3,
  owner: { userId: 'u5', fullName: 'Marco Vargas' },
  description: 'Grupo de la familia Vargas.',
  hiddenAt: null,
  reportCount: 1,
  reports: [
    {
      reason: 'otro',
      comment: 'Precio distinto al del catálogo',
      createdAt: '2026-10-14T14:00:00.000Z',
    },
  ],
});

function renderPage() {
  const user = userEvent.setup();
  render(<AdminModerationPage />);
  return user;
}

function dialog() {
  return screen.getByRole('dialog');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedList.mockResolvedValue({ items: [hidden, visible], nextCursor: null });
  mockedModerate.mockResolvedValue({});
});

describe('/admin/moderacion (spec 009 T032)', () => {
  it('RF-009-12: muestra las publicaciones reportadas u ocultas con motivos y comentarios', async () => {
    expect(metadata.title).toBe('Moderación');
    expect(isAdminPath(ADMIN_MODERATION_PATH)).toBe(true);
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Moderación de cupos libres' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Moderación' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const list = await screen.findByRole('list', { name: 'Publicaciones reportadas' });
    expect(mockedList).toHaveBeenCalledWith({ limit: 20 });
    const [first, second] = within(list).getAllByRole('article');
    expect(
      within(first).getByRole('heading', { name: 'Netflix · Premium · 1 cupo' }),
    ).toBeVisible();
    expect(within(first).getByText('Oculta · 3 reportes')).toBeVisible();
    expect(first).toHaveTextContent(
      'Titular: Sofía Mamani · publicada el 10 oct 2026 · oculta el 17 oct 2026',
    );
    const reports = within(first).getByRole('list', {
      name: 'Reportes de Netflix · Premium · 1 cupo',
    });
    expect(reports).toHaveTextContent(
      'Conducta indebida: Pide pagar fuera de la app · 16 oct 2026',
    );
    expect(reports).toHaveTextContent('Datos falsos · 16 oct 2026');
    expect(within(second).getByText('Visible · 1 reporte')).toBeVisible();
    expect(within(second).queryByRole('button', { name: /^Restaurar/ })).not.toBeInTheDocument();
  });

  it('CA-009-14: restaurar una publicación oculta pide motivo y la envía', async () => {
    const user = renderPage();
    await screen.findByRole('list', { name: 'Publicaciones reportadas' });
    await user.click(screen.getByRole('button', { name: 'Restaurar: Netflix · Premium · 1 cupo' }));
    expect(dialog()).toHaveTextContent('¿Restaurar Netflix · Premium · 1 cupo?');
    await user.click(within(dialog()).getByRole('button', { name: 'Restaurar' }));
    expect(mockedModerate).not.toHaveBeenCalled();
    await user.type(within(dialog()).getByRole('textbox'), REASON);
    mockedList.mockResolvedValue({ items: [visible], nextCursor: null });
    await user.click(within(dialog()).getByRole('button', { name: 'Restaurar' }));
    expect(mockedModerate).toHaveBeenCalledWith('l1', 'restore', { reason: REASON });
    expect(
      await screen.findByText('Restauraste Netflix · Premium · 1 cupo. Vuelve a la búsqueda.'),
    ).toBeVisible();
    expect(await screen.findByText('Grupo de la familia Vargas.')).toBeVisible();
    expect(screen.queryByText(/Cupo barato/)).not.toBeInTheDocument();
  });

  it('CA-009-15: eliminar avisa que se notifica al titular y envía el motivo', async () => {
    const user = renderPage();
    await screen.findByRole('list', { name: 'Publicaciones reportadas' });
    await user.click(screen.getByRole('button', { name: 'Eliminar: Netflix · Premium · 1 cupo' }));
    expect(dialog()).toHaveTextContent('Se avisa al titular con el motivo.');
    await user.type(within(dialog()).getByRole('textbox'), 'Pide pagar fuera de la app.');
    await user.click(within(dialog()).getByRole('button', { name: 'Eliminar' }));
    expect(mockedModerate).toHaveBeenCalledWith('l1', 'delete', {
      reason: 'Pide pagar fuera de la app.',
    });
    expect(
      await screen.findByText('Eliminaste Netflix · Premium · 1 cupo. Se avisó al titular.'),
    ).toBeVisible();
  });

  it('RF-009-13: eliminar y suspender al titular explica la suspensión y maneja un 422', async () => {
    mockedModerate.mockRejectedValueOnce(
      new ApiError(422, 'BUSINESS_RULE', 'x', { rule: 'RN-009-02' }),
    );
    const user = renderPage();
    await screen.findByRole('list', { name: 'Publicaciones reportadas' });
    await user.click(
      screen.getByRole('button', {
        name: 'Eliminar y suspender al titular: YouTube Premium · Familiar · 3 cupos',
      }),
    );
    expect(dialog()).toHaveTextContent('el titular queda suspendido');
    await user.type(within(dialog()).getByRole('textbox'), 'Estafa reiterada en cupos libres');
    await user.click(within(dialog()).getByRole('button', { name: 'Eliminar y suspender' }));
    expect(mockedModerate).toHaveBeenCalledWith('l2', 'delete-and-suspend', {
      reason: 'Estafa reiterada en cupos libres',
    });
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'No puedes aplicar esta acción a ti mismo ni a otro administrador.',
    );
  });

  it('RF-009-12: el contenido de la publicación se muestra como texto', async () => {
    mockedList.mockResolvedValue({
      items: [reportedListing({ description: '<script>alert(1)</script>Hola' })],
      nextCursor: null,
    });
    renderPage();
    expect(await screen.findByText('<script>alert(1)</script>Hola')).toBeVisible();
    expect(document.querySelector('main script, article script')).toBeNull();
  });

  it('RF-009-12: cargando, vacío, error con reintento y 403', async () => {
    mockedList.mockResolvedValueOnce({ items: [], nextCursor: null });
    const { unmount } = render(<AdminModerationPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando publicaciones reportadas…');
    expect(await screen.findByText(/No hay publicaciones reportadas ni ocultas/)).toBeVisible();
    unmount();
    mockedList.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    const user = renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo contactar con el servidor.',
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('list', { name: 'Publicaciones reportadas' });
  });

  it('CA-009-01: un 403 de la API se explica', async () => {
    mockedList.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tienes acceso al panel de administración.',
    );
  });
});
