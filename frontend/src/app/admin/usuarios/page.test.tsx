import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isAdminPath, isPublicPath } from '@/lib/routes';
import { adminUserRow } from '@/services/__fixtures__/admin';
import { listAdminUsers } from '@/services/admin-users';
import { ApiError } from '@/services/http';
import AdminUsersPage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/usuarios',
}));
jest.mock('@/services/admin-users', () => ({
  ...jest.requireActual('@/services/admin-users'),
  listAdminUsers: jest.fn(),
}));

const mocked = jest.mocked(listAdminUsers);

const camila = adminUserRow();
const patricia = adminUserRow({
  id: 'u2',
  fullName: 'Patricia Mendoza',
  email: 'patricia@example.com',
  phone: '+59170998877',
  status: 'suspendido',
  createdAt: '2026-09-03T14:00:00.000Z',
});
const leonardo = adminUserRow({
  id: 'u3',
  fullName: 'Leonardo Guzman',
  email: 'leo@example.com',
  role: 'admin',
});

function renderPage() {
  const user = userEvent.setup();
  render(<AdminUsersPage />);
  return user;
}

beforeEach(() => {
  mocked.mockReset();
  mocked.mockResolvedValue({ items: [camila, patricia, leonardo], nextCursor: null });
});

describe('/admin/usuarios (spec 009 T017)', () => {
  it('RF-009-08: la ruta es de administración, el título es «Usuarios» y pide la primera página', async () => {
    expect(metadata.title).toBe('Usuarios');
    expect(isPublicPath('/admin/usuarios')).toBe(false);
    expect(isAdminPath('/admin/usuarios')).toBe(true);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Administración' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('aria-current', 'page');
    await screen.findByRole('list', { name: 'Usuarios' });
    expect(mocked).toHaveBeenCalledWith({ limit: 20 });
  });

  it('RF-009-08: cada persona muestra nombre con enlace a su ficha, correo, celular, alta, rol y estado en texto', async () => {
    renderPage();
    const list = await screen.findByRole('list', { name: 'Usuarios' });
    const [first, second, third] = within(list).getAllByRole('article');
    expect(within(first).getByRole('link', { name: 'Camila Rojas' })).toHaveAttribute(
      'href',
      '/admin/usuarios/u1',
    );
    expect(first).toHaveTextContent('camila.rojas@example.com');
    expect(first).toHaveTextContent('Celular:+591 75550123');
    expect(first).toHaveTextContent('Alta:12 may 2026');
    expect(within(first).getByText('Usuario')).toBeVisible();
    expect(within(first).getByText('Activo')).toBeVisible();
    expect(within(second).getByText('Suspendido')).toBeVisible();
    expect(within(third).getByText('Administrador')).toBeVisible();
  });

  it('CA-009-07: buscar «camila» manda la búsqueda a la API', async () => {
    const user = renderPage();
    await screen.findByRole('list', { name: 'Usuarios' });
    await user.type(screen.getByLabelText('Buscar por nombre o correo'), '  camila ');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(mocked).toHaveBeenLastCalledWith({ q: 'camila', limit: 20 }));
  });

  it('RF-009-08: los filtros de estado y rol se piden a la API', async () => {
    const user = renderPage();
    await screen.findByRole('list', { name: 'Usuarios' });
    await user.selectOptions(screen.getByLabelText('Estado'), 'baneado');
    await waitFor(() => expect(mocked).toHaveBeenLastCalledWith({ status: 'baneado', limit: 20 }));
    await user.selectOptions(screen.getByLabelText('Rol'), 'admin');
    await waitFor(() =>
      expect(mocked).toHaveBeenLastCalledWith({ status: 'baneado', role: 'admin', limit: 20 }),
    );
  });

  it('RF-009-08: búsqueda sin resultados muestra un mensaje claro y permite quitar filtros', async () => {
    const user = renderPage();
    await screen.findByRole('list', { name: 'Usuarios' });
    mocked.mockResolvedValue({ items: [], nextCursor: null });
    await user.type(screen.getByLabelText('Buscar por nombre o correo'), 'zzz');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('No encontramos usuarios con «zzz».')).toBeVisible();
    mocked.mockResolvedValue({ items: [camila], nextCursor: null });
    await user.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    await screen.findByRole('list', { name: 'Usuarios' });
    expect(mocked).toHaveBeenLastCalledWith({ limit: 20 });
    expect(screen.getByLabelText('Buscar por nombre o correo')).toHaveValue('');
  });

  it('RF-009-08: muestra «cargando» y pagina con «Cargar más»', async () => {
    mocked.mockResolvedValueOnce({ items: [camila], nextCursor: 'c2' });
    const user = renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando usuarios…');
    await screen.findByRole('list', { name: 'Usuarios' });
    mocked.mockResolvedValueOnce({ items: [patricia], nextCursor: null });
    await user.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByRole('link', { name: 'Patricia Mendoza' })).toBeVisible();
    expect(mocked).toHaveBeenLastCalledWith({ limit: 20, cursor: 'c2' });
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('RF-009-08: un error de conexión se muestra con «Reintentar»', async () => {
    mocked.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    const user = renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar los usuarios.No se pudo contactar con el servidor.',
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('list', { name: 'Usuarios' });
  });

  it('CA-009-01: un 403 de la API explica que la cuenta no es administradora y lleva a su panel', async () => {
    mocked.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No tienes acceso al panel de administración.');
    expect(alert).toHaveTextContent('Tu cuenta no tiene permiso de administrador.');
    expect(within(alert).getByRole('link', { name: 'Ir a mi panel' })).toHaveAttribute(
      'href',
      '/panel',
    );
  });
});
