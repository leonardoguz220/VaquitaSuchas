/**
 * Cliente de los endpoints de reclamos del panel de administración (spec 009,
 * `contracts/api.md` § Reclamos; spec 010 RF-010-23 y RF-010-24). Todos exigen `AdminGuard`.
 * La evidencia solo se pide cuando el administrador pulsa «Ver evidencia»: cada llamada queda en
 * el log de auditoría antes de devolver nada (CA-009-27).
 */
import type {
  DisputeKind,
  DisputeResult,
  DisputeStatus,
  JoinProof,
  JoinQuote,
  JoinTimelineEvent,
} from './join-requests';
import { apiRequest } from './http';

export type DisputePartyRole = 'solicitante' | 'titular';

export interface DisputeParty {
  userId: string;
  fullName: string;
  role: DisputePartyRole;
}

/**
 * Fila de la cola `GET /admin/disputes` (RF-009-20): tipo, partes, fechas y `hasResponse`, sin
 * chat ni comprobante. [NECESITA ACLARACIÓN] El contrato no detalla `AdminDisputeRow`; se toman
 * los campos de `Dispute` (contrato 010) más el grupo, la persona acusada (titular en
 * `pago_sin_ingreso`, solicitante en `comprobante_falso`, RF-010-24) y el resultado. La persona
 * acusada la indica el backend: el frontend no la deduce.
 */
export interface AdminDisputeRow {
  id: string;
  kind: DisputeKind;
  status: DisputeStatus;
  requestId: string;
  group: { id: string; name: string; serviceName: string };
  openedBy: DisputeParty;
  accused: DisputeParty;
  /** ISO 8601 en UTC. */
  openedAt: string;
  resolvedAt: string | null;
  result: DisputeResult | null;
  hasResponse: boolean;
}

export interface AdminDisputesPage {
  items: AdminDisputeRow[];
  nextCursor: string | null;
}

/** Mensaje del chat en la evidencia. Texto plano; la imagen llega como URL firmada. */
export interface EvidenceMessage {
  id: string;
  seq: number;
  sender: { userId: string; fullName: string };
  body: string | null;
  imageUrl: string | null;
  createdAt: string;
}

/** Descripción de un reclamo y su respuesta, con sus imágenes como URL firmada. */
export interface EvidenceClaim {
  id: string;
  kind: DisputeKind;
  openedBy: { userId: string; fullName: string };
  description: string;
  evidenceUrl: string | null;
  openedAt: string;
  response: { text: string; evidenceUrl: string | null; respondedAt: string } | null;
}

/**
 * Evidencia `GET /admin/disputes/:disputeId/evidence` (RF-010-23): línea de tiempo, chat,
 * comprobante (URL firmada), cotización, descripciones, imágenes y respuestas. [NECESITA
 * ACLARACIÓN] El contrato la describe sin forma; se reutilizan los tipos del contrato 010.
 */
export interface AdminDisputeEvidence {
  dispute: AdminDisputeRow;
  timeline: JoinTimelineEvent[];
  messages: EvidenceMessage[];
  proof: (JoinProof & { fileUrl: string | null }) | null;
  quote: JoinQuote | null;
  claims: EvidenceClaim[];
}

export interface ListAdminDisputesParams {
  status?: DisputeStatus;
  limit?: number;
  cursor?: string;
}

function disputePath(disputeId: string): string {
  return `/api/admin/disputes/${encodeURIComponent(disputeId)}`;
}

/** `GET /admin/disputes` (RF-009-20): los abiertos primero; el orden lo da la API. */
export function listAdminDisputes(
  params: ListAdminDisputesParams = {},
): Promise<AdminDisputesPage> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const search = query.toString();
  return apiRequest<AdminDisputesPage>(`/api/admin/disputes${search ? `?${search}` : ''}`);
}

/**
 * `GET /admin/disputes/:disputeId/evidence` (CA-009-27): cada llamada escribe
 * `reclamo_abrir_evidencia` en la auditoría. Sin reclamo abierto responde `403`.
 */
export function getAdminDisputeEvidence(disputeId: string): Promise<AdminDisputeEvidence> {
  return apiRequest<AdminDisputeEvidence>(`${disputePath(disputeId)}/evidence`);
}

/**
 * `POST /admin/disputes/:disputeId/resolve` (RF-010-24; CA-009-25, 26, 30): `estafa_confirmada`
 * banea a la persona acusada en la misma transacción. Error `409` si ya estaba resuelto.
 * [NECESITA ACLARACIÓN] El contrato no dice qué devuelve.
 */
export function resolveAdminDispute(
  disputeId: string,
  input: { result: DisputeResult; reason: string },
): Promise<unknown> {
  return apiRequest<unknown>(`${disputePath(disputeId)}/resolve`, { method: 'POST', body: input });
}
