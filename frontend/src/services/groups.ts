/**
 * Cliente de suscripciones compartidas (`specs/001-suscripciones-compartidas/contracts/api.md`).
 * Conectadas al backend (T021): `GET /groups`, `GET /groups/:id` y `POST …/invite-code/regenerate`.
 * El resto sigue con datos simulados de `groups.mock.ts` hasta que se conecte su tarea (T017 para
 * el asistente de creación, y los PATCH y datos de pago de la pestaña Ajustes).
 */
import { apiRequest } from './http';
import * as mock from './groups.mock';

export type GroupCurrency = 'USD' | 'BS';
export type GroupRole = 'titular' | 'miembro';
export type GroupStatus = 'activo' | 'cerrado';
export type GroupFrozenReason = 'titular_baneado' | null;

export interface Breakdown {
  priceCents: number;
  currency: GroupCurrency;
  /** Bs por 1 USD con cuatro decimales («6.9600»); `null` con `BS`. */
  exchangeRate: string | null;
  totalBsCents: number;
  /** Miembros activos, titular incluido. */
  memberCount: number;
  baseShareCents: number;
  ownerShareCents: number;
  remainderCents: number;
}

export interface EntryWindow {
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  acceptingMembers: boolean;
}

export interface GroupSummary {
  id: string;
  name: string;
  serviceName: string;
  logoUrl: string | null;
  brandColor: string | null;
  role: GroupRole;
  status: GroupStatus;
  frozenReason: GroupFrozenReason;
  memberCount: number;
  totalSlots: number;
  myShareCents: number;
  myShareIsReference: boolean;
  billingDay: number;
  /** `YYYY-MM-DD` de La Paz. */
  nextCutDate: string;
}

export interface GroupMember {
  userId: string;
  fullName: string;
  role: GroupRole;
  phone: string | null;
  joinedAt: string;
}

export interface PaymentInfo {
  text: string | null;
  /** URL firmada que vence a los 10 minutos. */
  qrUrl: string | null;
  configured: boolean;
}

export interface GroupDetail {
  id: string;
  name: string;
  status: GroupStatus;
  frozenReason: GroupFrozenReason;
  createdAt: string;
  service: {
    name: string;
    planName: string | null;
    logoUrl: string | null;
    brandColor: string | null;
    isCustom: boolean;
  };
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
  /** Solo si quien consulta es el titular. */
  inviteCode?: string;
  version: number;
}

export interface HostEligibility {
  eligible: boolean;
  source: 'manual' | 'calificacion' | null;
  activeGroups: number;
  maxActiveGroups: number;
  canCreateMore: boolean;
  requirement: { minStars: number; minConsideredCharges: number; windowMonths: number };
  current: { stars: number; consideredCharges: number; level: string };
}

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

/** Exactamente uno de `catalogPlanSlug` o `customServiceName`; `exchangeRate` solo con `USD`. */
export interface CreateGroupRequest {
  catalogPlanSlug: string | null;
  customServiceName: string | null;
  name: string;
  priceCents: number;
  currency: GroupCurrency;
  exchangeRate?: string;
  billingDay: number;
  totalSlots: number;
  paymentInfoText: string | null;
}

export interface UpdateGroupRequest {
  name?: string;
  priceCents?: number;
  currency?: GroupCurrency;
  exchangeRate?: string | null;
  billingDay?: number;
  totalSlots?: number;
  acceptingMembers?: boolean;
  version?: number;
}

export interface ListGroupsParams {
  role?: GroupRole;
  status?: GroupStatus;
}

export interface GroupsPage {
  items: GroupSummary[];
  nextCursor: string | null;
}

export interface UpdatePaymentInfoInput {
  text?: string;
  /** JPG o PNG de hasta 2 MB (el backend valida el tipo real). */
  qr?: File;
  removeQr?: boolean;
}

export interface GroupsRequestOptions {
  signal?: AbortSignal;
}

/** Códigos de error propios de la spec 001 (además de los comunes del contrato 000 A.2). */
export type GroupsErrorCode =
  | 'NOT_HOST_ELIGIBLE'
  | 'TOO_MANY_ACTIVE_GROUPS'
  | 'SLOTS_BELOW_MEMBERS'
  | 'HAS_OPEN_CHARGES'
  | 'OWNER_CANNOT_LEAVE'
  | 'GROUP_CLOSED'
  | 'GROUP_FROZEN'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE';

/** `GET /users/me/host-eligibility` (RF-001-21). */
export function getHostEligibility(options: GroupsRequestOptions = {}): Promise<HostEligibility> {
  return mock.getHostEligibility(options.signal);
}

/** `POST /groups/quote`: desglose sin efectos para la pantalla de creación. */
export function quoteGroup(
  input: QuoteRequest,
  options: GroupsRequestOptions = {},
): Promise<QuoteResponse> {
  return mock.quoteGroup(input, options.signal);
}

/** `POST /groups` (RF-001-01 a 05): `201` con el `GroupDetail` y su `inviteCode`. */
export function createGroup(input: CreateGroupRequest): Promise<GroupDetail> {
  return mock.createGroup(input);
}

/** `GET /groups` (RF-001-19): solo los grupos del usuario. */
export function listGroups(
  params: ListGroupsParams = {},
  options: GroupsRequestOptions = {},
): Promise<GroupsPage> {
  return apiRequest<GroupsPage>(`/api/groups${buildListGroupsQuery(params)}`, {
    signal: options.signal,
  });
}

/** Query de `GET /groups`: solo se envían los filtros que vienen. Sin ninguno no hay `?`. */
export function buildListGroupsQuery(params: ListGroupsParams): string {
  const query = new URLSearchParams();
  if (params.role) query.set('role', params.role);
  if (params.status) query.set('status', params.status);
  const text = query.toString();
  return text ? `?${text}` : '';
}

/** `GET /groups/:groupId`: `404` si el usuario no pertenece al grupo. */
export function getGroup(
  groupId: string,
  options: GroupsRequestOptions = {},
): Promise<GroupDetail> {
  return apiRequest<GroupDetail>(`/api/groups/${encodeURIComponent(groupId)}`, {
    signal: options.signal,
  });
}

/** `PATCH /groups/:groupId` (RF-001-14, RF-001-09): solo el titular. */
export function updateGroup(groupId: string, input: UpdateGroupRequest): Promise<GroupDetail> {
  return mock.updateGroup(groupId, input);
}

/** `PUT /groups/:groupId/payment-info` (RF-001-20), `multipart/form-data`. */
export function updatePaymentInfo(
  groupId: string,
  input: UpdatePaymentInfoInput,
): Promise<{ paymentInfo: PaymentInfo }> {
  return mock.updatePaymentInfo(groupId, input);
}

/** `POST /groups/:groupId/invite-code/regenerate` (RF-001-08). */
export function regenerateInviteCode(groupId: string): Promise<{ inviteCode: string }> {
  return apiRequest<{ inviteCode: string }>(
    `/api/groups/${encodeURIComponent(groupId)}/invite-code/regenerate`,
    { method: 'POST' },
  );
}
