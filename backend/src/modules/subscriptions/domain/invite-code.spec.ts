import { randomBytes } from 'node:crypto';
import { generateInviteCode, INVITE_CODE_ALPHABET } from './invite-code.js';

describe('generateInviteCode', () => {
  it('RF-001-06: tiene 8 caracteres del alfabeto sin 0/O, 1/I/L', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode(randomBytes);
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('RF-001-06: el alfabeto tiene 31 símbolos', () => {
    expect(INVITE_CODE_ALPHABET).toHaveLength(31);
  });

  it('RF-001-06: descarta bytes ≥ 248 y mapea el resto por módulo', () => {
    const bytes = Uint8Array.from([255, 248, 0, 1, 30, 31, 247, 249, 62, 2, 3, 4, 5, 6, 7, 8]);
    // válidos: 0→A, 1→B, 30→9, 31→A, 247→(247%31=30)→9, 62→A, 2→C, 3→D
    expect(generateInviteCode(() => bytes)).toBe('AB9A9ACD');
  });

  it('RF-001-06: pide más bytes cuando se descartan demasiados', () => {
    let calls = 0;
    const code = generateInviteCode(() => {
      calls += 1;
      return calls === 1 ? new Uint8Array(16).fill(255) : new Uint8Array(16).fill(0);
    });
    expect(code).toBe('AAAAAAAA');
    expect(calls).toBe(2);
  });
});
