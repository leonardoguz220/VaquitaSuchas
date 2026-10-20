import type { RawCatalogRow } from './catalog-validation.js';

/** Lector CSV (RFC 4180): comillas dobles, comas y saltos de línea dentro de comillas, BOM y CRLF. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** `12.50` o `12,50` a centavos enteros, sin `float`; `null` si no es un monto con hasta 2 decimales. */
export function parseAmountToCents(text: string): number | null {
  const match = /^(\d{1,12})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
}

const COLUMNS: Record<string, string> = {
  tipo: 'kind',
  servicio: 'serviceSlug',
  slug: 'slug',
  nombre: 'name',
  categoria: 'category',
  logo_url: 'logoUrl',
  color: 'brandColor',
  precio: 'price',
  moneda: 'currency',
  cupos: 'maxSlots',
  precio_individual: 'individualPrice',
  verificado_el: 'verifiedOn',
  fuente: 'verifiedSource',
};
const KINDS: Record<string, string> = { servicio: 'service', plan: 'plan' };

/**
 * Filas del CSV del catálogo: encabezado `tipo,servicio,slug,nombre,categoria,logo_url,color,
 * precio,moneda,cupos,precio_individual,verificado_el,fuente`. El número de fila es el de la
 * línea del archivo (el encabezado es la 1). Los montos con decimales pasan a centavos aquí.
 */
export function csvToCatalogRows(input: string): RawCatalogRow[] {
  const [header, ...lines] = parseCsv(input);
  if (!header) return [];
  const keys = header.map((h) => COLUMNS[h.trim().toLowerCase()] ?? null);
  return lines.map((cells, index) => {
    const fields: Record<string, unknown> = {};
    keys.forEach((key, i) => {
      const value = (cells[i] ?? '').trim();
      if (key && value !== '') fields[key] = value;
    });
    for (const [source, target] of [
      ['price', 'priceCents'],
      ['individualPrice', 'individualPriceCents'],
    ] as const) {
      if (typeof fields[source] === 'string') {
        fields[target] = parseAmountToCents(fields[source]) ?? fields[source];
        delete fields[source];
      }
    }
    if (typeof fields['maxSlots'] === 'string' && /^\d+$/.test(fields['maxSlots'])) {
      fields['maxSlots'] = Number(fields['maxSlots']);
    }
    const kind = typeof fields['kind'] === 'string' ? fields['kind'].toLowerCase() : undefined;
    return { row: index + 2, kind: kind ? (KINDS[kind] ?? kind) : undefined, fields };
  });
}
