import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatDateTimeLaPaz } from '@/lib/dates';
import { listAuditLog, type AuditEntry, type AuditLogPage } from '@/services/admin-audit';
import { ApiError } from '@/services/http';
import { AdminAuditView } from './admin-audit-view';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/auditoria',
}));

jest.mock('@/services/admin-audit', () => ({
  ...jest.requireActual('@/services/admin-audit'),
  listAuditLog: jest.fn(),
}));

const list = listAuditLog as jest.MockedFunction<typeof listAuditLog>;

const ban: AuditEntry = {
  id: 'aud-1',
  adminName: 'Administradora Demo',
  action: 'usuario_banear',
  targetType: 'user',
  targetId: 'obj-100',
  reason: 'Cobros falsos reportados por tres grupos.',
  occurredAt: '2026-10-19T14:00:00.000Z',
};

const evidence: AuditEntry = {
  id: 'aud-2',
  adminName: 'Administrador Demo',
  action: 'reclamo_abrir_evidencia',
  targetType: 'join_dispute',
  targetId: null,
  reason: null,
  occurredAt: '2026-10-19T08:00:00.000Z',
};

function page(items: AuditEntry[], nextCursor: string | null = null): AuditLogPage {
  return { items, nextCursor };
}

beforeEach(() => {
  list.mockReset();
  list.mockResolvedValue(page([ban, evidence]));
});

describe('AdminAuditView (spec 009 T024, RF-009-18)', () => {
  it('CA-009-18: la tabla muestra autor, acción, fecha en La Paz, objeto y motivo', async () => {
    render(<AdminAuditView />);

    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row')[1];
    expect(within(row).getByText('Administradora Demo')).toBeVisible();
    expect(within(row).getByText('Banear usuario')).toBeVisible();
    expect(within(row).getByText(formatDateTimeLaPaz(ban.occurredAt))).toBeVisible();
    expect(within(row).getByText('Usuario')).toBeVisible();
    expect(within(row).getByText('Cobros falsos reportados por tres grupos.')).toBeVisible();
  });

  it('CA-009-18: una acción sin motivo lo dice', async () => {
    render(<AdminAuditView />);
    await screen.findByRole('table');
    expect(screen.getByText('Sin motivo')).toBeVisible();
  });

  it('CA-009-19: no hay controles para editar ni borrar el registro', async () => {
    render(<AdminAuditView />);
    await screen.findByRole('table');
    expect(screen.getByText(/no se puede editar ni borrar/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /editar|borrar|eliminar/i }),
    ).not.toBeInTheDocument();
  });

  it('RF-009-18: elegir una acción pide el registro filtrado', async () => {
    const user = userEvent.setup();
    render(<AdminAuditView />);
    await screen.findByRole('table');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Acción' }), 'usuario_banear');
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'usuario_banear' }));
  });

  it('RF-009-18: el rango de fechas se envía como AAAA-MM-DD', async () => {
    render(<AdminAuditView />);
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-10-01' }));
  });

  it('RF-009-18: «Siguiente» pide la página con el cursor y «Anterior» vuelve a la primera', async () => {
    const user = userEvent.setup();
    list.mockResolvedValueOnce(page([ban], 'c1'));
    render(<AdminAuditView />);
    await screen.findByRole('table');

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c1' }));
    expect(await screen.findByText('Página 2')).toBeVisible();

    list.mockResolvedValueOnce(page([ban, evidence]));
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(await screen.findByText('Página 1')).toBeVisible();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: undefined }));
  });

  it('RF-009-18: cambiar un filtro vuelve a la primera página', async () => {
    const user = userEvent.setup();
    list.mockResolvedValueOnce(page([ban], 'c1'));
    render(<AdminAuditView />);
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Página 2')).toBeVisible();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sobre' }), 'user');
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ targetType: 'user', cursor: undefined }),
    );
    expect(await screen.findByText('Página 1')).toBeVisible();
  });

  it('RF-009-18: sin resultados lo dice con los filtros puestos', async () => {
    list.mockResolvedValueOnce(page([]));
    render(<AdminAuditView />);
    expect(await screen.findByText('No hay acciones con esos filtros.')).toBeVisible();
  });

  it('RNF-009-02: si falla la carga muestra el aviso y Reintentar vuelve a pedir', async () => {
    const user = userEvent.setup();
    list.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'Fallo del servidor.'));
    render(<AdminAuditView />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo del servidor.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeVisible();
  });
});
