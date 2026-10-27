import { render, screen, within } from '@testing-library/react';
import { getAdminStats, type AdminStats } from '@/services/admin';
import { AdminStatsView } from './admin-stats-view';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin',
}));

jest.mock('@/services/admin', () => ({
  getAdminStats: jest.fn(),
}));

const statsMock = getAdminStats as jest.MockedFunction<typeof getAdminStats>;

const stats: AdminStats = {
  users: { total: 87, newThisMonth: 12, active30d: 64 },
  groups: { active: 24, closed: 6 },
  charges: {
    period: '2026-10',
    byStatus: { pendiente: 14, en_revision: 9, pagado: 61, atrasado: 3, cancelado: 2 },
    managedCents: 1842500,
  },
  punctualityRate: 93,
  topServices: [{ name: 'Netflix', groups: 7 }],
  listings: { active: 5 },
  joinRequestsThisMonth: 31,
  disputesOpen: 2,
};

describe('AdminStatsView (spec 009 T035)', () => {
  beforeEach(() => {
    statsMock.mockReset();
  });

  it('CA-009-16: muestra las cifras en tarjetas y los cobros por estado en tabla, con texto e ícono', async () => {
    statsMock.mockResolvedValue(stats);
    render(<AdminStatsView />);

    const cifras = await screen.findByRole('list', { name: 'Cifras principales' });
    expect(within(cifras).getByText('87')).toBeInTheDocument();

    const tabla = screen.getByRole('region', { name: /Cobros de/ });
    const fila = within(tabla).getByText('✓ Pagados').closest('tr');
    expect(fila).not.toBeNull();
    expect(within(fila as HTMLElement).getByText('61')).toBeInTheDocument();
    expect(within(tabla).getByText('! Atrasados')).toBeInTheDocument();
  });

  it('QA-01: la puntualidad llega como porcentaje entero y se muestra sin multiplicarla', async () => {
    statsMock.mockResolvedValue({ ...stats, punctualityRate: 86 });
    render(<AdminStatsView />);

    expect(await screen.findByText('86 %')).toBeInTheDocument();
    expect(screen.queryByText('8600 %')).not.toBeInTheDocument();
  });

  it('CA-009-16: al fallar la carga ofrece Reintentar', async () => {
    statsMock.mockRejectedValue(new Error('sin red'));
    render(<AdminStatsView />);

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
