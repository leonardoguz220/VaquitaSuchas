'use client';

import { getMyReputation } from '@/services/reputation';
import { useApiResource } from './use-api-resource';

/** Calificación propia con su detalle (`GET /users/me/reputation`, RF-007-01 a RF-007-04). */
export function useMyReputation() {
  return useApiResource(getMyReputation);
}
