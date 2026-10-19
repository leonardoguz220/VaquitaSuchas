import { buildMimeMessage, encodeHeaderValue } from './mime.js';

const DATE = new Date('2026-10-19T12:30:00.000Z');

function decodeWords(encoded: string): string {
  return [...encoded.matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)]
    .map((match) => Buffer.from(match[1] ?? '', 'base64').toString('utf8'))
    .join('');
}

function partBody(raw: string, contentType: string): string {
  const start = raw.indexOf(`Content-Type: ${contentType}; charset=UTF-8`);
  const body = raw.slice(start).split('\r\n\r\n')[1] ?? '';
  const base64 = body.split('\r\n--')[0] ?? '';
  return Buffer.from(base64.replace(/\r\n/g, ''), 'base64').toString('utf8');
}

describe('encodeHeaderValue', () => {
  it('RF-000-12: deja el ASCII corto tal cual', () => {
    expect(encodeHeaderValue('Codigo de ingreso')).toBe('Codigo de ingreso');
  });

  it('RF-000-12: codifica los acentos en UTF-8 y se puede decodificar', () => {
    const encoded = encodeHeaderValue('Recuperación de contraseña');

    expect(encoded).toMatch(/^=\?UTF-8\?B\?/);
    expect(decodeWords(encoded)).toBe('Recuperación de contraseña');
  });

  it('RF-000-12: parte los asuntos largos en palabras de menos de 75 caracteres sin cortar letras', () => {
    const subject = 'Cobro de Netflix Premium: ñandú çá €uro 🐄 '.repeat(6).trim();

    const encoded = encodeHeaderValue(subject);

    for (const line of encoded.split('\r\n')) expect(line.trim().length).toBeLessThan(75);
    expect(decodeWords(encoded)).toBe(subject);
  });
});

describe('buildMimeMessage', () => {
  const input = {
    from: { name: 'Vaquita', address: 'no-reply@vaquita.local' },
    message: {
      to: 'ana@ejemplo.com',
      subject: 'Tu cuota de marzo',
      html: '<p>Pagá <b>Bs 25,50</b> — ¡gracias!</p>',
      text: 'Pagá Bs 25,50 — ¡gracias!',
    },
    date: DATE,
    messageId: 'abc123@vaquita.local',
    boundary: 'vaquita-limite',
  };

  it('RF-000-12: arma las cabeceras con la fecha en UTC y CRLF', () => {
    const raw = buildMimeMessage(input);

    expect(raw).toContain('Date: Mon, 19 Oct 2026 12:30:00 +0000\r\n');
    expect(raw).toContain('From: Vaquita <no-reply@vaquita.local>\r\n');
    expect(raw).toContain('To: <ana@ejemplo.com>\r\n');
    expect(raw).toContain('Subject: Tu cuota de marzo\r\n');
    expect(raw).toContain('Message-ID: <abc123@vaquita.local>\r\n');
    expect(raw).toContain('Content-Type: multipart/alternative; boundary="vaquita-limite"\r\n');
    expect(raw).not.toMatch(/[^\r]\n/);
  });

  it('RF-000-12: lleva el texto y el HTML como partes UTF-8 recuperables', () => {
    const raw = buildMimeMessage(input);

    expect(partBody(raw, 'text/plain')).toBe(input.message.text);
    expect(partBody(raw, 'text/html')).toBe(input.message.html);
    expect(raw.trimEnd().endsWith('--vaquita-limite--')).toBe(true);
  });

  it('RF-000-12: ninguna línea supera los 76 caracteres aunque el cuerpo sea larga', () => {
    const raw = buildMimeMessage({
      ...input,
      message: { ...input.message, html: `<p>${'x'.repeat(5000)}</p>` },
    });

    for (const line of raw.split('\r\n')) expect(line.length).toBeLessThanOrEqual(76);
  });

  it('RF-000-12: sin nombre el remitente va solo entre ángulos', () => {
    const raw = buildMimeMessage({ ...input, from: { address: 'no-reply@vaquita.local' } });

    expect(raw).toContain('From: <no-reply@vaquita.local>\r\n');
  });
});
