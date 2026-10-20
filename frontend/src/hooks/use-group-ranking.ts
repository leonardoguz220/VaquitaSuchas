'use client';

import { useCallback } from 'react';
import { getGroupRanking } from '@/services/reputation';
import { useApiResource } from './use-api-resource';

/**
 * `GET /groups/:groupId/ranking` (RF-007-09 a 11): el orden y las posiciones las decide la API.
 * Un `404` (grupo ajeno o inexistente) o `403` llegan como `error` con su código.
 */
export function useGroupRanking(groupId: string) {
  const load = useCallback(() => getGroupRanking(groupId), [groupId]);
  return useApiResource(load);
}
