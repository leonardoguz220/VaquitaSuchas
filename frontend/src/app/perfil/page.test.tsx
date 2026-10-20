import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PHONE_CHANGE_POLL_MS } from '@/hooks/use-phone-change';
import { isPublicPath } from '@/lib/routes';
import { changePassword, getMe, logout, type UserSelf } from '@/services/auth';
import { ApiError } from '@/services/http';
import {
  getPhoneChangeStatus,
  startPhoneChange,
  updateMe,
  type PhoneChangeResponse,
} from '@/services/users';
import ProfilePage, { metadata } from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/perfil',
}));
jest.mock('@/services/auth', () => ({
  getMe: jest.fn(),
  changePassword: jest.fn(),
  logout: jest.fn(),
}));
jest.mock('@/services/users', () => ({
  updateMe: jest.fn(),
  startPhoneChange: jest.fn(),
  getPhoneChangeStatus: jest.fn(),
}));

const mockedGetMe = jest.mocked(getMe);
const mockedUpdateMe = jest.mocked(updateMe);
const mockedStart = jest.mocked(startPhoneChange);
const mockedStatus = jest.mocked(getPhoneChangeStatus);
const mockedChangePassword = jest.mocked(changePassword);
const mockedLogout = jest.mocked(logout);

const user: UserSelf = {
  id: '6f1c2a9e-1b2c-4d3e-8f9a-0b1c2d3e4f5a',
  fullName: 'Ana Quispe Mamani',
  email: 'ana.quispe@gmail.com',
  ciMasked: '*****123',
  phone: '+59171234567',
  role: 'usuario',
  status: 'activo',
  lastLoginAt: '2026-10-17T22:15:00.000Z',
  createdAt: '2026-10-01T14:00:00.000Z',
};

const link: PhoneChangeResponse = {
  verification: {
    telegramUrl: 'https://t.me/vaquita_bot?start=cel789',
    expiresAt: '2026-10-18T17:10:00.000Z',
  },
};

const NEW_PASSWORD = 'nuevaClave2027';

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function renderPage(me: UserSelf = user) {
  mockedGetMe.mockResolvedValue(me);
  const actor = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<ProfilePage />);
  await advance(0);
  return actor;
}

const section = (name: string) => screen.getByRole('region', { name });
const detail = (term: string) => screen.getByText(term, { selector: 'dt' }).nextElementSibling;
const focusWrapperOf = (text: string) => screen.getByText(text).closest('[tabindex="-1"]');

async function fillPassword(
  actor: ReturnType<typeof userEvent.setup>,
  current = 'vaquita2026',
  next = NEW_PASSWORD,
  confirmation = NEW_PASSWORD,
) {
  const form = section('Cambiar contraseña');
  await actor.type(within(form).getByLabelText('Contraseña actual'), current);
  await actor.type(within(form).getByLabelText('Nueva contraseña'), next);
  await actor.type(within(form).getByLabelText('Confirma la nueva contraseña'), confirmation);
  return form;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-18T17:00:18.000Z'));
  replace.mockReset();
  for (const mock of [
    mockedGetMe,
    mockedUpdateMe,
    mockedStart,
    mockedStatus,
    mockedChangePassword,
    mockedLogout,
  ]) {
    mock.mockReset();
  }
  window.history.replaceState(null, '', '/perfil');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => jest.useRealTimers());

describe('/perfil (T039): carga', () => {
  it('RNF-003-04: el título es "Mi perfil" y la ruta es protegida (no está en PUBLIC_ROUTES)', async () => {
    expect(metadata.title).toBe('Mi perfil');
    expect(isPublicPath('/perfil')).toBe(false);
    await renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Mi perfil' })).toBeInTheDocument();
  });

  it('RNF-003-04: mientras carga muestra el esqueleto', async () => {
    mockedGetMe.mockReturnValue(new Promise(() => {}));
    render(<ProfilePage />);
    const skeleton = screen.getByText('Cargando tu perfil…').closest('[role="status"]');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByLabelText('Nombre completo')).not.toBeInTheDocument();
  });

  it('RNF-003-04: si falla la carga muestra el aviso y Reintentar vuelve a pedir los datos', async () => {
    mockedGetMe
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'))
      .mockResolvedValueOnce(user);
    const actor = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<ProfilePage />);
    await advance(0);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar tu perfil.');
    expect(alert).toHaveTextContent('No se pudo contactar con el servidor.');
    await actor.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await advance(0);
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('Ana Quispe Mamani');
    expect(mockedGetMe).toHaveBeenCalledTimes(2);
  });

  it('RF-003-08: con 401 redirige a /ingresar?next=/perfil', async () => {
    mockedGetMe.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    render(<ProfilePage />);
    await advance(0);
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fperfil');
  });
});

describe('/perfil (T039): tus datos', () => {
  it('RF-003-14: nombre editable; correo, CI y celular de solo lectura con la nota de que no se cambian', async () => {
    await renderPage();
    const data = section('Tus datos');
    expect(within(data).getByLabelText('Nombre completo')).toHaveValue('Ana Quispe Mamani');
    expect(detail('Correo')).toHaveTextContent('ana.quispe@gmail.com');
    expect(detail('Celular')).toHaveTextContent('+591 71234567');
    // Solo el nombre es un campo: el correo, la CI y el celular no se pueden editar aquí.
    expect(within(data).getAllByRole('textbox')).toHaveLength(1);
    expect(data).toHaveTextContent('Tu correo y tu cédula no se pueden cambiar.');
  });

  it('CA-003-31: la CI se muestra tal como llega en ciMasked y nunca otra', async () => {
    await renderPage({ ...user, ciMasked: '*****987' });
    expect(detail('Cédula de identidad')?.textContent).toBe('*****987');
    // Los dígitos de la CI solo aparecen dentro del valor enmascarado.
    expect(screen.getAllByText(/987/)).toEqual([detail('Cédula de identidad')]);
  });

  it('RF-003-09: muestra el último ingreso en la hora de La Paz', async () => {
    await renderPage();
    expect(detail('Último ingreso')).toHaveTextContent('17 oct 2026, 18:15');
  });

  it('RF-003-09: sin último ingreso dice "Este es tu primer ingreso"', async () => {
    await renderPage({ ...user, lastLoginAt: null });
    expect(detail('Último ingreso')).toHaveTextContent('Este es tu primer ingreso');
  });

  it('CA-003-14: al editar el nombre se envía { fullName } y se muestra el nombre nuevo', async () => {
    mockedUpdateMe.mockResolvedValue({ ...user, fullName: 'Ana Quispe' });
    const actor = await renderPage();
    const input = screen.getByLabelText('Nombre completo');
    await actor.clear(input);
    await actor.type(input, '  Ana Quispe  ');
    await actor.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    await advance(0);

    expect(mockedUpdateMe).toHaveBeenCalledWith({ fullName: 'Ana Quispe' });
    expect(input).toHaveValue('Ana Quispe');
    expect(focusWrapperOf('Guardamos tu nombre.')).toHaveFocus();
  });

  it('RNF-003-04: el nombre de 1 caracter se marca en vivo y no se envía', async () => {
    const actor = await renderPage();
    const input = screen.getByLabelText('Nombre completo');
    await actor.clear(input);
    await actor.type(input, 'A');
    await actor.tab();
    expect(screen.getByText('El nombre debe tener entre 2 y 80 caracteres.')).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    expect(mockedUpdateMe).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
  });

  it('RF-003-14: VALIDATION_ERROR del servidor marca el campo; FIELD_NOT_EDITABLE da el aviso por code', async () => {
    mockedUpdateMe
      .mockRejectedValueOnce(
        new ApiError(400, 'VALIDATION_ERROR', 'interno', { fields: { fullName: ['LENGTH'] } }),
      )
      .mockRejectedValueOnce(new ApiError(400, 'FIELD_NOT_EDITABLE', 'interno'));
    const actor = await renderPage();
    const save = screen.getByRole('button', { name: 'Guardar nombre' });

    await actor.click(save);
    await advance(0);
    expect(screen.getByLabelText('Nombre completo')).toHaveAccessibleDescription(
      /El nombre debe tener entre 2 y 80 caracteres\./,
    );

    await actor.click(save);
    await advance(0);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Solo puedes cambiar tu nombre. Tu correo y tu cédula no se pueden editar.',
    );
    expect(screen.queryByText('interno')).not.toBeInTheDocument();
  });

  it('RNF-003-04: sin conexión al guardar el nombre ofrece Reintentar con el mismo cuerpo', async () => {
    mockedUpdateMe
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'))
      .mockResolvedValueOnce({ ...user, fullName: 'Ana Q' });
    const actor = await renderPage();
    const input = screen.getByLabelText('Nombre completo');
    await actor.clear(input);
    await actor.type(input, 'Ana Q');
    await actor.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    await advance(0);

    const alert = screen.getByRole('alert');
    expect(alert.closest('[tabindex="-1"]')).toHaveFocus();
    await actor.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await advance(0);
    expect(mockedUpdateMe).toHaveBeenNthCalledWith(2, { fullName: 'Ana Q' });
    expect(screen.getByText('Guardamos tu nombre.')).toBeInTheDocument();
  });
});

describe('/perfil (T039): cambiar celular', () => {
  async function startChange() {
    mockedStart.mockResolvedValue(link);
    const actor = await renderPage();
    await actor.click(
      within(section('Cambiar celular')).getByRole('button', { name: 'Cambiar celular' }),
    );
    await advance(0);
    return actor;
  }

  it('RF-003-14: pide el enlace y muestra la verificación con Telegram (Abrir Telegram con el enlace)', async () => {
    mockedStatus.mockResolvedValue({ status: 'pending' });
    await startChange();
    expect(mockedStart).toHaveBeenCalledTimes(1);
    const phone = section('Cambiar celular');
    expect(within(phone).getByRole('link', { name: /Abrir Telegram/ })).toHaveAttribute(
      'href',
      link.verification.telegramUrl,
    );
    expect(within(phone).getByText('Esperando que compartas tu número…')).toBeInTheDocument();
    expect(within(phone).getByRole('timer')).toBeInTheDocument();
  });

  it('CA-003-32: mientras no se verifica el número nuevo se conserva y se muestra el anterior', async () => {
    mockedStatus.mockResolvedValue({ status: 'pending' });
    await startChange();
    await advance(PHONE_CHANGE_POLL_MS * 3);
    expect(mockedStatus).toHaveBeenCalledTimes(3);
    expect(section('Cambiar celular')).toHaveTextContent(
      'Hasta que verifiques el número nuevo, sigues usando +591 71234567.',
    );
    expect(detail('Celular')).toHaveTextContent('+591 71234567');
  });

  it('RF-003-14: verified muestra el celular nuevo que entrega el servidor y el aviso con foco', async () => {
    mockedStatus
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'verified', user: { ...user, phone: '+59176543210' } });
    await startChange();
    await advance(PHONE_CHANGE_POLL_MS * 2);

    expect(detail('Celular')).toHaveTextContent('+591 76543210');
    expect(focusWrapperOf('Tu celular quedó actualizado.')).toHaveFocus();
    expect(screen.queryByRole('link', { name: /Abrir Telegram/ })).not.toBeInTheDocument();
    await advance(PHONE_CHANGE_POLL_MS * 3);
    expect(mockedStatus).toHaveBeenCalledTimes(2);
  });

  it('CA-003-15: un celular que no es boliviano se rechaza con el mensaje del registro y se conserva el anterior', async () => {
    mockedStatus.mockResolvedValue({ status: 'rejected', code: 'PHONE_NOT_BOLIVIAN' });
    await startChange();
    await advance(PHONE_CHANGE_POLL_MS);
    expect(within(section('Cambiar celular')).getByRole('alert')).toHaveTextContent(
      'El número que compartiste no es un celular boliviano.',
    );
    expect(detail('Celular')).toHaveTextContent('+591 71234567');
    expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeInTheDocument();
  });

  it('CA-003-32: si el enlace vence se conserva el celular y "Pedir un enlace nuevo" vuelve a llamar a phone-change', async () => {
    mockedStatus
      .mockResolvedValueOnce({ status: 'expired' })
      .mockResolvedValue({ status: 'pending' });
    const actor = await startChange();
    await advance(PHONE_CHANGE_POLL_MS);
    expect(screen.getByText('El enlace venció.')).toBeInTheDocument();
    expect(detail('Celular')).toHaveTextContent('+591 71234567');

    await actor.click(screen.getByRole('button', { name: 'Pedir un enlace nuevo' }));
    await advance(0);
    expect(mockedStart).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: /Abrir Telegram/ })).toBeInTheDocument();
  });

  it('CA-003-32: Cancelar oculta la verificación, deja de consultar y devuelve el foco al botón', async () => {
    mockedStatus.mockResolvedValue({ status: 'pending' });
    const actor = await startChange();
    await actor.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('link', { name: /Abrir Telegram/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar celular' })).toHaveFocus();
    await advance(PHONE_CHANGE_POLL_MS * 3);
    expect(mockedStatus).not.toHaveBeenCalled();
    expect(detail('Celular')).toHaveTextContent('+591 71234567');
  });

  it('RF-003-14: si pedir el enlace da RATE_LIMITED muestra la espera en minutos', async () => {
    mockedStart.mockRejectedValue(
      new ApiError(429, 'RATE_LIMITED', 'interno', { retryAfterSeconds: 900 }),
    );
    const actor = await renderPage();
    await actor.click(screen.getByRole('button', { name: 'Cambiar celular' }));
    await advance(0);
    expect(within(section('Cambiar celular')).getByRole('alert')).toHaveTextContent(
      'Pediste demasiados enlaces. Espera 15 minutos.',
    );
  });
});

describe('/perfil (T039): cambiar contraseña', () => {
  it('CA-003-16: con la actual correcta envía el cuerpo exacto, avisa que cerró las otras sesiones y limpia el formulario', async () => {
    mockedChangePassword.mockResolvedValue(undefined);
    const actor = await renderPage();
    const form = await fillPassword(actor);
    await actor.click(within(form).getByRole('button', { name: 'Cambiar contraseña' }));
    await advance(0);

    expect(mockedChangePassword).toHaveBeenCalledWith({
      currentPassword: 'vaquita2026',
      newPassword: NEW_PASSWORD,
      newPasswordConfirmation: NEW_PASSWORD,
    });
    expect(focusWrapperOf('Cambiaste tu contraseña. Cerramos tus otras sesiones.')).toHaveFocus();
    expect(within(form).getByLabelText('Contraseña actual')).toHaveValue('');
    expect(within(form).getByLabelText('Nueva contraseña')).toHaveValue('');
    expect(within(form).getByLabelText('Confirma la nueva contraseña')).toHaveValue('');
  });

  it('RF-003-15: CURRENT_PASSWORD_WRONG marca la contraseña actual y le da el foco', async () => {
    mockedChangePassword.mockRejectedValue(new ApiError(422, 'CURRENT_PASSWORD_WRONG', 'interno'));
    const actor = await renderPage();
    const form = await fillPassword(actor, 'equivocada1');
    await actor.click(within(form).getByRole('button', { name: 'Cambiar contraseña' }));
    await advance(0);

    const current = within(form).getByLabelText('Contraseña actual');
    expect(current).toHaveAccessibleDescription(/La contraseña actual no es correcta\./);
    expect(current).toHaveAttribute('aria-invalid', 'true');
    expect(current).toHaveFocus();
  });

  it('RF-003-15: RATE_LIMITED muestra la espera en minutos', async () => {
    mockedChangePassword.mockRejectedValue(
      new ApiError(429, 'RATE_LIMITED', 'interno', { retryAfterSeconds: 300 }),
    );
    const actor = await renderPage();
    const form = await fillPassword(actor);
    await actor.click(within(form).getByRole('button', { name: 'Cambiar contraseña' }));
    await advance(0);
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'Hiciste demasiados intentos. Espera 5 minutos e inténtalo de nuevo.',
    );
  });

  it('RF-003-15: VALIDATION_ERROR del servidor marca el campo de la nueva contraseña', async () => {
    mockedChangePassword.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'interno', {
        fields: { newPassword: ['WEAK_PASSWORD'] },
      }),
    );
    const actor = await renderPage();
    const form = await fillPassword(actor);
    await actor.click(within(form).getByRole('button', { name: 'Cambiar contraseña' }));
    await advance(0);
    expect(within(form).getByLabelText('Nueva contraseña')).toHaveAccessibleDescription(
      /La contraseña debe tener al menos 10 caracteres/,
    );
  });

  it('RNF-003-04: valida en vivo con las reglas (incluida "distinta de tu correo") y no envía si no cumple', async () => {
    const actor = await renderPage();
    const form = section('Cambiar contraseña');
    await actor.type(within(form).getByLabelText('Nueva contraseña'), 'ana.quispe@gmail.com');
    const rule = within(form).getByText('Distinta de tu correo').closest('li');
    expect(rule).toHaveAttribute('data-met', 'false');
    await actor.click(within(form).getByRole('button', { name: 'Cambiar contraseña' }));
    expect(mockedChangePassword).not.toHaveBeenCalled();
    expect(within(form).getByLabelText('Contraseña actual')).toHaveFocus();
    expect(within(form).getByText('Escribe tu contraseña actual.')).toBeInTheDocument();
  });
});

describe('/perfil (T039): cerrar sesión', () => {
  it('RF-003-07: Cerrar sesión llama a logout y va a /ingresar', async () => {
    mockedLogout.mockResolvedValue(undefined);
    const actor = await renderPage();
    await actor.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await advance(0);
    expect(mockedLogout).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/ingresar');
  });

  it('RF-003-07: va a /ingresar aunque el backend falle', async () => {
    mockedLogout.mockRejectedValue(new ApiError(504, 'UPSTREAM_TIMEOUT', 'x'));
    const actor = await renderPage();
    await actor.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await advance(0);
    expect(replace).toHaveBeenCalledWith('/ingresar');
  });
});
