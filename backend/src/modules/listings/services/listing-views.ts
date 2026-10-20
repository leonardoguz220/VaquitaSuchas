import type { CannotRequestReason } from '../domain/request-eligibility.js';

export type OwnerLevel = 'Nuevo' | 'En riesgo' | 'Regular' | 'Bueno' | 'Excelente';

/**
 * Lo que ve cualquier usuario con sesión (contrato 008, `ListingView`; RF-008-03, RF-008-04).
 * No incluye nombres ni datos de miembros, comprobantes, datos de pago, código de invitación ni
 * celular del titular (RNF-008-01).
 */
export interface ListingView {
  id: string;
  service: {
    name: string;
    planName: string | null;
    logoUrl: string | null;
    brandColor: string | null;
    category: string | null;
  };
  slotsOffered: number;
  estimatedShareCents: number;
  estimatedShareLabel: 'estimada';
  billingDay: number;
  owner: { fullName: string; level: OwnerLevel };
  description: string | null;
  conditions: string | null;
  publishedAt: string;
  expiresAt: string;
  entryWindow: { isOpen: boolean; opensAt: string | null; closesAt: string | null };
  myRequest: { id: string; status: string } | null;
  canRequest: boolean;
  cannotRequestReason: CannotRequestReason | null;
}

export interface ListingsPage {
  items: ListingView[];
  nextCursor: string | null;
}
