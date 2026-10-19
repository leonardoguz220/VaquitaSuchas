/**
 * Datos simulados de la spec 007 mientras el backend no está conectado. Las estrellas, los niveles,
 * la racha y la habilitación ya vienen calculados, como los entregaría la API: aquí no se calcula
 * nada del dominio. Nombres, montos y fechas son inventados.
 */
import type {
  BadgesResponse,
  ExcludeChargeReputationRequest,
  GroupRanking,
  RecentCharge,
  ReportChargeReputationRequest,
  ReputationDetail,
  ReputationFormula,
  ReputationRequestOptions,
} from './reputation';

const LATENCY_MS = 350;

/** Copia profunda: quien usa el simulador no puede cambiar los datos de otra llamada. */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function delay<T>(value: () => T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Petición cancelada.', 'AbortError'));
    if (signal?.aborted) return abort();
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      try {
        resolve(value());
      } catch (error) {
        reject(error);
      }
    }, LATENCY_MS);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        abort();
      },
      { once: true },
    );
  });
}

const FORMULA: ReputationFormula = {
  text: 'Estrellas = 5 × cobros puntuales ÷ cobros considerados de los últimos 12 meses, en pasos de media estrella. Es puntual si subiste el comprobante antes del vencimiento, aunque después lo rechacen. Con menos de 3 cobros tu nivel es «Nuevo». Los cobros de ingreso no cuentan.',
  example: 'Ejemplo: 9 puntuales de 10 = 4,5 estrellas.',
  version: 1,
};

const HOST_NOT_ELIGIBLE = {
  minStars: 4.5,
  minConsideredCharges: 6,
} as const;

function charge(
  index: number,
  groupName: string,
  serviceName: string,
  period: string,
  result: RecentCharge['result'],
  dueAt: string,
  countsForRating = true,
): RecentCharge {
  return {
    chargeId: `c0000000-0000-4000-8000-00000000000${index}`,
    groupName,
    serviceName,
    period,
    result,
    dueAt,
    countsForRating,
  };
}

/** Persona nueva: menos de 3 cobros considerados, sin estrellas (CA-007-01). */
const NEW_USER: ReputationDetail = {
  level: 'Nuevo',
  stars: null,
  starsLabel: null,
  consideredCount: 2,
  punctualCount: 2,
  lateCount: 0,
  currentStreak: 2,
  exactStars: null,
  recent: [
    charge(1, 'Disney+ primos', 'Disney+', '2026-10', 'puntual', '2026-10-16T03:59:59.000Z'),
    charge(
      2,
      'YouTube de la U',
      'YouTube Premium',
      '2026-09',
      'puntual',
      '2026-09-16T03:59:59.000Z',
    ),
  ],
  host: {
    eligible: false,
    source: null,
    ...HOST_NOT_ELIGIBLE,
    missing: ['stars', 'charges'],
  },
  formula: FORMULA,
};

/** Titular habilitado por calificación: 4,5 estrellas y 10 cobros considerados (CA-007-20). */
const HOST_ELIGIBLE: ReputationDetail = {
  level: 'Bueno',
  stars: 4.5,
  starsLabel: '4,5 de 5',
  consideredCount: 10,
  punctualCount: 9,
  lateCount: 1,
  currentStreak: 2,
  exactStars: '4.5000',
  recent: [
    charge(1, 'Disney+ primos', 'Disney+', '2026-10', 'puntual', '2026-10-16T03:59:59.000Z'),
    charge(2, 'Disney+ primos', 'Disney+', '2026-09', 'puntual', '2026-09-16T03:59:59.000Z'),
    charge(
      3,
      'Paramount+ del curso',
      'Paramount+',
      '2026-09',
      'tardio',
      '2026-09-08T03:59:59.000Z',
    ),
    charge(
      4,
      'YouTube de la U',
      'YouTube Premium',
      '2026-09',
      'puntual',
      '2026-09-08T03:59:59.000Z',
    ),
    charge(5, 'Spotify depa', 'Spotify', '2026-08', 'puntual', '2026-08-18T03:59:59.000Z', false),
  ],
  host: {
    eligible: true,
    source: 'calificacion',
    ...HOST_NOT_ELIGIBLE,
    missing: [],
  },
  formula: FORMULA,
};

/** Calificación regular y sin habilitación como titular (CA-007-20, lo que falta). */
const NOT_ELIGIBLE: ReputationDetail = {
  level: 'Regular',
  stars: 3.5,
  starsLabel: '3,5 de 5',
  consideredCount: 3,
  punctualCount: 2,
  lateCount: 1,
  currentStreak: 0,
  exactStars: '3.3333',
  recent: [
    charge(1, 'Netflix de la U', 'Netflix', '2026-09', 'tardio', '2026-09-05T03:59:59.000Z'),
    charge(2, 'Netflix de la U', 'Netflix', '2026-08', 'puntual', '2026-08-05T03:59:59.000Z'),
    charge(3, 'Max de amigos', 'Max', '2026-07', 'puntual', '2026-07-17T03:59:59.000Z'),
  ],
  host: {
    eligible: false,
    source: null,
    ...HOST_NOT_ELIGIBLE,
    missing: ['stars', 'charges'],
  },
  formula: FORMULA,
};

/** Escenarios del simulador. `MOCK_REPUTATION` es el que devuelve `getMyReputation`. */
export const MOCK_REPUTATION = {
  newUser: NEW_USER,
  hostEligible: HOST_ELIGIBLE,
  notEligible: NOT_ELIGIBLE,
} as const;

/** Insignias de una persona con dos ganadas, una lejos de su meta y otra casi completa (CA-007-08, 09). */
const BADGES: BadgesResponse = {
  earned: [
    {
      code: 'primer_cobro',
      name: 'Primer cobro puntual',
      description: 'Pagaste a tiempo tu primer cobro.',
      earnedAt: '2026-08-18T14:00:00.000Z',
    },
    {
      code: 'racha_3',
      name: 'Racha de 3',
      description: 'Tres cobros seguidos a tiempo.',
      earnedAt: '2026-09-15T14:00:00.000Z',
    },
  ],
  pending: [
    {
      code: 'racha_10',
      name: 'Racha de 10',
      description: 'Diez cobros seguidos a tiempo.',
      condition: 'Paga 10 cobros seguidos a tiempo.',
      progress: { current: 2, target: 10 },
    },
    {
      code: 'seis_meses_sin_atrasos',
      name: 'Seis meses sin atrasos',
      description: 'Seis meses sin cobros atrasados.',
      condition: 'Cumple 6 meses seguidos sin cobros atrasados.',
      progress: { current: 5, target: 6 },
    },
  ],
};

/** Respuesta de `GET /users/me/badges` con insignias (copia del simulador en `getMyBadges`). */
export const MOCK_BADGES = {
  withBadges: BADGES,
  empty: { earned: [], pending: [] } satisfies BadgesResponse,
} as const;

const RANKING: GroupRanking = {
  items: [
    {
      position: 1,
      user: { userId: '9c4e2f10-0000-4000-8000-000000000201', fullName: 'Ana Quispe Mamani' },
      rating: { level: 'Excelente', stars: 5, starsLabel: '5 de 5' },
      streak: 7,
    },
    {
      position: 2,
      user: { userId: '9c4e2f10-0000-4000-8000-000000000301', fullName: 'Marco Vargas Rojas' },
      rating: { level: 'Bueno', stars: 4.5, starsLabel: '4,5 de 5' },
      streak: 3,
    },
  ],
  unranked: [
    {
      user: { userId: '9c4e2f10-0000-4000-8000-000000000801', fullName: 'Lucía Mendoza Ríos' },
      rating: { level: 'Nuevo', stars: null, starsLabel: null },
    },
  ],
};

/** `GET /users/me/reputation`: el simulador responde como un titular habilitado (CA-007-02). */
export function getMyReputation(options: ReputationRequestOptions = {}) {
  return delay(() => copy(MOCK_REPUTATION.hostEligible), options.signal);
}

/** `GET /users/me/badges` (P2). */
export function getMyBadges(options: ReputationRequestOptions = {}) {
  return delay(() => copy(MOCK_BADGES.withBadges), options.signal);
}

/** `GET /groups/:groupId/ranking` (P2). */
export function getGroupRanking(_groupId: string, options: ReputationRequestOptions = {}) {
  return delay(() => copy(RANKING), options.signal);
}

/** `POST /charges/:chargeId/reputation-report` (P2): responde 201 sin cuerpo. */
export function reportChargeReputation(
  _chargeId: string,
  _input: ReportChargeReputationRequest,
): Promise<void> {
  return delay(() => undefined);
}

/** `POST /charges/:chargeId/reputation-exclusion` (P2): responde 200 sin cuerpo. */
export function excludeChargeReputation(
  _chargeId: string,
  _input: ExcludeChargeReputationRequest,
): Promise<void> {
  return delay(() => undefined);
}
