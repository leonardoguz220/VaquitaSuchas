import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { adminUserDetail, adminUserRow } from '@/services/__fixtures__/admin';
import { enableHost, transferGroupOwnership } from '@/services/admin-hosts';
import {
  banAdminUser,
  changeAdminUserRole,
  getAdminUser,
  listAdminUsers,
  reactivateAdminUser,
  revokeAdminBan,
  suspendAdminUser,
} from '@/services/admin-users';
import { ApiError } from '@/services/http';
import AdminUserPage, { metadata } from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/usuarios/u1',
}));
jest.mock('@/services/admin-users', () => ({
  ...jest.requireActual('@/services/admin-users'),
  getAdminUser: jest.fn(),
  suspendAdminUser: jest.fn(),
  reactivateAdminUser: jest.fn(),
  banAdminUser: jest.fn(),
  revokeAdminBan: jest.fn(),
  changeAdminUserRole: jest.fn(),
  listAdminUsers: jest.fn(),
}));
jest.mock('@/services/admin-hosts', () => ({
  ...jest.requireActual('@/services/admin-hosts'),
  enableHost: jest.fn(),
  transferGroupOwnership: jest.fn(),
}));

const mockedGet = jest.mocked(getAdminUser);
const mockedSuspend = jest.mocked(suspendAdminUser);
const mockedReactivate = jest.mocked(reactivateAdminUser);
const mockedBan = jest.mocked(banAdminUser);
const mockedRevoke = jest.mocked(revokeAdminBan);
const mockedRole = jest.mocked(changeAdminUserRole);
const mockedUsers = jest.mocked(listAdminUsers);
const mockedEnable = jest.mocked(enableHost);
const mockedTransfer = jest.mocked(transferGroupOwnership);

const REASON = 'Reclamo abierto por pago sin ingreso, mientras se revisa.';

async function renderPage(id = 'u1') {
  const ui = await AdminUserPage({ params: Promise.resolve({ id }) });
  const user = userEvent.setup();
  render(ui);
  await screen.findByRole('heading', { level: 1 });
  return user;
}

function dialog() {
  return screen.getByRole('dialog');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGet.mockResolvedValue(adminUserDetail());
});

describe('/admin/usuarios/[id] (spec 009 T017)', () => {
  it('RF-009-09: muestra la ficha con datos, grupos, nivel, reportes y habilitación', async () => {
    expect(metadata.title).toBe('Ficha de usuario');
    await renderPage();
    expect(mockedGet).toHaveBeenCalledWith('u1');
    expect(screen.getByRole('heading', { level: 1, name: 'Camila Rojas' })).toBeVisible();
    const data = screen.getByRole('region', { name: 'Datos de la cuenta' });
    expect(data).toHaveTextContent('Correocamila.rojas@example.com');
    expect(data).toHaveTextContent('Celular+591 75550123');
    expect(data).toHaveTextContent('Fecha de registro12 may 2026');
    expect(data).toHaveTextContent('Último ingreso18 oct 2026, 20:30');
    expect(data).toHaveTextContent('Titular de 1 grupo · miembro de 2 grupos');
    expect(within(data).getByText('Nivel: Regular')).toBeVisible();
    expect(data).toHaveTextContent('8 cobros considerados');
    expect(data).toHaveTextContent('Reportes recibidos1');
    expect(data).toHaveTextContent('Sin habilitación manual');
    expect(screen.getByRole('link', { name: 'Volver a usuarios' })).toHaveAttribute(
      'href',
      '/admin/usuarios',
    );
  });

  it('CA-009-36: la cédula se ve enmascarada tal como llega de la API', async () => {
    await renderPage();
    const data = screen.getByRole('region', { name: 'Datos de la cuenta' });
    expect(data).toHaveTextContent('Cédula de identidad*****471');
    expect(screen.getByLabelText('Cédula enmascarada: *****471')).toBeVisible();
  });

  it('CA-009-08: la ficha no muestra contraseñas ni comprobantes', async () => {
    await renderPage();
    expect(document.body).not.toHaveTextContent(/contraseña|comprobante/i);
  });

  it('CA-009-10: suspender sin motivo o con menos de 10 caracteres no se envía', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Suspender' }));
    expect(dialog()).toHaveTextContent('¿Suspender a Camila Rojas?');
    await user.click(within(dialog()).getByRole('button', { name: 'Suspender' }));
    expect(within(dialog()).getByText('Escribe un motivo de 10 a 300 caracteres.')).toBeVisible();
    await user.type(within(dialog()).getByRole('textbox'), '  corto   ');
    await user.click(within(dialog()).getByRole('button', { name: 'Suspender' }));
    expect(mockedSuspend).not.toHaveBeenCalled();
  });

  it('RNF-009-02: suspender pide confirmación con motivo y contador, y muestra el resultado', async () => {
    mockedSuspend.mockResolvedValue(adminUserDetail({ status: 'suspendido' }));
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Suspender' }));
    const textbox = within(dialog()).getByRole('textbox');
    expect(textbox).toHaveAccessibleName('Motivo (de 10 a 300 caracteres)');
    expect(textbox).toHaveAttribute('maxLength', '300');
    expect(dialog()).toHaveTextContent('0 / 300 · Queda en auditoría con tu nombre.');
    await user.type(textbox, REASON);
    expect(dialog()).toHaveTextContent(`${REASON.length} / 300`);
    mockedGet.mockResolvedValue(
      adminUserDetail({
        status: 'suspendido',
        suspension: { reason: REASON, suspendedAt: '2026-10-19T14:00:00.000Z' },
      }),
    );
    await user.click(within(dialog()).getByRole('button', { name: 'Suspender' }));
    expect(mockedSuspend).toHaveBeenCalledWith('u1', { reason: REASON });
    expect(await screen.findByText('Suspendiste a Camila Rojas.')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Cuenta suspendida')).toBeVisible();
    expect(screen.getByText(/Desde el 19 oct 2026, 10:00\. Motivo: Reclamo abierto/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeVisible();
  });

  it('CA-009-13: si la API rechaza suspender a un administrador, el modal lo explica', async () => {
    mockedSuspend.mockRejectedValue(new ApiError(422, 'BUSINESS_RULE', 'x', { rule: 'RN-009-02' }));
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Suspender' }));
    await user.type(within(dialog()).getByRole('textbox'), REASON);
    await user.click(within(dialog()).getByRole('button', { name: 'Suspender' }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'No puedes aplicar esta acción a ti mismo ni a otro administrador.',
    );
  });

  it('CA-009-10: un 400 del servidor se muestra junto al motivo', async () => {
    mockedSuspend.mockRejectedValue(new ApiError(400, 'VALIDATION_ERROR', 'x'));
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Suspender' }));
    await user.type(within(dialog()).getByRole('textbox'), REASON);
    await user.click(within(dialog()).getByRole('button', { name: 'Suspender' }));
    expect(
      await within(dialog()).findByText('Escribe un motivo de 10 a 300 caracteres.'),
    ).toBeVisible();
    expect(within(dialog()).getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('CA-009-11: reactivar a un suspendido admite el motivo opcional', async () => {
    mockedGet.mockResolvedValue(adminUserDetail({ status: 'suspendido' }));
    mockedReactivate.mockResolvedValue(adminUserDetail());
    const user = await renderPage();
    expect(screen.queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reactivar' }));
    expect(within(dialog()).getByRole('textbox')).toHaveAccessibleName(
      'Motivo (opcional, de 10 a 300 caracteres)',
    );
    await user.click(within(dialog()).getByRole('button', { name: 'Reactivar' }));
    expect(mockedReactivate).toHaveBeenCalledWith('u1', {});
    expect(await screen.findByText('Reactivaste a Camila Rojas.')).toBeVisible();
  });

  it('CA-009-24: con un baneo no se ofrece reactivar; si la API responde USER_BANNED se explica y recarga', async () => {
    mockedGet.mockResolvedValue(adminUserDetail({ status: 'suspendido' }));
    mockedReactivate.mockRejectedValue(
      new ApiError(422, 'BUSINESS_RULE', 'x', { rule: 'RF-009-19' }),
    );
    const user = await renderPage();
    mockedGet.mockResolvedValue(
      adminUserDetail({
        status: 'baneado',
        ban: {
          id: 'b1',
          reason: 'Estafa comprobada en un reclamo',
          bannedAt: '2026-10-18T14:00:00.000Z',
        },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Reactivar' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Reactivar' }));
    expect(
      await screen.findByText(/La cuenta está baneada: reactivar no deshace un baneo/),
    ).toBeVisible();
    expect(await screen.findByText('Cuenta baneada')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reactivar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revertir baneo' })).toBeVisible();
  });

  it('CA-009-23: banear exige motivo; con motivo envía y avisa de los efectos', async () => {
    mockedBan.mockResolvedValue({ banId: 'b1', user: adminUserDetail({ status: 'baneado' }) });
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Banear' }));
    expect(dialog()).toHaveTextContent(
      'se bloquean su correo, su celular, su cédula y su cuenta de Telegram',
    );
    await user.click(within(dialog()).getByRole('button', { name: 'Banear' }));
    expect(mockedBan).not.toHaveBeenCalled();
    await user.type(within(dialog()).getByRole('textbox'), REASON);
    await user.click(within(dialog()).getByRole('button', { name: 'Banear' }));
    expect(mockedBan).toHaveBeenCalledWith('u1', { reason: REASON });
    expect(await screen.findByText('Baneaste a Camila Rojas.')).toBeVisible();
  });

  it('CA-009-34: revertir el baneo usa el id del baneo; si lo intenta quien baneó se explica', async () => {
    mockedGet.mockResolvedValue(
      adminUserDetail({
        status: 'baneado',
        ban: {
          id: 'b1',
          reason: 'Estafa comprobada en un reclamo',
          bannedAt: '2026-10-18T14:00:00.000Z',
        },
      }),
    );
    mockedRevoke.mockRejectedValueOnce(new ApiError(422, 'SAME_ADMIN', 'x'));
    const user = await renderPage();
    expect(screen.getByText(/Motivo: Estafa comprobada en un reclamo/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Banear' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revertir baneo' }));
    await user.type(within(dialog()).getByRole('textbox'), 'Revisión del caso con pruebas nuevas');
    await user.click(within(dialog()).getByRole('button', { name: 'Revertir baneo' }));
    expect(mockedRevoke).toHaveBeenCalledWith('b1', {
      reason: 'Revisión del caso con pruebas nuevas',
    });
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Quien baneó no puede revertir el baneo.',
    );
    mockedRevoke.mockResolvedValueOnce({});
    mockedGet.mockResolvedValue(adminUserDetail());
    await user.click(within(dialog()).getByRole('button', { name: 'Revertir baneo' }));
    expect(await screen.findByText('Revertiste el baneo de Camila Rojas.')).toBeVisible();
  });

  it('RF-009-03: promover a administrador envía el rol con el motivo', async () => {
    mockedRole.mockResolvedValue({});
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Promover a administrador' }));
    await user.type(within(dialog()).getByRole('textbox'), 'Se suma al equipo de soporte');
    await user.click(within(dialog()).getByRole('button', { name: 'Promover' }));
    expect(mockedRole).toHaveBeenCalledWith('u1', {
      role: 'admin',
      reason: 'Se suma al equipo de soporte',
    });
    expect(await screen.findByText('Camila Rojas ahora es administrador.')).toBeVisible();
  });

  it('CA-009-12: a un administrador solo se le ofrece quitar el rol y LAST_ADMIN se explica', async () => {
    mockedGet.mockResolvedValue(adminUserDetail({ role: 'admin' }));
    mockedRole.mockRejectedValue(new ApiError(422, 'BUSINESS_RULE', 'x', { rule: 'RN-009-01' }));
    const user = await renderPage();
    expect(
      screen.getByText('Para suspender o banear a un administrador, primero quítale el rol.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quitar rol de administrador' }));
    await user.type(within(dialog()).getByRole('textbox'), 'Deja el equipo del proyecto');
    await user.click(within(dialog()).getByRole('button', { name: 'Quitar rol' }));
    expect(mockedRole).toHaveBeenCalledWith('u1', {
      role: 'usuario',
      reason: 'Deja el equipo del proyecto',
    });
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Debe existir al menos un administrador.',
    );
  });

  it('RNF-009-02: «Cancelar» cierra el modal sin enviar nada', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Banear' }));
    await user.type(within(dialog()).getByRole('textbox'), REASON);
    await user.click(within(dialog()).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedBan).not.toHaveBeenCalled();
  });

  it('RF-009-19: el motivo del baneo se muestra como texto, nunca como HTML', async () => {
    mockedGet.mockResolvedValue(
      adminUserDetail({
        status: 'baneado',
        ban: { id: 'b1', reason: '<b>Estafa</b> confirmada', bannedAt: '2026-10-18T14:00:00.000Z' },
      }),
    );
    await renderPage();
    expect(screen.getByText(/<b>Estafa<\/b> confirmada/)).toBeVisible();
    expect(document.querySelector('b')).toBeNull();
  });

  it('RF-009-09: muestra «cargando», el 404 y el 403 de la API', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'x'));
    const ui = await AdminUserPage({ params: Promise.resolve({ id: 'zz' }) });
    const { unmount } = render(ui);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando la ficha…');
    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos a este usuario.');
    unmount();
    mockedGet.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'x'));
    render(await AdminUserPage({ params: Promise.resolve({ id: 'u1' }) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tienes acceso al panel de administración.',
    );
  });

  it('CA-009-28: «Habilitar como titular» desde la ficha envía la habilitación con motivo', async () => {
    mockedEnable.mockResolvedValue({});
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Habilitar como titular' }));
    await user.type(within(dialog()).getByRole('textbox'), 'Titular conocido del equipo');
    mockedGet.mockResolvedValue(
      adminUserDetail({
        hostEnablement: {
          reason: 'Titular conocido del equipo',
          enabledAt: '2026-10-19T14:00:00.000Z',
        },
      }),
    );
    await user.click(within(dialog()).getByRole('button', { name: 'Habilitar' }));
    expect(mockedEnable).toHaveBeenCalledWith('u1', { reason: 'Titular conocido del equipo' });
    expect(await screen.findByText('Habilitaste a Camila Rojas como titular.')).toBeVisible();
    expect(
      await screen.findByText(/Habilitado por un administrador desde el 19 oct 2026/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Quitar habilitación de titular' })).toBeVisible();
  });

  it('RF-009-24: «Transferir titularidad» solo aparece con el titular suspendido', async () => {
    await renderPage();
    expect(
      screen.queryByRole('button', { name: 'Transferir titularidad' }),
    ).not.toBeInTheDocument();
  });

  it('CA-009-35: transferir pide grupo, nuevo titular y motivo, y envía la transferencia', async () => {
    mockedGet.mockResolvedValue(adminUserDetail({ status: 'suspendido' }));
    mockedUsers.mockResolvedValue({
      items: [adminUserRow({ id: 'u9', fullName: 'Ana Quispe', email: 'ana@example.com' })],
      nextCursor: null,
    });
    mockedTransfer.mockRejectedValueOnce(
      new ApiError(422, 'BUSINESS_RULE', 'x', { rule: 'RF-001-21' }),
    );
    mockedTransfer.mockResolvedValueOnce({});
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Transferir titularidad' }));
    expect(dialog()).toHaveTextContent('Solo se puede mientras el titular está suspendido');
    await user.type(within(dialog()).getByRole('textbox', { name: /^Motivo/ }), REASON);
    await user.click(within(dialog()).getByRole('button', { name: 'Transferir' }));
    expect(within(dialog()).getByRole('alert')).toHaveTextContent(
      'Escribe el identificador del grupo.',
    );
    await user.type(within(dialog()).getByLabelText('Identificador del grupo'), ' g1 ');
    await user.click(within(dialog()).getByRole('button', { name: 'Transferir' }));
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Elige al nuevo titular.');
    await user.type(
      within(dialog()).getByLabelText('Buscar al nuevo titular por nombre o correo'),
      'ana{Enter}',
    );
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.click(await within(dialog()).findByRole('radio', { name: /Ana Quispe/ }));
    await user.click(within(dialog()).getByRole('button', { name: 'Transferir' }));
    expect(mockedTransfer).toHaveBeenCalledWith('g1', { toUserId: 'u9', reason: REASON });
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'La persona elegida no está habilitada como titular.',
    );
    await user.click(within(dialog()).getByRole('button', { name: 'Transferir' }));
    expect(await screen.findByText('Transferiste la titularidad del grupo.')).toBeVisible();
  });

  it('CA-009-35: un grupo inexistente se explica sin cerrar el modal', async () => {
    mockedGet.mockResolvedValue(adminUserDetail({ status: 'suspendido' }));
    mockedUsers.mockResolvedValue({ items: [adminUserRow({ id: 'u9' })], nextCursor: null });
    mockedTransfer.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Transferir titularidad' }));
    await user.type(within(dialog()).getByLabelText('Identificador del grupo'), 'zz');
    await user.type(
      within(dialog()).getByLabelText('Buscar al nuevo titular por nombre o correo'),
      'camila',
    );
    await user.click(within(dialog()).getByRole('button', { name: 'Buscar persona' }));
    await user.click(await within(dialog()).findByRole('radio', { name: /Camila Rojas/ }));
    await user.type(within(dialog()).getByRole('textbox', { name: /^Motivo/ }), REASON);
    await user.click(within(dialog()).getByRole('button', { name: 'Transferir' }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'No encontramos ese grupo. Revisa el identificador.',
    );
  });
});
