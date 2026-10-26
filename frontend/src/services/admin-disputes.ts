/**
 * Cliente de los reclamos de ingreso de administración (spec 009, `contracts/api.md`, Reclamos).
 * Conectado al backend (T025). La cola llega con los abiertos primero y la API decide quién es el
 * acusado: la pantalla solo lo muestra. La cola no trae grupo, cuota ni referencia, y el chat solo
 * trae ids: se muestra lo disponible, sin inventar campos (mejora futura para backend).
 */
import { ApiError, apiRequest } from './http';

export type AdminDisputeType = 'pago_sin_ingreso' | 'comprobante_falso';
export type AdminDisputeStatus = 'abierto' | 'resuelto';
/** Resultados del contrato: `estafa_confirmada` banea a la persona acusada (RF-009-20). */
export type AdminDisputeResult = 'estafa_confirmada' | 'sin_falta';

/** Fila de la cola (`GET /admin/disputes`). No incluye chat ni comprobante. */
export interface AdminDispute {
  id: string;
  type: AdminDisputeType;
  status: AdminDisputeStatus;
  /** La cola no trae el resultado: llega al resolver en esta sesión. */
  result: AdminDisputeResult | null;
  requesterName: string;
  /** Titular en un reclamo por pago sin ingreso; solicitante en un comprobante falso. */
  accusedName: string;
  /** La cola no lo trae todavía: `null` y la pantalla lo omite. */
  groupName: string | null;
  quoteCents: number | null;
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
  quoteCents: number | null;
  descriptions: { by: string; text: string }[];
  responses: { by: string; text: string }[];
  /** Momento en que se abrió y quedó registrado. */
  openedAt: string;
}

/** Fila de la cola tal como la envía `GET /admin/disputes` (`AdminDisputeRow` del backend). */
interface ApiDisputeRow {
  id: string;
  kind: AdminDisputeType;
  status: AdminDisputeStatus;
  openedBy: { userId: string; fullName: string };
  accused: { userId: string; fullName: string };
  openedAt: string;
  hasResponse: boolean;
  resolvedAt: string | null;
}

interface ApiDisputeQueue {
  items: ApiDisputeRow[];
  nextCursor: string | null;
}

interface ApiDisputeView {
  status: AdminDisputeStatus;
  openedBy: { userId: string; fullName: string };
  description: string;
  response: { text: string } | null;
  resolution: { result: AdminDisputeResult; reason: string; resolvedAt: string } | null;
}

/** Evidencia tal como la envía `GET /admin/disputes/:id/evidence` (`DisputeEvidence`). */
interface ApiEvidence {
  dispute: ApiDisputeView;
  disputes: ApiDisputeView[];
  request: { quote: { amountCents: number } | null };
  timeline: { type: string; occurredAt: string }[];
  messages: {
    senderId: string;
    body: string | null;
    image: { url: string } | null;
    createdAt: string;
  }[];
  proof: { reference: string | null; file: { url: string } | null } | null;
}

const TIMELINE_LABEL: Record<string, string> = {
  abierta: 'Solicitud abierta',
  datos_pago_enviados: 'Se enviaron los datos de pago',
  plazo_prorrogado: 'Plazo prorrogado',
  comprobante_subido: 'Se subió el comprobante',
  confirmada: 'Pago confirmado',
  efectivo_registrado: 'Pago en efectivo registrado',
  rechazada: 'Solicitud rechazada',
  cancelada: 'Solicitud cancelada',
  expirada: 'Solicitud expirada',
  recordatorio_enviado: 'Recordatorio enviado',
  reclamo_abierto: 'Reclamo abierto',
  reclamo_respondido: 'Reclamo respondido',
  reclamo_resuelto: 'Reclamo resuelto',
};

/** La evidencia no trae el nombre de la otra parte: se muestra como «Persona B». */
const OTHER_PARTY = 'Persona B';

const toDispute = (row: ApiDisputeRow): AdminDispute => ({
  id: row.id,
  type: row.kind,
  status: row.status,
  result: null,
  requesterName: row.openedBy.fullName,
  accusedName: row.accused.fullName,
  groupName: null,
  quoteCents: null,
  reference: null,
  createdAt: row.openedAt,
  resolvedAt: row.resolvedAt,
  hasResponse: row.hasResponse,
});

/**
 * Traduce la evidencia del backend a la forma de la pantalla. El chat trae ids de remitente: quien
 * abrió el reclamo se muestra con su nombre y la otra parte como «Persona B».
 */
function toEvidence(evidence: ApiEvidence): AdminDisputeEvidence {
  const opener = evidence.dispute.openedBy;
  const proof = evidence.proof;
  return {
    timeline: evidence.timeline.map((event) => ({
      at: event.occurredAt,
      label: TIMELINE_LABEL[event.type] ?? event.type,
    })),
    chat: evidence.messages.map((message) => ({
      author: message.senderId === opener.userId ? opener.fullName : OTHER_PARTY,
      at: message.createdAt,
      text: message.body ?? (message.image ? 'Imagen adjunta' : ''),
    })),
    receipt: proof?.file
      ? {
          label: `Comprobante${proof.reference ? ` · Ref. ${proof.reference}` : ''}`,
          url: proof.file.url,
        }
      : null,
    quoteCents: evidence.request.quote?.amountCents ?? null,
    descriptions: evidence.disputes.map((item) => ({
      by: item.openedBy.fullName,
      text: item.description,
    })),
    responses: evidence.disputes.flatMap((item) =>
      item.response ? [{ by: OTHER_PARTY, text: item.response.text }] : [],
    ),
    openedAt: new Date().toISOString(),
  };
}

/** `GET /admin/disputes?status=` (RF-009-20). */
export async function listAdminDisputes(status?: AdminDisputeStatus): Promise<AdminDisputesPage> {
  const suffix = status ? `?status=${status}` : '';
  const page = await apiRequest<ApiDisputeQueue>(`/api/admin/disputes${suffix}`);
  return { items: page.items.map(toDispute), nextCursor: page.nextCursor };
}

/** `GET /admin/disputes/:id/evidence` (RF-010-23, CA-009-27). Solo al pedirla explícitamente. */
export async function getAdminDisputeEvidence(disputeId: string): Promise<AdminDisputeEvidence> {
  const evidence = await apiRequest<ApiEvidence>(
    `/api/admin/disputes/${encodeURIComponent(disputeId)}/evidence`,
  );
  return toEvidence(evidence);
}

/** Páginas que se recorren al buscar un reclamo en la cola (el contrato no tiene `GET` por id). */
const FIND_MAX_PAGES = 5;

/** Lectura de una fila por id: se busca en la cola de `GET /admin/disputes`. */
export async function getAdminDispute(disputeId: string): Promise<AdminDispute> {
  let cursor: string | null = null;
  for (let page = 0; page < FIND_MAX_PAGES; page += 1) {
    const query = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : '?limit=100';
    const data: ApiDisputeQueue = await apiRequest<ApiDisputeQueue>(`/api/admin/disputes${query}`);
    const row = data.items.find((item) => item.id === disputeId);
    if (row) return toDispute(row);
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }
  throw new ApiError(404, 'NOT_FOUND', 'No encontramos ese reclamo.');
}

/** `POST /admin/disputes/:id/resolve` (RF-010-24, CA-009-25, 26, 30). */
export async function resolveAdminDispute(
  disputeId: string,
  result: AdminDisputeResult,
  reason: string,
): Promise<AdminDispute> {
  const view = await apiRequest<ApiDisputeView>(
    `/api/admin/disputes/${encodeURIComponent(disputeId)}/resolve`,
    { method: 'POST', body: { result, reason } },
  );
  const row = await getAdminDispute(disputeId);
  return {
    ...row,
    status: 'resuelto',
    result: view.resolution?.result ?? result,
    resolvedAt: view.resolution?.resolvedAt ?? row.resolvedAt,
  };
}
