import {
  getRegisterStatus,
  register,
  requestRegisterLink,
  type RegisterLinkResponse,
  type RegisterRequest,
  type RegisterResponse,
  type RegisterStatusResponse,
  type UserSelf,
} from './auth';
import { apiRequest } from './http';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);

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
