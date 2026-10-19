/**
 * Datos de prueba fieles a `specs/001-suscripciones-compartidas/contracts/api.md`. Solo los
 * importan las pruebas. Nombres y montos inventados.
 */
import { netflixDetail, netflixPlans } from '@/components/features/catalog/__fixtures__/catalog';
import type { GroupDetail, HostEligibility, QuoteResponse } from '@/services/groups';
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
