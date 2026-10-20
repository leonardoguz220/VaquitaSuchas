import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createConnection, type Socket } from 'node:net';
import type { Clock } from '../clock/clock.js';
import { MailDeliveryError, type MailMessage, MailService } from '../ports/mail.service.js';
import { validateMailMessage, type Mailbox } from './domain/mail-message.js';
import { buildMimeMessage } from './domain/mime.js';

// Modo `dev` de MailService (RF-000-12, CA-000-09): entrega por SMTP a la bandeja local (Mailpit en
// localhost:1025). Es un cliente mínimo sin TLS ni autenticación: solo sirve para la bandeja de
// desarrollo y de CI; en producción se usa la API HTTPS del proveedor, y por eso este servicio
// nunca abre una conexión fuera de SMTP_HOST.

const DEFAULT_TIMEOUT_MS = 10_000;
const CLIENT_NAME = 'vaquita.local';
const CRLF = '\r\n';
const REPLY_LINE = /^(\d{3})([ -])/;

export interface SmtpMailOptions {
  readonly host: string;
  readonly port: number;
  readonly from: Mailbox;
  readonly timeoutMs?: number;
}

/** Lee respuestas SMTP (una o varias líneas «250-…», cerradas por «250 …») de un socket. */
class SmtpConnection {
  private buffer = '';
  private failure: MailDeliveryError | null = null;
  private wake: (() => void) | null = null;

  constructor(private readonly socket: Socket) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.notify();
    });
    socket.on('error', () => this.fail('No se pudo hablar con el servidor SMTP.'));
    socket.on('timeout', () => this.fail('El servidor SMTP tardó demasiado en responder.'));
    socket.on('close', () => this.fail('El servidor SMTP cerró la conexión.'));
  }

  private fail(message: string): void {
    this.failure ??= new MailDeliveryError(message);
    this.socket.destroy();
    this.notify();
  }

  private notify(): void {
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }

  /** Extrae del buffer la siguiente respuesta completa y devuelve su código, o `null` si falta. */
  private takeReply(): number | null {
    const lines = this.buffer.split(CRLF);
    for (let index = 0; index < lines.length - 1; index += 1) {
      const match = REPLY_LINE.exec(lines[index] ?? '');
      if (match?.[2] === ' ') {
        this.buffer = lines.slice(index + 1).join(CRLF);
        return Number(match[1]);
      }
    }
    return null;
  }

  async expectReply(expected: number): Promise<void> {
    for (;;) {
      const code = this.takeReply();
      if (code !== null) {
        if (code === expected) return;
        throw new MailDeliveryError(`El servidor SMTP rechazó el mensaje (código ${code}).`);
      }
      if (this.failure) throw this.failure;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }

  async command(line: string, expected: number): Promise<void> {
    this.socket.write(`${line}${CRLF}`);
    await this.expectReply(expected);
  }

  /** Envía la sección DATA con relleno de puntos (RFC 5321 §4.5.2) y espera la aceptación. */
  async sendData(data: string): Promise<void> {
    await this.command('DATA', 354);
    this.socket.write(`${data.replace(/^\./gm, '..')}.${CRLF}`);
    await this.expectReply(250);
  }

  close(): void {
    this.socket.destroy();
  }
}

export class SmtpMailService extends MailService {
  constructor(
    private readonly options: SmtpMailOptions,
    private readonly clock: Clock,
  ) {
    super();
  }

  async send(message: MailMessage): Promise<void> {
    validateMailMessage(message);
    const data = buildMimeMessage({
      from: this.options.from,
      message,
      date: this.clock.now(),
      messageId: `${randomUUID()}@${CLIENT_NAME}`,
      boundary: `vaquita-${randomUUID()}`,
    });

    const connection = await this.connect();
    try {
      await connection.expectReply(220);
      await connection.command(`EHLO ${CLIENT_NAME}`, 250);
      await connection.command(`MAIL FROM:<${this.options.from.address}>`, 250);
      await connection.command(`RCPT TO:<${message.to}>`, 250);
      await connection.sendData(data);
      await connection.command('QUIT', 221);
    } finally {
      connection.close();
    }
  }

  private async connect(): Promise<SmtpConnection> {
    const { host, port, timeoutMs = DEFAULT_TIMEOUT_MS } = this.options;
    const socket = createConnection({ host, port });
    socket.setTimeout(timeoutMs);
    try {
      await once(socket, 'connect', { signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      socket.destroy();
      throw new MailDeliveryError('No se pudo conectar con el servidor SMTP.');
    }
    return new SmtpConnection(socket);
  }
}
