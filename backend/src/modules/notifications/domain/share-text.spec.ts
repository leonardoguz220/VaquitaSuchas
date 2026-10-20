import { inviteMessage, periodLabel, reminderMessage } from './share-text.js';

describe('share-text', () => {
  it('RF-005-15: el mensaje de invitación lleva el enlace y el código', () => {
    const text = inviteMessage({
      groupName: 'Netflix Familiar',
      inviteUrl: 'https://vaquita.example/unirse?codigo=ABCD2345',
      code: 'ABCD2345',
    });
    expect(text).toContain('"Netflix Familiar"');
    expect(text).toContain('https://vaquita.example/unirse?codigo=ABCD2345');
    expect(text).toContain('ABCD2345');
  });

  it('RF-005-16: el recordatorio lleva monto Bs, período y vencimiento en hora de La Paz', () => {
    const text = reminderMessage({
      memberName: 'Mario',
      groupName: 'Netflix Familiar',
      amountCents: 3333,
      period: '2026-10',
      // 2026-10-19T02:00Z es el 18 de octubre a las 22:00 en La Paz.
      dueAt: new Date('2026-10-19T02:00:00Z'),
    });
    expect(text).toContain('Bs 33,33');
    expect(text).toContain('octubre de 2026');
    expect(text).toContain('18 de octubre de 2026');
    expect(text).toContain('Mario');
  });

  it('periodLabel convierte AAAA-MM y deja intacto lo que no cuadra', () => {
    expect(periodLabel('2026-01')).toBe('enero de 2026');
    expect(periodLabel('raro')).toBe('raro');
  });
});
