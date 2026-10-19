/**
 * Datos simulados de la spec 001 mientras el backend no está conectado (T016; se quita en T017).
 * No calcula cuotas: las cotizaciones salen de una tabla fija con respuestas ya resueltas, y una
 * combinación que no está en la tabla recibe la respuesta de ejemplo. Nombres y montos inventados.
 */
import { ApiError } from './http';
import type {
  CreateGroupRequest,
  GroupDetail,
  GroupMember,
  GroupRole,
  GroupsPage,
  GroupSummary,
  HostEligibility,
  ListGroupsParams,
  PaymentInfo,
  QuoteRequest,
  QuoteResponse,
  UpdateGroupRequest,
  UpdatePaymentInfoInput,
} from './groups';

const LATENCY_MS = 350;

function delay<T>(value: () => T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        resolve(value());
      } catch (error) {
        reject(error);
      }
    }, LATENCY_MS);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

export const MOCK_HOST_ELIGIBILITY: HostEligibility = {
  eligible: true,
  source: 'manual',
  activeGroups: 1,
  maxActiveGroups: 5,
  canCreateMore: true,
  requirement: { minStars: 4.5, minConsideredCharges: 6, windowMonths: 12 },
  current: { stars: 4.0, consideredCharges: 3, level: 'Bueno' },
};

/** Respuestas de `POST /groups/quote` ya resueltas, por `precio|moneda|tipo de cambio|miembros`. */
const QUOTES: Record<string, QuoteResponse> = {
  '1466|USD|6.9600|4': {
    totalBsCents: 10203,
    baseShareCents: 2550,
    ownerShareCents: 2553,
    remainderCents: 3,
  },
  '1466|USD|6.9600|3': {
    totalBsCents: 10203,
    baseShareCents: 3401,
    ownerShareCents: 3401,
    remainderCents: 0,
  },
  '2299|USD|6.9600|4': {
    totalBsCents: 16001,
    baseShareCents: 4000,
    ownerShareCents: 4001,
    remainderCents: 1,
  },
  '799|USD|6.9600|2': {
    totalBsCents: 5561,
    baseShareCents: 2780,
    ownerShareCents: 2781,
    remainderCents: 1,
  },
  '2551|BS||5': {
    totalBsCents: 2551,
    baseShareCents: 510,
    ownerShareCents: 511,
    remainderCents: 1,
  },
  '6000|BS||4': {
    totalBsCents: 6000,
    baseShareCents: 1500,
    ownerShareCents: 1500,
    remainderCents: 0,
  },
};

const DEFAULT_QUOTE = QUOTES['1466|USD|6.9600|4'];

function quoteKey(input: QuoteRequest): string {
  return `${input.priceCents}|${input.currency}|${input.exchangeRate ?? ''}|${input.memberCount}`;
}

export function getHostEligibility(signal?: AbortSignal): Promise<HostEligibility> {
  return delay(() => MOCK_HOST_ELIGIBILITY, signal);
}

export function quoteGroup(input: QuoteRequest, signal?: AbortSignal): Promise<QuoteResponse> {
  return delay(() => QUOTES[quoteKey(input)] ?? DEFAULT_QUOTE, signal);
}

export const MOCK_INVITE_CODE = 'K7M2QX9P';
const MOCK_GROUP_ID = '5b0d7c3e-0000-4000-8000-000000000101';
const NO_PAYMENT_INFO: PaymentInfo = { text: null, qrUrl: null, configured: false };

export const MOCK_GROUP: GroupDetail = {
  id: MOCK_GROUP_ID,
  name: 'Netflix del depa',
  status: 'activo',
  frozenReason: null,
  createdAt: '2026-10-19T14:00:00.000Z',
  service: {
    name: 'Netflix',
    planName: 'Estándar',
    logoUrl: null,
    brandColor: '#A4161A',
    isCustom: false,
  },
  billingDay: 15,
  totalSlots: 4,
  priceCents: 1466,
  currency: 'USD',
  exchangeRate: '6.9600',
  breakdown: {
    priceCents: 1466,
    currency: 'USD',
    exchangeRate: '6.9600',
    totalBsCents: 10203,
    memberCount: 1,
    baseShareCents: 10203,
    ownerShareCents: 10203,
    remainderCents: 0,
  },
  myShareCents: 10203,
  myRole: 'titular',
  entryWindow: { isOpen: true, opensAt: null, closesAt: null, acceptingMembers: true },
  members: [
    {
      userId: '9c4e2f10-0000-4000-8000-000000000201',
      fullName: 'Ana Quispe Mamani',
      role: 'titular',
      phone: null,
      joinedAt: '2026-10-19T14:00:00.000Z',
    },
  ],
  paymentInfo: NO_PAYMENT_INFO,
  inviteCode: MOCK_INVITE_CODE,
  version: 1,
};

function summaryOf(
  group: GroupDetail,
  serviceName: string,
  myShareIsReference: boolean,
  nextCutDate: string,
): GroupSummary {
  return {
    id: group.id,
    name: group.name,
    serviceName,
    logoUrl: group.service.logoUrl,
    brandColor: group.service.brandColor,
    role: group.myRole,
    status: group.status,
    frozenReason: group.frozenReason,
    memberCount: group.breakdown.memberCount,
    totalSlots: group.totalSlots,
    myShareCents: group.myShareCents,
    myShareIsReference,
    billingDay: group.billingDay,
    nextCutDate,
  };
}

/** QR de ejemplo en línea (el real es una URL firmada de Supabase Storage). */
const MOCK_QR_URL =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7" shape-rendering="crispEdges">' +
      '<rect width="7" height="7" fill="#fff"/>' +
      '<path d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM4 4h1v1H4zM6 4h1v3H6zM4 6h1v1H4z" fill="#17201c"/></svg>',
  );

function member(
  idSuffix: string,
  fullName: string,
  role: GroupRole,
  phone: string | null,
  joinedAt: string,
): GroupMember {
  return { userId: `9c4e2f10-0000-4000-8000-${idSuffix}`, fullName, role, phone, joinedAt };
}

/** Titular con miembros y ventana abierta; montos en USD ya calculados por el «backend». */
const PRIME_GROUP: GroupDetail = {
  id: '5b0d7c3e-0000-4000-8000-000000000102',
  name: 'Prime Video de la casa',
  status: 'activo',
  frozenReason: null,
  createdAt: '2026-06-17T15:00:00.000Z',
  service: {
    name: 'Prime Video',
    planName: 'Estándar',
    logoUrl: null,
    brandColor: '#1A6FB0',
    isCustom: false,
  },
  billingDay: 17,
  totalSlots: 4,
  priceCents: 899,
  currency: 'USD',
  exchangeRate: '6.9600',
  breakdown: {
    priceCents: 899,
    currency: 'USD',
    exchangeRate: '6.9600',
    totalBsCents: 6257,
    memberCount: 3,
    baseShareCents: 2085,
    ownerShareCents: 2087,
    remainderCents: 2,
  },
  myShareCents: 2087,
  myRole: 'titular',
  entryWindow: {
    isOpen: true,
    opensAt: null,
    closesAt: '2026-10-20T03:59:59.000Z',
    acceptingMembers: true,
  },
  members: [
    member(
      '000000000201',
      'Ana Quispe Mamani',
      'titular',
      '+59171234567',
      '2026-06-17T15:00:00.000Z',
    ),
    member(
      '000000000202',
      'Carla Rojas Vda.',
      'miembro',
      '+59170223344',
      '2026-07-17T18:20:00.000Z',
    ),
    member(
      '000000000203',
      'Diego Flores Paz',
      'miembro',
      '+59176655443',
      '2026-08-18T13:05:00.000Z',
    ),
  ],
  paymentInfo: {
    text: 'BNB · Cuenta 4501-998877\nAna Quispe Mamani',
    qrUrl: MOCK_QR_URL,
    configured: true,
  },
  inviteCode: 'R3T6YV8B',
  version: 4,
};

/** Miembro de un grupo en USD con ventana abierta y datos de pago completos. */
const SPOTIFY_GROUP: GroupDetail = {
  id: '5b0d7c3e-0000-4000-8000-000000000103',
  name: 'Spotify depa',
  status: 'activo',
  frozenReason: null,
  createdAt: '2026-03-18T12:00:00.000Z',
  service: {
    name: 'Spotify',
    planName: 'Familiar',
    logoUrl: null,
    brandColor: '#14743A',
    isCustom: false,
  },
  billingDay: 18,
  totalSlots: 6,
  priceCents: 1707,
  currency: 'USD',
  exchangeRate: '6.9600',
  breakdown: {
    priceCents: 1707,
    currency: 'USD',
    exchangeRate: '6.9600',
    totalBsCents: 11881,
    memberCount: 6,
    baseShareCents: 1980,
    ownerShareCents: 1981,
    remainderCents: 1,
  },
  myShareCents: 1980,
  myRole: 'miembro',
  entryWindow: {
    isOpen: true,
    opensAt: null,
    closesAt: '2026-10-21T03:59:59.000Z',
    acceptingMembers: true,
  },
  members: [
    member(
      '000000000301',
      'Marco Vargas Rojas',
      'titular',
      '+59176543210',
      '2026-03-18T12:00:00.000Z',
    ),
    member(
      '000000000201',
      'Ana Quispe Mamani',
      'miembro',
      '+59171234567',
      '2026-04-18T14:30:00.000Z',
    ),
    member('000000000302', 'Sofía Mamani', 'miembro', null, '2026-04-19T16:00:00.000Z'),
    member('000000000303', 'Bruno Paz', 'miembro', null, '2026-05-18T20:10:00.000Z'),
    member('000000000304', 'Lucía Torrez', 'miembro', null, '2026-07-20T01:45:00.000Z'),
    member('000000000305', 'Iván Céspedes', 'miembro', null, '2026-09-18T22:00:00.000Z'),
  ],
  paymentInfo: {
    text: 'BNB · Cuenta 4501-998877 · Marco Vargas Rojas',
    qrUrl: MOCK_QR_URL,
    configured: true,
  },
  version: 7,
};

/** Miembro de un grupo en Bs con la ventana cerrada y sin datos de pago. */
const CANVA_GROUP: GroupDetail = {
  id: '5b0d7c3e-0000-4000-8000-000000000104',
  name: 'Canva del equipo',
  status: 'activo',
  frozenReason: null,
  createdAt: '2026-05-05T13:00:00.000Z',
  service: {
    name: 'Canva Pro',
    planName: null,
    logoUrl: null,
    brandColor: null,
    isCustom: true,
  },
  billingDay: 5,
  totalSlots: 5,
  priceCents: 6000,
  currency: 'BS',
  exchangeRate: null,
  breakdown: {
    priceCents: 6000,
    currency: 'BS',
    exchangeRate: null,
    totalBsCents: 6000,
    memberCount: 4,
    baseShareCents: 1500,
    ownerShareCents: 1500,
    remainderCents: 0,
  },
  myShareCents: 1500,
  myRole: 'miembro',
  entryWindow: {
    isOpen: false,
    opensAt: '2026-11-05T04:00:00.000Z',
    closesAt: null,
    acceptingMembers: true,
  },
  members: [
    member('000000000401', 'Rocío Gutiérrez', 'titular', null, '2026-05-05T13:00:00.000Z'),
    member('000000000201', 'Ana Quispe Mamani', 'miembro', null, '2026-05-06T15:00:00.000Z'),
    member('000000000402', 'Pablo Choque', 'miembro', null, '2026-06-05T17:00:00.000Z'),
    member('000000000403', 'Gabriela Ríos', 'miembro', null, '2026-08-06T19:30:00.000Z'),
  ],
  paymentInfo: NO_PAYMENT_INFO,
  version: 2,
};

/** Grupo congelado porque banearon al titular: no recibe miembros. */
const DISNEY_GROUP: GroupDetail = {
  id: '5b0d7c3e-0000-4000-8000-000000000105',
  name: 'Disney+ primos',
  status: 'activo',
  frozenReason: 'titular_baneado',
  createdAt: '2026-02-12T12:00:00.000Z',
  service: {
    name: 'Disney+',
    planName: 'Premium',
    logoUrl: null,
    brandColor: '#1D3A8A',
    isCustom: false,
  },
  billingDay: 12,
  totalSlots: 4,
  priceCents: 8840,
  currency: 'BS',
  exchangeRate: null,
  breakdown: {
    priceCents: 8840,
    currency: 'BS',
    exchangeRate: null,
    totalBsCents: 8840,
    memberCount: 4,
    baseShareCents: 2210,
    ownerShareCents: 2210,
    remainderCents: 0,
  },
  myShareCents: 2210,
  myRole: 'miembro',
  entryWindow: { isOpen: false, opensAt: null, closesAt: null, acceptingMembers: false },
  members: [
    member('000000000501', 'Jorge Salinas', 'titular', null, '2026-02-12T12:00:00.000Z'),
    member('000000000201', 'Ana Quispe Mamani', 'miembro', null, '2026-03-12T14:00:00.000Z'),
    member('000000000502', 'Mariela Cruz', 'miembro', null, '2026-03-13T15:00:00.000Z'),
    member('000000000503', 'Tomás Arce', 'miembro', null, '2026-04-12T16:00:00.000Z'),
  ],
  paymentInfo: { text: 'Tigo Money 70011223 · Jorge Salinas', qrUrl: null, configured: true },
  version: 9,
};

/** Grupo cerrado: queda en la lista con su historial. */
const YOUTUBE_GROUP: GroupDetail = {
  id: '5b0d7c3e-0000-4000-8000-000000000106',
  name: 'YouTube de la U',
  status: 'cerrado',
  frozenReason: null,
  createdAt: '2026-01-30T12:00:00.000Z',
  service: {
    name: 'YouTube Premium',
    planName: 'Familiar',
    logoUrl: null,
    brandColor: '#5B5F66',
    isCustom: false,
  },
  billingDay: 30,
  totalSlots: 5,
  priceCents: 2299,
  currency: 'USD',
  exchangeRate: '6.9600',
  breakdown: {
    priceCents: 2299,
    currency: 'USD',
    exchangeRate: '6.9600',
    totalBsCents: 16001,
    memberCount: 3,
    baseShareCents: 5333,
    ownerShareCents: 5335,
    remainderCents: 2,
  },
  myShareCents: 5333,
  myRole: 'miembro',
  entryWindow: { isOpen: false, opensAt: null, closesAt: null, acceptingMembers: false },
  members: [
    member('000000000601', 'Valeria Méndez', 'titular', null, '2026-01-30T12:00:00.000Z'),
    member('000000000201', 'Ana Quispe Mamani', 'miembro', null, '2026-02-28T15:00:00.000Z'),
    member('000000000602', 'Ramiro Ticona', 'miembro', null, '2026-03-30T16:00:00.000Z'),
  ],
  paymentInfo: NO_PAYMENT_INFO,
  version: 12,
};

/** Grupos del usuario simulado, con el resumen que entregaría `GET /groups`. */
export const MOCK_GROUPS: ReadonlyArray<{ summary: GroupSummary; detail: GroupDetail }> = [
  { detail: MOCK_GROUP, summary: summaryOf(MOCK_GROUP, 'Netflix', true, '2026-11-15') },
  { detail: PRIME_GROUP, summary: summaryOf(PRIME_GROUP, 'Prime Video', true, '2026-11-17') },
  { detail: SPOTIFY_GROUP, summary: summaryOf(SPOTIFY_GROUP, 'Spotify', false, '2026-11-18') },
  { detail: CANVA_GROUP, summary: summaryOf(CANVA_GROUP, 'Canva Pro', false, '2026-11-05') },
  { detail: DISNEY_GROUP, summary: summaryOf(DISNEY_GROUP, 'Disney+', false, '2026-11-12') },
  {
    detail: YOUTUBE_GROUP,
    summary: summaryOf(YOUTUBE_GROUP, 'YouTube Premium', false, '2026-10-30'),
  },
];

/** Simula las reglas de forma del contrato: `exchangeRate` obligatorio con USD y prohibido con BS. */
export function createGroup(input: CreateGroupRequest): Promise<GroupDetail> {
  return delay(() => {
    if (input.currency === 'USD' && !input.exchangeRate) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Datos inválidos.', {
        fields: { exchangeRate: ['REQUIRED'] },
      });
    }
    if (input.currency === 'BS' && input.exchangeRate !== undefined) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Datos inválidos.', {
        fields: { exchangeRate: ['FORBIDDEN'] },
      });
    }
    const exchangeRate = input.exchangeRate ?? null;
    return {
      ...MOCK_GROUP,
      name: input.name,
      service: {
        ...MOCK_GROUP.service,
        name: input.customServiceName ?? MOCK_GROUP.service.name,
        planName: input.customServiceName ? null : MOCK_GROUP.service.planName,
        isCustom: input.customServiceName !== null,
      },
      billingDay: input.billingDay,
      totalSlots: input.totalSlots,
      priceCents: input.priceCents,
      currency: input.currency,
      exchangeRate,
      breakdown: {
        ...MOCK_GROUP.breakdown,
        priceCents: input.priceCents,
        currency: input.currency,
        exchangeRate,
      },
      paymentInfo: input.paymentInfoText
        ? { text: input.paymentInfoText, qrUrl: null, configured: true }
        : NO_PAYMENT_INFO,
    };
  });
}

export function listGroups(params: ListGroupsParams, signal?: AbortSignal): Promise<GroupsPage> {
  return delay(() => {
    const items = MOCK_GROUPS.map((group) => group.summary).filter(
      (group) =>
        (!params.role || params.role === group.role) &&
        (!params.status || params.status === group.status),
    );
    return { items, nextCursor: null };
  }, signal);
}

/**
 * Estado simulado de cada grupo: `PATCH` y regenerar el código lo cambian, para que la pantalla
 * vea el `version` nuevo y un `version` viejo responda `409 STALE_STATE`.
 */
const store = new Map<string, GroupDetail>();

/** Vuelve los grupos simulados a su estado inicial (para tests). */
export function resetMockGroups(): void {
  store.clear();
  for (const { detail } of MOCK_GROUPS) store.set(detail.id, detail);
  nextCode = 0;
}

/** Códigos de 8 caracteres sin ambiguos (RF-001-06) que entrega «Regenerar código», en orden. */
export const MOCK_REGENERATED_CODES = ['P4W8ZR2N', 'H6N3KT7V', 'Z9C2WM4R'] as const;
let nextCode = 0;
resetMockGroups();

function found(groupId: string): GroupDetail {
  const group = store.get(groupId);
  if (!group) throw new ApiError(404, 'NOT_FOUND', 'No encontrado.');
  return group;
}

/** Reglas del contrato para cambios del titular: `403` a un miembro y `422` si está cerrado o congelado. */
function ownedAndEditable(groupId: string): GroupDetail {
  const group = found(groupId);
  if (group.myRole !== 'titular') throw new ApiError(403, 'FORBIDDEN', 'Sin permiso.');
  if (group.status === 'cerrado') {
    throw new ApiError(422, 'GROUP_CLOSED', 'Grupo cerrado.', { rule: 'RN-001-07' });
  }
  if (group.frozenReason !== null) throw new ApiError(422, 'GROUP_FROZEN', 'Grupo congelado.');
  return group;
}

/** `404` para un id que no está entre los grupos del usuario (CA-001-10). */
export function getGroup(groupId: string, signal?: AbortSignal): Promise<GroupDetail> {
  return delay(() => found(groupId), signal);
}

export function updateGroup(groupId: string, input: UpdateGroupRequest): Promise<GroupDetail> {
  return delay(() => {
    const group = ownedAndEditable(groupId);
    const { acceptingMembers, exchangeRate, version, ...fields } = input;
    if (version !== undefined && version !== group.version) {
      throw new ApiError(409, 'STALE_STATE', 'El grupo cambió.');
    }
    const updated: GroupDetail = {
      ...group,
      ...fields,
      exchangeRate: exchangeRate === undefined ? group.exchangeRate : exchangeRate,
      entryWindow: {
        ...group.entryWindow,
        acceptingMembers: acceptingMembers ?? group.entryWindow.acceptingMembers,
      },
      version: group.version + 1,
    };
    store.set(groupId, updated);
    return updated;
  });
}

export function updatePaymentInfo(
  groupId: string,
  input: UpdatePaymentInfoInput,
): Promise<{ paymentInfo: PaymentInfo }> {
  return delay(() => {
    if (groupId !== MOCK_GROUP_ID) throw new ApiError(404, 'NOT_FOUND', 'No encontrado.');
    const text = input.text?.trim() ? input.text : null;
    const qrUrl = input.removeQr || !input.qr ? null : 'https://storage.example.com/qr/mock.png';
    return { paymentInfo: { text, qrUrl, configured: text !== null || qrUrl !== null } };
  });
}

/** El código anterior deja de existir en el mismo paso (RF-001-08). */
export function regenerateInviteCode(groupId: string): Promise<{ inviteCode: string }> {
  return delay(() => {
    const group = ownedAndEditable(groupId);
    const inviteCode = MOCK_REGENERATED_CODES[nextCode % MOCK_REGENERATED_CODES.length];
    nextCode += 1;
    store.set(groupId, { ...group, inviteCode });
    return { inviteCode };
  });
}
