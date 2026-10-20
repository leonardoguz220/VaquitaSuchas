'use client';

import { useCallback } from 'react';
import { excludeChargeReputation, reportChargeReputation } from '@/services/reputation';
import { useApiSubmit } from './use-api-submit';

/**
 * `POST /charges/:chargeId/reputation-report` (dueño del cobro) y
 * `POST /charges/:chargeId/reputation-exclusion` (titular), RF-007-14. Solo envían el texto; la
 * API decide la calificación y la recalcula. Mismo patrón que `useOwnerReviewActions`.
 */
export function useChargeReputationActions(chargeId: string) {
  const reportRequest = useCallback(
    (comment: string) => reportChargeReputation(chargeId, { comment }),
    [chargeId],
  );
  const excludeRequest = useCallback(
    (reason: string) => excludeChargeReputation(chargeId, { reason }),
    [chargeId],
  );
  const reportSubmit = useApiSubmit(reportRequest);
  const excludeSubmit = useApiSubmit(excludeRequest);

  return {
    report: reportSubmit.submit,
    exclude: excludeSubmit.submit,
    isReporting: reportSubmit.isSubmitting,
    isExcluding: excludeSubmit.isSubmitting,
  };
}
