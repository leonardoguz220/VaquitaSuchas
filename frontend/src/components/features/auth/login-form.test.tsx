import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { login } from '@/services/auth';
import { ApiError } from '@/services/http';
import { LoginForm } from './login-form';

const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }));
jest.mock('@/services/auth', () => ({ login: jest.fn() }));

const mockedLogin = jest.mocked(login);

const NOW = new Date('2026-10-19T15:00:00.000Z');

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

/** Envía el formulario con datos válidos y deja que llegue la respuesta del servidor. */
async function submitWith(error: ApiError) {
  mockedLogin.mockRejectedValueOnce(error);
  const actor = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<LoginForm redirectTo="/" forgotHref="/recuperar" />);
  await actor.type(screen.getByLabelText('Correo'), 'ana.quispe@gmail.com');
  await actor.type(screen.getByLabelText('Contraseña'), 'clave-segura-123');
  await actor.click(screen.getByRole('button', { name: 'Ingresar' }));
  await advance(0);
  return actor;
}

const submitButton = () => screen.getByRole('button', { name: 'Ingresar' });

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  replace.mockReset();
  mockedLogin.mockReset();
});

afterEach(() => jest.useRealTimers());

describe('LoginForm: espera tras RATE_LIMITED (T032)', () => {
  it('CA-003-06 / RNF-003-04: RATE_LIMITED con retryAfterSeconds 90 muestra el tiempo y deshabilita el botón', async () => {
    await submitWith(new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 90 }));

    expect(screen.getByRole('timer')).toHaveTextContent('01:30');
    const visible = screen
      .getAllByText(/Hiciste demasiados intentos\. Espera/)
      .filter((el) => el.closest('[aria-live="polite"]') === null);
    expect(visible).toHaveLength(1);
    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveAttribute('aria-disabled', 'true');
    // Los campos siguen editables durante la espera.
    expect(screen.getByLabelText('Correo')).toBeEnabled();
    expect(screen.getByLabelText('Contraseña')).toBeEnabled();
  });

  it('CA-003-06 / RNF-003-04: la región en vivo anuncia solo el inicio de la espera', async () => {
    await submitWith(new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 90 }));

    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toHaveTextContent(
      'Hiciste demasiados intentos. Espera 01:30 para volver a intentarlo.',
    );
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'off');
    await advance(1000);
    expect(live).toHaveTextContent(
      'Hiciste demasiados intentos. Espera 01:30 para volver a intentarlo.',
    );
  });

  it('CA-003-06 / RNF-003-04: el contador baja con el reloj y, al llegar a 0, habilita el botón sin enviar', async () => {
    await submitWith(new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 90 }));
    expect(mockedLogin).toHaveBeenCalledTimes(1);

    await advance(1000);
    expect(screen.getByRole('timer')).toHaveTextContent('01:29');
    expect(submitButton()).toBeDisabled();

    await advance(88_000);
    expect(screen.getByRole('timer')).toHaveTextContent('00:01');
    expect(submitButton()).toBeDisabled();

    await advance(1000);
    expect(submitButton()).toBeEnabled();
    expect(submitButton()).not.toHaveAttribute('aria-disabled');
    // El texto aparece en el aviso visible y en la región en vivo (sr-only).
    const visibleText = screen
      .getAllByText('Ya puedes intentarlo de nuevo.')
      .filter((el) => el.closest('[aria-live="polite"]') === null);
    expect(visibleText).toHaveLength(1);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(
      'Ya puedes intentarlo de nuevo.',
    );
    // Llegar a 0 no envía nada automáticamente.
    expect(mockedLogin).toHaveBeenCalledTimes(1);
  });

  it('CA-003-06: RATE_LIMITED sin retryAfterSeconds no tiene cuenta regresiva y muestra el aviso estático', async () => {
    await submitWith(new ApiError(429, 'RATE_LIMITED', 'x'));

    expect(
      screen.getByText('Hiciste demasiados intentos. Espera unos minutos e inténtalo de nuevo.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
    expect(submitButton()).not.toHaveAttribute('aria-disabled');
  });

  it('RNF-003-02 / CA-003-05: INVALID_CREDENTIALS no deshabilita el botón ni muestra cuenta regresiva', async () => {
    await submitWith(new ApiError(401, 'INVALID_CREDENTIALS', 'x'));

    expect(screen.getByText('Correo o contraseña incorrectos.')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
    expect(submitButton()).not.toHaveAttribute('aria-disabled');
  });
});
