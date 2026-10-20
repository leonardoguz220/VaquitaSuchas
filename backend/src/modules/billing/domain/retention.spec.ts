import { retentionCutoff } from './retention.js';

describe('retentionCutoff (RN-002-06)', () => {
  it.each([
    ['2026-10-19T12:00:00.000Z', '2026-08-19T12:00:00.000Z'],
    ['2026-01-15T00:00:00.000Z', '2025-11-15T00:00:00.000Z'],
    ['2026-03-31T08:30:00.000Z', '2026-01-31T08:30:00.000Z'],
    ['2026-04-30T08:30:00.000Z', '2026-02-28T08:30:00.000Z'],
    ['2024-04-30T08:30:00.000Z', '2024-02-29T08:30:00.000Z'],
  ])('RN-002-06: %s menos 2 meses es %s', (now, expected) => {
    expect(retentionCutoff(new Date(now)).toISOString()).toBe(expected);
  });
});
