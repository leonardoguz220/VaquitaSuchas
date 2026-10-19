/**
 * Datos simulados de la spec 001 mientras el backend no está conectado (T016; se quita en T017).
 * No calcula cuotas: las cotizaciones salen de una tabla fija con respuestas ya resueltas, y una
 * combinación que no está en la tabla recibe la respuesta de ejemplo. Nombres y montos inventados.
 */
import { ApiError } from './http';
import type {
  CreateGroupRequest,
  GroupDetail,
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

const MOCK_SUMMARY: GroupSummary = {
  id: MOCK_GROUP_ID,
  name: MOCK_GROUP.name,
  serviceName: MOCK_GROUP.service.name,
  logoUrl: MOCK_GROUP.service.logoUrl,
  brandColor: MOCK_GROUP.service.brandColor,
  role: 'titular',
  status: 'activo',
  frozenReason: null,
  memberCount: 1,
  totalSlots: 4,
  myShareCents: 2553,
  myShareIsReference: true,
  billingDay: 15,
  nextCutDate: '2026-11-15',
};

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
    const matches =
      (!params.role || params.role === MOCK_SUMMARY.role) &&
      (!params.status || params.status === MOCK_SUMMARY.status);
    return { items: matches ? [MOCK_SUMMARY] : [], nextCursor: null };
  }, signal);
}

export function getGroup(groupId: string, signal?: AbortSignal): Promise<GroupDetail> {
  return delay(() => {
    if (groupId !== MOCK_GROUP_ID) throw new ApiError(404, 'NOT_FOUND', 'No encontrado.');
    return MOCK_GROUP;
  }, signal);
}

export function updateGroup(groupId: string, input: UpdateGroupRequest): Promise<GroupDetail> {
  return delay(() => {
    if (groupId !== MOCK_GROUP_ID) throw new ApiError(404, 'NOT_FOUND', 'No encontrado.');
    if (input.version !== undefined && input.version !== MOCK_GROUP.version) {
      throw new ApiError(409, 'STALE_STATE', 'El grupo cambió.');
    }
    const { acceptingMembers, exchangeRate, ...fields } = input;
    return {
      ...MOCK_GROUP,
      ...fields,
      exchangeRate: exchangeRate === undefined ? MOCK_GROUP.exchangeRate : exchangeRate,
      entryWindow: {
        ...MOCK_GROUP.entryWindow,
        acceptingMembers: acceptingMembers ?? MOCK_GROUP.entryWindow.acceptingMembers,
      },
      version: MOCK_GROUP.version + 1,
    };
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

export function regenerateInviteCode(groupId: string): Promise<{ inviteCode: string }> {
  return delay(() => {
    if (groupId !== MOCK_GROUP_ID) throw new ApiError(404, 'NOT_FOUND', 'No encontrado.');
    return { inviteCode: 'P4W8ZR2N' };
  });
}
