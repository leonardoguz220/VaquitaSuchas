/**
 * Cliente de los endpoints de suscripciones compartidas (spec 001, `contracts/api.md`).
 * Una función por endpoint; los tipos salen del contrato congelado. El frontend no calcula
 * cuotas: muestra los campos `...Cents` que devuelve el backend.
 */
import { apiRequest } from './http';

export type GroupCurrency = 'USD' | 'BS';
export type GroupRole = 'titular' | 'miembro';
export type GroupStatus = 'activo' | 'cerrado';
export type FrozenReason = 'titular_baneado';

/** Desglose de la cuota (RF-001-13). */
export interface Breakdown {
  priceCents: number;
  currency: GroupCurrency;
  /** `"6.9600"`; `null` con `BS`. */
  exchangeRate: string | null;
  totalBsCents: number;
  /** Miembros activos, titular incluido. */
  memberCount: number;
  /** Lo que paga cada miembro (RN-001-02). */
  baseShareCents: number;
  /** Referencia del titular: base + resto. */
  ownerShareCents: number;
  remainderCents: number;
}

/** Ventana de ingreso (RF-001-22). Fechas ISO 8601 en UTC. */
export interface EntryWindow {
  isOpen: boolean;
  /** Si está cerrada: próxima apertura. */
  opensAt: string | null;
  /** Si está abierta: hasta cuándo (23:59:59 de La Paz del día 3). */
  closesAt: string | null;
  /** RF-001-09. */
  acceptingMembers: boolean;
}

/** Tarjeta de "Mis suscripciones" (RF-001-19). */
export interface GroupSummary {
  id: string;
  name: string;
  serviceName: string;
  logoUrl: string | null;
  brandColor: string | null;
  role: GroupRole;
  status: GroupStatus;
  frozenReason: FrozenReason | null;
  memberCount: number;
  totalSlots: number;
  /** Miembro: su cuota; titular: su cuota de referencia. */
  myShareCents: number;
  /** `true` para el titular (RN-001-10). */
  myShareIsReference: boolean;
  billingDay: number;
  /** `YYYY-MM-DD` de La Paz. */
  nextCutDate: string;
}

/** `phone` solo se ve entre el titular y los miembros activos. */
export interface GroupMember {
  userId: string;
  fullName: string;
  role: GroupRole;
  phone: string | null;
  /** ISO 8601 en UTC. */
  joinedAt: string;
}

export interface GroupService {
  name: string;
  planName: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  isCustom: boolean;
}

/** `qrUrl` es una URL firmada que vence en 10 minutos (RF-001-20). */
export interface PaymentInfo {
  text: string | null;
  qrUrl: string | null;
  configured: boolean;
}

/** Detalle del grupo (`GroupDetail` del contrato). */
export interface GroupDetail {
  id: string;
  name: string;
  status: GroupStatus;
  frozenReason: FrozenReason | null;
  createdAt: string;
  service: GroupService;
  billingDay: number;
  totalSlots: number;
  priceCents: number;
  currency: GroupCurrency;
  exchangeRate: string | null;
  breakdown: Breakdown;
  myShareCents: number;
  myRole: GroupRole;
  entryWindow: EntryWindow;
  members: GroupMember[];
  paymentInfo: PaymentInfo;
  /** Solo si el que consulta es el titular. */
  inviteCode?: string;
  version: number;
}

/** Página de `GET /groups` (contrato 000 A: `limit` de 1 a 100 y `cursor` opaco). */
export interface GroupsPage {
  items: GroupSummary[];
  nextCursor: string | null;
}

export interface ListGroupsParams {
  role?: GroupRole;
  status?: GroupStatus;
  limit?: number;
  cursor?: string;
}

/** `GET /groups` (RF-001-19): solo los grupos de la persona con sesión (CA-001-20). */
export function listGroups(params: ListGroupsParams = {}): Promise<GroupsPage> {
  const query = new URLSearchParams();
  if (params.role) query.set('role', params.role);
  if (params.status) query.set('status', params.status);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const search = query.toString();
  return apiRequest<GroupsPage>(`/api/groups${search ? `?${search}` : ''}`);
}

/**
 * `GET /groups/:groupId` (RF-001-12, RF-001-13). Lanza `ApiError` `404 NOT_FOUND` si el grupo
 * no existe o la persona no es miembro activo (RNF-001-01).
 */
export function getGroup(groupId: string): Promise<GroupDetail> {
  return apiRequest<GroupDetail>(`/api/groups/${encodeURIComponent(groupId)}`);
}

/** Respuesta 200 de `GET /users/me/host-eligibility` (RF-001-21). */
export interface HostEligibility {
  eligible: boolean;
  source: 'manual' | 'calificacion' | null;
  activeGroups: number;
  maxActiveGroups: number;
  canCreateMore: boolean;
  requirement: { minStars: number; minConsideredCharges: number; windowMonths: number };
  current: { stars: number | null; consideredCharges: number; level: string | null };
}

/** `GET /users/me/host-eligibility` (RF-001-21): con `eligible: false` se muestra qué falta. */
export function getHostEligibility(): Promise<HostEligibility> {
  return apiRequest<HostEligibility>('/api/users/me/host-eligibility');
}

/** Cuerpo de `POST /groups/quote`. `exchangeRate` solo con `USD`. */
export interface QuoteRequest {
  priceCents: number;
  currency: GroupCurrency;
  exchangeRate?: string;
  memberCount: number;
}

export interface QuoteResponse {
  totalBsCents: number;
  baseShareCents: number;
  ownerShareCents: number;
  remainderCents: number;
}

/**
 * `POST /groups/quote`: el total en Bs y la cuota por miembro, calculados por el backend para
 * no duplicar la fórmula. Sin efectos. Lanza `ApiError` `400 VALIDATION_ERROR`.
 */
export function quoteGroup(input: QuoteRequest): Promise<QuoteResponse> {
  return apiRequest<QuoteResponse>('/api/groups/quote', { method: 'POST', body: input });
}

/**
 * Cuerpo de `POST /groups`. Exactamente uno de `catalogPlanSlug` o `customServiceName`;
 * `exchangeRate` obligatorio con `USD` y `null` con `BS`.
 */
export interface CreateGroupRequest {
  catalogPlanSlug: string | null;
  customServiceName: string | null;
  name: string;
  priceCents: number;
  currency: GroupCurrency;
  exchangeRate: string | null;
  billingDay: number;
  totalSlots: number;
  paymentInfoText: string | null;
}

/**
 * `POST /groups` (RF-001-01 a 05). Devuelve el `GroupDetail` con `inviteCode`. Lanza `ApiError`
 * `422 BUSINESS_RULE`/`NOT_HOST_ELIGIBLE`/`TOO_MANY_ACTIVE_GROUPS`, `404` y `400`.
 */
export function createGroup(input: CreateGroupRequest): Promise<GroupDetail> {
  return apiRequest<GroupDetail>('/api/groups', { method: 'POST', body: input });
}

/** Campos de `PUT /groups/:id/payment-info`; los que no vienen no se envían. */
export interface PaymentInfoUpdate {
  /** Hasta 500 caracteres. */
  text?: string;
  /** JPG o PNG, máximo 2 MB (lo valida el servidor por el tipo real). */
  qr?: File;
  removeQr?: boolean;
}

/**
 * `PUT /groups/:id/payment-info` (RF-001-20) con `multipart/form-data`. Lanza `ApiError`
 * `413 FILE_TOO_LARGE` o `415 UNSUPPORTED_FILE_TYPE`; si falla se conserva el QR anterior.
 */
export function updatePaymentInfo(
  groupId: string,
  input: PaymentInfoUpdate,
): Promise<{ paymentInfo: PaymentInfo }> {
  const form = new FormData();
  if (input.text !== undefined) form.append('text', input.text);
  if (input.qr) form.append('qr', input.qr);
  if (input.removeQr) form.append('removeQr', 'true');
  return apiRequest<{ paymentInfo: PaymentInfo }>(
    `/api/groups/${encodeURIComponent(groupId)}/payment-info`,
    { method: 'PUT', formData: form },
  );
}

/**
 * Campos editables de `PATCH /groups/:groupId` (RF-001-14, RF-001-09); todos opcionales.
 * `version` evita pisar cambios de otra persona (`409 STALE_STATE`).
 */
export interface UpdateGroupRequest {
  name?: string;
  priceCents?: number;
  currency?: GroupCurrency;
  exchangeRate?: string | null;
  billingDay?: number;
  totalSlots?: number;
  acceptingMembers?: boolean;
  version: number;
}

/**
 * `PATCH /groups/:groupId` (solo titular). Devuelve el `GroupDetail` actualizado. Lanza
 * `ApiError` `409 STALE_STATE`, `422` (`GROUP_CLOSED`, `GROUP_FROZEN`, `SLOTS_BELOW_MEMBERS`...)
 * y `403` para un miembro.
 */
export function updateGroup(groupId: string, input: UpdateGroupRequest): Promise<GroupDetail> {
  return apiRequest<GroupDetail>(`/api/groups/${encodeURIComponent(groupId)}`, {
    method: 'PATCH',
    body: input,
  });
}

/**
 * `POST /groups/:groupId/invite-code/regenerate` (RF-001-08, solo titular): el código anterior
 * deja de servir al instante (CA-001-09).
 */
export function regenerateInviteCode(groupId: string): Promise<{ inviteCode: string }> {
  return apiRequest<{ inviteCode: string }>(
    `/api/groups/${encodeURIComponent(groupId)}/invite-code/regenerate`,
    { method: 'POST' },
  );
}
