import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { REGISTER_VERIFICATION_KEY } from '@/components/features/auth/verification-storage';
import { REGISTER_STATUS_POLL_MS } from '@/hooks/use-register-status';
import { isPublicPath } from '@/lib/routes';
import {
  getRegisterStatus,
  requestRegisterLink,
  type RegisterLinkResponse,
  type RegisterStatusResponse,
  type UserSelf,
} from '@/services/auth';
import { ApiError } from '@/services/http';
import RegisterVerifyPage, { metadata } from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }));
jest.mock('@/services/auth', () => ({
  getRegisterStatus: jest.fn(),
  requestRegisterLink: jest.fn(),
}));

const mockedStatus = jest.mocked(getRegisterStatus);
const mockedLink = jest.mocked(requestRegisterLink);

const NOW = new Date('2026-10-18T17:00:18.000Z');
const EXPIRES_AT = '2026-10-18T17:10:00.000Z';
const TELEGRAM_URL = 'https://t.me/vaquita_bot?start=abc123';

const pending: RegisterStatusResponse = { status: 'pending', expiresAt: EXPIRES_AT };

const newLink: RegisterLinkResponse = {
  verification: {
    telegramUrl: 'https://t.me/vaquita_bot?start=nuevo456',
    expiresAt: '2026-10-18T17:10:30.000Z',
  },
};

// Lo que llega al navegador: el proxy ya guardó la cookie y quitó sessionToken (contrato 000 C).
const user: UserSelf = {
  id: '6f1c2a9e-0d3b-4c1e-9a77-2b5f0e8d4c11',
  fullName: 'Ana Quispe Mamani',
  email: 'ana.quispe@gmail.com',
  ciMasked: '****123',
  phone: '+59171234567',
  role: 'usuario',
  status: 'activo',
  lastLoginAt: null,
  createdAt: '2026-10-18T17:00:00.000Z',
};

function storeVerification(telegramUrl = TELEGRAM_URL, expiresAt = EXPIRES_AT) {
  window.sessionStorage.setItem(
    REGISTER_VERIFICATION_KEY,
    JSON.stringify({ telegramUrl, expiresAt }),
  );
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function renderPage() {
  const actor = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<RegisterVerifyPage />);
  await advance(0);
  return actor;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

const focusWrapperOf = (text: string) => screen.getByText(text).closest('[tabindex="-1"]');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  replace.mockReset();
  mockedStatus.mockReset();
  mockedLink.mockReset();
  window.sessionStorage.clear();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => jest.useRealTimers());

describe('/registro/verificar (T024)', () => {
  it('RNF-003-04: el título de la página es "Verifica tu celular" y es el paso 2 de 2', async () => {
    expect(metadata.title).toBe('Verifica tu celular');
    mockedStatus.mockReturnValue(new Promise(() => {}));
    await renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Verifica tu celular con Telegram' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Paso 2 de 2/)).toBeInTheDocument();
  });

  it('RF-003-21: es una ruta pública (subruta de /registro)', () => {
    expect(isPublicPath('/registro/verificar')).toBe(true);
  });

  it('RNF-003-04: mientras carga muestra el esqueleto de la tarjeta', async () => {
    mockedStatus.mockReturnValue(new Promise(() => {}));
    await renderPage();
    const skeleton = screen.getByText('Cargando la verificación…').closest('[role="status"]');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('link', { name: /Abrir Telegram/ })).not.toBeInTheDocument();
  });

  it('RF-003-21: esperando muestra la explicación, los 3 pasos, Abrir Telegram y la cuenta regresiva', async () => {
    storeVerification();
    mockedStatus.mockResolvedValue(pending);
    await renderPage();

    expect(screen.getByText('Necesitas Telegram para verificar tu celular.')).toBeInTheDocument();
    expect(screen.getByText('Esperando que compartas tu número…')).toBeInTheDocument();
    const steps = within(screen.getByRole('list', { name: 'Pasos para verificar tu celular' }));
    expect(steps.getAllByRole('listitem')).toHaveLength(3);
    expect(steps.getByText(/Abre el bot/)).toBeInTheDocument();
    expect(steps.getByText('Iniciar')).toBeInTheDocument();
    expect(steps.getByText('Compartir mi número')).toBeInTheDocument();

    const open = screen.getByRole('link', { name: /Abrir Telegram/ });
    expect(open).toHaveAttribute('href', TELEGRAM_URL);
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    expect(open).toHaveClass('min-h-12'); // 48 px, toque cómodo en celular
    expect(screen.getByRole('timer')).toHaveTextContent('09:42');
  });

  it('RF-003-21: el QR del mismo enlace tiene texto alternativo y el enlace queda visible como alternativa', async () => {
    storeVerification();
    mockedStatus.mockResolvedValue(pending);
    await renderPage();

    const qr = screen.getByRole('img', { name: 'Código QR del enlace al bot de Telegram' });
    expect(qr.tagName.toLowerCase()).toBe('svg');
    // Secundario en celular: el botón es lo principal; el QR aparece desde md.
    expect(qr.closest('figure')).toHaveClass('hidden', 'md:flex');
    expect(screen.getByText(/Escanéalo con la cámara de tu celular/)).toBeInTheDocument();
    const textLink = screen.getByRole('link', { name: TELEGRAM_URL });
    expect(textLink).toHaveAttribute('href', TELEGRAM_URL);
  });

  it('RF-003-21: la cuenta regresiva baja cada segundo y solo anuncia el hito de 1 minuto', async () => {
    const soon = '2026-10-18T17:01:20.000Z'; // faltan 62 s
    storeVerification(TELEGRAM_URL, soon);
    mockedStatus.mockResolvedValue({ status: 'pending', expiresAt: soon });
    await renderPage();
    const milestone = () => document.querySelector('p.sr-only[aria-live="polite"]');

    expect(screen.getByRole('timer')).toHaveTextContent('01:02');
    expect(milestone()).toBeEmptyDOMElement();
    await advance(1000);
    expect(screen.getByRole('timer')).toHaveTextContent('01:01');
    expect(milestone()).toBeEmptyDOMElement();
    await advance(1000);
    expect(screen.getByRole('timer')).toHaveTextContent('01:00');
    expect(milestone()).toHaveTextContent('Queda menos de 1 minuto para que venza el enlace.');
  });

  it('RF-003-21: al llegar a 0 consulta al servidor y no declara vencido solo por el reloj', async () => {
    const soon = '2026-10-18T17:00:21.000Z'; // faltan 3 s
    storeVerification(TELEGRAM_URL, soon);
    mockedStatus.mockResolvedValue({ status: 'pending', expiresAt: soon });
    await renderPage();
    setVisibility('hidden'); // pausa el sondeo para aislar la consulta de la cuenta regresiva
    const calls = mockedStatus.mock.calls.length;

    await advance(3000);
    expect(mockedStatus).toHaveBeenCalledTimes(calls + 1);
    expect(screen.queryByText('El enlace venció.')).not.toBeInTheDocument();
    expect(screen.getByText('Comprobando si el enlace sigue vigente…')).toBeInTheDocument();
    expect(document.querySelector('p.sr-only[aria-live="polite"]')).toHaveTextContent(
      'Se acabó el tiempo del enlace. Comprobando…',
    );
  });

  it('RF-003-21: al llegar a 0, si el servidor responde expired muestra vencido', async () => {
    const soon = '2026-10-18T17:00:21.000Z';
    storeVerification(TELEGRAM_URL, soon);
    mockedStatus.mockResolvedValue({ status: 'pending', expiresAt: soon });
    await renderPage();
    setVisibility('hidden');
    mockedStatus.mockResolvedValue({ status: 'expired' });

    await advance(3000);
    expect(screen.getByText('El enlace venció.')).toBeInTheDocument();
  });

  it('RF-003-21: consulta cada 2 s mientras espera', async () => {
    storeVerification();
    mockedStatus.mockResolvedValue(pending);
    await renderPage();
    expect(mockedStatus).toHaveBeenCalledTimes(1);
    await advance(REGISTER_STATUS_POLL_MS * 3);
    expect(mockedStatus).toHaveBeenCalledTimes(4);
  });

  it('CA-003-27: verificado muestra el aviso de éxito, borra la verificación y redirige a /', async () => {
    storeVerification();
    mockedStatus.mockResolvedValueOnce(pending).mockResolvedValueOnce({ status: 'verified', user });
    await renderPage();
    await advance(REGISTER_STATUS_POLL_MS);

    expect(
      screen.getByText('¡Listo! Tu celular quedó verificado.').closest('[role="status"]'),
    ).not.toBeNull();
    expect(replace).toHaveBeenCalledWith('/');
    expect(window.sessionStorage.getItem(REGISTER_VERIFICATION_KEY)).toBeNull();
    await advance(REGISTER_STATUS_POLL_MS * 3);
    expect(mockedStatus).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['REGISTRATION_NOT_ALLOWED', 'No es posible crear la cuenta con estos datos.'],
    [
      'PHONE_NOT_BOLIVIAN',
      'El número que compartiste no es un celular boliviano. Usa una cuenta de Telegram con un número de Bolivia (+591).',
    ],
    ['PHONE_ALREADY_REGISTERED', 'Ya existe una cuenta con ese celular.'],
    ['TELEGRAM_ALREADY_REGISTERED', 'Ya existe una cuenta con esa cuenta de Telegram.'],
  ] as const)(
    'CA-003-28: rechazado con %s muestra su mensaje, enfoca el aviso y ofrece volver al registro',
    async (code, message) => {
      storeVerification();
      mockedStatus
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce({ status: 'rejected', code });
      await renderPage();
      await advance(REGISTER_STATUS_POLL_MS);

      expect(screen.getByRole('alert')).toHaveTextContent(message);
      expect(focusWrapperOf(message)).toHaveFocus();
      expect(screen.getByRole('link', { name: 'Volver al registro' })).toHaveAttribute(
        'href',
        '/registro',
      );
      expect(screen.queryByRole('link', { name: /Abrir Telegram/ })).not.toBeInTheDocument();
      await advance(REGISTER_STATUS_POLL_MS * 3);
      expect(mockedStatus).toHaveBeenCalledTimes(2);
    },
  );

  it('CA-003-28: un código de rechazo desconocido muestra el mensaje genérico', async () => {
    mockedStatus.mockResolvedValue({
      status: 'rejected',
      code: 'OTRO' as 'PHONE_NOT_BOLIVIAN',
    });
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No es posible crear la cuenta con estos datos.',
    );
  });

  it('CA-003-28: vencido muestra el aviso con ícono y texto, lo enfoca y deja de consultar', async () => {
    storeVerification();
    mockedStatus.mockResolvedValue({ status: 'expired' });
    await renderPage();

    expect(screen.getByText('El enlace venció.')).toBeInTheDocument();
    expect(focusWrapperOf('El enlace venció.')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Pedir un enlace nuevo' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Abrir Telegram/ })).not.toBeInTheDocument();
    await advance(REGISTER_STATUS_POLL_MS * 3);
    expect(mockedStatus).toHaveBeenCalledTimes(1);
  });

  it('RF-003-21: "Pedir un enlace nuevo" guarda la verificación nueva y vuelve a esperar', async () => {
    storeVerification();
    mockedStatus
      .mockResolvedValueOnce({ status: 'expired' })
      .mockResolvedValue({ status: 'pending', expiresAt: newLink.verification.expiresAt });
    mockedLink.mockResolvedValue(newLink);
    const actor = await renderPage();

    await actor.click(screen.getByRole('button', { name: 'Pedir un enlace nuevo' }));
    await advance(0);

    expect(mockedLink).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.sessionStorage.getItem(REGISTER_VERIFICATION_KEY)!)).toEqual(
      newLink.verification,
    );
    expect(screen.getByRole('link', { name: /Abrir Telegram/ })).toHaveAttribute(
      'href',
      newLink.verification.telegramUrl,
    );
    expect(screen.getByRole('timer')).toHaveTextContent('10:12');
    await advance(REGISTER_STATUS_POLL_MS);
    expect(mockedStatus).toHaveBeenCalledTimes(2);
  });

  it('CA-003-29: el sexto enlace (429) muestra el mensaje de espera con los minutos', async () => {
    mockedStatus.mockResolvedValue({ status: 'expired' });
    mockedLink.mockRejectedValue(
      new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 1200 }),
    );
    const actor = await renderPage();

    await actor.click(screen.getByRole('button', { name: 'Pedir un enlace nuevo' }));
    await advance(0);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Pediste demasiados enlaces. Espera 20 minutos.',
    );
  });

  it('RF-003-21: si el enlace responde 409 ALREADY_VERIFIED vuelve a consultar el estado', async () => {
    mockedStatus
      .mockResolvedValueOnce({ status: 'expired' })
      .mockResolvedValueOnce({ status: 'verified', user });
    mockedLink.mockRejectedValue(new ApiError(409, 'ALREADY_VERIFIED', 'x'));
    const actor = await renderPage();

    await actor.click(screen.getByRole('button', { name: 'Pedir un enlace nuevo' }));
    await advance(0);
    expect(mockedStatus).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('RF-003-04: si el enlace responde 401, el registro ya no está activo', async () => {
    mockedStatus.mockResolvedValue({ status: 'expired' });
    mockedLink.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    const actor = await renderPage();

    await actor.click(screen.getByRole('button', { name: 'Pedir un enlace nuevo' }));
    await advance(0);
    expect(
      screen.getByText('Tu registro ya no está activo. Vuelve a crear tu cuenta.'),
    ).toBeInTheDocument();
  });

  it('RF-003-04: con 401 del estado (sin vq_reg o vencido) pide volver a crear la cuenta', async () => {
    mockedStatus.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    await renderPage();

    const message = 'Tu registro ya no está activo. Vuelve a crear tu cuenta.';
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(focusWrapperOf(message)).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Volver al registro' })).toHaveAttribute(
      'href',
      '/registro',
    );
    await advance(REGISTER_STATUS_POLL_MS * 3);
    expect(mockedStatus).toHaveBeenCalledTimes(1);
  });

  it('RF-003-21: sin verificación en sessionStorage y pending, pide un enlace nuevo para continuar', async () => {
    mockedStatus.mockResolvedValue(pending);
    mockedLink.mockResolvedValue({
      verification: { telegramUrl: newLink.verification.telegramUrl, expiresAt: EXPIRES_AT },
    });
    const actor = await renderPage();

    expect(screen.getByText('Pide un enlace nuevo para continuar.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Abrir Telegram/ })).not.toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Pedir un enlace nuevo' }));
    await advance(0);
    expect(screen.getByRole('link', { name: /Abrir Telegram/ })).toHaveAttribute(
      'href',
      newLink.verification.telegramUrl,
    );
  });

  it('RF-003-21: si el enlace guardado no corresponde al vencimiento del servidor, pide uno nuevo', async () => {
    storeVerification(TELEGRAM_URL, '2026-10-18T16:40:00.000Z');
    mockedStatus.mockResolvedValue(pending);
    await renderPage();
    expect(screen.getByText('Pide un enlace nuevo para continuar.')).toBeInTheDocument();
  });

  it('RNF-003-04: sin conexión avisa "Sin conexión, reintentando…" y sigue consultando', async () => {
    storeVerification();
    mockedStatus
      .mockResolvedValueOnce(pending)
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'))
      .mockResolvedValue(pending);
    await renderPage();

    await advance(REGISTER_STATUS_POLL_MS);
    expect(screen.getByText('Sin conexión, reintentando…')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir Telegram/ })).toBeInTheDocument();
    await advance(REGISTER_STATUS_POLL_MS);
    expect(mockedStatus).toHaveBeenCalledTimes(3);
    expect(screen.queryByText('Sin conexión, reintentando…')).not.toBeInTheDocument();
  });

  it('RNF-003-04: sin conexión desde el inicio mantiene el esqueleto con el aviso', async () => {
    mockedStatus.mockRejectedValue(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    await renderPage();
    expect(screen.getByText('Cargando la verificación…')).toBeInTheDocument();
    expect(screen.getByText('Sin conexión, reintentando…')).toBeInTheDocument();
    await advance(REGISTER_STATUS_POLL_MS);
    expect(mockedStatus).toHaveBeenCalledTimes(2);
  });
});
