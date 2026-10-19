import { getTelegramOutbox, simulateTelegram, type TelegramSimulateRequest } from './dev-telegram';
import { apiRequest } from './http';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);

beforeEach(() => mockedRequest.mockReset());

describe('services/dev-telegram (contrato 000 B, solo en TELEGRAM_MODE=dev)', () => {
  it('RF-003-21: simulateTelegram envía /start con el cuerpo exacto del contrato', async () => {
    mockedRequest.mockResolvedValue({ ok: true });
    const body: TelegramSimulateRequest = { kind: 'start', telegramUserId: 1001, token: 'abc123' };
    await simulateTelegram(body);
    expect(mockedRequest).toHaveBeenCalledWith('/api/dev/telegram/simulate', {
      method: 'POST',
      body: { kind: 'start', telegramUserId: 1001, token: 'abc123' },
    });
  });

  it('RF-003-21: simulateTelegram envía el contacto con phoneNumber y contactUserId', async () => {
    mockedRequest.mockResolvedValue(undefined);
    const body: TelegramSimulateRequest = {
      kind: 'contact',
      telegramUserId: 1001,
      phoneNumber: '+59171234567',
      contactUserId: 1001,
    };
    await simulateTelegram(body);
    expect(mockedRequest).toHaveBeenCalledWith('/api/dev/telegram/simulate', {
      method: 'POST',
      body,
    });
  });

  it('RF-003-21: getTelegramOutbox hace GET con telegramUserId en la query y devuelve el cuerpo tal cual', async () => {
    const outbox = [{ any: 'shape' }];
    mockedRequest.mockResolvedValue(outbox);
    await expect(getTelegramOutbox(1001)).resolves.toBe(outbox);
    expect(mockedRequest).toHaveBeenCalledWith('/api/dev/telegram/outbox?telegramUserId=1001');
  });
});
