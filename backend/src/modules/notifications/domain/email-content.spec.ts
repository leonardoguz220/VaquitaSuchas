import { buildEmailContent } from './email-content.js';

const base = {
  title: 'Tu cobro de Netflix se acerca',
  body: 'Detalle <b>del</b> cobro con datos de pago',
  link: '/cobros/abc',
  appUrl: 'https://app.example.com',
  unsubscribeUrl: 'https://app.example.com/avisos/desactivar?token=t',
};

describe('buildEmailContent', () => {
  it('CA-005-13: todo correo lleva el enlace de desactivación, en texto y en HTML', () => {
    const mail = buildEmailContent({ ...base, type: 'aviso_previo' });
    expect(mail.subject).toBe(base.title);
    expect(mail.text).toContain(base.unsubscribeUrl);
    expect(mail.text).toContain('https://app.example.com/cobros/abc');
    expect(mail.html).toContain(`href="${base.unsubscribeUrl}"`);
    expect(mail.html).toContain('&lt;b&gt;');
  });

  it('RNF-005-02: los tipos con datos de pago no llevan el cuerpo de la app por correo', () => {
    const mail = buildEmailContent({ ...base, type: 'cobro_generado' });
    expect(mail.text).not.toContain('datos de pago');
    expect(mail.text).toContain('Entra a Vaquita');
  });
});
