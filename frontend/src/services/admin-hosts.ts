/**
 * Cliente de los endpoints de titulares habilitados y transferencia por un administrador (spec
 * 009, `contracts/api.md` § Titulares habilitados). Todos exigen `AdminGuard` en el servidor.
 * La habilitación manual es independiente de la calificación (RF-007-17); si alguien puede ser
 * titular lo decide el backend.
 */
import { apiRequest } from './http';

/**
 * Habilitación manual vigente de `GET /admin/host-enablements?active=true`. [NECESITA
 * ACLARACIÓN] El contrato no detalla la respuesta; se toman las columnas de `host_enablements`
 * (`data-model.md`) y del mockup `AdminTitulares.dc.html`: usuario, motivo, quién y desde cuándo.
 */
export interface HostEnablementRow {
  id: string;
  user: { id: string; fullName: string; email: string };
  reason: string;
  enabledBy: { id: string; fullName: string };
  /** ISO 8601 en UTC. */
  enabledAt: string;
}

export interface HostEnablementsPage {
  items: HostEnablementRow[];
  nextCursor: string | null;
}

export interface ListHostEnablementsParams {
  limit?: number;
  cursor?: string;
}

function hostEnablementPath(userId: string): string {
  return `/api/admin/users/${encodeURIComponent(userId)}/host-enablement`;
}

/** `GET /admin/host-enablements?active=true` (RF-009-21): solo las vigentes. */
export function listHostEnablements(
  params: ListHostEnablementsParams = {},
): Promise<HostEnablementsPage> {
  const query = new URLSearchParams({ active: 'true' });
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  return apiRequest<HostEnablementsPage>(`/api/admin/host-enablements?${query.toString()}`);
}

/**
 * `POST /admin/users/:userId/host-enablement` (RF-009-21, CA-009-28): habilita con motivo de 10
 * a 300 caracteres. [NECESITA ACLARACIÓN] El contrato no dice qué devuelve; se vuelve a pedir.
 */
export function enableHost(userId: string, input: { reason: string }): Promise<unknown> {
  return apiRequest<unknown>(hostEnablementPath(userId), { method: 'POST', body: input });
}

/** `POST /admin/users/:userId/host-enablement/revoke` (RF-009-21): quita la habilitación. */
export function revokeHostEnablement(userId: string, input: { reason: string }): Promise<unknown> {
  return apiRequest<unknown>(`${hostEnablementPath(userId)}/revoke`, {
    method: 'POST',
    body: input,
  });
}

/**
 * `POST /admin/groups/:groupId/transfer-ownership` (RF-009-24, CA-009-35): solo si el titular
 * actual está `suspendido`. Errores `422 BUSINESS_RULE`: `RF-001-21` (`NOT_HOST_ELIGIBLE`),
 * `RN-010-09` (solicitudes en pago) y `RN-001-14` (límite de grupos del destinatario).
 */
export function transferGroupOwnership(
  groupId: string,
  input: { toUserId: string; reason: string },
): Promise<unknown> {
  return apiRequest<unknown>(
    `/api/admin/groups/${encodeURIComponent(groupId)}/transfer-ownership`,
    { method: 'POST', body: input },
  );
}
