'use client';

import { useCallback } from 'react';
import {
  banAdminUser,
  getAdminUser,
  reactivateAdminUser,
  setAdminUserRole,
  suspendAdminUser,
  type AdminRole,
  type AdminUserDetail,
} from '@/services/admin';
import { useApiResource } from './use-api-resource';
import { useApiSubmit, type ApiSubmitResult } from './use-api-submit';

/** Acciones sobre una cuenta; cada una exige motivo salvo la reactivación (CA-009-11). */
export type AdminUserAction =
  | { type: 'suspend'; reason: string }
  | { type: 'reactivate'; reason?: string }
  | { type: 'ban'; reason: string }
  | { type: 'role'; role: AdminRole; reason: string };

/**
 * Ficha de un usuario (`GET /admin/users/:userId`, RF-009-09) y sus acciones. Tras una acción
 * exitosa la ficha se reemplaza por la que devuelve la API; la pantalla no recalcula estados.
 */
export function useAdminUser(userId: string) {
  const load = useCallback(() => getAdminUser(userId), [userId]);
  const resource = useApiResource<AdminUserDetail>(load);
  const { replace } = resource;

  const runAction = useCallback(
    (action: AdminUserAction): Promise<AdminUserDetail> => {
      switch (action.type) {
        case 'suspend':
          return suspendAdminUser(userId, action.reason);
        case 'reactivate':
          return reactivateAdminUser(userId, action.reason);
        case 'ban':
          return banAdminUser(userId, action.reason);
        case 'role':
          return setAdminUserRole(userId, action.role, action.reason);
      }
    },
    [userId],
  );
  const { submit, isSubmitting } = useApiSubmit(runAction);

  /** Envía la acción; con éxito reemplaza la ficha. `null` si ya había un envío en curso. */
  const act = useCallback(
    async (action: AdminUserAction): Promise<ApiSubmitResult<AdminUserDetail> | null> => {
      const outcome = await submit(action);
      if (outcome?.ok) replace(outcome.data);
      return outcome;
    },
    [submit, replace],
  );

  return { ...resource, act, isSubmitting };
}
