/**
 * Cliente de los reclamos de ingreso de administración (spec 009, `contracts/api.md`, Reclamos).
 * Por ahora responde con datos simulados de `admin-disputes.mock.ts`; al conectar el backend solo
 * cambia el cuerpo por `apiRequest`. La cola llega con los abiertos primero y la API decide quién
 * es el acusado: la pantalla solo lo muestra.
 */
import * as mock from './admin-disputes.mock';

export type AdminDisputeType = 'pago_sin_ingreso' | 'comprobante_falso';
export type AdminDisputeStatus = 'abierto' | 'resuelto';
/** Resultados del contrato: `estafa_confirmada` banea a la persona acusada (RF-009-20). */
export type AdminDisputeResult = 'estafa_confirmada' | 'sin_falta';

/** Fila de la cola (`GET /admin/disputes`). No incluye chat ni comprobante. */
export interface AdminDispute {
  id: string;
  type: AdminDisputeType;
  status: AdminDisputeStatus;
  result: AdminDisputeResult | null;
  requesterName: string;
  /** Titular en un reclamo por pago sin ingreso; solicitante en un comprobante falso. */
  accusedName: string;
  groupName: string;
  quoteCents: number;
  reference: string | null;
  /** ISO 8601 en UTC. */
  createdAt: string;
  resolvedAt: string | null;
  hasResponse: boolean;
}

export interface AdminDisputesPage {
  items: AdminDispute[];
  nextCursor: string | null;
}

export interface AdminDisputeTimelineItem {
  at: string;
  label: string;
}

export interface AdminDisputeChatMessage {
  author: string;
  at: string;
  text: string;
}

/** Evidencia (`GET /admin/disputes/:id/evidence`): cada llamada queda en auditoría (CA-009-27). */
export interface AdminDisputeEvidence {
  timeline: AdminDisputeTimelineItem[];
  chat: AdminDisputeChatMessage[];
  receipt: { label: string; url: string } | null;
  quoteCents: number;
  descriptions: { by: string; text: string }[];
  responses: { by: string; text: string }[];
  /** Momento en que se abrió y quedó registrado. */
  openedAt: string;
}

/** `GET /admin/disputes?status=` (RF-009-20). */
export function listAdminDisputes(status?: AdminDisputeStatus): Promise<AdminDisputesPage> {
  return mock.listDisputes(status);
}

/** `GET /admin/disputes/:id/evidence` (RF-010-23, CA-009-27). Solo al pedirla explícitamente. */
export function getAdminDisputeEvidence(disputeId: string): Promise<AdminDisputeEvidence> {
  return mock.getEvidence(disputeId);
}

/** `POST /admin/disputes/:id/resolve` (RF-010-24, CA-009-25, 26, 30). */
export function resolveAdminDispute(
  disputeId: string,
  result: AdminDisputeResult,
  reason: string,
): Promise<AdminDispute> {
  return mock.resolve(disputeId, result, reason);
}

/** Lectura de una fila por id (la ficha la toma de la cola simulada). */
export function getAdminDispute(disputeId: string): Promise<AdminDispute> {
  return mock.getDispute(disputeId);
}
