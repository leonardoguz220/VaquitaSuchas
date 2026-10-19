import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { REGISTER_VERIFICATION_KEY } from '@/components/features/auth/verification-storage';
import { getTelegramOutbox, simulateTelegram } from '@/services/dev-telegram';
import { ApiError } from '@/services/http';
import DevTelegramPage, { metadata } from './page';

const notFound = jest.fn(() => {
  throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
});
jest.mock('next/navigation', () => ({ notFound: () => notFound() }));
jest.mock('@/services/dev-telegram', () => ({
  simulateTelegram: jest.fn(),
  getTelegramOutbox: jest.fn(),
}));

const mockedSimulate = jest.mocked(simulateTelegram);
const mockedOutbox = jest.mocked(getTelegramOutbox);
const ORIGINAL_MODE = process.env.NEXT_PUBLIC_TELEGRAM_MODE;

function renderDevPage() {
  process.env.NEXT_PUBLIC_TELEGRAM_MODE = 'dev';
  const user = userEvent.setup();
  render(<DevTelegramPage />);
  return user;
}

const field = {
  token: () => screen.getByLabelText('Token'),
  telegramUserId: () => screen.getByLabelText('ID de Telegram simulado'),
  phoneNumber: () => screen.getByLabelText('Celular'),
  contactUserId: () => screen.getByLabelText('ID del contacto'),
};

beforeEach(() => {
  notFound.mockClear();
  mockedSimulate.mockReset();
  mockedOutbox.mockReset();
  window.sessionStorage.clear();
});

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.NEXT_PUBLIC_TELEGRAM_MODE;
  else process.env.NEXT_PUBLIC_TELEGRAM_MODE = ORIGINAL_MODE;
});

describe('/dev/telegram (T024, plan 003 §6)', () => {
  it.each([undefined, '', 'webhook'])(
    'RF-003-21: con NEXT_PUBLIC_TELEGRAM_MODE=%p responde 404',
    (mode) => {
      if (mode === undefined) delete process.env.NEXT_PUBLIC_TELEGRAM_MODE;
      else process.env.NEXT_PUBLIC_TELEGRAM_MODE = mode;
      expect(() => DevTelegramPage()).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
      expect(notFound).toHaveBeenCalledTimes(1);
    },
  );

  it('RF-003-21: en modo dev muestra el aviso "Solo para desarrollo" y los valores por defecto', () => {
    renderDevPage();
    expect(metadata.title).toBe('Bot de Telegram (desarrollo)');
    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Solo para desarrollo')).toBeInTheDocument();
    expect(field.token()).toHaveValue('');
    expect(field.telegramUserId()).toHaveValue('1001');
    expect(field.phoneNumber()).toHaveValue('+59171234567');
    expect(field.contactUserId()).toHaveValue('1001');
  });

  it('RF-003-21: prellena el token con el parámetro start del enlace guardado por /registro', () => {
    window.sessionStorage.setItem(
      REGISTER_VERIFICATION_KEY,
      JSON.stringify({
        telegramUrl: 'https://t.me/vaquita_bot?start=abc123',
        expiresAt: '2026-10-18T17:10:00.000Z',
      }),
    );
    renderDevPage();
    expect(field.token()).toHaveValue('abc123');
  });

  it('RF-003-21: el ID del contacto sigue al ID de Telegram hasta que se edita', async () => {
    const user = renderDevPage();
    await user.clear(field.telegramUserId());
    await user.type(field.telegramUserId(), '2002');
    expect(field.contactUserId()).toHaveValue('2002');
    await user.clear(field.contactUserId());
    await user.type(field.contactUserId(), '3003');
    await user.type(field.telegramUserId(), '9');
    expect(field.contactUserId()).toHaveValue('3003');
  });

  it('CA-003-27: "Enviar /start" manda kind start con el token y actualiza la bandeja', async () => {
    mockedSimulate.mockResolvedValue({ ok: true });
    mockedOutbox.mockResolvedValue([{ text: 'Comparte tu número' }]);
    const user = renderDevPage();
    await user.type(field.token(), 'abc123');
    await user.click(screen.getByRole('button', { name: 'Enviar /start' }));

    expect(mockedSimulate).toHaveBeenCalledWith({
      kind: 'start',
      telegramUserId: 1001,
      token: 'abc123',
    });
    expect(await screen.findByText('Se envió /start al bot.')).toBeInTheDocument();
    await waitFor(() => expect(mockedOutbox).toHaveBeenCalledWith(1001));
    expect(await screen.findByLabelText('Mensajes del bot')).toHaveTextContent(
      'Comparte tu número',
    );
  });

  it('CA-003-27: "Compartir contacto" manda kind contact con phoneNumber y contactUserId', async () => {
    mockedSimulate.mockResolvedValue(undefined);
    mockedOutbox.mockResolvedValue([]);
    const user = renderDevPage();
    await user.click(screen.getByRole('button', { name: 'Compartir contacto' }));

    expect(mockedSimulate).toHaveBeenCalledWith({
      kind: 'contact',
      telegramUserId: 1001,
      phoneNumber: '+59171234567',
      contactUserId: 1001,
    });
    expect(await screen.findByText('La bandeja está vacía.')).toBeInTheDocument();
  });

  it('CA-003-28: permite simular un contacto de otra cuenta y un número no boliviano', async () => {
    mockedSimulate.mockResolvedValue(undefined);
    mockedOutbox.mockResolvedValue([]);
    const user = renderDevPage();
    await user.clear(field.contactUserId());
    await user.type(field.contactUserId(), '2002');
    await user.clear(field.phoneNumber());
    await user.type(field.phoneNumber(), '+5491123456789');
    await user.click(screen.getByRole('button', { name: 'Compartir contacto' }));

    expect(mockedSimulate).toHaveBeenCalledWith({
      kind: 'contact',
      telegramUserId: 1001,
      phoneNumber: '+5491123456789',
      contactUserId: 2002,
    });
  });

  it('RNF-003-04: sin token no envía /start y marca el campo', async () => {
    const user = renderDevPage();
    await user.click(screen.getByRole('button', { name: 'Enviar /start' }));
    expect(mockedSimulate).not.toHaveBeenCalled();
    expect(field.token()).toHaveAttribute('aria-invalid', 'true');
    expect(field.token()).toHaveAccessibleDescription(
      expect.stringContaining('Pega el token del enlace.'),
    );
  });

  it('RNF-003-04: un ID de Telegram no numérico no se envía', async () => {
    const user = renderDevPage();
    await user.clear(field.telegramUserId());
    await user.type(field.telegramUserId(), 'abc');
    await user.click(screen.getByRole('button', { name: 'Compartir contacto' }));
    expect(mockedSimulate).not.toHaveBeenCalled();
    expect(field.telegramUserId()).toHaveAttribute('aria-invalid', 'true');
  });

  it('RF-003-21: si el backend falla muestra el código y el estado, sin el mensaje interno', async () => {
    mockedSimulate.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'detalle interno'));
    const user = renderDevPage();
    await user.type(field.token(), 'abc123');
    await user.click(screen.getByRole('button', { name: 'Enviar /start' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El backend respondió NOT_FOUND (404).',
    );
    expect(screen.queryByText(/detalle interno/)).not.toBeInTheDocument();
    expect(mockedOutbox).not.toHaveBeenCalled();
  });

  it('RF-003-21: "Actualizar" carga la bandeja y muestra el JSON tal cual', async () => {
    const outbox = [{ text: 'Listo, vuelve a Vaquita', buttons: [] }];
    mockedOutbox.mockResolvedValue(outbox);
    const user = renderDevPage();
    expect(screen.getByText(/Toca Actualizar/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actualizar' }));
    const pre = await screen.findByLabelText('Mensajes del bot');
    expect(pre.textContent).toBe(JSON.stringify(outbox, null, 2));
  });

  it('RNF-003-04: si la bandeja falla muestra el error', async () => {
    mockedOutbox.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'x'));
    const user = renderDevPage();
    await user.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar la bandeja (NETWORK_ERROR, 0).',
    );
  });
});
