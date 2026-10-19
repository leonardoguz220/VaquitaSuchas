/**
 * Datos simulados que respetan el contrato 008 (`contracts/api.md`), solo para las pruebas.
 * Nombres, montos y fechas son inventados.
 */
import type { ListingView, OwnerListing } from '../listings';

/** CA-008-01: 2 cupos de Prime Video con la cuota estimada que calcula el backend. */
export function listingView(overrides: Partial<ListingView> = {}): ListingView {
  return {
    id: 'l1',
    service: {
      name: 'Prime Video',
      planName: 'Estándar',
      logoUrl: null,
      brandColor: '#00A8E1',
      category: 'video',
    },
    slotsOffered: 2,
    estimatedShareCents: 930,
    estimatedShareLabel: 'estimada',
    billingDay: 18,
    owner: { fullName: 'Valeria Choque', level: 'Excelente' },
    description: 'Somos una familia que comparte Prime Video desde hace un año.',
    conditions: 'Pago por QR dentro del plazo.',
    publishedAt: '2026-10-18T14:00:00.000Z',
    // 17 nov 2026, 10:00 en La Paz.
    expiresAt: '2026-11-17T14:00:00.000Z',
    entryWindow: {
      isOpen: true,
      opensAt: null,
      // 20 oct 2026, 23:59 en La Paz.
      closesAt: '2026-10-21T03:59:59.000Z',
    },
    myRequest: null,
    canRequest: true,
    cannotRequestReason: null,
    ...overrides,
  };
}

/** Publicación `activa` del grupo `g1`, vista por su titular. */
export function ownerListing(overrides: Partial<OwnerListing> = {}): OwnerListing {
  return {
    id: 'l1',
    groupId: 'g1',
    status: 'activa',
    slotsOffered: 2,
    description: 'Somos una familia que comparte Prime Video desde hace un año.',
    conditions: 'Pago por QR dentro del plazo.',
    publishedAt: '2026-10-18T14:00:00.000Z',
    expiresAt: '2026-11-17T14:00:00.000Z',
    renewedAt: null,
    hiddenAt: null,
    endReason: null,
    reportCount: 0,
    openRequests: 1,
    preview: listingView(),
    version: 3,
    ...overrides,
  };
}
