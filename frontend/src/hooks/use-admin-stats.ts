'use client';

import { getAdminStats } from '@/services/admin-stats';
import { useApiResource } from './use-api-resource';

/** Estadísticas agregadas del tablero (`GET /admin/stats`, RF-009-15). */
export function useAdminStats() {
  return useApiResource(getAdminStats);
}
