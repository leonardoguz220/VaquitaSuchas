import { register, type RegisterRequest, type RegisterResponse } from './auth';
import { apiRequest } from './http';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);

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
