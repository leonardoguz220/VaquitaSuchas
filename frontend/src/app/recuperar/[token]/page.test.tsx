import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetPassword } from '@/services/auth';
import { ApiError } from '@/services/http';
import ResetPasswordPage, { metadata } from './page';

jest.mock('@/services/auth', () => ({ resetPassword: jest.fn() }));

const mockedReset = jest.mocked(resetPassword);

const TOKEN = 'q3Vx9kPzR2mT7wLb4nYc8dHf1sJa6uEo0iGk5pXv';
const NEW_PASSWORD = 'nuevaclave2026';

async function renderPage(token = TOKEN) {
  const ui = await ResetPasswordPage({ params: Promise.resolve({ token }) });
  const user = userEvent.setup();
  render(ui);
  return user;
}

const field = {
  password: () => screen.getByLabelText('Nueva contraseña'),
  confirmation: () => screen.getByLabelText('Confirma la contraseña'),
  submit: () => screen.getByRole('button', { name: /Guardar contraseña/ }),
};

function ruleItem(text: string) {
  const list = screen.getByRole('list', { name: 'Reglas de la contraseña' });
  return within(list)
    .getAllByRole('listitem')
    .find((li) => li.textContent?.startsWith(text))!;
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  password = NEW_PASSWORD,
  confirmation = password,
) {
  await user.type(field.password(), password);
  await user.type(field.confirmation(), confirmation);
  await user.click(field.submit());
}

async function submitWithError(error: ApiError) {
  mockedReset.mockRejectedValue(error);
  const user = await renderPage();
  await fillAndSubmit(user);
  return user;
}

function expectTokenNotVisible() {
  expect(document.body.textContent).not.toContain(TOKEN);
}

beforeEach(() => mockedReset.mockReset());

describe('/recuperar/[token] (T035)', () => {
  it('RNF-003-04: el título es "Crear una contraseña nueva" y la ruta no se indexa ni manda Referer', () => {
    expect(metadata.title).toBe('Crear una contraseña nueva');
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.referrer).toBe('no-referrer');
  });

  it('RNF-003-04: pide la contraseña nueva y su confirmación con autocompletado new-password', async () => {
    await renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Crea una nueva contraseña' }),
    ).toBeInTheDocument();
    expect(field.password()).toHaveAttribute('type', 'password');
    expect(field.password()).toHaveAttribute('autocomplete', 'new-password');
    expect(field.confirmation()).toHaveAttribute('type', 'password');
    expect(field.confirmation()).toHaveAttribute('autocomplete', 'new-password');
    expect(field.submit()).toHaveAttribute('type', 'submit');
    expectTokenNotVisible();
  });

  it('RNF-003-04: las reglas se actualizan en vivo; la del correo queda como nota del servidor', async () => {
    const user = await renderPage();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(ruleItem('Al menos 10 caracteres')).toHaveTextContent(': pendiente');
    expect(
      screen.getByText('Tampoco puede ser igual a tu correo: lo comprobamos al guardar.'),
    ).toBeInTheDocument();
    // La lista describe al campo de la contraseña.
    expect(field.password()).toHaveAccessibleDescription(/Al menos 10 caracteres/);

    await user.type(field.password(), 'abcd1234');
    expect(ruleItem('Al menos 10 caracteres')).toHaveTextContent(': pendiente');
    expect(ruleItem('Al menos una letra')).toHaveTextContent(': cumplida');
    expect(ruleItem('Al menos un número')).toHaveTextContent(': cumplida');

    await user.type(field.password(), '56');
    expect(ruleItem('Al menos 10 caracteres')).toHaveTextContent(': cumplida');
  });

  it('RF-003-12: envía el cuerpo exacto { token, newPassword, newPasswordConfirmation } y muestra el aviso con "Ingresar"', async () => {
    mockedReset.mockResolvedValue(undefined);
    const user = await renderPage();
    await fillAndSubmit(user);

    expect(mockedReset).toHaveBeenCalledTimes(1);
    expect(mockedReset).toHaveBeenCalledWith({
      token: TOKEN,
      newPassword: NEW_PASSWORD,
      newPasswordConfirmation: NEW_PASSWORD,
    });

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('Tu contraseña se cambió. Cerramos tus otras sesiones.');
    await waitFor(() => expect(notice.parentElement).toHaveFocus());
    expect(screen.getByRole('link', { name: 'Ingresar' })).toHaveAttribute('href', '/ingresar');
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument();
    expectTokenNotVisible();
  });

  it('CA-003-11: un enlace vencido (410 RESET_TOKEN_INVALID) muestra el aviso y "Pedir otro enlace"', async () => {
    await submitWithError(new ApiError(410, 'RESET_TOKEN_INVALID', 'x', { canRequestNew: true }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Este enlace venció o ya se usó. Pide uno nuevo.');
    await waitFor(() => expect(alert.parentElement).toHaveFocus());
    expect(screen.getByRole('link', { name: 'Pedir otro enlace' })).toHaveAttribute(
      'href',
      '/recuperar',
    );
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument();
    expectTokenNotVisible();
  });

  it('CA-003-12: un enlace reemplazado por otro más nuevo (410) también permite pedir otro', async () => {
    // El backend responde lo mismo para vencido, usado o reemplazado.
    await submitWithError(
      new ApiError(410, 'RESET_TOKEN_INVALID', 'Reemplazado', { canRequestNew: true }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este enlace venció o ya se usó. Pide uno nuevo.',
    );
    expect(screen.getByRole('link', { name: 'Pedir otro enlace' })).toBeInTheDocument();
    expect(screen.queryByText('Reemplazado')).not.toBeInTheDocument();
  });

  it('RNF-003-04: al enviar vacío marca los dos campos, enfoca la contraseña y no envía', async () => {
    const user = await renderPage();
    await user.click(field.submit());
    expect(mockedReset).not.toHaveBeenCalled();
    expect(field.password()).toHaveFocus();
    expect(field.password()).toHaveAttribute('aria-invalid', 'true');
    expect(field.password()).toHaveAccessibleDescription(
      /La contraseña no cumple todas las reglas de la lista\./,
    );
    expect(field.confirmation()).toHaveAccessibleDescription('Vuelve a escribir la contraseña.');
  });

  it('RNF-003-04: la confirmación distinta marca la confirmación, la enfoca y no envía', async () => {
    const user = await renderPage();
    await fillAndSubmit(user, NEW_PASSWORD, 'nuevaclave2025');
    expect(mockedReset).not.toHaveBeenCalled();
    expect(field.confirmation()).toHaveFocus();
    expect(field.confirmation()).toHaveAccessibleDescription('Las contraseñas no coinciden.');
    expect(field.password()).not.toHaveAttribute('aria-invalid');
  });

  it('RF-003-12: VALIDATION_ERROR (política) marca la contraseña nueva y la enfoca', async () => {
    await submitWithError(
      new ApiError(400, 'VALIDATION_ERROR', 'x', { fields: { newPassword: ['WEAK_PASSWORD'] } }),
    );
    await waitFor(() => expect(field.password()).toHaveFocus());
    expect(field.password()).toHaveAttribute('aria-invalid', 'true');
    expect(field.password()).toHaveAccessibleDescription(
      /La contraseña debe tener al menos 10 caracteres, una letra y un número, y no ser igual al correo\./,
    );
  });

  it('RF-003-12: el error del servidor en un campo se va al corregirlo', async () => {
    const user = await submitWithError(
      new ApiError(400, 'VALIDATION_ERROR', 'x', { fields: { newPassword: ['WEAK_PASSWORD'] } }),
    );
    await waitFor(() => expect(field.password()).toHaveAttribute('aria-invalid', 'true'));
    await user.type(field.password(), 'x');
    expect(field.password()).not.toHaveAttribute('aria-invalid');
  });

  it('RNF-003-04: mientras envía, el botón está cargando y deshabilitado', async () => {
    mockedReset.mockReturnValue(new Promise(() => {}));
    const user = await renderPage();
    await fillAndSubmit(user);
    expect(field.submit()).toBeDisabled();
    expect(field.submit()).toHaveAttribute('aria-busy', 'true');
    expect(field.submit()).toHaveTextContent('Cargando…');
    await user.click(field.submit());
    expect(mockedReset).toHaveBeenCalledTimes(1);
  });

  it('RNF-003-04: un error inesperado muestra el mensaje genérico', async () => {
    await submitWithError(new ApiError(500, 'INTERNAL_ERROR', 'x'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ocurrió un error inesperado. Inténtalo de nuevo.',
    );
    expect(field.password()).toBeInTheDocument();
  });

  it('RNF-003-04: sin conexión muestra el aviso con Reintentar, que reenvía y muestra el éxito', async () => {
    mockedReset
      .mockRejectedValueOnce(new ApiError(504, 'GATEWAY_TIMEOUT', 'x'))
      .mockResolvedValueOnce(undefined);
    const user = await renderPage();
    await fillAndSubmit(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo contactar con el servidor.');
    await waitFor(() => expect(alert.parentElement).toHaveFocus());
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(mockedReset).toHaveBeenCalledTimes(2);
    expect(mockedReset.mock.calls[1]).toEqual(mockedReset.mock.calls[0]);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Tu contraseña se cambió. Cerramos tus otras sesiones.',
    );
  });
});
