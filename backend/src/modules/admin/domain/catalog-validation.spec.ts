import { describe, expect, it } from '@jest/globals';
import { csvToCatalogRows, parseAmountToCents, parseCsv } from './csv-parse.js';
import { validateCatalogRows, type RawCatalogRow } from './catalog-validation.js';

const service = (row: number, over: Record<string, unknown> = {}): RawCatalogRow => ({
  row,
  kind: 'service',
  fields: { slug: 'netflix', name: 'Netflix', category: 'video', ...over },
});
const plan = (row: number, over: Record<string, unknown> = {}): RawCatalogRow => ({
  row,
  kind: 'plan',
  fields: {
    serviceSlug: 'netflix',
    slug: 'netflix-premium',
    name: 'Premium',
    priceCents: 1999,
    currency: 'USD',
    maxSlots: 4,
    ...over,
  },
});

describe('validateCatalogRows', () => {
  it('acepta servicios y planes válidos', () => {
    const { rows, errors } = validateCatalogRows([service(1), plan(2)]);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it('CA-009-03: un slug repetido en el archivo es un error de esa fila', () => {
    const { rows, errors } = validateCatalogRows([service(1), service(2)]);
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([{ row: 2, field: 'slug', message: expect.any(String) }]);
  });

  it('CA-009-06: informa todos los errores por fila y campo', () => {
    const { errors } = validateCatalogRows([
      service(1, { slug: 'Mala Clave', category: 'inventada' }),
      plan(2, { maxSlots: 21, priceCents: 0 }),
      plan(3, { currency: 'EUR', slug: 'otro' }),
    ]);
    expect(errors.map((e) => `${e.row}:${e.field}`).sort()).toEqual(
      ['1:category', '1:slug', '2:maxSlots', '2:priceCents', '3:currency'].sort(),
    );
  });

  it('los cupos van de 2 a 20 (límites incluidos)', () => {
    expect(validateCatalogRows([plan(1, { maxSlots: 2 })]).errors).toEqual([]);
    expect(validateCatalogRows([plan(1, { maxSlots: 20 })]).errors).toEqual([]);
    expect(validateCatalogRows([plan(1, { maxSlots: 1 })]).errors).toHaveLength(1);
  });

  it('un tipo desconocido es un error', () => {
    expect(validateCatalogRows([{ row: 4, kind: 'otro', fields: {} }]).errors[0]).toMatchObject({
      row: 4,
      field: 'kind',
    });
  });
});

describe('csv', () => {
  it('parseCsv respeta comillas, comas internas y CRLF', () => {
    expect(parseCsv('﻿a,b\r\n"x,1","di ""hola"""\r\n')).toEqual([
      ['a', 'b'],
      ['x,1', 'di "hola"'],
    ]);
  });

  it('parseAmountToCents no usa float', () => {
    expect(parseAmountToCents('19.99')).toBe(1999);
    expect(parseAmountToCents('5,5')).toBe(550);
    expect(parseAmountToCents('7')).toBe(700);
    expect(parseAmountToCents('1.234')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
  });

  it('csvToCatalogRows numera desde la línea 2 y convierte montos y cupos', () => {
    const rows = csvToCatalogRows(
      'tipo,servicio,slug,nombre,categoria,precio,moneda,cupos\nservicio,,netflix,Netflix,video,,,\nplan,netflix,netflix-premium,Premium,,19.99,USD,4\n',
    );
    expect(rows.map((r) => r.row)).toEqual([2, 3]);
    expect(rows[1]).toMatchObject({
      kind: 'plan',
      fields: { serviceSlug: 'netflix', priceCents: 1999, currency: 'USD', maxSlots: 4 },
    });
    expect(validateCatalogRows(rows).errors).toEqual([]);
  });
});
