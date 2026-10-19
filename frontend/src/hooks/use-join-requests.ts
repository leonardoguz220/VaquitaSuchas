'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ACTIVE_JOIN_STATUSES,
  cancelJoinRequest,
  confirmJoinRequest,
  extendJoinRequest,
  FINAL_JOIN_STATUSES,
  getJoinRequest,
  getJoinRequestsSummary,
  getPaymentQr,
  getProofFile,
  listDisputes,
  listGroupJoinRequests,
  listJoinRequests,
  openDispute,
  openJoinRequest,
  registerCashPayment,
  rejectJoinRequest,
  respondDispute,
  sendPaymentData,
  type JoinRequestsSummary,
  type OpenDisputeRequest,
  type RespondDisputeRequest,
  type RejectJoinRequestRequest,
  type SendPaymentDataRequest,
  type UploadJoinProofRequest,
  uploadJoinProof,
} from '@/services/join-requests';
import { useApiResource } from './use-api-resource';
import { useApiSubmit } from './use-api-submit';
import { usePaginatedResource } from './use-paginated-resource';

/** Solicitudes por página de "Mis solicitudes" (contrato 000 A: `limit` de 1 a 100). */
export const MY_REQUESTS_PAGE_SIZE = 20;

/** Cada cuánto la barra consulta las insignias de solicitudes (RF-010-26). */
export const SUMMARY_POLL_MS = 30_000;

/** Solicitudes por página de la cola del titular. */
export const HOST_QUEUE_PAGE_SIZE = 20;

/** Pestañas de "Mis solicitudes": las activas o el historial (estados finales). */
export type MyRequestsScope = 'activas' | 'historial';

/**
 * "Mis solicitudes" (`GET /join-requests?role=solicitante`, RF-010-26): el filtro por estados lo
 * aplica la API y "Ver más" sigue el cursor. Al cambiar de pestaña se vuelve a la primera página.
 */
export function useMyJoinRequests(scope: MyRequestsScope) {
  const loadPage = useCallback(
    (cursor?: string) =>
      listJoinRequests({
        role: 'solicitante',
        status: scope === 'activas' ? ACTIVE_JOIN_STATUSES : FINAL_JOIN_STATUSES,
        limit: MY_REQUESTS_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    [scope],
  );
  return usePaginatedResource(loadPage);
}

/**
 * Cola del titular en la pestaña Solicitudes de `/grupos/[id]` (`GET /groups/:id/join-requests`,
 * RF-010-26): la más antigua primero, con «Ver más». `firstPage.slots` trae los cupos del grupo.
 */
export function useGroupJoinRequests(groupId: string) {
  const loadPage = useCallback(
    (cursor?: string) =>
      listGroupJoinRequests(groupId, {
        limit: HOST_QUEUE_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
    [groupId],
  );
  return usePaginatedResource(loadPage);
}

/**
 * Insignias de la barra (`GET /me/join-requests/summary`, RF-010-26): consulta al montar y cada
 * 30 s. Un fallo no bloquea la barra: se conserva el último valor y se vuelve a intentar.
 */
export function useJoinRequestsSummary(): JoinRequestsSummary | null {
  const [summary, setSummary] = useState<JoinRequestsSummary | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      getJoinRequestsSummary().then(
        (data) => {
          if (active) setSummary(data);
        },
        () => {
          // Se vuelve a intentar en el próximo sondeo.
        },
      );
    };
    refresh();
    const timer = setInterval(refresh, SUMMARY_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return summary;
}

/** Enlace firmado del comprobante para el titular (`GET …/proof/file`, RF-010-13). */
export function useProofFile(requestId: string) {
  const request = useCallback(() => getProofFile(requestId), [requestId]);
  return useApiSubmit(request);
}

/** Abrir una solicitud con el código de invitación (`POST /join-requests`, RF-010-01). */
export function useOpenJoinRequest() {
  return useApiSubmit(openJoinRequest);
}

/**
 * Detalle de una solicitud (`GET /join-requests/:id`). `403` (miembro que no participa) y `404`
 * (ajeno, CA-010-20) llegan en `error`.
 */
export function useJoinRequest(requestId: string) {
  const load = useCallback(() => getJoinRequest(requestId), [requestId]);
  return useApiResource(load);
}

/** Enviar los datos de pago como titular (`POST /join-requests/:id/payment-data`, RF-010-11). */
export function useSendPaymentData(requestId: string) {
  const request = useCallback(
    (input: SendPaymentDataRequest) => sendPaymentData(requestId, input),
    [requestId],
  );
  return useApiSubmit(request);
}

/** Prorrogar el plazo de pago una vez (`POST /join-requests/:id/extend`, RF-010-28). */
export function useExtendJoinRequest(requestId: string) {
  const request = useCallback(
    (input: { version?: number }) => extendJoinRequest(requestId, input),
    [requestId],
  );
  return useApiSubmit(request);
}

/**
 * URL firmada del QR de pago de la solicitud (`GET …/payment-qr`). Con `enabled = false` no la
 * pide (la solicitud no tiene QR). `410 FILE_DELETED` llega en `error`.
 */
export function usePaymentQr(requestId: string, enabled: boolean) {
  const load = useCallback(() => getPaymentQr(requestId), [requestId]);
  return useApiResource(enabled ? load : null);
}

/** Subir el comprobante de ingreso (`POST /join-requests/:id/proof`, RF-010-13). */
export function useUploadJoinProof(requestId: string) {
  const request = useCallback(
    (input: UploadJoinProofRequest) => uploadJoinProof(requestId, input),
    [requestId],
  );
  return useApiSubmit(request);
}

type VersionInput = { version?: number };

function useRequestAction(
  requestId: string,
  call: (id: string, input: VersionInput) => ReturnType<typeof confirmJoinRequest>,
) {
  const request = useCallback((input: VersionInput) => call(requestId, input), [requestId, call]);
  return useApiSubmit(request);
}

/** Confirmar el ingreso como titular (`POST /join-requests/:id/confirm`, RF-010-17). */
export function useConfirmJoinRequest(requestId: string) {
  return useRequestAction(requestId, confirmJoinRequest);
}

/** Registrar un pago en efectivo (`POST /join-requests/:id/cash-payment`, RF-010-18). */
export function useCashPayment(requestId: string) {
  return useRequestAction(requestId, registerCashPayment);
}

/** Cancelar la solicitud como solicitante (`POST /join-requests/:id/cancel`, RF-010-15). */
export function useCancelJoinRequest(requestId: string) {
  return useRequestAction(requestId, cancelJoinRequest);
}

/** Rechazar con motivo (`POST /join-requests/:id/reject`, RF-010-16). */
export function useRejectJoinRequest(requestId: string) {
  const request = useCallback(
    (input: RejectJoinRequestRequest) => rejectJoinRequest(requestId, input),
    [requestId],
  );
  return useApiSubmit(request);
}

/**
 * Reclamos de la solicitud (`GET /join-requests/:id/disputes`, RF-010-24). Con `enabled = false`
 * no los pide. `revision` cambia cuando la solicitud trae otros reclamos y fuerza la recarga.
 */
export function useDisputes(requestId: string, enabled: boolean, revision: string) {
  const load = useCallback(
    () => listDisputes(requestId),
    // `revision` vuelve a pedir la lista cuando cambian los reclamos de la solicitud.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requestId, revision],
  );
  return useApiResource(enabled ? load : null);
}

/** Abrir un reclamo (`POST /join-requests/:id/disputes`, RF-010-21). */
export function useOpenDispute(requestId: string) {
  const request = useCallback(
    (input: OpenDisputeRequest) => openDispute(requestId, input),
    [requestId],
  );
  return useApiSubmit(request);
}

/** Responder un reclamo de la otra parte (`POST …/disputes/:disputeId/response`, RF-010-22). */
export function useRespondDispute(requestId: string) {
  const request = useCallback(
    (input: { disputeId: string } & RespondDisputeRequest) =>
      respondDispute(requestId, input.disputeId, { text: input.text, evidence: input.evidence }),
    [requestId],
  );
  return useApiSubmit(request);
}
