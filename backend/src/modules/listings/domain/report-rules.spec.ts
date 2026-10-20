import { shouldHide } from './report-rules.js';

const at = (iso: string): Date => new Date(iso);
const report = (reporterId: string, iso = '2026-10-10T00:00:00Z') => ({
  reporterId,
  createdAt: at(iso),
});

describe('shouldHide', () => {
  it('CA-008-17: 3 reportes de usuarios distintos ocultan', () => {
    expect(shouldHide([report('a'), report('b'), report('c')], null)).toBe(true);
  });

  it('CA-008-17: 2 reportes no ocultan', () => {
    expect(shouldHide([report('a'), report('b')], null)).toBe(false);
  });

  it('RF-008-18: el mismo usuario no suma dos veces', () => {
    expect(shouldHide([report('a'), report('a'), report('b')], null)).toBe(false);
  });

  it('RF-008-18: solo cuentan los reportes posteriores a la restauración', () => {
    const cleared = at('2026-10-12T00:00:00Z');
    const old = [report('a'), report('b'), report('c')];
    expect(shouldHide(old, cleared)).toBe(false);
    expect(shouldHide([...old, report('d', '2026-10-13T00:00:00Z')], cleared)).toBe(false);
    expect(
      shouldHide(
        [
          report('d', '2026-10-13T00:00:00Z'),
          report('e', '2026-10-14T00:00:00Z'),
          report('f', '2026-10-15T00:00:00Z'),
        ],
        cleared,
      ),
    ).toBe(true);
  });
});
