import { render, screen } from '@testing-library/react';
import { getAdminUser, type AdminUserDetail } from '@/services/admin';
import { AdminUserView } from './admin-user-view';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/usuarios',
}));

jest.mock('@/services/admin', () => ({
  getAdminUser: jest.fn(),
  suspendAdminUser: jest.fn(),
  reactivateAdminUser: jest.fn(),
  banAdminUser: jest.fn(),
  setAdminUserRole: jest.fn(),
}));

const getMock = getAdminUser as jest.MockedFunction<typeof getAdminUser>;

function detail(overrides: Partial<AdminUserDetail>): AdminUserDetail {
  return {
    id: 'u-ana',
    fullName: 'Ana Quispe',
    phone: '+59171234567',
    role: 'usuario',
    status: 'activo',
    createdAt: '2026-02-01T12:00:00Z',
    email: 'ana@ejemplo.bo',
    ciMasked: '*****567',
    lastLoginAt: null,
    groupsAsHost: 0,
    groupsAsMember: 1,
    reputation: {
      level: 'Bueno',
      stars: 4,
      starsLabel: '4 de 5',
      consideredCharges: 6,
    },
    reportsReceived: 0,
    ban: null,
    suspension: null,
    hostEnablement: null,
    ...overrides,
  };
}

describe('AdminUserView (spec 009 T017)', () => {
  it('CA-009-08: la ficha muestra la CI enmascarada, sin CI en claro', async () => {
    getMock.mockResolvedValue(detail({}));
    render(<AdminUserView userId="u-ana" />);

    expect(await screen.findByText('*****567')).toBeInTheDocument();
  });

  it('CA-009-11: una cuenta suspendida ofrece Reactivar y no Suspender', async () => {
    getMock.mockResolvedValue(
      detail({
        status: 'suspendido',
        suspension: { reason: 'Reclamo abierto', at: '2026-10-02T10:00:00Z' },
      }),
    );
    render(<AdminUserView userId="u-ana" />);

    expect(await screen.findByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument();
  });

  it('CA-009-22: una cuenta baneada no ofrece Banear de nuevo', async () => {
    getMock.mockResolvedValue(
      detail({
        status: 'baneado',
        ban: { reason: 'Estafa confirmada', by: 'Camila Fuentes', at: '2026-08-15T16:00:00Z' },
      }),
    );
    render(<AdminUserView userId="u-ana" />);

    expect(await screen.findByText(/Cuenta baneada/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Banear' })).not.toBeInTheDocument();
  });

  it('CA-009-22: una cuenta activa ofrece Suspender y Banear, y Banear abre la confirmación', async () => {
    getMock.mockResolvedValue(detail({}));
    render(<AdminUserView userId="u-ana" />);

    const ban = await screen.findByRole('button', { name: 'Banear' });
    expect(screen.getByRole('button', { name: 'Suspender' })).toBeInTheDocument();
    ban.click();
    expect(
      await screen.findByRole('dialog', { name: '¿Banear a Ana Quispe?' }),
    ).toBeInTheDocument();
  });
});
