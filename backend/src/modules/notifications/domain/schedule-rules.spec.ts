import {
  DEFAULT_SCHEDULE_CONFIG,
  dueScheduledNotices,
  parseScheduleConfig,
  previewCutFor,
  type ScheduleCharge,
  type ScheduleGroup,
} from './schedule-rules.js';

// 12:00 UTC = 08:00 en La Paz.
const at = (iso: string): Date => new Date(`${iso}T12:00:00Z`);
const group = (billingDay: number): ScheduleGroup => ({
  id: 'g1',
  billingDay,
  memberIds: ['m1', 'm2'],
});
const charge = (over: Partial<ScheduleCharge>): ScheduleCharge => ({
  id: 'c1',
  groupId: 'g1',
  userId: 'm1',
  ownerId: 'o1',
  status: 'pendiente',
  dueAt: new Date('2026-10-19T04:00:00Z'),
  receipt: null,
  ...over,
});

describe('schedule-rules', () => {
  it('CA-005-02: con corte el 15, el día 13 cada miembro recibe el aviso previo del período', () => {
    const notices = dueScheduledNotices([group(15)], [], at('2026-10-13'));
    expect(notices).toEqual([
      expect.objectContaining({ type: 'aviso_previo', userId: 'm1', period: '2026-10' }),
      expect.objectContaining({ type: 'aviso_previo', userId: 'm2', period: '2026-10' }),
    ]);
  });

  it('CA-005-02: el día 12 aún no, y recupera el aviso el 14 pero no el día del corte', () => {
    expect(dueScheduledNotices([group(15)], [], at('2026-10-12'))).toEqual([]);
    expect(dueScheduledNotices([group(15)], [], at('2026-10-14'))).toHaveLength(2);
    expect(dueScheduledNotices([group(15)], [], at('2026-10-15'))).toEqual([]);
  });

  it('CA-005-02: el día de cobro 31 se ajusta al último día del mes (febrero) y cruza de mes', () => {
    expect(previewCutFor(at('2026-02-26'), 31, 2)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(previewCutFor(at('2026-10-30'), 1, 2)).toEqual({ year: 2026, month: 11, day: 1 });
  });

  it('CA-005-03: un cobro pendiente que vence mañana genera recordatorio', () => {
    const notices = dueScheduledNotices([], [charge({})], at('2026-10-18'));
    expect(notices).toEqual([
      { type: 'recordatorio_vencimiento', userId: 'm1', groupId: 'g1', chargeId: 'c1' },
    ]);
    expect(dueScheduledNotices([], [charge({})], at('2026-10-17'))).toEqual([]);
  });

  it('CA-005-04 y CA-005-06: pagado, cancelado o atrasado no generan recordatorio', () => {
    for (const status of ['pagado', 'cancelado', 'atrasado'] as const) {
      expect(dueScheduledNotices([], [charge({ status })], at('2026-10-18'))).toEqual([]);
    }
    // Vencido (tras el retiro por mora) tampoco insiste.
    expect(dueScheduledNotices([], [charge({})], at('2026-10-25'))).toEqual([]);
  });

  it('RN-005-03: el titular no recibe recordatorio de cobro como miembro', () => {
    expect(dueScheduledNotices([], [charge({ userId: 'o1' })], at('2026-10-18'))).toEqual([]);
  });

  it('CA-005-08: más de 48 horas en revisión avisa al titular; antes no', () => {
    const receipt = { id: 'r1', uploadedAt: new Date('2026-10-16T12:00:00Z') };
    const review = charge({ status: 'en_revision', receipt });
    expect(dueScheduledNotices([], [review], new Date('2026-10-18T11:59:00Z'))).toEqual([]);
    expect(dueScheduledNotices([], [review], new Date('2026-10-18T12:00:00Z'))).toEqual([
      {
        type: 'comprobante_pendiente_48h',
        userId: 'o1',
        groupId: 'g1',
        chargeId: 'c1',
        memberId: 'm1',
        receiptId: 'r1',
      },
    ]);
  });

  it('RN-005-06: los tiempos son parámetros de configuración con valores por defecto', () => {
    expect(DEFAULT_SCHEDULE_CONFIG).toEqual({
      previewDaysBefore: 2,
      dueReminderDaysBefore: 1,
      reviewReminderHours: 48,
    });
    expect(parseScheduleConfig({})).toEqual(DEFAULT_SCHEDULE_CONFIG);
    expect(parseScheduleConfig({ NOTICE_PREVIEW_DAYS: '3', NOTICE_REVIEW_HOURS: 'x' })).toEqual({
      ...DEFAULT_SCHEDULE_CONFIG,
      previewDaysBefore: 3,
    });
    const notices = dueScheduledNotices([group(15)], [], at('2026-10-12'), {
      ...DEFAULT_SCHEDULE_CONFIG,
      previewDaysBefore: 3,
    });
    expect(notices).toHaveLength(2);
  });
});
