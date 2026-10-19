import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { FakeClock } from '../clock/fake-clock.js';
import { InvalidMailMessageError, MailDeliveryError } from '../ports/mail.service.js';
import { SmtpMailService } from './smtp-mail.service.js';

// Servidor SMTP de mentira en un puerto efímero de localhost: ninguna prueba sale a la red.

interface FakeSmtp {
  readonly port: number;
  readonly commands: string[];
  /** Mensaje recibido tras DATA, sin el punto final. */
  data(): string;
  close(): Promise<void>;
}

async function startFakeSmtp(options: { rejectRcpt?: boolean } = {}): Promise<FakeSmtp> {
  const commands: string[] = [];
  let received = '';
  const sockets = new Set<Socket>();

  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let inData = false;
    let buffer = '';
    socket.write('220 fake ESMTP\r\n');
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      if (inData) {
        if (!buffer.endsWith('\r\n.\r\n')) return;
        received = buffer.slice(0, -3);
        buffer = '';
        inData = false;
        socket.write('250 2.0.0 queued\r\n');
        return;
      }
      for (const line of buffer.split('\r\n').slice(0, -1)) {
        commands.push(line);
        if (line.startsWith('EHLO')) socket.write('250-fake\r\n250 8BITMIME\r\n');
        else if (line.startsWith('RCPT') && options.rejectRcpt)
          socket.write('550 no such user\r\n');
        else if (line === 'DATA') {
          inData = true;
          socket.write('354 go ahead\r\n');
        } else if (line === 'QUIT') socket.write('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
      buffer = '';
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    port: (server.address() as AddressInfo).port,
    commands,
    data: () => received,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

const MESSAGE = {
  to: 'ana@ejemplo.com',
  subject: 'Recuperación de contraseña',
  html: '<p>.Hola</p>',
  text: '.Hola',
};
const FROM = { name: 'Vaquita', address: 'no-reply@vaquita.local' };

describe('SmtpMailService', () => {
  let smtp: FakeSmtp;
  const clock = new FakeClock(new Date('2026-10-19T12:00:00.000Z'));

  afterEach(async () => {
    await smtp?.close();
  });

  it('CA-000-09: entrega el correo al servidor SMTP con el sobre y el mensaje MIME', async () => {
    smtp = await startFakeSmtp();
    const service = new SmtpMailService({ host: '127.0.0.1', port: smtp.port, from: FROM }, clock);

    await service.send(MESSAGE);

    expect(smtp.commands).toEqual([
      'EHLO vaquita.local',
      'MAIL FROM:<no-reply@vaquita.local>',
      'RCPT TO:<ana@ejemplo.com>',
      'DATA',
      'QUIT',
    ]);
    expect(smtp.data()).toContain('To: <ana@ejemplo.com>\r\n');
    expect(smtp.data()).toContain('Date: Mon, 19 Oct 2026 12:00:00 +0000\r\n');
  });

  it('CA-000-09: un destinatario rechazado por el servidor lanza MailDeliveryError sin repetir la dirección', async () => {
    smtp = await startFakeSmtp({ rejectRcpt: true });
    const service = new SmtpMailService({ host: '127.0.0.1', port: smtp.port, from: FROM }, clock);

    const failure = await service.send(MESSAGE).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MailDeliveryError);
    expect((failure as Error).message).toContain('550');
    expect((failure as Error).message).not.toContain('ana@ejemplo.com');
  });

  it('CA-000-09: sin servidor SMTP lanza MailDeliveryError', async () => {
    smtp = await startFakeSmtp();
    const { port } = smtp;
    await smtp.close();
    const service = new SmtpMailService({ host: '127.0.0.1', port, from: FROM }, clock);

    await expect(service.send(MESSAGE)).rejects.toBeInstanceOf(MailDeliveryError);
  });

  it('CA-000-09: un mensaje inválido no abre ninguna conexión', async () => {
    smtp = await startFakeSmtp();
    const service = new SmtpMailService({ host: '127.0.0.1', port: smtp.port, from: FROM }, clock);

    await expect(
      service.send({ ...MESSAGE, to: 'a@b.com\r\nRCPT TO:<x@y.com>' }),
    ).rejects.toBeInstanceOf(InvalidMailMessageError);
    expect(smtp.commands).toEqual([]);
  });
});
