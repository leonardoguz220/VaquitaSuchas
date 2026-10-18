import {
  forgotPassword,
  getMe,
  login,
  register,
  resetPassword,
  type ForgotPasswordResponse,
  type ResetPasswordRequest,
  type LoginResponse,
  type RegisterRequest,
  type RegisterResponse,
  type UserSelf,
} from './auth';
import { ApiError, apiRequest } from './http';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

const user: UserSelf = {
  id: '6f1c2a9e-1b2c-4d3e-8f9a-0b1c2d3e4f5a',
  fullName: 'Ana Quispe Mamani',
  email: 'ana.quispe@gmail.com',
  ciMasked: '*****123',
  phone: '+59171234567',
  role: 'usuario',
  status: 'activo',
  lastLoginAt: null,
  createdAt: '2026-10-18T14:00:00.000Z',
};

beforeEach(() => mockedRequest.mockReset());

describe('services/auth (contrato 003, POST /auth/register)', () => {
  it('RF-003-01: register hace POST /api/auth/register con el cuerpo exacto del contrato', async () => {
    // Lo que llega al navegador: el proxy ya quitó registrationSecret (contrato 000 C).
    const response: RegisterResponse = {
      verification: {
        telegramUrl: 'https://t.me/vaquita_bot?start=abc123',
        expiresAt: '2026-10-18T17:10:00.000Z',
      },
    };
    mockedRequest.mockResolvedValue(response);
    const input: RegisterRequest = {
      fullName: 'Ana Quispe Mamani',
      email: 'ana.quispe@gmail.com',
      ci: '7845123',
      password: 'vaquita2026',
      passwordConfirmation: 'vaquita2026',
      acceptDataPolicy: true,
    };

    await expect(register(input)).resolves.toEqual(response);
    expect(mockedRequest).toHaveBeenCalledWith('/api/auth/register', {
      method: 'POST',
      body: input,
    });
  });
});

describe('services/auth (contrato 003, sesión)', () => {
  it('RF-003-06: login hace POST /api/auth/login con { email, password } y devuelve { user }', async () => {
    // Lo que llega al navegador: el proxy ya movió sessionToken a la cookie (contrato 000 C).
    const response: LoginResponse = { user };
    mockedRequest.mockResolvedValue(response);
    const input = { email: 'ana.quispe@gmail.com', password: 'vaquita2026' };

    await expect(login(input)).resolves.toEqual(response);
    expect(mockedRequest).toHaveBeenCalledWith('/api/auth/login', { method: 'POST', body: input });
  });

  it('CA-003-05: login propaga el 401 INVALID_CREDENTIALS sin transformarlo', async () => {
    const error = new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    mockedRequest.mockRejectedValue(error);
    await expect(login({ email: 'x@y.com', password: 'z' })).rejects.toBe(error);
  });

  it('RF-003-08: getMe hace GET /api/auth/me y devuelve el UserSelf', async () => {
    mockedRequest.mockResolvedValue(user);
    await expect(getMe()).resolves.toEqual(user);
    expect(mockedRequest).toHaveBeenCalledWith('/api/auth/me');
  });

  it('RF-003-08: getMe propaga el 401 sin sesión', async () => {
    const error = new ApiError(401, 'UNAUTHENTICATED', 'Inicia sesión.');
    mockedRequest.mockRejectedValue(error);
    await expect(getMe()).rejects.toBe(error);
  });
});

describe('services/auth (contrato 003, recuperación de contraseña)', () => {
  it('RF-003-10: forgotPassword hace POST /api/auth/password/forgot con { email } y devuelve { message }', async () => {
    const response: ForgotPasswordResponse = {
      message: 'Si el correo está registrado, recibirás un enlace en unos minutos.',
    };
    mockedRequest.mockResolvedValue(response);

    await expect(forgotPassword({ email: 'ana.quispe@gmail.com' })).resolves.toEqual(response);
    expect(mockedRequest).toHaveBeenCalledWith('/api/auth/password/forgot', {
      method: 'POST',
      body: { email: 'ana.quispe@gmail.com' },
    });
  });

  it('CA-003-13: forgotPassword propaga el 429 RATE_LIMITED sin transformarlo', async () => {
    const error = new ApiError(429, 'RATE_LIMITED', 'Demasiados pedidos.', {
      retryAfterSeconds: 1200,
    });
    mockedRequest.mockRejectedValue(error);
    await expect(forgotPassword({ email: 'ana.quispe@gmail.com' })).rejects.toBe(error);
  });

  it('RF-003-12: resetPassword hace POST /api/auth/password/reset con el cuerpo exacto y resuelve sin valor (204)', async () => {
    mockedRequest.mockResolvedValue(undefined);
    const input: ResetPasswordRequest = {
      token: 'q3Vx9kPz-token-de-prueba',
      newPassword: 'nuevaclave2026',
      newPasswordConfirmation: 'nuevaclave2026',
    };

    await expect(resetPassword(input)).resolves.toBeUndefined();
    expect(mockedRequest).toHaveBeenCalledWith('/api/auth/password/reset', {
      method: 'POST',
      body: input,
    });
  });

  it('CA-003-11: resetPassword propaga el 410 RESET_TOKEN_INVALID con sus details', async () => {
    const error = new ApiError(410, 'RESET_TOKEN_INVALID', 'Este enlace venció o ya se usó.', {
      canRequestNew: true,
    });
    mockedRequest.mockRejectedValue(error);
    await expect(
      resetPassword({ token: 't', newPassword: 'a', newPasswordConfirmation: 'a' }),
    ).rejects.toBe(error);
  });
});
