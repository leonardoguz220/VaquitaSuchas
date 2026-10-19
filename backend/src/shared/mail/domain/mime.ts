import type { MailMessage } from '../../ports/mail.service.js';
import type { Mailbox } from './mail-message.js';

// Construcción pura del mensaje RFC 5322 / MIME que se entrega por SMTP en modo `dev`.
// Todo el contenido no ASCII va en UTF-8: asunto con palabras codificadas (RFC 2047) y cuerpos en base64.

const CRLF = '\r\n';
const BASE64_LINE_LENGTH = 76;
// 45 bytes se codifican en 60 caracteres base64; con «=?UTF-8?B?» y «?=» la palabra queda en 72 (< 75).
const MAX_WORD_BYTES = 45;
const PLAIN_HEADER = /^[ -~]{1,60}$/;

export interface MimeInput {
  readonly from: Mailbox;
  readonly message: MailMessage;
  readonly date: Date;
  /** Identificador único del mensaje, sin los signos «<» y «>». */
  readonly messageId: string;
  /** Separador de las partes; no debe aparecer en los cuerpos. */
  readonly boundary: string;
}

function toBase64Lines(value: string): string {
  const encoded = Buffer.from(value, 'utf8').toString('base64');
  const lines: string[] = [];
  for (let index = 0; index < encoded.length; index += BASE64_LINE_LENGTH) {
    lines.push(encoded.slice(index, index + BASE64_LINE_LENGTH));
  }
  return lines.join(CRLF);
}

/** Palabras codificadas «=?UTF-8?B?…?=» sin partir ningún carácter en mitad de su secuencia UTF-8. */
export function encodeHeaderValue(value: string): string {
  if (PLAIN_HEADER.test(value)) return value;
  const words: string[] = [];
  let current = '';
  for (const character of value) {
    if (Buffer.byteLength(current + character, 'utf8') > MAX_WORD_BYTES) {
      words.push(current);
      current = '';
    }
    current += character;
  }
  if (current) words.push(current);
  return words
    .map((word) => `=?UTF-8?B?${Buffer.from(word, 'utf8').toString('base64')}?=`)
    .join(`${CRLF} `);
}

function formatMailbox({ name, address }: Mailbox): string {
  return name ? `${encodeHeaderValue(name)} <${address}>` : `<${address}>`;
}

function textPart(contentType: string, body: string): string[] {
  return [
    `Content-Type: ${contentType}; charset=UTF-8`,
    'Content-Transfer-Encoding: base64',
    '',
    toBase64Lines(body),
  ];
}

/** Devuelve el mensaje completo con saltos CRLF, listo para enviarse tras el comando DATA. */
export function buildMimeMessage({ from, message, date, messageId, boundary }: MimeInput): string {
  const lines = [
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `From: ${formatMailbox(from)}`,
    `To: <${message.to}>`,
    `Subject: ${encodeHeaderValue(message.subject)}`,
    `Message-ID: <${messageId}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    ...textPart('text/plain', message.text),
    `--${boundary}`,
    ...textPart('text/html', message.html),
    `--${boundary}--`,
    '',
  ];
  return lines.join(CRLF);
}
