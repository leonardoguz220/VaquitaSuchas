import {
  REGISTER_VERIFICATION_KEY,
  readRegisterVerification,
  saveRegisterVerification,
} from './verification-storage';

const verification = {
  telegramUrl: 'https://t.me/vaquita_bot?start=abc123',
  expiresAt: '2026-10-18T17:10:00.000Z',
};

beforeEach(() => window.sessionStorage.clear());

describe('verification-storage (paso de /registro a /registro/verificar)', () => {
  it('RF-003-21: guarda y lee telegramUrl y expiresAt en sessionStorage', () => {
    saveRegisterVerification(verification);
    expect(JSON.parse(window.sessionStorage.getItem(REGISTER_VERIFICATION_KEY)!)).toEqual(
      verification,
    );
    expect(readRegisterVerification()).toEqual(verification);
  });

  it('RF-003-21: sin dato o con una forma inválida devuelve null', () => {
    expect(readRegisterVerification()).toBeNull();
    window.sessionStorage.setItem(REGISTER_VERIFICATION_KEY, '{"telegramUrl":1}');
    expect(readRegisterVerification()).toBeNull();
    window.sessionStorage.setItem(REGISTER_VERIFICATION_KEY, 'no-json');
    expect(readRegisterVerification()).toBeNull();
  });

  it('RF-003-21: si sessionStorage falla no lanza', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveRegisterVerification(verification)).not.toThrow();
    spy.mockRestore();
  });
});
