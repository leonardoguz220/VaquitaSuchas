import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import { ApiError } from '@/services/http';
import {
  getNotificationPreferences,
  reactivateTelegram,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '@/services/notifications';
import NotificationSettingsPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/ajustes/avisos',
}));

const mockedGet = jest.mocked(getNotificationPreferences);
const mockedPut = jest.mocked(updateNotificationPreferences);
const mockedReactivate = jest.mocked(reactivateTelegram);

function preferences(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    email: { recordatorios: true, resoluciones: true, titular: false, grupo: true },
    telegram: {
      recordatorios: true,
      resoluciones: false,
      titular: true,
      grupo: true,
      blocked: false,
    },
    emailProblem: false,
    securityEmailsAlwaysOn: true,
    ...overrides,
  };
}

function renderPage() {
  const user = userEvent.setup();
  render(<NotificationSettingsPage />);
  return user;
}

const sw = (name: string) => screen.getByRole('switch', { name });

beforeEach(() => {
  replace.mockReset();
  mockedGet.mockReset();
  mockedPut.mockReset();
  mockedReactivate.mockReset();
});

describe('/ajustes/avisos (spec 005 T023)', () => {
  it('RF-005-17: el título es "Ajustes de avisos", la ruta es protegida y pide las preferencias', async () => {
    mockedGet.mockResolvedValue(preferences());
    expect(metadata.title).toBe('Ajustes de avisos');
    expect(isPublicPath('/ajustes/avisos')).toBe(false);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Ajustes de avisos' })).toBeVisible();
    expect(await screen.findByRole('list', { name: 'Tipos de aviso' })).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('RF-005-17: mientras carga muestra el esqueleto y un error ofrece Reintentar', async () => {
    mockedGet
      .mockReturnValueOnce(new Promise(() => {}))
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
      .mockResolvedValue(preferences());
    const { unmount } = render(<NotificationSettingsPage />);
    expect(screen.getByText('Cargando tus ajustes de avisos…')).toBeInTheDocument();
    unmount();
    const user = renderPage();
    expect(await screen.findByText('No pudimos cargar tus ajustes de avisos.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Tipos de aviso' })).toBeInTheDocument();
  });

  it('RF-005-17: un interruptor por tipo para correo y otro para Telegram, con el estado en texto', async () => {
    mockedGet.mockResolvedValue(preferences());
    renderPage();
    await screen.findByRole('list', { name: 'Tipos de aviso' });
    expect(sw('Correo: Recordatorios de pago')).toBeChecked();
    expect(sw('Correo: Avisos como titular')).not.toBeChecked();
    expect(sw('Telegram: Resoluciones de pago')).not.toBeChecked();
    expect(sw('Telegram: Avisos de grupo')).toBeChecked();
    expect(screen.getAllByRole('switch')).toHaveLength(8);
    const item = sw('Correo: Avisos como titular').closest('li') as HTMLElement;
    expect(within(item).getByText('Desactivado')).toBeInTheDocument();
  });

  it('RF-005-03: la app y los correos de seguridad no tienen interruptor y se explica con texto fijo', async () => {
    mockedGet.mockResolvedValue(preferences());
    renderPage();
    await screen.findByRole('list', { name: 'Tipos de aviso' });
    expect(screen.queryByRole('switch', { name: /En la app/ })).toBeNull();
    expect(screen.queryByRole('switch', { name: /Seguridad/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Seguridad de la cuenta' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Las notificaciones dentro de la app no se pueden desactivar. Los correos de seguridad (recuperar contraseña, cambios de cuenta) siempre se envían.',
      ),
    ).toBeInTheDocument();
  });

  it('RF-005-17: guardar envía correo y Telegram por tipo con PUT y vuelve a pedir las preferencias', async () => {
    mockedGet.mockResolvedValueOnce(preferences()).mockResolvedValue(
      preferences({
        email: { recordatorios: false, resoluciones: true, titular: false, grupo: true },
      }),
    );
    mockedPut.mockResolvedValue(undefined);
    const user = renderPage();
    await screen.findByRole('list', { name: 'Tipos de aviso' });
    const save = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(save).toBeDisabled();
    await user.click(sw('Correo: Recordatorios de pago'));
    expect(save).toBeEnabled();
    await user.click(save);
    expect(mockedPut).toHaveBeenCalledWith({
      email: { recordatorios: false, resoluciones: true, titular: false, grupo: true },
      telegram: { recordatorios: true, resoluciones: false, titular: true, grupo: true },
    });
    expect(await screen.findByText('Guardamos tus preferencias de avisos.')).toBeVisible();
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    expect(sw('Correo: Recordatorios de pago')).not.toBeChecked();
  });

  it('RF-005-17: si guardar falla muestra el error y conserva lo elegido', async () => {
    mockedGet.mockResolvedValue(preferences());
    mockedPut.mockRejectedValue(new ApiError(500, 'INTERNAL', 'x'));
    const user = renderPage();
    await screen.findByRole('list', { name: 'Tipos de aviso' });
    await user.click(sw('Telegram: Resoluciones de pago'));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('No pudimos guardar tus preferencias.')).toBeVisible();
    expect(sw('Telegram: Resoluciones de pago')).toBeChecked();
  });

  it('RF-005-28: Telegram conectado se muestra como activo, sin «Reactivar»', async () => {
    mockedGet.mockResolvedValue(preferences());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Telegram: conectado' })).toBeVisible();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reactivar' })).toBeNull();
  });

  it('RF-005-28: con el bot bloqueado muestra «Reactivar» y deshabilita los interruptores de Telegram', async () => {
    const blocked = preferences({
      telegram: { ...preferences().telegram, blocked: true },
    });
    mockedGet.mockResolvedValue(blocked);
    mockedReactivate.mockResolvedValue(preferences());
    const user = renderPage();
    expect(await screen.findByRole('heading', { name: 'Telegram: bloqueado' })).toBeVisible();
    expect(screen.getByText('Pausado')).toBeInTheDocument();
    expect(sw('Telegram: Avisos de grupo')).toBeDisabled();
    expect(sw('Correo: Avisos de grupo')).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Reactivar' }));
    expect(mockedReactivate).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('Listo, volvimos a activar tus avisos por Telegram.'),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Telegram: conectado' })).toBeVisible();
    expect(sw('Telegram: Avisos de grupo')).toBeEnabled();
  });

  it('RF-005-28: si la API sigue viendo el bot bloqueado lo explica', async () => {
    const blocked = preferences({ telegram: { ...preferences().telegram, blocked: true } });
    mockedGet.mockResolvedValue(blocked);
    mockedReactivate.mockResolvedValue(blocked);
    const user = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Reactivar' }));
    expect(await screen.findByText(/Todavía vemos el bot bloqueado/)).toBeVisible();
  });

  it('RF-005-17: un correo con rebote permanente muestra el aviso de problema', async () => {
    mockedGet.mockResolvedValue(preferences({ emailProblem: true }));
    renderPage();
    expect(await screen.findByText('Tu correo tiene problemas de entrega.')).toBeVisible();
  });

  it('RF-003-08: un 401 lleva a /ingresar con la ruta actual', async () => {
    mockedGet.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'x'));
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fajustes%2Favisos'));
  });
});
