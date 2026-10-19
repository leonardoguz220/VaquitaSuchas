import { formatBs, formatUsd } from '@/lib/money';
import { tigoPlay, netflix } from './__fixtures__/catalog';
import { formatCatalogPrice, fromPriceLabel, maxSlotsLabel } from './catalog-format';

describe('catalog-format (RF-004-02, plan 004 §6: sin convertir monedas)', () => {
  it('RF-004-02: un precio en USD se muestra en USD y uno en Bs en Bs, con la utilidad de lib/money', () => {
    expect(formatCatalogPrice(1799, 'USD')).toBe('USD 17,99');
    expect(formatCatalogPrice(1799, 'USD')).toBe(formatUsd(1799));
    expect(formatCatalogPrice(2550, 'BS')).toBe('Bs 25,50');
    expect(formatCatalogPrice(2550, 'BS')).toBe(formatBs(2550));
  });

  it('RF-004-02: «desde» usa fromPriceCents y fromCurrency tal como vienen, sin convertir', () => {
    expect(fromPriceLabel(netflix)).toBe('desde USD 7,99');
    expect(fromPriceLabel(tigoPlay)).toBe('desde Bs 25,51');
  });

  it('RF-004-02: sin fromPriceCents (objeto del detalle) no inventa un precio', () => {
    expect(fromPriceLabel({ fromPriceCents: undefined, fromCurrency: undefined })).toBeNull();
    expect(fromPriceLabel({ fromPriceCents: 799, fromCurrency: undefined })).toBeNull();
  });

  it('RF-004-02: los cupos máximos incluyen al titular', () => {
    expect(maxSlotsLabel(4)).toBe('Hasta 4 cupos (titular incluido)');
    expect(maxSlotsLabel(2)).toBe('Hasta 2 cupos (titular incluido)');
  });
});
