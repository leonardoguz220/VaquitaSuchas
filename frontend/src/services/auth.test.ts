import {
  changePassword,
  forgotPassword,
  getMe,
  getRegisterStatus,
  login,
  logout,
  register,
  type ChangePasswordRequest,
  resetPassword,
  type ForgotPasswordResponse,
  type ResetPasswordRequest,
  requestRegisterLink,
  type LoginResponse,
  type RegisterLinkResponse,
  type RegisterRequest,
  type RegisterResponse,
  type RegisterStatusResponse,
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
  beforeEach(() => mockedRequest.mockReset());

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

describe('services/auth (contrato 003, verificación por Telegram)', () => {
  beforeEach(() => mockedRequest.mockReset());

  it.each<RegisterStatusResponse>([
    { status: 'pending', expiresAt: '2026-10-18T17:10:00.000Z' },
    { status: 'expired' },
    { status: 'rejected', code: 'PHONE_NOT_BOLIVIAN' },
    // Lo que llega al navegador: el proxy ya quitó sessionToken (contrato 000 C).
    { status: 'verified', user },
  ])('RF-003-21: getRegisterStatus hace GET /api/auth/register/status ($status)', async (body) => {
    mockedRequest.mockResolvedValue(body);
    await expect(getRegisterStatus()).resolves.toEqual(body);
    expect(mockedRequest).toHaveBeenCalledWith('/api/auth/register/status');
  });

  it('RF-003-21: requestRegisterLink hace POST /api/auth/register/link sin cuerpo', async () => {
    const response: RegisterLinkResponse = {
      verification: {
        telegramUrl: 'https://t.me/vaquita_bot?start=nuevo456',
        expiresAt: '2026-10-18T17:20:00.000Z',
      },
    };
    mockedRequest.mockResolvedValue(response);
    await expect(requestRegisterLink()).resolves.toEqual(response);
    expect(mockedRequest).toHaveBeenCalledWith('/api/auth/register/link', { method: 'POST' });
  });
});

describe('services/auth (contrato 003, perfil: contraseña y cierre de sesión)', () => {
  it('RF-003-15: changePassword hace POST /api/auth/password/change con el cuerpo exacto y resuelve sin valor', async () => {
    // Lo que llega al navegador: el proxy movió sessionToken a la cookie y dejó `{}` (contrato 000 C).
    mockedRequest.mockResolvedValue({});
    const input: ChangePasswordRequest = {
      currentPassword: 'vaquita2026',
      newPassword: 'nuevaClave2027',
      newPasswordConfirmation: 'nuevaClave2027',
    };

    await expect(changePassword(input)).resolves.toBeUndefined();
    expect(mockedRequest).toHaveBeenCalledWith('/api/auth/password/change', {
      method: 'POST',
      body: input,
    });
  });

  it('RF-003-15: changePassword propaga el 422 CURRENT_PASSWORD_WRONG sin transformarlo', async () => {
    const error = new ApiError(
      422,
      'CURRENT_PASSWORD_WRONG',
      'La contraseña actual no es correcta.',
    );
    mockedRequest.mockRejectedValue(error);
    await expect(
      changePassword({
        currentPassword: 'equivocada1',
        newPassword: 'nuevaClave2027',
        newPasswordConfirmation: 'nuevaClave2027',
      }),
    ).rejects.toBe(error);
  });

  it('RF-003-07: logout hace POST /api/auth/logout sin cuerpo y resuelve sin valor (204)', async () => {
    mockedRequest.mockResolvedValue(undefined);
    await expect(logout()).resolves.toBeUndefined();
    expect(mockedRequest).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
  });
});
