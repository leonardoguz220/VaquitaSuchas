import { toLaPazParts } from '../../../shared/domain/la-paz.js';

const BOM = '﻿';
const FORMULA_START = /^[=+\-@\t\r]/;

/** Celda de texto: neutraliza fórmulas con apóstrofo inicial y aplica comillas RFC 4180 (RNF-006-04). */
export function csvEscapeCell(text: string): string {
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Monto en centavos como `25.50`, sin separador de miles y sin `float`. */
export function formatCsvAmount(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('El monto debe ser un entero de centavos.');
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Fecha `AAAA-MM-DD` en hora de La Paz. */
export function formatCsvDate(date: Date): string {
  const p = toLaPazParts(date);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export type CsvValue = string | number | Date | null | undefined;
export type CsvColumnKind = 'text' | 'amount' | 'date';
export interface CsvColumn<Row> {
  header: string;
  kind: CsvColumnKind;
  value: (row: Row) => CsvValue;
}

function formatCell(kind: CsvColumnKind, value: CsvValue): string {
  if (value === null || value === undefined || value === '') return '';
  if (kind === 'amount') return formatCsvAmount(value as number);
  if (kind === 'date') return formatCsvDate(value as Date);
  return csvEscapeCell(String(value));
}

/** Encabezado de una exportación: BOM UTF-8 + nombres de columna. */
export function csvHeader<Row>(columns: readonly CsvColumn<Row>[]): string {
  return `${BOM}${columns.map((c) => c.header).join(',')}\r\n`;
}

/** Una fila ya formateada, lista para escribirse en flujo. */
export function csvRow<Row>(row: Row, columns: readonly CsvColumn<Row>[]): string {
  return `${columns.map((c) => formatCell(c.kind, c.value(row))).join(',')}\r\n`;
}

/** CSV completo con BOM, encabezado y filas. */
export function buildCsv<Row>(rows: readonly Row[], columns: readonly CsvColumn<Row>[]): string {
  return csvHeader(columns) + rows.map((row) => csvRow(row, columns)).join('');
}
