import {
  DEFAULT_PREFERENCES,
  deliveryPlan,
  inSendWindow,
  nextWindowOpening,
  type DeliveryPreferences,
} from './delivery-rules.js';

const recordatorio = { category: 'recordatorios', timing: 'ventana' } as const;
const inmediato = { category: 'titular', timing: 'inmediato' } as const;
const active = { status: 'activo' };
const prefs = (over: Partial<DeliveryPreferences> = {}): DeliveryPreferences => ({
  ...DEFAULT_PREFERENCES,
  ...over,
});

describe('deliveryPlan', () => {
  it('por defecto el correo queda pendiente y los recordatorios respetan la ventana', () => {
    expect(deliveryPlan(recordatorio, prefs(), active, ['email'])).toEqual([
      { channel: 'email', status: 'pending', respectWindow: true },
    ]);
    expect(deliveryPlan(inmediato, prefs(), active)[0]).toMatchObject({ respectWindow: false });
  });

  it('CA-005-11: correo de recordatorios desactivado → skipped con motivo', () => {
    const off = prefs({ email: { ...DEFAULT_PREFERENCES.email, recordatorios: false } });
    expect(deliveryPlan(recordatorio, off, active, ['email'])).toEqual([
      {
        channel: 'email',
        status: 'skipped',
        respectWindow: true,
        reason: 'preferencia_desactivada',
      },
    ]);
    // Otra categoría sigue encendida.
    expect(deliveryPlan(inmediato, off, active)[0]).toMatchObject({ status: 'pending' });
  });

  it('RN-005-04: usuario suspendido o baneado no recibe correos', () => {
    for (const status of ['suspendido', 'baneado']) {
      expect(deliveryPlan(inmediato, prefs(), { status })[0]).toMatchObject({
        status: 'skipped',
        reason: 'usuario_suspendido',
      });
    }
  });

  it('correo rebotado y Telegram bloqueado cortan su canal', () => {
    const bounced = prefs({ emailBouncedAt: new Date() });
    expect(deliveryPlan(inmediato, bounced, active)[0]).toMatchObject({
      reason: 'correo_rebotado',
    });
    const blocked = prefs({ telegramBlockedAt: new Date() });
    expect(deliveryPlan(inmediato, blocked, active, ['telegram'])[0]).toMatchObject({
      channel: 'telegram',
      reason: 'telegram_bloqueado',
    });
    expect(deliveryPlan(inmediato, blocked, active)[0]).toMatchObject({ status: 'pending' });
  });
});

describe('ventana de envío', () => {
  // La Paz es UTC−4: 08:00 local = 12:00 UTC.
  it('CA-005-24: abre a las 08:00 y cierra a las 19:59:59 de La Paz', () => {
    expect(inSendWindow(new Date('2026-10-20T11:59:59Z'))).toBe(false);
    expect(inSendWindow(new Date('2026-10-20T12:00:00Z'))).toBe(true);
    expect(inSendWindow(new Date('2026-10-21T23:59:59Z'))).toBe(true);
    expect(inSendWindow(new Date('2026-10-21T00:00:00Z'))).toBe(false);
  });

  it('CA-005-24: a las 21:00 de La Paz espera hasta las 08:00 del día siguiente', () => {
    const night = new Date('2026-10-21T01:00:00Z'); // 21:00 del 20
    expect(nextWindowOpening(night).toISOString()).toBe('2026-10-21T12:00:00.000Z');
    const early = new Date('2026-10-20T08:00:00Z'); // 04:00 del 20
    expect(nextWindowOpening(early).toISOString()).toBe('2026-10-20T12:00:00.000Z');
    const open = new Date('2026-10-20T15:00:00Z');
    expect(nextWindowOpening(open)).toEqual(open);
  });
});
