import { jest } from '@jest/globals';
import { InvalidMailMessageError, MailDeliveryError } from '../ports/mail.service.js';
import {
  BREVO_URL,
  BrevoMailService,
  RESEND_URL,
  ResendMailService,
  type FetchFn,
} from './http-mail.service.js';

const MESSAGE = {
  to: 'ana@ejemplo.com',
  subject: 'Recuperación de contraseña',
  html: '<p>Hola</p>',
  text: 'Hola',
};
const FROM = { name: 'Vaquita', address: 'no-reply@vaquita.app' };
const API_KEY = 'clave-ficticia-de-prueba';

function fakeFetch(response: Response | Error): jest.Mock<FetchFn> {
  return jest.fn<FetchFn>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
}

function requestOf(fetchFn: jest.Mock<FetchFn>): { url: string; init: RequestInit } {
  const [url, init] = fetchFn.mock.calls[0] ?? [];
  return { url: String(url), init: init ?? {} };
}

describe('ResendMailService', () => {
  it('RF-000-12: hace POST a api.resend.com/emails con la clave y el cuerpo de Resend', async () => {
    const fetchFn = fakeFetch(new Response('{"id":"1"}', { status: 200 }));

    await new ResendMailService({ apiKey: API_KEY, from: FROM }, fetchFn).send(MESSAGE);

    const { url, init } = requestOf(fetchFn);
    expect(url).toBe('https://api.resend.com/emails');
    expect(url).toBe(RESEND_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${API_KEY}` });
    expect(JSON.parse(String(init.body))).toEqual({
      from: 'Vaquita <no-reply@vaquita.app>',
      to: ['ana@ejemplo.com'],
      subject: MESSAGE.subject,
      html: MESSAGE.html,
      text: MESSAGE.text,
    });
  });

  it('RF-000-12: un rechazo del proveedor lanza MailDeliveryError solo con el estado HTTP', async () => {
    const fetchFn = fakeFetch(
      new Response(`{"message":"invalid to ${MESSAGE.to} ${API_KEY}"}`, { status: 403 }),
    );

    const failure = await new ResendMailService({ apiKey: API_KEY, from: FROM }, fetchFn)
      .send(MESSAGE)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MailDeliveryError);
    expect((failure as Error).message).toContain('403');
    expect((failure as Error).message).not.toContain(MESSAGE.to);
    expect((failure as Error).message).not.toContain(API_KEY);
  });

  it('RF-000-12: un fallo de red lanza MailDeliveryError sin la causa original', async () => {
    const fetchFn = fakeFetch(new Error(`fetch failed ${API_KEY}`));

    const failure = await new ResendMailService({ apiKey: API_KEY, from: FROM }, fetchFn)
      .send(MESSAGE)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MailDeliveryError);
    expect((failure as Error).message).not.toContain(API_KEY);
  });

  it('RF-000-12: un mensaje inválido no llama al proveedor', async () => {
    const fetchFn = fakeFetch(new Response('{}', { status: 200 }));

    await expect(
      new ResendMailService({ apiKey: API_KEY, from: FROM }, fetchFn).send({
        ...MESSAGE,
        to: 'no-es-correo',
      }),
    ).rejects.toBeInstanceOf(InvalidMailMessageError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('BrevoMailService', () => {
  it('RF-000-12: hace POST a la API de Brevo con api-key y el cuerpo de Brevo', async () => {
    const fetchFn = fakeFetch(new Response('{"messageId":"1"}', { status: 201 }));

    await new BrevoMailService({ apiKey: API_KEY, from: FROM }, fetchFn).send(MESSAGE);

    const { url, init } = requestOf(fetchFn);
    expect(url).toBe(BREVO_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'api-key': API_KEY });
    expect(JSON.parse(String(init.body))).toEqual({
      sender: { name: 'Vaquita', email: 'no-reply@vaquita.app' },
      to: [{ email: 'ana@ejemplo.com' }],
      subject: MESSAGE.subject,
      htmlContent: MESSAGE.html,
      textContent: MESSAGE.text,
    });
  });

  it('RF-000-12: un rechazo de Brevo lanza MailDeliveryError', async () => {
    const fetchFn = fakeFetch(new Response('{}', { status: 400 }));

    await expect(
      new BrevoMailService({ apiKey: API_KEY, from: { address: 'a@b.com' } }, fetchFn).send(
        MESSAGE,
      ),
    ).rejects.toBeInstanceOf(MailDeliveryError);
  });
});
