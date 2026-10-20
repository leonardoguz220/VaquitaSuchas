import { render, screen, within } from '@testing-library/react';
import { listAdminUsers, type AdminUserRow } from '@/services/admin';
import { AdminUsersView } from './admin-users-view';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/usuarios',
}));

jest.mock('@/services/admin', () => ({
  listAdminUsers: jest.fn(),
}));

const listMock = listAdminUsers as jest.MockedFunction<typeof listAdminUsers>;

const rows: AdminUserRow[] = [
  {
    id: 'u-kevin',
    fullName: 'Kevin Rojas',
    phone: '+59175550123',
    role: 'usuario',
    status: 'activo',
    createdAt: '2026-05-02T12:00:00Z',
  },
  {
    id: 'u-raul',
    fullName: 'Raúl Flores',
    phone: '+59177001122',
    role: 'usuario',
    status: 'baneado',
    createdAt: '2026-07-01T12:00:00Z',
  },
];

describe('AdminUsersView (spec 009 T017)', () => {
  beforeEach(() => {
    listMock.mockReset();
  });

  it('CA-009-07: muestra cada usuario con el estado en texto y el rol, no solo con color', async () => {
    listMock.mockResolvedValue({ items: rows, nextCursor: null });
    render(<AdminUsersView />);

    const list = await screen.findByRole('list', { name: 'Lista de usuarios' });
    const cards = within(list).getAllByRole('link');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText('✓ Activo')).toBeInTheDocument();
    expect(within(cards[1]!).getByText('⛔ Baneado')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Usuario')).toBeInTheDocument();
    expect(cards[0]).toHaveAttribute('href', '/admin/usuarios/u-kevin');
  });

  it('CA-009-07: sin resultados muestra un mensaje de lista vacía', async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });
    render(<AdminUsersView />);

    expect(
      await screen.findByText('Ninguna persona coincide con esa búsqueda.'),
    ).toBeInTheDocument();
  });

  it('CA-009-07: al fallar la carga ofrece Reintentar', async () => {
    listMock.mockRejectedValue(new Error('red caída'));
    render(<AdminUsersView />);

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('CA-009-07: los filtros de estado y rol piden la lista al servicio', async () => {
    listMock.mockResolvedValue({ items: rows, nextCursor: null });
    render(<AdminUsersView />);
    await screen.findByRole('list', { name: 'Lista de usuarios' });

    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    expect(screen.getByRole('combobox', { name: 'Estado' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Rol' })).toBeInTheDocument();
  });
});
