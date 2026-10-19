import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN_DISPUTES_PATH, isAdminPath } from '@/lib/routes';
import { adminDisputeRow } from '@/services/__fixtures__/admin';
import { listAdminDisputes } from '@/services/admin-disputes';
import { ApiError } from '@/services/http';
import AdminDisputesPage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/reclamos',
}));
jest.mock('@/services/admin-disputes', () => ({
  ...jest.requireActual('@/services/admin-disputes'),
  listAdminDisputes: jest.fn(),
}));

const mocked = jest.mocked(listAdminDisputes);

const open = adminDisputeRow();
const resolved = adminDisputeRow({
  id: 'd3',
  kind: 'comprobante_falso',
  status: 'resuelto',
  group: { id: 'g9', name: 'Disney+ amigos', serviceName: 'Disney+' },
  openedBy: { userId: 'u8', fullName: 'Bruno Paz', role: 'titular' },
  accused: { userId: 'u9', fullName: 'Iván Céspedes', role: 'solicitante' },
  result: 'sin_falta',
  resolvedAt: '2026-10-02T15:00:00.000Z',
  hasResponse: false,
});

function renderPage() {
  const user = userEvent.setup();
  render(<AdminDisputesPage />);
  return user;
}

beforeEach(() => {
  mocked.mockReset();
  mocked.mockResolvedValue({ items: [open, resolved], nextCursor: null });
});

describe('/admin/reclamos (spec 009 T024)', () => {
  it('RF-009-20: la ruta es de administración y pide la cola en el orden de la API', async () => {
    expect(metadata.title).toBe('Reclamos');
    expect(isAdminPath(ADMIN_DISPUTES_PATH)).toBe(true);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Reclamos' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Reclamos' })).toHaveAttribute('aria-current', 'page');
    const list = await screen.findByRole('list', { name: 'Reclamos' });
    const [first, second] = within(list).getAllByRole('article');
    expect(mocked).toHaveBeenCalledWith({ limit: 20 });
    expect(
      within(first).getByRole('link', { name: 'Pago sin ingreso · Crunchyroll anime' }),
    ).toHaveAttribute('href', '/admin/reclamos/d1');
    expect(first).toHaveTextContent('Abrió Ana Quispe (solicitante) contra Kevin Rojas (titular)');
    expect(first).toHaveTextContent('abierto el 17 oct 2026, 09:12 · con respuesta');
    expect(within(first).getByText('Abierto')).toBeVisible();
    expect(within(second).getByText('Resuelto')).toBeVisible();
    expect(second).toHaveTextContent('sin respuesta · resultado: Sin falta');
  });

  it('RF-009-20: la cola no muestra chat ni comprobante', async () => {
    renderPage();
    const list = await screen.findByRole('list', { name: 'Reclamos' });
    expect(list).not.toHaveTextContent(/chat|Ref\.|Abrir comprobante|TRF-/i);
  });

  it('RF-009-20: vacío, error con reintento y 403', async () => {
    mocked.mockResolvedValueOnce({ items: [], nextCursor: null });
    const { unmount } = render(<AdminDisputesPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando reclamos…');
    expect(await screen.findByText(/No hay reclamos/)).toBeVisible();
    unmount();
    mocked.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'x'));
    const user = renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los reclamos.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('list', { name: 'Reclamos' });
  });

  it('CA-009-01: un 403 de la API se explica', async () => {
    mocked.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tienes acceso al panel de administración.',
    );
  });
});
