import { retentionCutoff } from './retention.js';

describe('retentionCutoff', () => {
  it('CA-010-44: resta 2 meses', () => {
    expect(retentionCutoff(new Date('2026-10-16T15:00:00Z')).toISOString()).toBe(
      '2026-08-16T15:00:00.000Z',
    );
  });

  it('CA-010-44: ajusta al último día del mes si el día no existe', () => {
    expect(retentionCutoff(new Date('2026-12-31T10:00:00Z')).toISOString()).toBe(
      '2026-10-31T10:00:00.000Z',
    );
    expect(retentionCutoff(new Date('2026-04-30T10:00:00Z')).toISOString()).toBe(
      '2026-02-28T10:00:00.000Z',
    );
  });
});
