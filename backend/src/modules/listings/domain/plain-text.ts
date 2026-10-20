import { toLaPazParts } from '../../../shared/domain/la-paz.js';

export type PlainTextResult =
  { ok: true; value: string | null } | { ok: false; reason: 'TOO_LONG' | 'CONTROL_CHARS' };

// Todo control salvo el salto de línea (ya normalizado a \n).
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/;

/**
 * Texto libre de una publicación (RN-008-07): recorta, normaliza saltos de línea a `\n` y rechaza
 * caracteres de control. No altera `<` ni `&`: el escape es de quien lo muestra (CA-008-19).
 * Vacío tras recortar → `null`. El máximo cuenta caracteres Unicode, como `char_length`.
 */
export function normalizePlainText(input: string, max: number): PlainTextResult {
  const value = input.replace(/\r\n?/g, '\n').trim();
  if (CONTROL.test(value)) return { ok: false, reason: 'CONTROL_CHARS' };
  if ([...value].length > max) return { ok: false, reason: 'TOO_LONG' };
  return { ok: true, value: value === '' ? null : value };
}

export interface EntryWindowLike {
  isOpen: boolean;
  opensAt: Date | null;
  closesAt: Date | null;
}

const pad = (n: number): string => String(n).padStart(2, '0');

function formatDate(date: Date): string {
  const p = toLaPazParts(date);
  return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
}

/** «abierta hasta [fecha]» o «se abre el [fecha]» (RF-008-03, CA-008-23); fechas en America/La_Paz. */
export function entryWindowLabel(window: EntryWindowLike): string {
  if (window.isOpen && window.closesAt) return `abierta hasta ${formatDate(window.closesAt)}`;
  if (window.opensAt) return `se abre el ${formatDate(window.opensAt)}`;
  return 'cerrada';
}
