/**
 * Datos simulados que respetan el contrato 007 (`contracts/api.md`), solo para las pruebas.
 * Nombres, períodos y fechas son inventados.
 */
import type {
  GroupRanking,
  MyBadges,
  ReputationDetail,
  ReputationRecentCharge,
} from '../reputation';

export function recentCharge(
  overrides: Partial<ReputationRecentCharge> = {},
): ReputationRecentCharge {
  return {
    chargeId: 'c1',
    groupName: 'Disney+ primos',
    serviceName: 'Disney+',
    period: '2026-10',
    result: 'puntual',
    // Vence justo antes de las 00:00 del 16 oct en La Paz (se muestra «15 oct 2026, 23:59»).
    dueAt: '2026-10-16T04:00:00.000Z',
    countsForRating: true,
    ...overrides,
  };
}

/** CA-007-01: 10 cobros considerados y 9 puntuales → 4,5 estrellas, «Bueno», habilitado. */
export function reputationDetail(overrides: Partial<ReputationDetail> = {}): ReputationDetail {
  return {
    level: 'Bueno',
    stars: 4.5,
    starsLabel: '4,5 de 5',
    consideredCount: 10,
    punctualCount: 9,
    lateCount: 1,
    currentStreak: 2,
    exactStars: '4.5000',
    recent: [
      recentCharge(),
      recentCharge({
        chargeId: 'c2',
        groupName: 'Paramount+ del curso',
        serviceName: 'Paramount+',
        period: '2026-09',
        result: 'tardio',
        dueAt: '2026-09-09T04:00:00.000Z',
      }),
    ],
    host: {
      eligible: true,
      source: 'calificacion',
      minStars: 4.5,
      minConsideredCharges: 6,
      missing: [],
    },
    formula: {
      text: 'Estrellas = 5 × cobros puntuales ÷ cobros considerados de los últimos 12 meses, en pasos de media estrella.',
      example: '9 puntuales de 10 = 4,5 estrellas.',
      version: 1,
    },
    ...overrides,
  };
}

/** CA-007-02: 2 cobros considerados → «Nuevo», sin estrellas y sin habilitación. */
export function newcomerReputation(overrides: Partial<ReputationDetail> = {}): ReputationDetail {
  return reputationDetail({
    level: 'Nuevo',
    stars: null,
    starsLabel: null,
    consideredCount: 2,
    punctualCount: 2,
    lateCount: 0,
    currentStreak: 2,
    exactStars: null,
    host: {
      eligible: false,
      source: null,
      minStars: 4.5,
      minConsideredCharges: 6,
      missing: ['Te faltan 4 cobros considerados', 'Necesitas 4,5 estrellas'],
    },
    ...overrides,
  });
}

/** CA-007-09: «Racha 3» obtenida que se conserva; la racha de 12 vuelve a empezar. */
export function myBadges(overrides: Partial<MyBadges> = {}): MyBadges {
  return {
    earned: [
      {
        code: 'first_payment',
        name: 'Primer pago',
        description: 'Subiste tu primer comprobante a tiempo.',
        // 6 mar 2026, 10:00 en La Paz.
        earnedAt: '2026-03-06T14:00:00.000Z',
      },
      {
        code: 'streak_3',
        name: 'Racha 3',
        description: '3 pagos puntuales seguidos.',
        // 15 may 2026, 23:30 en La Paz (16 may en UTC).
        earnedAt: '2026-05-16T03:30:00.000Z',
      },
    ],
    pending: [
      {
        code: 'streak_12',
        name: 'Racha 12',
        description: '12 pagos puntuales seguidos.',
        condition: 'Paga a tiempo 12 cobros seguidos.',
        progress: { current: 2, target: 12 },
      },
    ],
    ...overrides,
  };
}

/**
 * CA-007-10: 5, 4,5, 4,5 y «Nuevo», en el orden que entrega la API (el desempate entre los de
 * 4,5 ya viene resuelto por el valor exacto y la racha).
 */
export function groupRanking(overrides: Partial<GroupRanking> = {}): GroupRanking {
  return {
    items: [
      {
        position: 1,
        user: { userId: 'u3', fullName: 'Sofía Mamani' },
        rating: { level: 'Excelente', stars: 5, starsLabel: '5 de 5' },
        streak: 11,
      },
      {
        position: 2,
        user: { userId: 'u2', fullName: 'Ana Quispe Mamani' },
        rating: { level: 'Bueno', stars: 4.5, starsLabel: '4,5 de 5' },
        streak: 2,
      },
      {
        position: 3,
        user: { userId: 'u4', fullName: 'Bruno Paz' },
        rating: { level: 'Bueno', stars: 4.5, starsLabel: '4,5 de 5' },
        streak: 5,
      },
    ],
    unranked: [
      {
        user: { userId: 'u5', fullName: 'Iván Céspedes' },
        rating: { level: 'Nuevo', stars: null },
      },
    ],
    ...overrides,
  };
}
