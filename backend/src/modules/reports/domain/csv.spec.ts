import { describe, expect, it } from '@jest/globals';
import { buildCsv, csvEscapeCell, formatCsvAmount, formatCsvDate, type CsvColumn } from './csv.js';

describe('csvEscapeCell', () => {
  it('CA-006-16: neutraliza fórmulas con apóstrofo inicial', () => {
    for (const text of ['=CMD()', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) {
      expect(csvEscapeCell(text).replace(/^"/, '').startsWith("'")).toBe(true);
    }
    expect(csvEscapeCell('=CMD()')).toBe("'=CMD()");
  });

  it('pone comillas RFC 4180 con comas, comillas y saltos de línea', () => {
    expect(csvEscapeCell('a,b')).toBe('"a,b"');
    expect(csvEscapeCell('di "hola"')).toBe('"di ""hola"""');
    expect(csvEscapeCell('a\nb')).toBe('"a\nb"');
  });

  it('deja intacto el texto normal con acentos', () => {
    expect(csvEscapeCell('Niño Ñandú')).toBe('Niño Ñandú');
  });
});

describe('formatCsvAmount', () => {
  it('formatea sin float ni separador de miles', () => {
    expect(formatCsvAmount(2550)).toBe('25.50');
    expect(formatCsvAmount(5)).toBe('0.05');
    expect(formatCsvAmount(123456789)).toBe('1234567.89');
    expect(formatCsvAmount(-250)).toBe('-2.50');
  });
});

describe('buildCsv', () => {
  type Row = { name: string; cents: number; paidAt: Date | null };
  const columns: CsvColumn<Row>[] = [
    { header: 'miembro', kind: 'text', value: (r) => r.name },
    { header: 'monto_bs', kind: 'amount', value: (r) => r.cents },
    { header: 'fecha_pago', kind: 'date', value: (r) => r.paidAt },
  ];

  it('CA-006-15: BOM UTF-8, encabezado, montos numéricos y fechas de La Paz', () => {
    const csv = buildCsv(
      [{ name: 'José', cents: 2550, paidAt: new Date('2026-03-01T02:00:00Z') }],
      columns,
    );
    expect(csv.startsWith('﻿miembro,monto_bs,fecha_pago\r\n')).toBe(true);
    // 02:00 UTC del 1 de marzo es 22:00 del 28 de febrero en La Paz.
    expect(csv).toContain('José,25.50,2026-02-28\r\n');
  });

  it('CA-006-16: una celda =CMD() sale como texto', () => {
    const csv = buildCsv([{ name: '=CMD()', cents: 100, paidAt: null }], columns);
    expect(csv).toContain("'=CMD(),1.00,\r\n");
  });

  it('formatCsvDate usa la fecha de La Paz', () => {
    expect(formatCsvDate(new Date('2026-03-01T03:59:00Z'))).toBe('2026-02-28');
  });
});
