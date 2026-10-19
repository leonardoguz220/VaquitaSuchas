/**
 * Datos simulados que respetan el contrato 006 (`contracts/api.md`), solo para las pruebas.
 * Nombres, montos y fechas son inventados; los montos siguen los criterios CA-006-xx.
 */
import type { ChargeLine, CollectionSummary, DashboardSummary } from '../reports';

/** Cobranza de "Netflix de la familia": esperado Bs 90,00, cobrado Bs 60,00 (CA-006-09). */
export function collection(overrides: Partial<CollectionSummary> = {}): CollectionSummary {
  return {
    groupId: 'g1',
    groupName: 'Netflix de la familia',
    serviceName: 'Netflix',
    period: '2026-10',
    expectedCents: 9000,
    collectedCents: 6000,
    inReviewCents: 1500,
    pendingCents: 3000,
    percentCollected: 67,
    lateMembers: [
      {
        userId: 'u5',
        fullName: 'Luis Mamani',
        chargeId: 'c9',
        amountCents: 1500,
        dueDate: '2026-10-08',
        daysLate: 11,
      },
    ],
    ...overrides,
  };
}

/** Miembro de dos grupos y titular de uno, en octubre de 2026. */
export function dashboard(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    month: '2026-10',
    groupId: null,
    availableMonths: ['2026-10', '2026-09', '2026-08'],
    isEmpty: false,
    hasGroups: true,
    // CA-006-01: Bs 30,00 + Bs 25,50 = Bs 55,50 (el total lo da la API).
    spend: {
      totalCents: 5550,
      paidCents: 3000,
      lines: [
        {
          groupId: 'g2',
          groupName: 'Spotify depa',
          serviceName: 'Spotify',
          logoUrl: null,
          role: 'miembro',
          costCents: 3000,
          paidCents: 3000,
        },
        {
          groupId: 'g1',
          groupName: 'Netflix de la familia',
          serviceName: 'Netflix',
          logoUrl: null,
          role: 'titular',
          costCents: 2550,
          paidCents: null,
        },
      ],
    },
    // CA-006-04: USD 10,00 × 6,96 − Bs 20,00 = Bs 49,60; CA-006-05: Netflix «sin dato».
    savings: {
      totalCents: 4960,
      estimated: true,
      lines: [
        {
          groupId: 'g2',
          serviceName: 'Spotify',
          role: 'miembro',
          individualPriceBsCents: 6960,
          shareCents: 2000,
          savingsCents: 4960,
        },
      ],
      withoutData: [{ groupId: 'g1', serviceName: 'Netflix' }],
      negativeNote: null,
    },
    // CA-006-06: Bs 10,00 + Bs 15,00; CA-006-07: en revisión aparte.
    debts: { totalCents: 2500, count: 2, inReviewCents: 1640, inReviewCount: 1 },
    // CA-006-08: 3 pendientes, 1 atrasado y 1 en revisión.
    owed: {
      totalCents: 7500,
      count: 5,
      groups: [
        {
          groupId: 'g1',
          groupName: 'Netflix de la familia',
          serviceName: 'Netflix',
          totalCents: 7500,
          count: 5,
        },
      ],
    },
    collection: [collection()],
    ...overrides,
  };
}

export function chargeLine(overrides: Partial<ChargeLine> = {}): ChargeLine {
  return {
    chargeId: 'c1',
    groupId: 'g2',
    groupName: 'Spotify depa',
    serviceName: 'Spotify',
    period: '2026-10',
    memberName: null,
    amountCents: 1000,
    status: 'pendiente',
    dueDate: '2026-10-21',
    link: '/cobros/c1',
    ...overrides,
  };
}
