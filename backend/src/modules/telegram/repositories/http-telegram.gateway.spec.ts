import { jest } from '@jest/globals';
import { TelegramBotBlockedError, TelegramDeliveryError } from '../ports/telegram.gateway.js';
import { HttpTelegramGateway } from './http-telegram.gateway.js';

const TOKEN = 'TOKEN-SECRETO';

describe('HttpTelegramGateway', () => {
  it('RF-000-22: envía el mensaje con botón de contacto a api.telegram.org', async () => {
    const fetchFn = jest.fn(async () => new Response('{}', { status: 200 }));
    const gateway = new HttpTelegramGateway(TOKEN, fetchFn as unknown as typeof fetch);

    await gateway.sendMessage(7, {
      text: 'Hola',
      buttons: [{ text: 'Compartir', requestContact: true }],
    });

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(JSON.parse(init.body as string)).toMatchObject({
      chat_id: 7,
      text: 'Hola',
      reply_markup: { keyboard: [[{ text: 'Compartir', request_contact: true }]] },
    });
  });

  it('RF-000-22: el error de entrega no contiene el token', async () => {
    const failing = jest.fn(async () => {
      throw new Error(`fallo en https://api.telegram.org/bot${TOKEN}/sendMessage`);
    });
    const gateway = new HttpTelegramGateway(TOKEN, failing as unknown as typeof fetch);

    const error = await gateway.sendMessage(7, { text: 'Hola' }).catch((e: Error) => e);

    expect(error).toBeInstanceOf(TelegramDeliveryError);
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it('RF-000-22: una respuesta no 2xx lanza TelegramDeliveryError sin el token', async () => {
    const fetchFn = jest.fn(async () => new Response('{}', { status: 403 }));
    const gateway = new HttpTelegramGateway(TOKEN, fetchFn as unknown as typeof fetch);

    const error = await gateway.setWebhook('https://x.test/hook', 's').catch((e: Error) => e);

    expect(error).toBeInstanceOf(TelegramDeliveryError);
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it('CA-005-33: un 403 al enviar se reconoce como bot bloqueado', async () => {
    const fetchFn = jest.fn(async () => new Response('{}', { status: 403 }));
    const gateway = new HttpTelegramGateway(TOKEN, fetchFn as unknown as typeof fetch);

    await expect(gateway.sendMessage(1, { text: 'hola' })).rejects.toBeInstanceOf(
      TelegramBotBlockedError,
    );
  });
});
