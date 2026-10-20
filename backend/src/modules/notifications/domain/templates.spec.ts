import {
  NOTIFICATION_TYPES,
  categoryFor,
  NOTIFICATION_CATALOG,
  isNotificationType,
} from './catalog.js';
import {
  formatLaPazDate,
  formatLaPazDateTime,
  render,
  telegramTextFor,
  type NotificationData,
} from './templates.js';

const FULL: NotificationData = {
  personName: 'Ana Pérez',
  groupName: 'Netflix Familia',
  groupId: '11111111-1111-4111-8111-111111111111',
  chargeId: '22222222-2222-4222-8222-222222222222',
  requestId: '33333333-3333-4333-8333-333333333333',
  amountCents: 2550,
  // 2026-11-16T02:00Z es el 15 de noviembre a las 22:00 en La Paz.
  dueAt: new Date('2026-11-16T02:00:00Z'),
  reason: 'El monto no coincide',
  paymentInfo: 'Transferencia a la cuenta del titular',
  appUrl: 'https://vaquita.example',
  unsubscribeUrl: 'https://vaquita.example/avisos/desactivar?token=abc',
};

describe('catálogo de avisos (plan.md §5)', () => {
  it('RF-005-27: todos los tipos tienen entrada y la categoría por rol exige el rol', () => {
    for (const type of NOTIFICATION_TYPES) expect(isNotificationType(type)).toBe(true);
    expect(isNotificationType('inventado')).toBe(false);
    expect(categoryFor('cobro_generado')).toBe('recordatorios');
    expect(categoryFor('solicitud_mensaje', 'titular')).toBe('titular');
    expect(categoryFor('solicitud_mensaje', 'miembro')).toBe('grupo');
    expect(() => categoryFor('reclamo_abierto')).toThrow();
    expect(NOTIFICATION_CATALOG.aviso_previo.timing).toBe('ventana');
    expect(NOTIFICATION_CATALOG.cobro_generado.timing).toBe('inmediato');
  });
});

describe('render (RNF-005-07, RNF-005-02, CA-005-32)', () => {
  it.each(NOTIFICATION_TYPES)(
    'RNF-005-02: %s respeta los límites de la base y usa rutas internas',
    (type) => {
      const r = render(type, FULL);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.title.length).toBeLessThanOrEqual(120);
      expect(r.body.length).toBeLessThanOrEqual(500);
      if (r.link !== null) expect(r.link).toMatch(/^\/[^/]/);
      expect(r.emailSubject).toBe(r.title);
    },
  );

  it('RNF-005-07: el monto sale como Bs 25,50 y la fecha en hora de La Paz', () => {
    const r = render('cobro_generado', FULL);
    expect(r.body).toContain('Bs 25,50');
    expect(r.body).toContain('15 de noviembre de 2026');
    expect(r.body).not.toContain('16 de noviembre');
    expect(r.link).toBe(`/cobros/${FULL.chargeId}`);
  });

  it('RNF-005-07: formatea fechas y horas de La Paz', () => {
    expect(formatLaPazDate(new Date('2026-01-01T03:59:00Z'))).toBe('31 de diciembre de 2025');
    expect(formatLaPazDateTime(new Date('2026-11-16T02:05:00Z'))).toBe(
      '15 de noviembre de 2026, 22:05',
    );
  });

  it('CA-005-01: la notificación de cobro lleva monto, vencimiento y datos de pago', () => {
    const r = render('cobro_generado', FULL);
    expect(r.body).toContain('Bs 25,50');
    expect(r.body).toContain('vence el 15 de noviembre');
    expect(r.body).toContain(FULL.paymentInfo);
  });

  it('CA-005-32: Telegram lleva solo un texto corto y el enlace, sin montos ni datos de pago', () => {
    const r = render('cobro_generado', FULL);
    expect(r.telegramText).toBe(
      `Tienes un nuevo cobro en Vaquita. https://vaquita.example/cobros/${FULL.chargeId}`,
    );
    for (const type of NOTIFICATION_TYPES) {
      const t = render(type, FULL).telegramText;
      expect(t).not.toContain('Bs ');
      expect(t).not.toContain(FULL.paymentInfo);
      expect(t).not.toContain(FULL.reason);
    }
  });

  it('CA-005-32: telegramTextFor da el mismo texto que render para todos los tipos', () => {
    for (const type of NOTIFICATION_TYPES) {
      const r = render(type, FULL);
      expect(telegramTextFor(type, r.link, FULL.appUrl!)).toBe(r.telegramText);
    }
  });

  it('RNF-005-02: el correo no lleva datos de pago y sí el enlace de desactivación', () => {
    const r = render('cobro_generado', FULL);
    expect(r.emailText).not.toContain(FULL.paymentInfo);
    expect(r.emailText).toContain('Bs 25,50');
    expect(r.emailText).toContain('avisos/desactivar?token=abc');
    expect(
      render('cobro_generado', { ...FULL, unsubscribeUrl: undefined }).emailText,
    ).not.toContain('desactívalos');
  });

  it('CA-005-25: la solicitud nueva nombra al solicitante', () => {
    const r = render('solicitud_nueva', FULL);
    expect(r.title + r.body).toContain('Ana Pérez');
    expect(r.link).toBe(`/solicitudes/${FULL.requestId}`);
  });

  it('CA-005-26: los datos de pago de la solicitud llevan monto y el plazo de 15 minutos', () => {
    const r = render('solicitud_datos_pago', { ...FULL, minutes: 15 });
    expect(r.body).toContain('Bs 25,50');
    expect(r.body).toContain('15 minutos');
  });

  it('CA-005-28: el aviso de chat agrupa mensajes y no copia su contenido', () => {
    const r = render('solicitud_mensaje', { ...FULL, count: 3 });
    expect(r.title).toContain('3 mensajes');
    expect(r.body).toContain('3 mensajes sin leer');
  });

  it('RNF-005-02: recorta textos largos al límite de la base', () => {
    const r = render('pago_rechazado', { ...FULL, reason: 'x'.repeat(900) });
    expect(r.body.length).toBeLessThanOrEqual(500);
    expect(r.body.endsWith('…')).toBe(true);
  });

  it('RNF-005-02: falla si falta un dato del tipo', () => {
    expect(() => render('cobro_generado', {})).toThrow(/amountCents|groupName/);
    expect(() => render('pago_rechazado', { ...FULL, reason: undefined })).toThrow(/reason/);
  });
});
