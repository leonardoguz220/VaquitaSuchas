import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN_AUDIT_PATH, isAdminPath } from '@/lib/routes';
import { adminUserRow, auditEntry } from '@/services/__fixtures__/admin';
import { listAuditLog } from '@/services/admin-audit';
import { listAdminUsers } from '@/services/admin-users';
import { ApiError } from '@/services/http';
import AdminAuditPage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/auditoria',
}));
jest.mock('@/services/admin-audit', () => ({
  ...jest.requireActual('@/services/admin-audit'),
  listAuditLog: jest.fn(),
}));
jest.mock('@/services/admin-users', () => ({
  ...jest.requireActual('@/services/admin-users'),
  listAdminUsers: jest.fn(),
}));

const mocked = jest.mocked(listAuditLog);
const mockedUsers = jest.mocked(listAdminUsers);

const evidence = auditEntry({
  id: 'al2',
  admin: { id: 'a2', fullName: 'Camila Fuentes' },
  action: 'reclamo_abrir_evidencia',
  targetType: 'join_dispute',
  targetId: 'd1',
  targetLabel: 'Crunchyroll anime',
  reason: null,
  occurredAt: '2026-10-18T14:04:00.000Z',
});

function renderPage() {
  const user = userEvent.setup();
  render(<AdminAuditPage />);
  return user;
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.mockResolvedValue({ items: [evidence, auditEntry()], nextCursor: null });
  mockedUsers.mockResolvedValue({
    items: [adminUserRow({ id: 'a1', fullName: 'Leonardo Guzman', role: 'admin' })],
    nextCursor: null,
  });
});

describe('/admin/auditoria (spec 009 T024)', () => {
  it('CA-009-18: cada acción muestra fecha en La Paz, autor, acción, objetivo y motivo', async () => {
    expect(metadata.title).toBe('Auditoría');
    expect(isAdminPath(ADMIN_AUDIT_PATH)).toBe(true);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Auditoría' })).toBeVisible();
    const table = await screen.findByRole('table', { name: 'Acciones de administración' });
    expect(mocked).toHaveBeenCalledWith({ limit: 50 });
    const [, first, second] = within(table).getAllByRole('row');
    expect(first).toHaveTextContent('18 oct 2026, 10:04');
    expect(first).toHaveTextContent('Camila Fuentes');
    expect(first).toHaveTextContent('Evidencia abierta');
    expect(first).toHaveTextContent('Reclamo · Crunchyroll anime');
    expect(first).toHaveTextContent('—');
    expect(second).toHaveTextContent('17 oct 2026, 18:30');
    expect(second).toHaveTextContent('Usuario suspendido');
    expect(
      within(second).getByRole('link', { name: 'Usuario · Patricia Mendoza' }),
    ).toHaveAttribute('href', '/admin/usuarios/u2');
    expect(second).toHaveTextContent('Comprobantes repetidos en dos grupos');
  });

  it('CA-009-19: el log es de solo anexado y no ofrece editar ni borrar', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Acciones de administración' });
    expect(screen.getByText('Registro de solo anexado: no se edita ni se borra.')).toBeVisible();
    expect(within(table).queryAllByRole('button')).toHaveLength(0);
    expect(
      screen.queryByRole('button', { name: /editar|borrar|eliminar/i }),
    ).not.toBeInTheDocument();
  });

  it('RF-009-18: filtra por acción, administrador, objetivo y fechas en la API', async () => {
    const user = renderPage();
    await screen.findByRole('table', { name: 'Acciones de administración' });
    await user.selectOptions(screen.getByLabelText('Acción'), 'usuario_banear');
    await waitFor(() =>
      expect(mocked).toHaveBeenLastCalledWith({ action: 'usuario_banear', limit: 50 }),
    );
    await screen.findByRole('option', { name: 'Leonardo Guzman' });
    expect(mockedUsers).toHaveBeenCalledWith({ role: 'admin', limit: 50 });
    await user.selectOptions(screen.getByLabelText('Administrador'), 'a1');
    await user.selectOptions(screen.getByLabelText('Sobre'), 'user');
    await user.type(screen.getByLabelText('Desde'), '2026-10-01');
    await user.type(screen.getByLabelText('Hasta'), '2026-10-19');
    await waitFor(() =>
      expect(mocked).toHaveBeenLastCalledWith({
        adminId: 'a1',
        action: 'usuario_banear',
        targetType: 'user',
        from: '2026-10-01',
        to: '2026-10-19',
        limit: 50,
      }),
    );
  });

  it('RF-009-18: pagina con «Cargar más»', async () => {
    mocked.mockResolvedValueOnce({ items: [evidence], nextCursor: 'c2' });
    const user = renderPage();
    await screen.findByRole('table', { name: 'Acciones de administración' });
    mocked.mockResolvedValueOnce({ items: [auditEntry()], nextCursor: null });
    await user.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByRole('cell', { name: 'Usuario suspendido' })).toBeVisible();
    expect(mocked).toHaveBeenLastCalledWith({ limit: 50, cursor: 'c2' });
  });

  it('RF-009-18: cargando, vacío con filtros y error con 403', async () => {
    mocked.mockResolvedValue({ items: [], nextCursor: null });
    const user = renderPage();
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('Cargando auditoría…');
    expect(await screen.findByText('Todavía no hay acciones registradas.')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Acción'), 'rol_quitar');
    expect(await screen.findByText('No hay acciones con esos filtros.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    await waitFor(() => expect(mocked).toHaveBeenLastCalledWith({ limit: 50 }));
  });

  it('CA-009-01: un 403 de la API se explica', async () => {
    mocked.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tienes acceso al panel de administración.',
    );
  });
});
