'use client';

import { useCallback } from 'react';
import {
  excludeChargeFromReputation,
  getGroupRanking,
  getMyBadges,
  getMyReputation,
  reportChargeRating,
} from '@/services/reputation';
import { useApiSubmit } from './use-api-submit';
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

/** Reportar un cobro mal calificado (`POST /charges/:id/reputation-report`, RF-007-14). */
export function useReportChargeRating(chargeId: string) {
  const request = useCallback(
    (comment: string) => reportChargeRating(chargeId, { comment }),
    [chargeId],
  );
  return useApiSubmit(request);
}

/** Excluir un cobro de la reputación (`POST /charges/:id/reputation-exclusion`, CA-007-13). */
export function useExcludeChargeFromReputation(chargeId: string) {
  const request = useCallback(
    (reason: string) => excludeChargeFromReputation(chargeId, { reason }),
    [chargeId],
  );
  return useApiSubmit(request);
}
