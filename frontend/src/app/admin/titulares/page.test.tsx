import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN_HOSTS_PATH, isAdminPath } from '@/lib/routes';
import { adminUserRow, hostEnablementRow } from '@/services/__fixtures__/admin';
import { enableHost, listHostEnablements, revokeHostEnablement } from '@/services/admin-hosts';
import { listAdminUsers } from '@/services/admin-users';
import { ApiError } from '@/services/http';
import AdminHostsPage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/titulares',
}));
jest.mock('@/services/admin-hosts', () => ({
  ...jest.requireActual('@/services/admin-hosts'),
  listHostEnablements: jest.fn(),
  enableHost: jest.fn(),
  revokeHostEnablement: jest.fn(),
}));
jest.mock('@/services/admin-users', () => ({
  ...jest.requireActual('@/services/admin-users'),
  listAdminUsers: jest.fn(),
}));

const mockedList = jest.mocked(listHostEnablements);
const mockedEnable = jest.mocked(enableHost);
const mockedRevoke = jest.mocked(revokeHostEnablement);
const mockedUsers = jest.mocked(listAdminUsers);

const REASON = 'Titular de prueba para la demo; administra Prime Video.';

function renderPage() {
  const user = userEvent.setup();
  render(<AdminHostsPage />);
  return user;
}

function dialog() {
  return screen.getByRole('dialog');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedList.mockResolvedValue({ items: [hostEnablementRow()], nextCursor: null });
  mockedUsers.mockResolvedValue({
    items: [adminUserRow({ id: 'u7', fullName: 'Kevin Rojas', email: 'kevin@example.com' })],
    nextCursor: null,
  });
  mockedEnable.mockResolvedValue({});
  mockedRevoke.mockResolvedValue({});
});

describe('/admin/titulares (spec 009 T021)', () => {
  it('RF-009-21: la ruta es de administración y muestra las habilitaciones vigentes', async () => {
    expect(metadata.title).toBe('Titulares');
    expect(ADMIN_HOSTS_PATH).toBe('/admin/titulares');
    expect(isAdminPath(ADMIN_HOSTS_PATH)).toBe(true);
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Habilitación de titulares' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Titulares' })).toHaveAttribute('aria-current', 'page');
    const list = await screen.findByRole('list', { name: 'Habilitaciones vigentes' });
    const item = within(list).getByRole('article');
    expect(within(item).getByRole('link', { name: 'Rodrigo Salazar' })).toHaveAttribute(
      'href',
      '/admin/usuarios/u5',
    );
    expect(item).toHaveTextContent('Motivo: Primer titular del grupo de prueba');
    expect(item).toHaveTextContent('Por Leonardo Guzman · desde el 10 ene 2026');
    expect(mockedList).toHaveBeenCalledWith({ limit: 20 });
  });

  it('CA-009-28: habilitar a un usuario lo busca, pide motivo y lo envía', async () => {
    const user = renderPage();
    await screen.findByRole('list', { name: 'Habilitaciones vigentes' });
    expect(screen.getByRole('button', { name: 'Habilitar' })).toBeDisabled();
    await user.type(screen.getByLabelText('Buscar usuario por nombre o correo'), 'kevin{Enter}');
    expect(mockedUsers).toHaveBeenCalledWith({ q: 'kevin', limit: 5 });
    await user.click(await screen.findByRole('radio', { name: /Kevin Rojas/ }));
    await user.click(screen.getByRole('button', { name: 'Habilitar a Kevin Rojas' }));
    expect(dialog()).toHaveTextContent('¿Habilitar a Kevin Rojas como titular?');
    expect(dialog()).toHaveTextContent('aunque su calificación sea menor al umbral');
    await user.click(within(dialog()).getByRole('button', { name: 'Habilitar' }));
    expect(mockedEnable).not.toHaveBeenCalled();
    await user.type(within(dialog()).getByRole('textbox'), REASON);
    await user.click(within(dialog()).getByRole('button', { name: 'Habilitar' }));
    expect(mockedEnable).toHaveBeenCalledWith('u7', { reason: REASON });
    expect(await screen.findByText('Habilitaste a Kevin Rojas como titular.')).toBeVisible();
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Habilitar' })).toBeDisabled();
  });

  it('RF-009-21: quitar una habilitación pide confirmación con motivo', async () => {
    const user = renderPage();
    await screen.findByRole('list', { name: 'Habilitaciones vigentes' });
    await user.click(
      screen.getByRole('button', { name: 'Quitar la habilitación de Rodrigo Salazar' }),
    );
    expect(dialog()).toHaveTextContent('¿Quitar la habilitación de Rodrigo Salazar?');
    await user.type(within(dialog()).getByRole('textbox'), 'Ya alcanzó la calificación necesaria');
    mockedList.mockResolvedValue({ items: [], nextCursor: null });
    await user.click(within(dialog()).getByRole('button', { name: 'Quitar habilitación' }));
    expect(mockedRevoke).toHaveBeenCalledWith('u5', {
      reason: 'Ya alcanzó la calificación necesaria',
    });
    expect(await screen.findByText('Quitaste la habilitación de Rodrigo Salazar.')).toBeVisible();
    expect(await screen.findByText(/No hay habilitaciones manuales vigentes/)).toBeVisible();
  });

  it('RF-009-21: la búsqueda sin resultados lo dice', async () => {
    mockedUsers.mockResolvedValue({ items: [], nextCursor: null });
    const user = renderPage();
    await user.type(screen.getByLabelText('Buscar usuario por nombre o correo'), 'zzz');
    await user.click(screen.getByRole('button', { name: 'Buscar persona' }));
    expect(await screen.findByText('No encontramos a nadie con «zzz».')).toBeVisible();
  });

  it('RF-009-21: carga, vacío, error con reintento y 403', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'));
    const user = renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando habilitaciones…');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar las habilitaciones.',
    );
    mockedList.mockResolvedValueOnce({ items: [], nextCursor: null });
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/No hay habilitaciones manuales vigentes/)).toBeVisible();
  });

  it('CA-009-01: un 403 de la API se explica con un mensaje claro', async () => {
    mockedList.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tienes acceso al panel de administración.',
    );
  });
});
