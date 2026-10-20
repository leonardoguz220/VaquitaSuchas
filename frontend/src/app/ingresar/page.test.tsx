import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { login, type LoginResponse } from '@/services/auth';
import { ApiError } from '@/services/http';
import LoginPage, { metadata } from './page';

const replace = jest.fn();
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }));
jest.mock('@/services/auth', () => ({ login: jest.fn() }));

const mockedLogin = jest.mocked(login);

// Respuesta 200 tal como llega al navegador: el proxy ya movió sessionToken a la cookie.
const ok: LoginResponse = {
  user: {
    id: '6f1c2a9e-1b2c-4d3e-8f9a-0b1c2d3e4f5a',
    fullName: 'Ana Quispe Mamani',
    email: 'ana.quispe@gmail.com',
    ciMasked: '*****123',
    phone: '+59171234567',
    role: 'usuario',
    status: 'activo',
    lastLoginAt: null,
    createdAt: '2026-10-18T14:00:00.000Z',
  },
};

const VALID = { email: 'ana.quispe@gmail.com', password: 'vaquita2026' };

async function renderPage(searchParams: Record<string, string | string[]> = {}) {
  const ui = await LoginPage({ searchParams: Promise.resolve(searchParams) });
  const user = userEvent.setup();
  render(ui);
  return user;
}

const field = {
  email: () => screen.getByLabelText('Correo'),
  password: () => screen.getByLabelText('Contraseña'),
  submit: () => screen.getByRole('button', { name: /Ingresar/ }),
};

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  data: { email: string; password: string } = VALID,
) {
  await user.type(field.email(), data.email);
  await user.type(field.password(), data.password);
  await user.click(field.submit());
}

async function submitWithError(error: ApiError, data = VALID) {
  mockedLogin.mockRejectedValue(error);
  const user = await renderPage();
  await fillAndSubmit(user, data);
  return user;
}

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
  mockedLogin.mockReset();
});

describe('/ingresar (T029)', () => {
  it('RNF-003-04: el título de la página es "Ingresar"', () => {
    expect(metadata.title).toBe('Ingresar');
  });

  it('RNF-003-04: pide correo y contraseña con su autocompletado y sin paso', async () => {
    await renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ingresa a tu cuenta' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Usa el correo con el que te registraste.')).toBeInTheDocument();
    expect(screen.queryByText(/Paso \d/)).not.toBeInTheDocument();
    expect(field.email()).toHaveAttribute('type', 'email');
    expect(field.email()).toHaveAttribute('autocomplete', 'email');
    expect(field.password()).toHaveAttribute('type', 'password');
    expect(field.password()).toHaveAttribute('autocomplete', 'current-password');
    expect(field.submit()).toHaveAttribute('type', 'submit');
  });

  it('RNF-003-04: los enlaces llevan a /recuperar y a /registro', async () => {
    await renderPage();
    expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute(
      'href',
      '/recuperar',
    );
    expect(screen.getByRole('link', { name: 'Crea una' })).toHaveAttribute('href', '/registro');
    expect(screen.getByText(/¿Todavía no tienes cuenta\?/)).toBeInTheDocument();
  });

  it('RF-003-08: los enlaces conservan codigo y next (y descartan otros parámetros)', async () => {
    await renderPage({ codigo: 'AB12CD34', next: '/grupos/1', otro: 'x' });
    expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute(
      'href',
      '/recuperar?codigo=AB12CD34&next=%2Fgrupos%2F1',
    );
    expect(screen.getByRole('link', { name: 'Crea una' })).toHaveAttribute(
      'href',
      '/registro?codigo=AB12CD34&next=%2Fgrupos%2F1',
    );
  });

  it('RF-003-06: envía el cuerpo exacto del contrato { email, password } y va a la raíz', async () => {
    mockedLogin.mockResolvedValue(ok);
    const user = await renderPage();
    await fillAndSubmit(user, { email: '  ana.quispe@gmail.com ', password: ' vaquita2026 ' });

    expect(mockedLogin).toHaveBeenCalledTimes(1);
    // El correo se recorta; la contraseña viaja tal cual.
    expect(mockedLogin).toHaveBeenCalledWith({
      email: 'ana.quispe@gmail.com',
      password: ' vaquita2026 ',
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('RF-003-08: con next seguro vuelve a esa ruta tras ingresar', async () => {
    mockedLogin.mockResolvedValue(ok);
    const user = await renderPage({ next: '/grupos/1?tab=cobros', codigo: 'AB12CD34' });
    await fillAndSubmit(user);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/grupos/1?tab=cobros'));
  });

  it.each(['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)'])(
    'RF-003-08: ignora el next inseguro %j y va a la raíz',
    async (next) => {
      mockedLogin.mockResolvedValue(ok);
      const user = await renderPage({ next });
      await fillAndSubmit(user);
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    },
  );

  it('RF-003-08: con codigo y sin next va a /unirse?codigo= (plan 010 §6)', async () => {
    mockedLogin.mockResolvedValue(ok);
    const user = await renderPage({ codigo: 'AB12CD34' });
    await fillAndSubmit(user);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/unirse?codigo=AB12CD34'));
  });

  it('RNF-003-04: al enviar vacío marca los dos campos, enfoca el correo y no envía', async () => {
    const user = await renderPage();
    await user.click(field.submit());

    expect(mockedLogin).not.toHaveBeenCalled();
    expect(field.email()).toHaveFocus();
    expect(field.email()).toHaveAccessibleDescription('Escribe tu correo.');
    expect(field.password()).toHaveAccessibleDescription('Escribe tu contraseña.');
  });

  it('RNF-003-04: el correo sin forma válida muestra el error al salir del campo', async () => {
    const user = await renderPage();
    await user.type(field.email(), 'ana@');
    await user.tab();
    expect(field.email()).toHaveAttribute('aria-invalid', 'true');
    expect(field.email()).toHaveAccessibleDescription(
      'Escribe un correo válido, por ejemplo ana@gmail.com.',
    );
    await user.type(field.email(), 'gmail.com');
    expect(field.email()).not.toHaveAttribute('aria-invalid');
  });

  it('RNF-003-04: mientras envía, el botón está cargando y deshabilitado', async () => {
    mockedLogin.mockReturnValue(new Promise(() => {}));
    const user = await renderPage();
    await fillAndSubmit(user);

    expect(field.submit()).toBeDisabled();
    expect(field.submit()).toHaveAttribute('aria-busy', 'true');
    expect(field.submit()).toHaveTextContent('Cargando…');
    await user.click(field.submit());
    expect(mockedLogin).toHaveBeenCalledTimes(1);
  });

  it('RNF-003-02: INVALID_CREDENTIALS muestra "Correo o contraseña incorrectos." sin marcar un campo', async () => {
    await submitWithError(new ApiError(401, 'INVALID_CREDENTIALS', 'x'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Correo o contraseña incorrectos.');
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
    expect(within(alert).queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    // El aviso recibe el foco para que el lector de pantalla lo anuncie.
    await waitFor(() => expect(alert.parentElement).toHaveFocus());
  });

  it('CA-003-05: correo inexistente y contraseña errónea muestran exactamente el mismo mensaje', async () => {
    // El backend responde 401 INVALID_CREDENTIALS en ambos casos; aunque el texto del servidor
    // difiriera, la interfaz decide por code y muestra el mismo aviso.
    await submitWithError(new ApiError(401, 'INVALID_CREDENTIALS', 'Correo inexistente'), {
      email: 'nadie@gmail.com',
      password: 'vaquita2026',
    });
    const unknownEmail = (await screen.findByRole('alert')).textContent;

    cleanup();
    await submitWithError(new ApiError(401, 'INVALID_CREDENTIALS', 'Contraseña errónea'), {
      email: 'ana.quispe@gmail.com',
      password: 'otra-clave-1',
    });
    const wrongPassword = (await screen.findByRole('alert')).textContent;

    expect(unknownEmail).toBe(wrongPassword);
    expect(wrongPassword).toContain('Correo o contraseña incorrectos.');
  });

  it('CA-003-06 / RNF-003-04: RATE_LIMITED muestra la cuenta regresiva a partir de retryAfterSeconds', async () => {
    await submitWithError(new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 840 }));
    expect(await screen.findByRole('timer')).toHaveTextContent('14:00');
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeDisabled();
  });

  it('RNF-003-04: VALIDATION_ERROR marca el campo correo y lo enfoca', async () => {
    await submitWithError(
      new ApiError(400, 'VALIDATION_ERROR', 'x', { fields: { email: ['INVALID_EMAIL'] } }),
    );
    await waitFor(() => expect(field.email()).toHaveFocus());
    expect(field.email()).toHaveAttribute('aria-invalid', 'true');
    expect(field.email()).toHaveAccessibleDescription(
      'Escribe un correo válido, por ejemplo ana@gmail.com.',
    );
  });

  it('RNF-003-04: un error inesperado muestra el mensaje genérico', async () => {
    await submitWithError(new ApiError(500, 'INTERNAL_ERROR', 'x'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ocurrió un error inesperado. Inténtalo de nuevo.',
    );
  });

  it('RNF-003-04: sin conexión muestra el aviso con Reintentar, que reenvía e ingresa', async () => {
    mockedLogin
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
      .mockResolvedValueOnce(ok);
    const user = await renderPage({ next: '/grupos' });
    await fillAndSubmit(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo contactar con el servidor.');
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(mockedLogin).toHaveBeenCalledTimes(2);
    expect(mockedLogin.mock.calls[1]).toEqual(mockedLogin.mock.calls[0]);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/grupos'));
    expect(screen.queryByText('No se pudo contactar con el servidor.')).not.toBeInTheDocument();
  });

  it('RNF-003-02: tras un error, volver a enviar quita el aviso anterior', async () => {
    const user = await submitWithError(new ApiError(401, 'INVALID_CREDENTIALS', 'x'));
    await screen.findByRole('alert');
    mockedLogin.mockReset();
    mockedLogin.mockResolvedValue(ok);
    await user.click(field.submit());
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
