import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isPublicPath } from '@/lib/routes';
import { ApiError } from '@/services/http';
import { unsubscribeEmail } from '@/services/notifications';
import UnsubscribePage, { metadata } from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/avisos/desactivar',
}));

const mockedUnsubscribe = jest.mocked(unsubscribeEmail);

async function renderPage(token?: string | string[]) {
  const user = userEvent.setup();
  const searchParams = Promise.resolve(token === undefined ? {} : { token });
  render(await UnsubscribePage({ searchParams }));
  return user;
}

beforeEach(() => {
  replace.mockReset();
  mockedUnsubscribe.mockReset();
});

describe('/avisos/desactivar (spec 005 T023)', () => {
  it('RF-005-18: es pública, no se indexa y no envía el token como Referer', () => {
    expect(isPublicPath('/avisos/desactivar')).toBe(true);
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.referrer).toBe('no-referrer');
  });

  it('CA-005-13: abrir el enlace no desactiva nada hasta confirmar con el botón', async () => {
    await renderPage('tok.abc');
    expect(
      screen.getByRole('heading', { level: 1, name: '¿Dejar de recibir este tipo de correos?' }),
    ).toBeVisible();
    expect(mockedUnsubscribe).not.toHaveBeenCalled();
    expect(screen.queryByText('tok.abc')).not.toBeInTheDocument();
  });

  it('CA-005-13: al confirmar envía el token y muestra el tipo de correo desactivado', async () => {
    mockedUnsubscribe.mockResolvedValue({ category: 'recordatorios' });
    const user = await renderPage('tok.abc');
    await user.click(screen.getByRole('button', { name: 'Sí, dejar de recibirlos' }));
    expect(mockedUnsubscribe).toHaveBeenCalledWith('tok.abc');
    expect(
      await screen.findByText(/Ya no te enviaremos correos de «Recordatorios de pago»/),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ir a Ajustes de avisos' })).toHaveAttribute(
      'href',
      '/ajustes/avisos',
    );
  });

  it('RF-005-18: un token inválido (400) lo explica y lleva a los ajustes', async () => {
    mockedUnsubscribe.mockRejectedValue(new ApiError(400, 'VALIDATION_ERROR', 'x'));
    const user = await renderPage('malo');
    await user.click(screen.getByRole('button', { name: 'Sí, dejar de recibirlos' }));
    expect(await screen.findByText(/Este enlace no es válido/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /dejar de recibirlos|Reintentar/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Ir a Ajustes de avisos' })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('RF-005-18: un error de conexión permite reintentar', async () => {
    mockedUnsubscribe
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'))
      .mockResolvedValue({ category: 'grupo' });
    const user = await renderPage('tok.abc');
    await user.click(screen.getByRole('button', { name: 'Sí, dejar de recibirlos' }));
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/«Avisos de grupo»/)).toBeVisible();
    expect(mockedUnsubscribe).toHaveBeenCalledTimes(2);
  });

  it('RF-005-18: sin token no llama a la API y lo explica', async () => {
    await renderPage();
    expect(screen.getByText('Falta el código del enlace.')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
    expect(mockedUnsubscribe).not.toHaveBeenCalled();
  });

  it('RF-005-18: con varios token toma el primero', async () => {
    mockedUnsubscribe.mockResolvedValue({ category: 'titular' });
    const user = await renderPage(['uno', 'dos']);
    await user.click(screen.getByRole('button', { name: 'Sí, dejar de recibirlos' }));
    expect(mockedUnsubscribe).toHaveBeenCalledWith('uno');
  });
});
