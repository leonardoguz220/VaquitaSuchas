/**
 * Datos de prueba fieles a `specs/001-suscripciones-compartidas/contracts/api.md`. Solo los
 * importan las pruebas. Nombres y montos inventados.
 */
import { netflixDetail, netflixPlans } from '@/components/features/catalog/__fixtures__/catalog';
import type { GroupDetail, GroupSummary, HostEligibility, QuoteResponse } from '@/services/groups';
import type { NewGroupChoice } from '../new-group-form-model';

export const eligibleHost: HostEligibility = {
  eligible: true,
  source: 'manual',
  activeGroups: 1,
  maxActiveGroups: 5,
  canCreateMore: true,
  requirement: { minStars: 4.5, minConsideredCharges: 6, windowMonths: 12 },
  current: { stars: 4.8, consideredCharges: 9, level: 'Excelente' },
};

export const notEligibleHost: HostEligibility = {
  ...eligibleHost,
  eligible: false,
  source: null,
  current: { stars: 4.0, consideredCharges: 3, level: 'Bueno' },
};

export const fullHost: HostEligibility = { ...eligibleHost, activeGroups: 5, canCreateMore: false };

/** Respuesta de la API a propósito «rara» para comprobar que se muestra tal cual. */
export const quote: QuoteResponse = {
  totalBsCents: 10203,
  baseShareCents: 2550,
  ownerShareCents: 2553,
  remainderCents: 3,
};

export const estandarChoice: NewGroupChoice = {
  service: netflixDetail.service,
  plan: netflixPlans[1],
};

export const customChoice: NewGroupChoice = { custom: true };

export const createdGroup: GroupDetail = {
  id: '5b0d7c3e-0000-4000-8000-000000000101',
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
  billingDay: 1,
  totalSlots: 3,
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
  paymentInfo: { text: null, qrUrl: null, configured: false },
  inviteCode: 'K7M2QX9P',
  version: 1,
};

/** Titular: su cuota es solo de referencia (CA-001-21). */
export const ownerSummary: GroupSummary = {
  id: '5b0d7c3e-0000-4000-8000-000000000102',
  name: 'Prime Video de la casa',
  serviceName: 'Prime Video',
  logoUrl: null,
  brandColor: '#1A6FB0',
  role: 'titular',
  status: 'activo',
  frozenReason: null,
  memberCount: 3,
  totalSlots: 4,
  myShareCents: 2087,
  myShareIsReference: true,
  billingDay: 17,
  nextCutDate: '2026-11-17',
};

export const memberSummary: GroupSummary = {
  ...ownerSummary,
  id: '5b0d7c3e-0000-4000-8000-000000000103',
  name: 'Spotify depa',
  serviceName: 'Spotify',
  brandColor: '#14743A',
  role: 'miembro',
  memberCount: 6,
  totalSlots: 6,
  myShareCents: 1980,
  myShareIsReference: false,
  billingDay: 18,
  nextCutDate: '2026-11-18',
};

export const closedSummary: GroupSummary = {
  ...memberSummary,
  id: '5b0d7c3e-0000-4000-8000-000000000106',
  name: 'YouTube de la U',
  serviceName: 'YouTube Premium',
  status: 'cerrado',
  memberCount: 3,
  totalSlots: 5,
  myShareCents: 5333,
};

export const frozenSummary: GroupSummary = {
  ...memberSummary,
  id: '5b0d7c3e-0000-4000-8000-000000000105',
  name: 'Disney+ primos',
  serviceName: 'Disney+',
  frozenReason: 'titular_baneado',
  memberCount: 4,
  totalSlots: 4,
  myShareCents: 2210,
};

/** Miembro de un grupo en USD con ventana abierta y datos de pago con QR. Montos «raros». */
export const memberGroup: GroupDetail = {
  id: memberSummary.id,
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
    {
      userId: '9c4e2f10-0000-4000-8000-000000000301',
      fullName: 'Marco Vargas Rojas',
      role: 'titular',
      phone: '+59176543210',
      joinedAt: '2026-03-18T12:00:00.000Z',
    },
    {
      userId: '9c4e2f10-0000-4000-8000-000000000201',
      fullName: 'Ana Quispe Mamani',
      role: 'miembro',
      phone: null,
      joinedAt: '2026-04-18T14:30:00.000Z',
    },
  ],
  paymentInfo: {
    text: 'BNB · Cuenta 4501-998877 · Marco Vargas Rojas',
    qrUrl: 'https://storage.example.com/qr/firmada.png',
    configured: true,
  },
  version: 7,
};

/** Titular de un grupo en Bs, con la ventana cerrada y sin datos de pago. */
export const ownerGroup: GroupDetail = {
  ...memberGroup,
  id: ownerSummary.id,
  name: 'Canva del equipo',
  service: { name: 'Canva Pro', planName: null, logoUrl: null, brandColor: null, isCustom: true },
  billingDay: 5,
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
  myRole: 'titular',
  entryWindow: {
    isOpen: false,
    opensAt: '2026-11-05T04:00:00.000Z',
    closesAt: null,
    acceptingMembers: true,
  },
  paymentInfo: { text: null, qrUrl: null, configured: false },
  inviteCode: 'R3T6YV8B',
};
