import { keyHash } from './key-hash.js';

describe('keyHash', () => {
  it('es estable, depende del tipo y de la clave, y no contiene el valor', () => {
    const hash = keyHash('clave', 'ip', '10.0.0.1');
    expect(hash).toBe(keyHash('clave', 'ip', '10.0.0.1'));
    expect(hash).not.toBe(keyHash('clave', 'email', '10.0.0.1'));
    expect(hash).not.toBe(keyHash('otra', 'ip', '10.0.0.1'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('10.0.0.1');
  });
});
