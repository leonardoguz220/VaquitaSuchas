import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN_PATH, isAdminPath } from '@/lib/routes';
import { adminStats } from '@/services/__fixtures__/admin';
import { getAdminStats } from '@/services/admin-stats';
import { ApiError } from '@/services/http';
import AdminHomePage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin',
}));
jest.mock('@/services/admin-stats', () => ({
  ...jest.requireActual('@/services/admin-stats'),
  getAdminStats: jest.fn(),
}));

const mocked = jest.mocked(getAdminStats);

function renderPage() {
  const user = userEvent.setup();
  render(<AdminHomePage />);
  return user;
}

function tile(label: string) {
  return screen.getByText(label, { selector: 'dt' }).parentElement as HTMLElement;
}

beforeEach(() => {
  mocked.mockReset();
  mocked.mockResolvedValue(adminStats());
});

describe('/admin (spec 009 T035)', () => {
  it('RF-009-15: el tablero muestra los totales que entrega la API', async () => {
    expect(metadata.title).toBe('Tablero');
    expect(isAdminPath(ADMIN_PATH)).toBe(true);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Tablero' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Tablero' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Usuarios' })).not.toHaveAttribute('aria-current');
    await screen.findByText(
      'Datos agregados de Octubre 2026. Pueden tener hasta 5 minutos de retraso.',
    );
    expect(tile('Usuarios')).toHaveTextContent('87');
    expect(tile('Usuarios')).toHaveTextContent('12 nuevos este mes · 64 activos en 30 días');
    expect(tile('Grupos activos')).toHaveTextContent('243 cerrados');
    expect(tile('Monto gestionado en Octubre 2026')).toHaveTextContent('Bs 2.543,50');
    expect(tile('Puntualidad global')).toHaveTextContent('92 %');
    expect(tile('Publicaciones de cupos activas')).toHaveTextContent('5');
    expect(tile('Solicitudes de ingreso del mes')).toHaveTextContent('31');
    expect(tile('Reclamos abiertos')).toHaveTextContent('2');
    expect(
      within(tile('Reclamos abiertos')).getByRole('link', { name: 'Ver reclamos' }),
    ).toHaveAttribute('href', '/admin/reclamos');
  });

  it('CA-009-16: los cobros del mes por estado son los de la API, con texto además del color', async () => {
    renderPage();
    const chart = await screen.findByRole('list', { name: 'Cobros de Octubre 2026 por estado' });
    const items = within(chart).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Pagado61',
      'En revisión9',
      'Pendiente14',
      'Atrasado3',
      'Cancelado1',
    ]);
  });

  it('RF-009-16: cada gráfico tiene su alternativa en tabla', async () => {
    const user = renderPage();
    await screen.findByRole('list', { name: 'Cobros de Octubre 2026 por estado' });
    const [statusSummary, servicesSummary] = screen.getAllByText('Ver tabla');
    await user.click(statusSummary);
    const table = screen.getByRole('table', { name: 'Cobros de Octubre 2026 por estado' });
    expect(within(table).getByRole('row', { name: 'Atrasado 3' })).toBeVisible();
    await user.click(servicesSummary);
    const services = screen.getByRole('table', { name: 'Servicios más compartidos' });
    expect(within(services).getByRole('row', { name: 'Netflix 9' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Servicios más compartidos' })).toHaveTextContent(
      '1. Netflix9',
    );
  });

  it('CA-009-17: el tablero solo muestra agregados, sin personas ni comprobantes', async () => {
    renderPage();
    await screen.findByRole('list', { name: 'Servicios más compartidos' });
    expect(document.body).not.toHaveTextContent(/comprobante|@|\+591/i);
  });

  it('RF-009-15: con cero datos muestra ceros sin errores', async () => {
    mocked.mockResolvedValue(
      adminStats({
        users: { total: 0, newThisMonth: 0, active30d: 0 },
        groups: { active: 0, closed: 0 },
        charges: {
          period: '2026-10',
          byStatus: { pendiente: 0, en_revision: 0, pagado: 0, atrasado: 0, cancelado: 0 },
          managedCents: 0,
        },
        punctualityRate: null,
        topServices: [],
        listings: { active: 0 },
        joinRequestsThisMonth: 0,
        disputesOpen: 0,
      }),
    );
    renderPage();
    await screen.findByText(/Datos agregados de Octubre 2026/);
    expect(tile('Monto gestionado en Octubre 2026')).toHaveTextContent('Bs 0,00');
    expect(tile('Puntualidad global')).toHaveTextContent('Sin datos');
    expect(screen.getByText('Todavía no hay grupos con servicios del catálogo.')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('RF-009-15: cargando, error con reintento y 403', async () => {
    mocked.mockRejectedValueOnce(new ApiError(504, 'UPSTREAM_TIMEOUT', 'x'));
    const user = renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando estadísticas…');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar las estadísticas.No se pudo contactar con el servidor.',
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText(/Datos agregados/);
  });

  it('CA-009-01: un 403 de la API se explica', async () => {
    mocked.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tienes acceso al panel de administración.',
    );
  });
});
