import { NOTIFICATION_TYPES } from './catalog.js';
import { buildEmailContent } from './email-content.js';
import { render } from './templates.js';

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

describe('buildEmailContent con los textos reales de la app (RNF-005-02, T031)', () => {
  const data = {
    personName: 'Ana Pérez',
    groupName: 'Netflix Familia',
    groupId: '11111111-1111-4111-8111-111111111111',
    chargeId: '22222222-2222-4222-8222-222222222222',
    requestId: '33333333-3333-4333-8333-333333333333',
    disputeId: '44444444-4444-4444-8444-444444444444',
    amountCents: 2550,
    dueAt: new Date('2026-11-16T02:00:00Z'),
    period: '2026-11',
    reason: 'Motivo escrito',
    paymentInfo: 'MARCA-DE-DATOS-DE-PAGO',
    minutes: 15,
    count: 2,
    slotsFreed: 1,
  };

  it.each(NOTIFICATION_TYPES)('RNF-005-02: el correo de %s no lleva datos de pago', (type) => {
    const rendered = render(type, data);
    const mail = buildEmailContent({
      type,
      title: rendered.title,
      body: rendered.body,
      link: rendered.link,
      appUrl: base.appUrl,
      unsubscribeUrl: base.unsubscribeUrl,
    });
    expect(mail.text).not.toContain(data.paymentInfo);
    expect(mail.html).not.toContain(data.paymentInfo);
  });
});
