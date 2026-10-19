'use client';

import { useCallback } from 'react';
import { getGroupRanking, getMyBadges, getMyReputation } from '@/services/reputation';
import { useApiResource } from './use-api-resource';

/** Calificación propia con su detalle (`GET /users/me/reputation`, RF-007-01 a RF-007-04). */
export function useMyReputation() {
  return useApiResource(getMyReputation);
}

/** Insignias obtenidas y por obtener (`GET /users/me/badges`, RF-007-07). */
export function useMyBadges() {
  return useApiResource(getMyBadges);
}

/** Ranking de puntualidad del grupo (`GET /groups/:id/ranking`, RF-007-09 y RF-007-10). */
export function useGroupRanking(groupId: string) {
  const load = useCallback(() => getGroupRanking(groupId), [groupId]);
  return useApiResource(load);
}
