import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forgotPassword, type ForgotPasswordResponse } from '@/services/auth';
import { ApiError } from '@/services/http';
import RecoverPage, { metadata } from './page';

jest.mock('@/services/auth', () => ({ forgotPassword: jest.fn() }));

const mockedForgot = jest.mocked(forgotPassword);

// Respuesta 202 del contrato: idéntica exista o no la cuenta.
const ok: ForgotPasswordResponse = {
  message: 'Si el correo está registrado, recibirás un enlace en unos minutos.',
};

const SENT_TEXT = 'Si el correo está registrado, recibirás un enlace en unos minutos.';
const SENT_HINT =
  'Revisa también tu carpeta de spam. El enlace sirve una sola vez y vence en 30 minutos.';

async function renderPage(searchParams: Record<string, string | string[]> = {}) {
  const ui = await RecoverPage({ searchParams: Promise.resolve(searchParams) });
  const user = userEvent.setup();
  render(ui);
  return user;
}

const field = {
  email: () => screen.getByLabelText('Correo'),
  submit: () => screen.getByRole('button', { name: /Enviarme el enlace/ }),
};

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, email = 'ana@gmail.com') {
  await user.type(field.email(), email);
  await user.click(field.submit());
}

async function submitWithError(error: ApiError) {
  mockedForgot.mockRejectedValue(error);
  const user = await renderPage();
  await fillAndSubmit(user);
  return user;
}

beforeEach(() => mockedForgot.mockReset());

describe('/recuperar (T035)', () => {
  it('RNF-003-04: el título de la página es "Recuperar contraseña"', () => {
    expect(metadata.title).toBe('Recuperar contraseña');
  });

  it('RNF-003-04: pide el correo con su autocompletado y explica el enlace', async () => {
    await renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: '¿Olvidaste tu contraseña?' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/vence en 30 minutos/)).toBeInTheDocument();
    expect(field.email()).toHaveAttribute('type', 'email');
    expect(field.email()).toHaveAttribute('autocomplete', 'email');
    expect(field.submit()).toHaveAttribute('type', 'submit');
    expect(screen.getByText('Puedes pedir hasta 3 enlaces por hora.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ingresa' })).toHaveAttribute('href', '/ingresar');
  });

  it('RF-003-10: envía el cuerpo exacto { email } (recortado) y cambia el formulario por el aviso fijo', async () => {
    mockedForgot.mockResolvedValue(ok);
    const user = await renderPage();
    await fillAndSubmit(user, '  ana.quispe@gmail.com ');

    expect(mockedForgot).toHaveBeenCalledTimes(1);
    expect(mockedForgot).toHaveBeenCalledWith({ email: 'ana.quispe@gmail.com' });

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(SENT_TEXT);
    expect(notice).toHaveTextContent(SENT_HINT);
    expect(screen.queryByLabelText('Correo')).not.toBeInTheDocument();
    // El foco va al aviso para que el lector de pantalla lo anuncie.
    await waitFor(() => expect(notice.parentElement).toHaveFocus());
    expect(screen.getByRole('link', { name: 'Volver a ingresar' })).toHaveAttribute(
      'href',
      '/ingresar',
    );
  });

  it('RF-003-10: "Volver a ingresar" y el pie conservan codigo y next', async () => {
    mockedForgot.mockResolvedValue(ok);
    const user = await renderPage({ codigo: 'AB12CD34', next: '/grupos/1', otro: 'x' });
    expect(screen.getByRole('link', { name: 'Ingresa' })).toHaveAttribute(
      'href',
      '/ingresar?codigo=AB12CD34&next=%2Fgrupos%2F1',
    );
    await fillAndSubmit(user);
    expect(await screen.findByRole('link', { name: 'Volver a ingresar' })).toHaveAttribute(
      'href',
      '/ingresar?codigo=AB12CD34&next=%2Fgrupos%2F1',
    );
  });

  it('CA-003-09: dos respuestas 202 con message distinto muestran exactamente el mismo texto', async () => {
    // Aunque el servidor cambiara su texto (cuenta existente o no), la pantalla usa el suyo.
    mockedForgot.mockResolvedValue({ message: 'Enviado a una cuenta existente.' });
    let user = await renderPage();
    await fillAndSubmit(user, 'ana.quispe@gmail.com');
    const existing = (await screen.findByRole('status')).textContent;

    cleanup();
    mockedForgot.mockResolvedValue({ message: 'Ese correo no existe.' });
    user = await renderPage();
    await fillAndSubmit(user, 'nadie@gmail.com');
    const missing = (await screen.findByRole('status')).textContent;

    expect(existing).toBe(missing);
    expect(missing).toContain(SENT_TEXT);
    expect(screen.queryByText('Ese correo no existe.')).not.toBeInTheDocument();
  });

  it('RF-003-10: "Enviar de nuevo" vuelve al formulario con el correo escrito y enfocado', async () => {
    mockedForgot.mockResolvedValue(ok);
    const user = await renderPage();
    await fillAndSubmit(user, 'ana.quispe@gmail.com');
    await user.click(await screen.findByRole('button', { name: 'Enviar de nuevo' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await waitFor(() => expect(field.email()).toHaveFocus());
    expect(field.email()).toHaveValue('ana.quispe@gmail.com');
    await user.click(field.submit());
    expect(mockedForgot).toHaveBeenCalledTimes(2);
  });

  it('RNF-003-04: al enviar vacío marca el correo, lo enfoca y no envía', async () => {
    const user = await renderPage();
    await user.click(field.submit());
    expect(mockedForgot).not.toHaveBeenCalled();
    expect(field.email()).toHaveFocus();
    expect(field.email()).toHaveAccessibleDescription('Escribe tu correo.');
  });

  it('RNF-003-04: el correo sin forma válida muestra el error al salir del campo', async () => {
    const user = await renderPage();
    await user.type(field.email(), 'ana@');
    await user.tab();
    expect(field.email()).toHaveAttribute('aria-invalid', 'true');
    expect(field.email()).toHaveAccessibleDescription(
      'Escribe un correo válido, por ejemplo ana@gmail.com.',
    );
  });

  it('RNF-003-04: mientras envía, el botón está cargando y deshabilitado', async () => {
    mockedForgot.mockReturnValue(new Promise(() => {}));
    const user = await renderPage();
    await fillAndSubmit(user);
    expect(field.submit()).toBeDisabled();
    expect(field.submit()).toHaveAttribute('aria-busy', 'true');
    expect(field.submit()).toHaveTextContent('Cargando…');
    await user.click(field.submit());
    expect(mockedForgot).toHaveBeenCalledTimes(1);
  });

  it('CA-003-13: RATE_LIMITED muestra el mensaje de espera con los minutos de retryAfterSeconds', async () => {
    await submitWithError(new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 1500 }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Ya pediste 3 enlaces en la última hora. Espera 25 minutos para pedir otro.',
    );
    expect(within(alert).queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    await waitFor(() => expect(alert.parentElement).toHaveFocus());
    // El formulario sigue disponible.
    expect(field.email()).toBeInTheDocument();
  });

  it('CA-003-13: RATE_LIMITED sin retryAfterSeconds muestra el mensaje sin número', async () => {
    await submitWithError(new ApiError(429, 'RATE_LIMITED', 'x'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya pediste 3 enlaces en la última hora. Espera unos minutos para pedir otro.',
    );
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

  it('RNF-003-04: sin conexión muestra el aviso con Reintentar, que reenvía y muestra el éxito', async () => {
    mockedForgot
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'))
      .mockResolvedValueOnce(ok);
    const user = await renderPage();
    await fillAndSubmit(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo contactar con el servidor.');
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(mockedForgot).toHaveBeenCalledTimes(2);
    expect(mockedForgot.mock.calls[1]).toEqual(mockedForgot.mock.calls[0]);
    expect(await screen.findByRole('status')).toHaveTextContent(SENT_TEXT);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
