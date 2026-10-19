'use client';

import { useCallback } from 'react';
import { getMyBadges } from '@/services/reputation';
import { useApiResource } from './use-api-resource';

/** Mis insignias, obtenidas y pendientes (`GET /users/me/badges`, RF-007-07). */
export function useMyBadges() {
  const load = useCallback(() => getMyBadges(), []);
  return useApiResource(load);
}
