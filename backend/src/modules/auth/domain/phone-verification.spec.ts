import { decideContact, type ContactCheck } from './phone-verification.js';

const ok: ContactCheck = {
  fromTelegramId: 10,
  contactUserId: 10,
  phoneNumber: '+59171234567',
  blocked: false,
  phoneTaken: false,
  telegramTaken: false,
};

describe('decideContact', () => {
  it('CA-003-27: contacto propio y celular boliviano libre → verificado', () => {
    expect(decideContact(ok)).toEqual({ outcome: 'verificado', phone: '+59171234567' });
  });

  it('CA-003-28: un contacto de otra cuenta de Telegram se rechaza', () => {
    expect(decideContact({ ...ok, contactUserId: 11 }).outcome).toBe('rechazado_contacto_ajeno');
    expect(decideContact({ ...ok, contactUserId: undefined }).outcome).toBe(
      'rechazado_contacto_ajeno',
    );
  });

  it('CA-003-25: un celular no boliviano se rechaza', () => {
    expect(decideContact({ ...ok, phoneNumber: '+5491112345678' }).outcome).toBe(
      'rechazado_no_boliviano',
    );
  });

  it('CA-003-22: huellas bloqueadas se rechazan', () => {
    expect(decideContact({ ...ok, blocked: true }).outcome).toBe('rechazado_bloqueado');
  });

  it('CA-003-26: celular o Telegram ya usados se rechazan', () => {
    expect(decideContact({ ...ok, phoneTaken: true }).outcome).toBe('rechazado_duplicado');
    expect(decideContact({ ...ok, telegramTaken: true }).outcome).toBe('rechazado_duplicado');
  });
});
