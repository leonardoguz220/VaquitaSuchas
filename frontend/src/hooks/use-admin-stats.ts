'use client';

import { getAdminStats } from '@/services/admin';
import { useApiResource } from './use-api-resource';

/** Agregados del tablero (`GET /admin/stats`, RF-009-15 a RF-009-17). Sin cálculos en la pantalla. */
export function useAdminStats() {
  return useApiResource(getAdminStats);
}
