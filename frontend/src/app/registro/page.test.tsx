import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { REGISTER_VERIFICATION_KEY } from '@/components/features/auth/verification-storage';
import { register, type RegisterResponse } from '@/services/auth';
import { ApiError } from '@/services/http';
import RegisterPage, { metadata } from './page';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('@/services/auth', () => ({ register: jest.fn() }));

const mockedRegister = jest.mocked(register);

// Respuesta 201 tal como llega al navegador: el proxy ya quitó registrationSecret.
const created: RegisterResponse = {
  verification: {
    telegramUrl: 'https://t.me/vaquita_bot?start=abc123',
    expiresAt: '2026-10-18T17:10:00.000Z',
  },
};

const VALID = {
  fullName: 'Ana Quispe Mamani',
  email: 'ana.quispe@gmail.com',
  ci: '7845123',
  password: 'vaquita2026',
};

async function renderPage(searchParams: Record<string, string | string[]> = {}) {
  const ui = await RegisterPage({ searchParams: Promise.resolve(searchParams) });
  const user = userEvent.setup();
  render(ui);
  return user;
}

const field = {
  fullName: () => screen.getByLabelText('Nombre completo'),
  email: () => screen.getByLabelText('Correo'),
  ci: () => screen.getByLabelText('Cédula de identidad'),
  password: () => screen.getByLabelText('Contraseña'),
  confirmation: () => screen.getByLabelText('Confirma la contraseña'),
  policy: () => screen.getByRole('checkbox', { name: /Acepto la política de datos/ }),
  submit: () => screen.getByRole('button', { name: /Continuar a la verificación/ }),
};

async function fillValid(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<typeof VALID & { confirmation: string; policy: boolean }> = {},
) {
  const data = { ...VALID, confirmation: VALID.password, policy: true, ...overrides };
  await user.type(field.fullName(), data.fullName);
  await user.type(field.email(), data.email);
  await user.type(field.ci(), data.ci);
  await user.type(field.password(), data.password);
  await user.type(field.confirmation(), data.confirmation);
  if (data.policy) await user.click(field.policy());
}

async function submitWithError(error: ApiError) {
  mockedRegister.mockRejectedValue(error);
  const user = await renderPage();
  await fillValid(user);
  await user.click(field.submit());
  return user;
}

beforeEach(() => {
  push.mockReset();
  mockedRegister.mockReset();
  window.sessionStorage.clear();
});

describe('/registro (T023)', () => {
  it('RF-003-01: el título de la página es "Crear cuenta"', () => {
    expect(metadata.title).toBe('Crear cuenta');
  });

  it('RF-003-01: pide nombre, correo, CI, contraseña, confirmación y la política, sin celular', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Crea tu cuenta' })).toBeInTheDocument();
    expect(screen.getByText('Paso 1 de 2: tus datos')).toBeInTheDocument();
    expect(field.fullName()).toHaveAttribute('autocomplete', 'name');
    expect(field.email()).toHaveAttribute('type', 'email');
    expect(field.email()).toHaveAttribute('autocomplete', 'email');
    expect(field.ci()).toHaveAttribute('inputmode', 'numeric');
    expect(field.ci()).toHaveAccessibleDescription('Solo el número, sin extensión.');
    expect(field.password()).toHaveAttribute('type', 'password');
    expect(field.password()).toHaveAttribute('autocomplete', 'new-password');
    expect(field.confirmation()).toHaveAttribute('autocomplete', 'new-password');
    expect(field.policy()).not.toBeChecked();
    expect(screen.queryByLabelText(/celular/i)).not.toBeInTheDocument();
  });

  it('RF-003-01: el enlace "Ingresa" lleva a /ingresar', async () => {
    await renderPage();
    expect(screen.getByRole('link', { name: 'Ingresa' })).toHaveAttribute('href', '/ingresar');
  });

  it('RF-003-01: el enlace "Ingresa" conserva codigo y next del invitado', async () => {
    await renderPage({ codigo: 'AB12CD', next: '/unirse', otro: 'x' });
    expect(screen.getByRole('link', { name: 'Ingresa' })).toHaveAttribute(
      'href',
      '/ingresar?codigo=AB12CD&next=%2Funirse',
    );
  });

  it('RF-003-03 / RNF-003-04: las reglas de la contraseña cambian en vivo al escribir', async () => {
    const user = await renderPage();
    const rules = screen.getByRole('list', { name: 'Reglas de la contraseña' });
    const item = (text: string) =>
      within(rules)
        .getAllByRole('listitem')
        .find((li) => li.textContent?.startsWith(text))!;

    expect(field.password()).toHaveAccessibleDescription(expect.stringContaining('Al menos'));
    await user.type(field.password(), 'abc');
    expect(item('Al menos una letra')).toHaveTextContent(': cumplida');
    expect(item('Al menos un número')).toHaveTextContent(': pendiente');
    await user.type(field.password(), '1234567');
    expect(item('Al menos 10 caracteres')).toHaveTextContent(': cumplida');
    expect(item('Al menos un número')).toHaveTextContent(': cumplida');
  });

  it('CA-003-03: con una contraseña de 8 caracteres no se envía y se indica la política', async () => {
    const user = await renderPage();
    await fillValid(user, { password: 'abcd1234', confirmation: 'abcd1234' });
    await user.click(field.submit());

    expect(mockedRegister).not.toHaveBeenCalled();
    expect(field.password()).toHaveAttribute('aria-invalid', 'true');
    expect(field.password()).toHaveAccessibleDescription(
      expect.stringContaining('La contraseña no cumple todas las reglas'),
    );
    expect(field.password()).toHaveFocus();
  });

  it('RF-003-01: la confirmación distinta muestra el error al salir del campo', async () => {
    const user = await renderPage();
    await user.type(field.password(), VALID.password);
    await user.type(field.confirmation(), 'otra2026xx');
    await user.tab();
    expect(field.confirmation()).toHaveAttribute('aria-invalid', 'true');
    expect(field.confirmation()).toHaveAccessibleDescription('Las contraseñas no coinciden.');
  });

  it('RNF-003-04: el error de un campo aparece al salir de él y se va al corregirlo', async () => {
    const user = await renderPage();
    await user.type(field.ci(), '12');
    await user.tab();
    expect(field.ci()).toHaveAccessibleDescription(expect.stringContaining('entre 5 y 10 dígitos'));
    await user.type(field.ci(), '345');
    expect(field.ci()).not.toHaveAttribute('aria-invalid');
  });

  it('CA-003-34: sin aceptar la política no se envía y el foco va a la casilla', async () => {
    const user = await renderPage();
    await fillValid(user, { policy: false });
    await user.click(field.submit());

    expect(mockedRegister).not.toHaveBeenCalled();
    expect(field.policy()).toHaveAttribute('aria-invalid', 'true');
    expect(field.policy()).toHaveAccessibleDescription(
      'Debes aceptar la política de datos para crear tu cuenta.',
    );
    expect(field.policy()).toHaveFocus();
  });

  it('RNF-003-04: al enviar vacío marca los errores y enfoca el primer campo', async () => {
    const user = await renderPage();
    await user.click(field.submit());
    expect(mockedRegister).not.toHaveBeenCalled();
    expect(field.fullName()).toHaveFocus();
    expect(field.fullName()).toHaveAttribute('aria-invalid', 'true');
    expect(field.email()).toHaveAttribute('aria-invalid', 'true');
  });

  it('RF-003-01: con datos válidos envía el cuerpo exacto del contrato y va a /registro/verificar', async () => {
    mockedRegister.mockResolvedValue(created);
    const user = await renderPage();
    await fillValid(user, { fullName: '  Ana Quispe Mamani ', email: ' ana.quispe@gmail.com' });
    await user.click(field.submit());

    expect(mockedRegister).toHaveBeenCalledTimes(1);
    expect(mockedRegister).toHaveBeenCalledWith({
      fullName: 'Ana Quispe Mamani',
      email: 'ana.quispe@gmail.com',
      ci: '7845123',
      password: 'vaquita2026',
      passwordConfirmation: 'vaquita2026',
      acceptDataPolicy: true,
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/registro/verificar'));
    // T024 lee el enlace desde sessionStorage; el secreto quedó en la cookie vq_reg.
    expect(JSON.parse(window.sessionStorage.getItem(REGISTER_VERIFICATION_KEY)!)).toEqual(
      created.verification,
    );
    expect(screen.getByText(/Ahora verifica tu celular con Telegram/)).toBeInTheDocument();
  });

  it('RNF-003-04: mientras envía, el botón está cargando y deshabilitado', async () => {
    mockedRegister.mockReturnValue(new Promise(() => {}));
    const user = await renderPage();
    await fillValid(user);
    await user.click(field.submit());

    expect(field.submit()).toBeDisabled();
    expect(field.submit()).toHaveAttribute('aria-busy', 'true');
    expect(field.submit()).toHaveTextContent('Cargando…');
    await user.click(field.submit());
    expect(mockedRegister).toHaveBeenCalledTimes(1);
  });

  it('RF-003-01: EMAIL_TAKEN se muestra en el campo correo y lo enfoca', async () => {
    await submitWithError(new ApiError(409, 'EMAIL_TAKEN', 'Ese correo ya está registrado.'));
    await waitFor(() => expect(field.email()).toHaveFocus());
    expect(field.email()).toHaveAttribute('aria-invalid', 'true');
    expect(field.email()).toHaveAccessibleDescription('Ese correo ya está registrado.');
    expect(push).not.toHaveBeenCalled();
  });

  it('RF-003-01: el error del servidor en un campo se quita al corregirlo', async () => {
    const user = await submitWithError(new ApiError(409, 'EMAIL_TAKEN', 'x'));
    await waitFor(() => expect(field.email()).toHaveAttribute('aria-invalid', 'true'));
    await user.type(field.email(), 'x');
    expect(screen.queryByText('Ese correo ya está registrado.')).not.toBeInTheDocument();
  });

  it('RF-003-01: CI_TAKEN se muestra en el campo CI', async () => {
    await submitWithError(new ApiError(409, 'CI_TAKEN', 'x'));
    await waitFor(() => expect(field.ci()).toHaveFocus());
    expect(field.ci()).toHaveAccessibleDescription(
      expect.stringContaining('Ya existe una cuenta con esa cédula.'),
    );
  });

  it('RF-003-01: REGISTRATION_NOT_ALLOWED muestra el aviso genérico sin señalar un campo', async () => {
    await submitWithError(new ApiError(403, 'REGISTRATION_NOT_ALLOWED', 'x'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No es posible crear la cuenta con estos datos.');
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('RF-003-03: VALIDATION_ERROR con WEAK_PASSWORD e INVALID_CI marca cada campo', async () => {
    await submitWithError(
      new ApiError(400, 'VALIDATION_ERROR', 'x', {
        fields: { ci: ['INVALID_CI'], password: ['WEAK_PASSWORD'] },
      }),
    );
    await waitFor(() => expect(field.ci()).toHaveFocus());
    expect(field.ci()).toHaveAccessibleDescription(expect.stringContaining('entre 5 y 10'));
    expect(field.password()).toHaveAccessibleDescription(
      expect.stringContaining('al menos 10 caracteres, una letra y un número'),
    );
  });

  it('CA-003-34: VALIDATION_ERROR con POLICY_NOT_ACCEPTED marca la casilla', async () => {
    await submitWithError(
      new ApiError(400, 'VALIDATION_ERROR', 'x', {
        fields: { acceptDataPolicy: ['POLICY_NOT_ACCEPTED'] },
      }),
    );
    await waitFor(() => expect(field.policy()).toHaveAttribute('aria-invalid', 'true'));
  });

  it('RF-003-01: RATE_LIMITED muestra la espera en minutos', async () => {
    await submitWithError(new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 300 }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Hiciste demasiados intentos. Espera 5 minutos e inténtalo de nuevo.',
    );
  });

  it('RF-003-01: un error inesperado muestra el mensaje genérico', async () => {
    await submitWithError(new ApiError(500, 'INTERNAL_ERROR', 'x'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ocurrió un error inesperado. Inténtalo de nuevo.',
    );
  });

  it('RF-003-01: sin conexión muestra el aviso con Reintentar, que reenvía y avanza', async () => {
    mockedRegister
      .mockRejectedValueOnce(new ApiError(504, 'UPSTREAM_TIMEOUT', 'x'))
      .mockResolvedValueOnce(created);
    const user = await renderPage();
    await fillValid(user);
    await user.click(field.submit());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo contactar con el servidor.');
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(mockedRegister).toHaveBeenCalledTimes(2);
    expect(mockedRegister.mock.calls[1]).toEqual(mockedRegister.mock.calls[0]);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/registro/verificar'));
    expect(screen.queryByText('No se pudo contactar con el servidor.')).not.toBeInTheDocument();
  });

  it('RF-003-23: el enlace "política de datos" abre el modal sin marcar la casilla, y se cierra', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'política de datos' }));

    const dialog = screen.getByRole('dialog', { name: 'Política de datos' });
    expect(within(dialog).getByText(/identificar a las personas/)).toBeInTheDocument();
    expect(field.policy()).not.toBeChecked();

    await user.click(within(dialog).getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(field.policy()).not.toBeChecked();
  });

  it('RF-003-23: la etiqueta de la casilla es clicable y la marca', async () => {
    const user = await renderPage();
    await user.click(screen.getByText(/de Vaquita\./));
    expect(field.policy()).toBeChecked();
  });
});
