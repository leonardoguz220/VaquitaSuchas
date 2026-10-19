/**
 * Datos simulados de la pestaña Cobros de `/grupos/[id]` (T037; se quitan en T038). Los montos,
 * estados y totales vienen fijos, como los entregaría la API: aquí no se calcula nada.
 * - Prime Video (102): la persona es titular. Dos períodos, `ownerTotals` y `Charge` completo.
 * - Spotify (103): la persona es miembro. Sin `ownerTotals` y solo `ChargePublic`.
 * - Netflix (101): titular sin ciclos todavía, el resumen responde `404`.
 * Nombres y montos inventados.
 */
import { ApiError } from './http';
import type {
  BillingSummary,
  Charge,
  ChargeEvent,
  ChargePublic,
  ChargeStatus,
  GroupChargesParams,
  Page,
  PersonRef,
} from './charges';

export const MOCK_BILLING_GROUP_IDS = {
  /** Titular con ciclos. */
  owner: '5b0d7c3e-0000-4000-8000-000000000102',
  /** Miembro con ciclos. */
  member: '5b0d7c3e-0000-4000-8000-000000000103',
  /** Titular sin ciclos: el resumen responde `404`. */
  noCycle: '5b0d7c3e-0000-4000-8000-000000000101',
} as const;

const PAGE_SIZE = 5;
const id = (suffix: string) => `7a1c5e00-0000-4000-8000-${suffix}`;
const person = (suffix: string, fullName: string): PersonRef => ({
  userId: `9c4e2f10-0000-4000-8000-${suffix}`,
  fullName,
});

const ANA = person('000000000201', 'Ana Quispe Mamani');
const CARLA = person('000000000202', 'Carla Rojas Vda.');
const DIEGO = person('000000000203', 'Diego Flores Paz');
const LUIS = person('000000000204', 'Luis Mamani Choque');
const ROCIO = person('000000000205', 'Rocío Gutiérrez');

const MARCO = person('000000000301', 'Marco Vargas Rojas');
const SOFIA = person('000000000302', 'Sofía Mamani');
const BRUNO = person('000000000303', 'Bruno Paz');
const LUCIA = person('000000000304', 'Lucía Torrez');
const IVAN = person('000000000305', 'Iván Céspedes');

let eventSeq = 0;
function ev(
  type: ChargeEvent['type'],
  actor: PersonRef | null,
  fromStatus: ChargeStatus | null,
  toStatus: ChargeStatus,
  occurredAt: string,
  reason: string | null = null,
): ChargeEvent {
  eventSeq += 1;
  const suffix = String(9000 + eventSeq).padStart(12, '0');
  return { id: id(suffix), type, actor, fromStatus, toStatus, reason, occurredAt };
}

interface ChargeSeed {
  id: string;
  period: string;
  origin: Charge['origin'];
  member: PersonRef;
  isFormerMember: boolean;
  amountCents: number;
  status: ChargeStatus;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  totalBsCents: number;
  memberCount: number;
  timeline: ChargeEvent[];
}

/** `Charge` completo como lo recibe el titular; sin comprobantes para no inventar archivos. */
function ownerCharge(seed: ChargeSeed): Charge {
  return {
    id: seed.id,
    groupId: MOCK_BILLING_GROUP_IDS.owner,
    period: seed.period,
    origin: seed.origin,
    member: { ...seed.member, isFormerMember: seed.isFormerMember },
    amountCents: seed.amountCents,
    status: seed.status,
    dueAt: seed.dueAt,
    paidAt: seed.paidAt,
    timeline: seed.timeline,
    cycleId: id(`0000000007${seed.period.slice(5)}`),
    issuedAt: seed.issuedAt,
    firstSubmittedAt: null,
    priceCents: 899,
    currency: 'USD',
    exchangeRate: '6.9600',
    totalBsCents: seed.totalBsCents,
    memberCount: seed.memberCount,
    settlement:
      seed.status === 'pagado' ? (seed.origin === 'ingreso' ? 'ingreso' : 'comprobante') : null,
    settledBy: seed.status === 'pagado' ? ANA : null,
    manualNote: null,
    cancelReason: null,
    lastRejection: null,
    currentReceipt: null,
    receipts: [],
    paymentInfo: null,
    allowedActions: seed.status === 'en_revision' ? ['confirm', 'reject'] : [],
    version: seed.timeline.length,
  };
}

/** Versión pública: sin comprobantes, referencias ni motivos (RF-002-17). */
function publicCharge(seed: ChargeSeed, groupId: string): ChargePublic {
  return {
    id: seed.id,
    groupId,
    period: seed.period,
    origin: seed.origin,
    member: { ...seed.member, isFormerMember: seed.isFormerMember },
    amountCents: seed.amountCents,
    status: seed.status,
    dueAt: seed.dueAt,
    paidAt: seed.paidAt,
    timeline: seed.timeline.map(({ type, actor, occurredAt }) => ({ type, actor, occurredAt })),
  };
}

// Prime Video (titular). Octubre: 5 personas al corte (cuota base 1251, titular 1253).
const PRIME_OCT_ISSUED = '2026-10-17T04:00:00.000Z';
const PRIME_OCT_DUE = '2026-10-21T03:59:59.000Z';
const PRIME_OCT: ChargeSeed[] = [
  {
    id: id('000000001001'),
    period: '2026-10',
    origin: 'ciclo',
    member: CARLA,
    isFormerMember: false,
    amountCents: 1251,
    status: 'pagado',
    issuedAt: PRIME_OCT_ISSUED,
    dueAt: PRIME_OCT_DUE,
    paidAt: '2026-10-17T20:10:00.000Z',
    totalBsCents: 6257,
    memberCount: 5,
    timeline: [
      ev('generado', null, null, 'pendiente', PRIME_OCT_ISSUED),
      ev('comprobante_subido', CARLA, 'pendiente', 'en_revision', '2026-10-17T13:00:00.000Z'),
      ev('confirmado', ANA, 'en_revision', 'pagado', '2026-10-17T20:10:00.000Z'),
    ],
  },
  {
    id: id('000000001002'),
    period: '2026-10',
    origin: 'ciclo',
    member: DIEGO,
    isFormerMember: false,
    amountCents: 1251,
    status: 'en_revision',
    issuedAt: PRIME_OCT_ISSUED,
    dueAt: PRIME_OCT_DUE,
    paidAt: null,
    totalBsCents: 6257,
    memberCount: 5,
    timeline: [
      ev('generado', null, null, 'pendiente', PRIME_OCT_ISSUED),
      ev('comprobante_subido', DIEGO, 'pendiente', 'en_revision', '2026-10-18T14:42:00.000Z'),
    ],
  },
  {
    id: id('000000001003'),
    period: '2026-10',
    origin: 'ciclo',
    member: LUIS,
    isFormerMember: true,
    amountCents: 1251,
    status: 'pagado',
    issuedAt: PRIME_OCT_ISSUED,
    dueAt: PRIME_OCT_DUE,
    paidAt: '2026-10-17T16:30:00.000Z',
    totalBsCents: 6257,
    memberCount: 5,
    timeline: [
      ev('generado', null, null, 'pendiente', PRIME_OCT_ISSUED),
      ev(
        'pago_manual',
        ANA,
        'pendiente',
        'pagado',
        '2026-10-17T16:30:00.000Z',
        'Pagó en efectivo.',
      ),
    ],
  },
  {
    id: id('000000001004'),
    period: '2026-10',
    origin: 'ciclo',
    member: ROCIO,
    isFormerMember: true,
    amountCents: 1251,
    status: 'atrasado',
    issuedAt: PRIME_OCT_ISSUED,
    dueAt: PRIME_OCT_DUE,
    paidAt: null,
    totalBsCents: 6257,
    memberCount: 5,
    timeline: [
      ev('generado', null, null, 'pendiente', PRIME_OCT_ISSUED),
      ev('atrasado', null, 'pendiente', 'atrasado', '2026-10-21T04:00:00.000Z'),
      ev('retiro_por_mora', null, 'atrasado', 'atrasado', '2026-10-21T04:00:00.000Z'),
    ],
  },
];

// Septiembre: 4 personas al corte (base 1564, titular 1565) y Luis entra después del corte.
const PRIME_SEP_ISSUED = '2026-09-17T04:00:00.000Z';
const PRIME_SEP_DUE = '2026-09-21T03:59:59.000Z';
const PRIME_SEP_ENTRY_AT = '2026-09-18T15:20:00.000Z';
const PRIME_SEP: ChargeSeed[] = [
  {
    id: id('000000001011'),
    period: '2026-09',
    origin: 'ingreso',
    member: LUIS,
    isFormerMember: true,
    amountCents: 1251,
    status: 'pagado',
    issuedAt: PRIME_SEP_ENTRY_AT,
    dueAt: PRIME_SEP_ENTRY_AT,
    paidAt: PRIME_SEP_ENTRY_AT,
    totalBsCents: 6257,
    memberCount: 5,
    timeline: [ev('ingreso_registrado', ANA, null, 'pagado', PRIME_SEP_ENTRY_AT)],
  },
  ...[CARLA, DIEGO, ROCIO].map((member, index): ChargeSeed => ({
    id: id(`00000000101${index + 2}`),
    period: '2026-09',
    origin: 'ciclo',
    member,
    isFormerMember: member === ROCIO,
    amountCents: 1564,
    status: 'pagado',
    issuedAt: PRIME_SEP_ISSUED,
    dueAt: PRIME_SEP_DUE,
    paidAt: `2026-09-1${8 + (index % 2)}T19:00:00.000Z`,
    totalBsCents: 6257,
    memberCount: 4,
    timeline: [
      ev('generado', null, null, 'pendiente', PRIME_SEP_ISSUED),
      ev('confirmado', ANA, 'en_revision', 'pagado', `2026-09-1${8 + (index % 2)}T19:00:00.000Z`),
    ],
  })),
];

const PRIME_SUMMARIES: BillingSummary[] = [
  {
    period: '2026-10',
    cycleType: 'regular',
    cutDate: '2026-10-17',
    dueAt: PRIME_OCT_DUE,
    totalBsCents: 6257,
    memberCount: 5,
    baseShareCents: 1251,
    ownerShareCents: 1253,
    rows: PRIME_OCT.map((seed) => ({
      charge: ownerCharge(seed),
      isFormerMember: seed.isFormerMember,
    })),
    ownerTotals: {
      expectedCents: 5004,
      collectedCents: 2502,
      pendingCents: 1251,
      overdueCents: 1251,
    },
    availablePeriods: ['2026-10', '2026-09'],
  },
  {
    period: '2026-09',
    cycleType: 'regular',
    cutDate: '2026-09-17',
    dueAt: PRIME_SEP_DUE,
    totalBsCents: 6257,
    memberCount: 4,
    baseShareCents: 1564,
    ownerShareCents: 1565,
    rows: PRIME_SEP.map((seed) => ({
      charge: ownerCharge(seed),
      isFormerMember: seed.isFormerMember,
    })),
    ownerTotals: {
      expectedCents: 5943,
      collectedCents: 5943,
      pendingCents: 0,
      overdueCents: 0,
    },
    availablePeriods: ['2026-10', '2026-09'],
  },
];

// Spotify (miembro). Octubre: 6 personas (base 1980, titular 1981).
const SPOTIFY_OCT_ISSUED = '2026-10-18T04:00:00.000Z';
const SPOTIFY_OCT_DUE = '2026-10-22T03:59:59.000Z';
const spotifySeed = (
  suffix: string,
  member: PersonRef,
  status: ChargeStatus,
  timeline: ChargeEvent[],
  paidAt: string | null = null,
): ChargeSeed => ({
  id: id(suffix),
  period: '2026-10',
  origin: 'ciclo',
  member,
  isFormerMember: false,
  amountCents: 1980,
  status,
  issuedAt: SPOTIFY_OCT_ISSUED,
  dueAt: SPOTIFY_OCT_DUE,
  paidAt,
  totalBsCents: 11881,
  memberCount: 6,
  timeline,
});
const SPOTIFY_OCT: ChargeSeed[] = [
  // El cobro de la persona (mismo id que en `GET /me/charges`).
  spotifySeed('000000000501', ANA, 'pendiente', [
    ev('generado', null, null, 'pendiente', SPOTIFY_OCT_ISSUED),
    ev('comprobante_subido', ANA, 'pendiente', 'en_revision', '2026-10-18T14:30:00.000Z'),
    ev(
      'rechazado',
      MARCO,
      'en_revision',
      'pendiente',
      '2026-10-18T22:05:00.000Z',
      'Monto distinto.',
    ),
  ]),
  spotifySeed(
    '000000001101',
    SOFIA,
    'pagado',
    [
      ev('generado', null, null, 'pendiente', SPOTIFY_OCT_ISSUED),
      ev('comprobante_subido', SOFIA, 'pendiente', 'en_revision', '2026-10-18T12:00:00.000Z'),
      ev('confirmado', MARCO, 'en_revision', 'pagado', '2026-10-18T18:00:00.000Z'),
    ],
    '2026-10-18T18:00:00.000Z',
  ),
  spotifySeed(
    '000000001102',
    BRUNO,
    'pagado',
    [
      ev('generado', null, null, 'pendiente', SPOTIFY_OCT_ISSUED),
      ev('pago_manual', MARCO, 'pendiente', 'pagado', '2026-10-18T10:00:00.000Z'),
    ],
    '2026-10-18T10:00:00.000Z',
  ),
  spotifySeed('000000001103', LUCIA, 'en_revision', [
    ev('generado', null, null, 'pendiente', SPOTIFY_OCT_ISSUED),
    ev('comprobante_subido', LUCIA, 'pendiente', 'en_revision', '2026-10-19T01:15:00.000Z'),
  ]),
  spotifySeed('000000001104', IVAN, 'pendiente', [
    ev('generado', null, null, 'pendiente', SPOTIFY_OCT_ISSUED),
  ]),
];
const SPOTIFY_SEP_ENTRY_AT = '2026-09-19T15:00:00.000Z';
const SPOTIFY_SEP: ChargeSeed[] = [
  {
    id: id('000000000505'),
    period: '2026-09',
    origin: 'ingreso',
    member: ANA,
    isFormerMember: false,
    amountCents: 1980,
    status: 'pagado',
    issuedAt: SPOTIFY_SEP_ENTRY_AT,
    dueAt: SPOTIFY_SEP_ENTRY_AT,
    paidAt: SPOTIFY_SEP_ENTRY_AT,
    totalBsCents: 11881,
    memberCount: 6,
    timeline: [ev('ingreso_registrado', MARCO, null, 'pagado', SPOTIFY_SEP_ENTRY_AT)],
  },
];

const spotifyPublic = (seed: ChargeSeed) => publicCharge(seed, MOCK_BILLING_GROUP_IDS.member);

const SPOTIFY_SUMMARIES: BillingSummary[] = [
  {
    period: '2026-10',
    cycleType: 'regular',
    cutDate: '2026-10-18',
    dueAt: SPOTIFY_OCT_DUE,
    totalBsCents: 11881,
    memberCount: 6,
    baseShareCents: 1980,
    ownerShareCents: 1981,
    rows: SPOTIFY_OCT.map((seed) => ({ charge: spotifyPublic(seed), isFormerMember: false })),
    availablePeriods: ['2026-10', '2026-09'],
  },
  {
    period: '2026-09',
    cycleType: 'inicial',
    cutDate: '2026-09-18',
    dueAt: '2026-09-22T03:59:59.000Z',
    totalBsCents: 11881,
    memberCount: 6,
    baseShareCents: 1980,
    ownerShareCents: 1981,
    rows: SPOTIFY_SEP.map((seed) => ({ charge: spotifyPublic(seed), isFormerMember: false })),
    availablePeriods: ['2026-10', '2026-09'],
  },
];

/** Historial ya ordenado por período y emisión descendente, como lo entrega el servidor. */
const HISTORY: Record<string, (ChargePublic | Charge)[]> = {
  [MOCK_BILLING_GROUP_IDS.owner]: [...PRIME_OCT, ...PRIME_SEP].map(ownerCharge),
  [MOCK_BILLING_GROUP_IDS.member]: [...SPOTIFY_OCT, ...SPOTIFY_SEP].map(spotifyPublic),
  [MOCK_BILLING_GROUP_IDS.noCycle]: [],
};

const SUMMARIES: Record<string, BillingSummary[]> = {
  [MOCK_BILLING_GROUP_IDS.owner]: PRIME_SUMMARIES,
  [MOCK_BILLING_GROUP_IDS.member]: SPOTIFY_SUMMARIES,
};

const notFound = () => new ApiError(404, 'NOT_FOUND', 'No encontrado.');

/** `GET /groups/:groupId/charges`: el cursor simulado es la posición del siguiente ítem. */
export function groupChargesPage(
  groupId: string,
  params: GroupChargesParams,
): Page<ChargePublic | Charge> {
  const all = HISTORY[groupId];
  if (!all) throw notFound();
  const filtered = all.filter(
    (charge) =>
      (!params.period || charge.period === params.period) &&
      (!params.status?.length || params.status.includes(charge.status)) &&
      (!params.userId || charge.member.userId === params.userId),
  );
  const start = params.cursor ? Number(params.cursor) : 0;
  const limit = params.limit ?? PAGE_SIZE;
  const end = start + limit;
  return {
    items: filtered.slice(start, end),
    nextCursor: end < filtered.length ? String(end) : null,
  };
}

/** `GET /groups/:groupId/billing/summary`: sin `period` responde el último ciclo. */
export function billingSummary(groupId: string, period: string | undefined): BillingSummary {
  const summaries = SUMMARIES[groupId];
  const summary = period ? summaries?.find((item) => item.period === period) : summaries?.[0];
  if (!summary) throw notFound();
  return summary;
}
