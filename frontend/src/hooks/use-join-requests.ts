'use client';

import { useCallback } from 'react';
import {
  ACTIVE_JOIN_STATUSES,
  cancelJoinRequest,
  confirmJoinRequest,
  extendJoinRequest,
  FINAL_JOIN_STATUSES,
  getJoinRequest,
  getPaymentQr,
  listJoinRequests,
  openJoinRequest,
  registerCashPayment,
  rejectJoinRequest,
  sendPaymentData,
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
