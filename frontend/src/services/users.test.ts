import type { UserSelf } from './auth';
import { ApiError, apiRequest } from './http';
import {
  getPhoneChangeStatus,
  startPhoneChange,
  updateMe,
  type PhoneChangeResponse,
  type PhoneChangeStatusResponse,
} from './users';

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
  lastLoginAt: '2026-10-17T22:15:00.000Z',
  createdAt: '2026-10-01T14:00:00.000Z',
};

beforeEach(() => mockedRequest.mockReset());

describe('services/users (contrato 003, perfil)', () => {
  it('RF-003-14: updateMe hace PATCH /api/users/me solo con { fullName } y devuelve el UserSelf', async () => {
    const updated: UserSelf = { ...user, fullName: 'Ana Quispe' };
    mockedRequest.mockResolvedValue(updated);

    await expect(updateMe({ fullName: 'Ana Quispe' })).resolves.toEqual(updated);
    expect(mockedRequest).toHaveBeenCalledWith('/api/users/me', {
      method: 'PATCH',
      body: { fullName: 'Ana Quispe' },
    });
  });

  it('RF-003-14: updateMe propaga el 400 FIELD_NOT_EDITABLE sin transformarlo', async () => {
    const error = new ApiError(400, 'FIELD_NOT_EDITABLE', 'Ese dato no se puede editar.');
    mockedRequest.mockRejectedValue(error);
    await expect(updateMe({ fullName: 'Ana' })).rejects.toBe(error);
  });

  it('RF-003-14: startPhoneChange hace POST /api/users/me/phone-change sin cuerpo y devuelve { verification }', async () => {
    const response: PhoneChangeResponse = {
      verification: {
        telegramUrl: 'https://t.me/vaquita_bot?start=cel789',
        expiresAt: '2026-10-18T17:10:00.000Z',
      },
    };
    mockedRequest.mockResolvedValue(response);

    await expect(startPhoneChange()).resolves.toEqual(response);
    expect(mockedRequest).toHaveBeenCalledWith('/api/users/me/phone-change', { method: 'POST' });
  });

  it('CA-003-32: getPhoneChangeStatus hace GET /api/users/me/phone-change/status y devuelve el estado tal cual', async () => {
    const response: PhoneChangeStatusResponse = { status: 'verified', user };
    mockedRequest.mockResolvedValue(response);

    await expect(getPhoneChangeStatus()).resolves.toEqual(response);
    expect(mockedRequest).toHaveBeenCalledWith('/api/users/me/phone-change/status');
  });
});
