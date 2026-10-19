'use client';

import { useCallback } from 'react';
import { getMyReputation } from '@/services/reputation';
import { useApiResource } from './use-api-resource';

/** Mi reputación y mi habilitación como titular (`GET /users/me/reputation`, RF-007-04). */
export function useMyReputation() {
  const load = useCallback(() => getMyReputation(), []);
  return useApiResource(load);
}
