'use client';

import { getMyBadges, getMyReputation } from '@/services/reputation';
import { useApiResource } from './use-api-resource';

/** Calificación propia con su detalle (`GET /users/me/reputation`, RF-007-01 a RF-007-04). */
export function useMyReputation() {
  return useApiResource(getMyReputation);
}

/** Insignias obtenidas y por obtener (`GET /users/me/badges`, RF-007-07). */
export function useMyBadges() {
  return useApiResource(getMyBadges);
}
