import { describe, expect, it } from '@jest/globals';
import { rankingOrder, type RankingCandidate } from './ranking-order.js';

const member = (
  userId: string,
  punctual: number,
  considered: number,
  streak: number,
  joinedDay: number,
): RankingCandidate => ({
  userId,
  halfStars: considered < 3 ? null : Math.floor((20 * punctual + considered) / (2 * considered)),
  punctualCount: punctual,
  consideredCount: considered,
  currentStreak: streak,
  joinedAt: new Date(Date.UTC(2026, 0, joinedDay)),
});

describe('rankingOrder', () => {
  it('CA-007-10: ordena por calificación exacta, luego racha, luego antigüedad', () => {
    const { ranked } = rankingOrder([
      member('c', 7, 8, 7, 1), // 4,375
      member('a', 8, 8, 2, 5), // 5
      member('b', 8, 8, 6, 9), // 5, más racha
      member('d', 7, 8, 7, 0 + 2), // 4,375, igual racha, más reciente que c
    ]);
    expect(ranked.map((m) => m.userId)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('usa la calificación exacta y no la mostrada para desempatar', () => {
    // 9/10 y 14/16 muestran 4,5 estrellas; la exacta es 4,5 y 4,375.
    const { ranked } = rankingOrder([member('x', 14, 16, 0, 1), member('y', 9, 10, 0, 2)]);
    expect(ranked.map((m) => m.userId)).toEqual(['y', 'x']);
  });

  it('los «Nuevo» van aparte, sin posición', () => {
    const { ranked, unranked } = rankingOrder([member('n', 2, 2, 2, 1), member('a', 5, 5, 5, 2)]);
    expect(ranked.map((m) => m.userId)).toEqual(['a']);
    expect(unranked.map((m) => m.userId)).toEqual(['n']);
  });
});
