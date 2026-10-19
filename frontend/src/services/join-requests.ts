/**
 * Cliente de los endpoints de solicitudes de ingreso y chat (spec 010, `contracts/api.md`). Una
 * función por endpoint; los tipos salen del contrato congelado. El frontend no calcula cuotas,
 * plazos ni estados: usa `quote.amountCents`, `phase` y `allowedActions` del backend, y dibuja la
 * cuenta regresiva con `deadlineAt` y `serverNow`. Los reclamos (T040) siguen con datos simulados
 * de `join-requests.mock.ts`; el resto llama a la API.
 */
import { apiRequest } from './http';
import * as mock from './join-requests.mock';

/** Ruta de una solicitud del contrato 010 (`/api/join-requests/:id/...`). */
function requestPath(requestId: string, suffix = ''): string {
  return `/api/join-requests/${encodeURIComponent(requestId)}${suffix}`;
}

export type JoinRequestStatus =
  | 'abierta'
  | 'esperando_pago'
  | 'pago_informado'
  | 'aceptada'
  | 'rechazada'
  | 'cancelada'
  | 'expirada';

/** Estados activos (RF-010-02): reservan o pueden reservar un cupo. */
export const ACTIVE_JOIN_STATUSES: JoinRequestStatus[] = [
  'abierta',
  'esperando_pago',
  'pago_informado',
];

/** Estados finales (RN-010-05). */
export const FINAL_JOIN_STATUSES: JoinRequestStatus[] = [
  'aceptada',
  'rechazada',
  'cancelada',
  'expirada',
];

export type JoinRequestAction =
  | 'sendPaymentData'
  | 'extend'
  | 'uploadProof'
  | 'confirm'
  | 'cashPayment'
  | 'reject'
  | 'cancel'
  | 'sendMessage'
  | 'openDispute'
  | 'respondDispute';

export type DeadlineKind = 'solicitud' | 'pago' | 'decision';

/** El plazo vigente, evaluado con la hora del servidor al responder (RNF-010-03). */
export interface JoinRequestPhase {
  /** Estado efectivo: ya aplica los plazos vencidos aunque la tarea no haya corrido. */
  status: JoinRequestStatus;
  /** Vencimiento del plazo vigente (ISO 8601 en UTC). */
  deadlineAt: string | null;
  deadlineKind: DeadlineKind | null;
  /** Hora del servidor, para corregir la cuenta regresiva del cliente. */
  serverNow: string;
}

export interface JoinRequestGroup {
  id: string;
  name: string;
  serviceName: string;
  planName: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  billingDay: number;
}

/** Persona con su calificación (spec 007); `stars: null` es «Sin calificación». */
export interface JoinRequestPerson {
  userId: string;
  fullName: string;
  stars: number | null;
  level: string | null;
}

export type JoinCurrency = 'USD' | 'BS';

/** Cotización fijada al enviar los datos de pago (RN-010-01). */
export interface JoinQuote {
  amountCents: number;
  priceCents: number;
  currency: JoinCurrency;
  exchangeRate: string | null;
  totalBsCents: number;
  memberCount: number;
}

/** Datos de pago copiados a la solicitud; el QR se pide con `GET …/payment-qr`. */
export interface JoinPaymentInfo {
  text: string | null;
  qrAvailable: boolean;
}

export type JoinPaymentMethod = 'qr' | 'transferencia';

export interface JoinProof {
  method: JoinPaymentMethod;
  reference: string;
  mime: string;
  sizeBytes: number;
  uploadedAt: string;
  fileAvailable: boolean;
}

/** Ventana de ingreso del grupo (spec 001, RF-001-22). Fechas ISO 8601 en UTC. */
export interface JoinEntryWindow {
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export type DisputeKind = 'pago_sin_ingreso' | 'comprobante_falso';
export type DisputeStatus = 'abierto' | 'resuelto';

export interface JoinDisputeRef {
  id: string;
  kind: DisputeKind;
  status: DisputeStatus;
  openedByMe: boolean;
  canRespond: boolean;
}

/** Tipos de evento de la línea de tiempo (`join_request_events.type`, data-model 010). */
export type JoinEventType =
  | 'abierta'
  | 'datos_pago_enviados'
  | 'plazo_prorrogado'
  | 'comprobante_subido'
  | 'confirmada'
  | 'efectivo_registrado'
  | 'rechazada'
  | 'cancelada'
  | 'expirada'
  | 'recordatorio_enviado'
  | 'reclamo_abierto'
  | 'reclamo_respondido'
  | 'reclamo_resuelto';

export interface JoinTimelineEvent {
  type: JoinEventType;
  /** `null` es el sistema. */
  actor: { userId: string; fullName: string } | null;
  fromStatus: JoinRequestStatus | null;
  toStatus: JoinRequestStatus | null;
  reason: string | null;
  occurredAt: string;
}

/** `JoinRequest` del contrato. */
export interface JoinRequest {
  id: string;
  group: JoinRequestGroup;
  applicant: JoinRequestPerson;
  host: JoinRequestPerson;
  source: 'codigo' | 'publicacion';
  phase: JoinRequestPhase;
  openedAt: string;
  /** Cuota estimada con los miembros actuales + 1 (RF-010-03); no es la cotización. */
  estimatedShareCents: number;
  quote: JoinQuote | null;
  paymentInfo: JoinPaymentInfo | null;
  extended: boolean;
  proof: JoinProof | null;
  entryWindow: JoinEntryWindow;
  /** Valores de `join_requests.final_reason` (data-model 010), por ejemplo `titular_sin_respuesta`. */
  finalReason: string | null;
  rejectReason: string | null;
  rejectedAsFalse: boolean;
  /** Solo en `aceptada`: por comprobante o en efectivo (RF-010-18). */
  acceptedMethod?: 'comprobante' | 'efectivo' | null;
  chargeId: string | null;
  unreadCount: number;
  disputes: JoinDisputeRef[];
  /** `null` si no corresponde o ya lo abrió. */
  canOpenDispute: { kind: DisputeKind; closesAt: string } | null;
  allowedActions: JoinRequestAction[];
  timeline: JoinTimelineEvent[];
  version: number;
}

export interface JoinRequestsPage {
  items: JoinRequest[];
  nextCursor: string | null;
}

export type JoinRequestRole = 'solicitante' | 'titular';

export interface ListJoinRequestsParams {
  role?: JoinRequestRole;
  /** Uno o varios estados. */
  status?: JoinRequestStatus[];
  groupId?: string;
  limit?: number;
  cursor?: string;
}

/**
 * `POST /join-requests` (RF-010-01, RF-010-03): abre una solicitud `abierta` con el código; no une
 * a la persona al grupo. Lanza `ApiError` `422 INVALID_INVITE_CODE`, `429 RATE_LIMITED`, `422
 * BUSINESS_RULE` (`ENTRY_WINDOW_CLOSED` con `details.opensAt`, `GROUP_NOT_ACCEPTING`,
 * `NO_SLOTS_AVAILABLE`, `ACTIVE_REQUEST_EXISTS`, `TOO_MANY_ACTIVE_REQUESTS`,
 * `OPEN_CHARGES_IN_GROUP`, `ALREADY_MEMBER`, `GROUP_FROZEN`) o `403 ACCOUNT_RESTRICTED`.
 */
export function openJoinRequest(code: string): Promise<JoinRequest> {
  return mock.openJoinRequest(code);
}

/**
 * `GET /join-requests` (RF-010-26): como solicitante, sus solicitudes (más recientes primero);
 * como titular, las de sus grupos (más antigua primero).
 */
export function listJoinRequests(params: ListJoinRequestsParams = {}): Promise<JoinRequestsPage> {
  return mock.listJoinRequests(params);
}

/**
 * `GET /join-requests/:id`: la solicitud con su línea de tiempo completa (RF-010-27). Lanza
 * `ApiError` `403` (miembro que no participa) o `404` (ajeno), CA-010-20.
 */
export function getJoinRequest(requestId: string): Promise<JoinRequest> {
  return mock.getJoinRequest(requestId);
}

export interface SendPaymentDataRequest {
  /** Hasta 500 caracteres; opcional. */
  text?: string;
  /** JPG o PNG, hasta 2 MB; opcional. */
  qr?: File;
  version?: number;
}

/**
 * `POST /join-requests/:id/payment-data` (RF-010-11, RF-010-12), solo titular, con
 * `multipart/form-data`. Sin `text` ni `qr` el backend usa los datos de pago del grupo. Devuelve
 * la solicitud en `esperando_pago` con `quote` y el plazo de 15 minutos. Lanza `ApiError` `409
 * INVALID_TRANSITION` / `STALE_STATE` y `422` (`ENTRY_WINDOW_CLOSED`, `NO_SLOTS_AVAILABLE`,
 * `PAYMENT_INFO_MISSING`, `GROUP_FROZEN`).
 */
export function sendPaymentData(
  requestId: string,
  input: SendPaymentDataRequest = {},
): Promise<JoinRequest> {
  return mock.sendPaymentData(requestId, input);
}

/**
 * `POST /join-requests/:id/extend` (RF-010-28), solo titular: 15 minutos más, una sola vez.
 * Lanza `ApiError` `422 ALREADY_EXTENDED` o `409 INVALID_TRANSITION`.
 * [NECESITA ACLARACIÓN] el contrato no lista cuerpo; se manda `{ version? }` como en las demás.
 */
export function extendJoinRequest(
  requestId: string,
  input: { version?: number } = {},
): Promise<JoinRequest> {
  return mock.extendJoinRequest(requestId, input);
}

/** URL firmada de 10 minutos como máximo (`{ url, expiresAt, mime }`). */
export interface SignedFileLink {
  url: string;
  expiresAt: string;
  mime: string;
}

/**
 * `GET /join-requests/:id/payment-qr`: el QR de pago copiado a la solicitud. Lanza `ApiError`
 * `410 FILE_DELETED` tras la retención.
 */
export function getPaymentQr(requestId: string): Promise<SignedFileLink> {
  return mock.getPaymentQr(requestId);
}

export interface UploadJoinProofRequest {
  /** JPG, PNG o PDF, hasta 5 MB (el servidor valida el tipo real). */
  file: File;
  method: JoinPaymentMethod;
  /** 1 a 100 caracteres; obligatoria y única por grupo (RN-010-14). */
  reference: string;
  version?: number;
}

/**
 * `POST /join-requests/:id/proof` (RF-010-13), solo solicitante, con `multipart/form-data`.
 * Devuelve la solicitud en `pago_informado`. Lanza `ApiError` `413`, `415`, `400` (sin referencia
 * o método), `409 REFERENCE_ALREADY_USED` / `INVALID_TRANSITION` / `STALE_STATE`, `422
 * PAYMENT_DEADLINE_PASSED` (la solicitud expiró) y `503` (sin cambios).
 */
export function uploadJoinProof(
  requestId: string,
  input: UploadJoinProofRequest,
): Promise<JoinRequest> {
  return mock.uploadJoinProof(requestId, input);
}

/**
 * `POST /join-requests/:id/confirm` (RF-010-17), solo titular: la solicitud pasa a `aceptada`
 * con `chargeId`. Lanza `ApiError` `409 INVALID_TRANSITION` / `STALE_STATE` o `422 GROUP_FROZEN`.
 */
export function confirmJoinRequest(
  requestId: string,
  input: { version?: number } = {},
): Promise<JoinRequest> {
  return apiRequest<JoinRequest>(requestPath(requestId, '/confirm'), {
    method: 'POST',
    body: input,
  });
}

/**
 * `POST /join-requests/:id/cash-payment` (RF-010-18), solo titular y desde `esperando_pago`:
 * acepta sin comprobante, con el mismo efecto que `confirm`.
 */
export function registerCashPayment(
  requestId: string,
  input: { version?: number } = {},
): Promise<JoinRequest> {
  return apiRequest<JoinRequest>(requestPath(requestId, '/cash-payment'), {
    method: 'POST',
    body: input,
  });
}

export interface RejectJoinRequestRequest {
  /** 5 a 200 caracteres (RF-010-16). */
  reason: string;
  /** Solo en `pago_informado`: habilita el reclamo por comprobante falso (RF-010-21). */
  markProofAsFalse?: boolean;
  version?: number;
}

/**
 * `POST /join-requests/:id/reject` (RF-010-16), solo titular: la solicitud pasa a `rechazada` y
 * se libera el cupo. Lanza `ApiError` `400` (sin motivo), `409 INVALID_TRANSITION` o `422`.
 */
export function rejectJoinRequest(
  requestId: string,
  input: RejectJoinRequestRequest,
): Promise<JoinRequest> {
  return apiRequest<JoinRequest>(requestPath(requestId, '/reject'), {
    method: 'POST',
    body: input,
  });
}

/**
 * `POST /join-requests/:id/cancel` (RF-010-15), solo solicitante, en `abierta` o
 * `esperando_pago`. Lanza `ApiError` `409 INVALID_TRANSITION` (en `pago_informado` o final).
 * [NECESITA ACLARACIÓN] el contrato no lista cuerpo; se manda `{ version? }` como en las demás.
 */
export function cancelJoinRequest(requestId: string): Promise<JoinRequest> {
  return apiRequest<JoinRequest>(requestPath(requestId, '/cancel'), { method: 'POST' });
}

/** Mensaje del chat (`JoinMessage`). El texto es plano y nunca se interpreta como HTML. */
export interface JoinMessage {
  id: string;
  seq: number;
  senderId: string;
  body: string | null;
  imageAvailable: boolean;
  createdAt: string;
}

export interface JoinMessagesPage {
  items: JoinMessage[];
  serverNow: string;
}

/**
 * `GET /join-requests/:id/messages?afterSeq=&limit=` (RF-010-09): mensajes por `seq` ascendente;
 * con `afterSeq` solo los nuevos. El cliente consulta cada 5 s con la conversación abierta.
 */
export function listMessages(
  requestId: string,
  params: { afterSeq?: number; limit?: number } = {},
): Promise<JoinMessagesPage> {
  const query = new URLSearchParams();
  if (params.afterSeq !== undefined) query.set('afterSeq', String(params.afterSeq));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  const text = query.toString();
  return apiRequest<JoinMessagesPage>(
    `${requestPath(requestId, '/messages')}${text ? `?${text}` : ''}`,
  );
}

export interface SendMessageRequest {
  /** 1 a 1.000 caracteres; opcional si hay imagen. */
  text?: string;
  /** JPG o PNG hasta 5 MB; opcional si hay texto. */
  image?: File;
}

/**
 * `POST /join-requests/:id/messages` (RF-010-05, RF-010-10) con `multipart/form-data`. Lanza
 * `ApiError` `400` (vacío o > 1.000), `413`, `415` (por ejemplo un PDF), `422 CHAT_READ_ONLY` y
 * `429 RATE_LIMITED` con `details.retryAfterSeconds`. No hay operaciones para editar ni borrar.
 */
export function sendMessage(requestId: string, input: SendMessageRequest): Promise<JoinMessage> {
  const form = new FormData();
  if (input.text !== undefined) form.append('text', input.text);
  if (input.image) form.append('image', input.image);
  return apiRequest<JoinMessage>(requestPath(requestId, '/messages'), {
    method: 'POST',
    body: form,
  });
}

/** `GET /join-requests/:id/messages/:messageId/image`: URL firmada de la imagen (≤ 10 min). */
export function getMessageImage(requestId: string, messageId: string): Promise<SignedFileLink> {
  return apiRequest<SignedFileLink>(
    requestPath(requestId, `/messages/${encodeURIComponent(messageId)}/image`),
  );
}

/** `POST /join-requests/:id/read` (RF-010-09): marca como leído hasta `upToSeq`. Responde 204. */
export function markMessagesRead(requestId: string, upToSeq: number): Promise<void> {
  return apiRequest<void>(requestPath(requestId, '/read'), {
    method: 'POST',
    body: { upToSeq },
  });
}

export type DisputeResult = 'estafa_confirmada' | 'sin_falta';

/** `Dispute` del contrato. La resolución la ven ambas partes (RF-010-24). */
export interface Dispute {
  id: string;
  kind: DisputeKind;
  status: DisputeStatus;
  openedBy: { userId: string; fullName: string };
  description: string;
  evidenceAvailable: boolean;
  openedAt: string;
  response: { text: string; evidenceAvailable: boolean; respondedAt: string } | null;
  resolution: { result: DisputeResult; reason: string; resolvedAt: string } | null;
}

export interface OpenDisputeRequest {
  /** 10 a 500 caracteres. */
  description: string;
  /** JPG o PNG hasta 5 MB; opcional. */
  evidence?: File;
}

/**
 * `POST /join-requests/:id/disputes` (RF-010-21) con `multipart/form-data`. El tipo lo deduce el
 * backend por quién abre y el estado. Lanza `ApiError` `422` (`DISPUTE_NOT_ALLOWED`,
 * `DISPUTE_WINDOW_CLOSED`, `DISPUTE_ALREADY_OPEN`), `413` y `415`.
 */
export function openDispute(requestId: string, input: OpenDisputeRequest): Promise<Dispute> {
  return mock.openDispute(requestId, input);
}

export interface RespondDisputeRequest {
  /** 10 a 500 caracteres. */
  text: string;
  evidence?: File;
}

/**
 * `POST /join-requests/:id/disputes/:disputeId/response` (RF-010-22): una sola respuesta de la
 * otra parte. Lanza `ApiError` `422 DISPUTE_ALREADY_RESPONDED` o `DISPUTE_RESOLVED`.
 */
export function respondDispute(
  requestId: string,
  disputeId: string,
  input: RespondDisputeRequest,
): Promise<Dispute> {
  return mock.respondDispute(requestId, disputeId, input);
}

/** `GET /join-requests/:id/disputes`: los reclamos de la solicitud, con su resolución. */
export function listDisputes(requestId: string): Promise<{ items: Dispute[] }> {
  return mock.listDisputes(requestId);
}
