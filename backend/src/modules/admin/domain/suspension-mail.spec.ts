import { buildSuspensionMail } from './suspension-mail.js';

describe('buildSuspensionMail', () => {
  it('RF-009-11: incluye el motivo y el contacto de apelaciones', () => {
    const mail = buildSuspensionMail({
      to: 'a@example.com',
      reason: 'Pagos falsos reportados',
      appealEmail: 'apelaciones@example.com',
    });
    expect(mail.to).toBe('a@example.com');
    expect(mail.text).toContain('Pagos falsos reportados');
    expect(mail.text).toContain('apelaciones@example.com');
    expect(mail.html).toContain('apelaciones@example.com');
  });

  it('RF-009-11: sin contacto configurado el correo sale igual, sin dirección inventada', () => {
    const mail = buildSuspensionMail({
      to: 'a@example.com',
      reason: 'Motivo de prueba',
      appealEmail: undefined,
    });
    expect(mail.text).toContain('Motivo de prueba');
    expect(mail.text).not.toContain('@');
  });

  it('RNF-009-03: escapa el HTML del motivo', () => {
    const mail = buildSuspensionMail({
      to: 'a@example.com',
      reason: '<script>x</script> motivo',
      appealEmail: undefined,
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});
