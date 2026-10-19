import { render, screen } from '@testing-library/react';
import type { MeState } from '@/hooks/use-me';
import type { UserSelf } from '@/services/auth';
import { AdminGate } from './admin-gate';

const useMe = jest.fn<MeState & { reload: () => void }, []>();

jest.mock('@/hooks/use-me', () => ({
  useMe: () => useMe(),
}));

function userWithRole(role: UserSelf['role']): UserSelf {
  return {
    id: 'u-1',
    fullName: 'Persona de prueba',
    email: 'prueba@ejemplo.bo',
    ciMasked: '*****123',
    phone: '+59170000000',
    role,
    status: 'activo',
    lastLoginAt: null,
    createdAt: '2026-01-01T12:00:00Z',
  } as UserSelf;
}

describe('AdminGate (spec 009)', () => {
  it('CA-009-01: un usuario normal ve el aviso de 403 y no el contenido de administración', () => {
    useMe.mockReturnValue({
      status: 'success',
      user: userWithRole('usuario'),
      error: null,
      reload: jest.fn(),
    });
    render(<AdminGate>Contenido secreto</AdminGate>);

    expect(screen.getByText(/Error 403/)).toBeInTheDocument();
    expect(screen.queryByText('Contenido secreto')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a mi panel' })).toHaveAttribute('href', '/panel');
  });

  it('CA-009-01: un administrador ve el contenido del panel', () => {
    useMe.mockReturnValue({
      status: 'success',
      user: userWithRole('admin'),
      error: null,
      reload: jest.fn(),
    });
    render(<AdminGate>Contenido del panel</AdminGate>);

    expect(screen.getByText('Contenido del panel')).toBeInTheDocument();
  });

  it('CA-009-01: mientras se comprueba el rol no muestra nada de administración', () => {
    useMe.mockReturnValue({ status: 'loading', user: null, error: null, reload: jest.fn() });
    render(<AdminGate>Contenido secreto</AdminGate>);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando el panel');
    expect(screen.queryByText('Contenido secreto')).not.toBeInTheDocument();
  });
});
