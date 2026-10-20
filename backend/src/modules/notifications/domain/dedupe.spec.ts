import { dedupeKey } from './dedupe.js';

const charge = { type: 'charge', id: '11111111-1111-4111-8111-111111111111' };

describe('dedupeKey (RNF-005-01)', () => {
  it('RNF-005-01: es estable para los mismos datos', () => {
    expect(dedupeKey('cobro_generado', charge)).toBe(dedupeKey('cobro_generado', { ...charge }));
    expect(dedupeKey('cobro_generado', charge)).toBe(
      'cobro_generado|charge:11111111-1111-4111-8111-111111111111',
    );
  });

  it('RNF-005-01: cambia con el tipo, la entidad, el período, el número y el destinatario', () => {
    const keys = [
      dedupeKey('cobro_generado', charge),
      dedupeKey('aviso_previo', charge),
      dedupeKey('cobro_generado', { type: 'group', id: charge.id }),
      dedupeKey('cobro_generado', charge, '2026-10'),
      dedupeKey('cobro_generado', charge, '2026-11'),
      dedupeKey('cobro_generado', charge, undefined, 1),
      dedupeKey('cobro_generado', charge, undefined, 2),
      dedupeKey('cobro_generado', charge, undefined, undefined, 'user-a'),
      dedupeKey('cobro_generado', charge, undefined, undefined, 'user-b'),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('RNF-005-01: un período no se confunde con un número ni con un destinatario', () => {
    expect(dedupeKey('t', charge, '1')).not.toBe(dedupeKey('t', charge, undefined, 1));
    expect(dedupeKey('t', charge, undefined, 1)).not.toBe(
      dedupeKey('t', charge, undefined, undefined, '1'),
    );
  });

  it('RNF-005-01: rechaza valores vacíos, con separador o un número inválido', () => {
    expect(() => dedupeKey('', charge)).toThrow();
    expect(() => dedupeKey('a|b', charge)).toThrow();
    expect(() => dedupeKey('t', { type: 'charge', id: '' })).toThrow();
    expect(() => dedupeKey('t', charge, 'a|b')).toThrow();
    expect(() => dedupeKey('t', charge, undefined, -1)).toThrow();
    expect(() => dedupeKey('t', charge, undefined, 1.5)).toThrow();
  });
});
