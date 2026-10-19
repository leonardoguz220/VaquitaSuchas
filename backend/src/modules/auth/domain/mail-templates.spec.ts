import { passwordChangedMail, passwordResetMail } from './mail-templates.js';

describe('plantillas de correo', () => {
  it('RF-003-10: el correo de recuperación lleva el enlace y avisa que vale 30 minutos', () => {
    const mail = passwordResetMail('https://vaquita.test/recuperar/abc');
    expect(mail.text).toContain('https://vaquita.test/recuperar/abc');
    expect(mail.html).toContain('href="https://vaquita.test/recuperar/abc"');
    expect(mail.text).toContain('30 minutos');
  });

  it('RF-003-12: el aviso de cambio no incluye datos de la cuenta', () => {
    const mail = passwordChangedMail();
    expect(mail.subject).toContain('cambió');
    expect(mail.text).not.toMatch(/@|https?:/);
  });
});
