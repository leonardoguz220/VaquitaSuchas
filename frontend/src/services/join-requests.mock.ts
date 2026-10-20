/**
 * Datos simulados de la spec 010 mientras el backend no está conectado (T017 a T039). Los
 * estados, plazos, cuotas y `allowedActions` ya vienen resueltos, como los entregaría la API:
 * aquí no se calcula nada del dominio. Los plazos se cuentan desde la hora en que se pide la
 * solicitud para que la cuenta regresiva se vea viva. Nombres, montos y cuentas inventados.
 */
import { ApiError } from './http';
import type {
  Dispute,
  JoinMessage,
  JoinMessagesPage,
  JoinRequest,
  JoinRequestPhase,
  JoinRequestsPage,
  ListJoinRequestsParams,
  OpenDisputeRequest,
  RejectJoinRequestRequest,
  RespondDisputeRequest,
  SendMessageRequest,
  SendPaymentDataRequest,
  SignedFileLink,
  UploadJoinProofRequest,
} from './join-requests';

const LATENCY_MS = 350;

function delay<T>(value: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(value());
      } catch (error) {
        reject(error);
      }
    }, LATENCY_MS);
  });
}

const uuid = (suffix: string) => `3e8a1d00-0000-4000-8000-${suffix}`;

const ANA = { userId: '9c4e2f10-0000-4000-8000-000000000201', fullName: 'Ana Quispe Mamani' };
const RODRIGO = { userId: '9c4e2f10-0000-4000-8000-000000000701', fullName: 'Rodrigo Salazar Paz' };
const LUCIA = { userId: '9c4e2f10-0000-4000-8000-000000000801', fullName: 'Lucía Mendoza Ríos' };

/** Ids fijos del simulador: sirven para probar cada pantalla a mano y en las pruebas. */
export const MOCK_JOIN_REQUEST_IDS = {
  open: uuid('000000000001'),
  awaitingPayment: uuid('000000000002'),
  reported: uuid('000000000003'),
  accepted: uuid('000000000004'),
  unanswered: uuid('000000000005'),
  hostOpen: uuid('000000000006'),
  hostReported: uuid('000000000007'),
} as const;

/** Códigos de invitación del simulador (`POST /join-requests`). */
export const MOCK_INVITE_CODES = {
  valid: 'K7M2Q9XA',
  windowClosed: 'CERRADO1',
  noSlots: 'LLENO001',
} as const;

const MAX_GROUP = {
  id: '5b0d7c3e-0000-4000-8000-000000000107',
  name: 'Max de amigos',
  serviceName: 'Max',
  planName: 'Estándar',
  logoUrl: null,
  brandColor: '#4B2A8C',
  billingDay: 17,
};

const SPOTIFY_GROUP = {
  id: '5b0d7c3e-0000-4000-8000-000000000103',
  name: 'Spotify depa',
  serviceName: 'Spotify',
  planName: 'Familiar',
  logoUrl: null,
  brandColor: '#14743A',
  billingDay: 18,
};

const NETFLIX_GROUP = {
  id: '5b0d7c3e-0000-4000-8000-000000000109',
  name: 'Netflix de la U',
  serviceName: 'Netflix',
  planName: 'Premium',
  logoUrl: null,
  brandColor: '#B20710',
  billingDay: 5,
};

const minutes = (value: number) => value * 60 * 1000;

function phase(
  status: JoinRequestPhase['status'],
  kind: JoinRequestPhase['deadlineKind'],
  msLeft: number,
): JoinRequestPhase {
  const now = Date.now();
  return {
    status,
    deadlineKind: kind,
    deadlineAt: kind ? new Date(now + msLeft).toISOString() : null,
    serverNow: new Date(now).toISOString(),
  };
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const QUOTE_MAX = {
  amountCents: 2100,
  priceCents: 8400,
  currency: 'BS' as const,
  exchangeRate: null,
  totalBsCents: 8400,
  memberCount: 4,
};

const PROOF = {
  method: 'qr' as const,
  reference: 'QR-20261018-77120',
  mime: 'image/jpeg',
  sizeBytes: 2 * 1024 * 1024,
  uploadedAt: '2026-10-18T18:50:00.000Z',
  fileAvailable: true,
};

/** Solicitud `abierta` de Ana a "Max de amigos"; base de las demás. */
function openRequest(): JoinRequest {
  return {
    id: MOCK_JOIN_REQUEST_IDS.open,
    group: MAX_GROUP,
    applicant: { ...ANA, stars: null, level: 'Nuevo' },
    host: { ...RODRIGO, stars: 4.5, level: 'Muy bueno' },
    source: 'codigo',
    phase: phase('abierta', 'solicitud', minutes(33 * 60 + 20)),
    openedAt: ago(minutes(20)),
    estimatedShareCents: 2100,
    quote: null,
    paymentInfo: null,
    extended: false,
    proof: null,
    entryWindow: { isOpen: true, opensAt: null, closesAt: '2026-10-20T03:59:59.000Z' },
    finalReason: null,
    rejectReason: null,
    rejectedAsFalse: false,
    chargeId: null,
    unreadCount: 0,
    disputes: [],
    canOpenDispute: null,
    allowedActions: ['cancel', 'sendMessage'],
    timeline: [
      {
        type: 'abierta',
        actor: ANA,
        fromStatus: null,
        toStatus: 'abierta',
        reason: null,
        occurredAt: ago(minutes(20)),
      },
    ],
    version: 1,
  };
}

function awaitingPayment(): JoinRequest {
  const base = openRequest();
  return {
    ...base,
    id: MOCK_JOIN_REQUEST_IDS.awaitingPayment,
    group: SPOTIFY_GROUP,
    phase: phase('esperando_pago', 'pago', minutes(12) + 34_000),
    quote: { ...QUOTE_MAX, amountCents: 1980, totalBsCents: 11881, memberCount: 6 },
    estimatedShareCents: 1980,
    paymentInfo: { text: 'BNB · Cuenta 4502-117733 · Rodrigo Salazar Paz', qrAvailable: true },
    unreadCount: 2,
    allowedActions: ['uploadProof', 'cancel', 'sendMessage'],
    timeline: [
      ...base.timeline,
      {
        type: 'datos_pago_enviados',
        actor: RODRIGO,
        fromStatus: 'abierta',
        toStatus: 'esperando_pago',
        reason: null,
        occurredAt: ago(minutes(3)),
      },
    ],
    version: 2,
  };
}

function reported(): JoinRequest {
  const base = awaitingPayment();
  return {
    ...base,
    id: MOCK_JOIN_REQUEST_IDS.reported,
    group: NETFLIX_GROUP,
    phase: phase('pago_informado', 'decision', minutes(47) + 10_000),
    proof: PROOF,
    unreadCount: 0,
    allowedActions: ['sendMessage'],
    timeline: [
      ...base.timeline,
      {
        type: 'comprobante_subido',
        actor: ANA,
        fromStatus: 'esperando_pago',
        toStatus: 'pago_informado',
        reason: null,
        occurredAt: ago(minutes(13)),
      },
    ],
    version: 3,
  };
}

function accepted(): JoinRequest {
  return {
    ...openRequest(),
    id: MOCK_JOIN_REQUEST_IDS.accepted,
    group: { ...SPOTIFY_GROUP, id: '5b0d7c3e-0000-4000-8000-000000000110', name: 'Spotify primos' },
    host: {
      userId: '9c4e2f10-0000-4000-8000-000000000301',
      fullName: 'Marco Vargas Rojas',
      stars: null,
      level: null,
    },
    phase: phase('aceptada', null, 0),
    openedAt: '2026-09-18T15:00:00.000Z',
    estimatedShareCents: 1980,
    quote: {
      amountCents: 1980,
      priceCents: 1707,
      currency: 'USD',
      exchangeRate: '6.9600',
      totalBsCents: 11881,
      memberCount: 6,
    },
    finalReason: 'confirmada',
    chargeId: '7a1c5e00-0000-4000-8000-000000000101',
    allowedActions: [],
    version: 5,
  };
}

function unanswered(): JoinRequest {
  return {
    ...reported(),
    id: MOCK_JOIN_REQUEST_IDS.unanswered,
    phase: phase('expirada', null, 0),
    finalReason: 'titular_sin_respuesta',
    canOpenDispute: {
      kind: 'pago_sin_ingreso',
      closesAt: new Date(Date.now() + minutes(7 * 24 * 60)).toISOString(),
    },
    disputes: [
      {
        id: uuid('000000000901'),
        kind: 'pago_sin_ingreso',
        status: 'abierto',
        openedByMe: true,
        canRespond: false,
      },
    ],
    allowedActions: [],
  };
}

/** Vistas del titular: Rodrigo recibe la solicitud de Lucía. */
function hostOpen(): JoinRequest {
  return {
    ...openRequest(),
    id: MOCK_JOIN_REQUEST_IDS.hostOpen,
    applicant: { ...LUCIA, stars: null, level: 'Nuevo' },
    host: { ...ANA, stars: 4.8, level: 'Excelente' },
    allowedActions: ['sendPaymentData', 'reject', 'sendMessage'],
  };
}

function hostReported(): JoinRequest {
  return {
    ...reported(),
    id: MOCK_JOIN_REQUEST_IDS.hostReported,
    applicant: { ...LUCIA, stars: 4, level: 'Bueno' },
    host: { ...ANA, stars: 4.8, level: 'Excelente' },
    allowedActions: ['confirm', 'reject', 'sendMessage'],
  };
}

const BUILDERS: Record<string, () => JoinRequest> = {
  [MOCK_JOIN_REQUEST_IDS.open]: openRequest,
  [MOCK_JOIN_REQUEST_IDS.awaitingPayment]: awaitingPayment,
  [MOCK_JOIN_REQUEST_IDS.reported]: reported,
  [MOCK_JOIN_REQUEST_IDS.accepted]: accepted,
  [MOCK_JOIN_REQUEST_IDS.unanswered]: unanswered,
  [MOCK_JOIN_REQUEST_IDS.hostOpen]: hostOpen,
  [MOCK_JOIN_REQUEST_IDS.hostReported]: hostReported,
};

const APPLICANT_IDS = [
  MOCK_JOIN_REQUEST_IDS.open,
  MOCK_JOIN_REQUEST_IDS.awaitingPayment,
  MOCK_JOIN_REQUEST_IDS.reported,
  MOCK_JOIN_REQUEST_IDS.accepted,
  MOCK_JOIN_REQUEST_IDS.unanswered,
];
const HOST_IDS = [MOCK_JOIN_REQUEST_IDS.hostOpen, MOCK_JOIN_REQUEST_IDS.hostReported];

function find(requestId: string): JoinRequest {
  const build = BUILDERS[requestId];
  if (!build) throw new ApiError(404, 'NOT_FOUND', 'Solicitud no encontrada.');
  return build();
}

function requireAction(request: JoinRequest, action: JoinRequest['allowedActions'][number]) {
  if (!request.allowedActions.includes(action)) {
    throw new ApiError(409, 'INVALID_TRANSITION', 'La solicitud ya no admite este cambio.', {
      from: request.phase.status,
      action,
    });
  }
}

function checkVersion(request: JoinRequest, version: number | undefined) {
  if (version !== undefined && version !== request.version) {
    throw new ApiError(409, 'STALE_STATE', 'La solicitud cambió.');
  }
}

/** Mueve la solicitud a otro estado con un evento nuevo; no guarda el cambio entre llamadas. */
function move(
  request: JoinRequest,
  next: Partial<JoinRequest> & { phase: JoinRequestPhase },
  type: JoinRequest['timeline'][number]['type'],
  actor: { userId: string; fullName: string },
  reason: string | null = null,
): JoinRequest {
  return {
    ...request,
    ...next,
    version: request.version + 1,
    timeline: [
      ...request.timeline,
      {
        type,
        actor,
        fromStatus: request.phase.status,
        toStatus: next.phase.status,
        reason,
        occurredAt: next.phase.serverNow,
      },
    ],
  };
}

export function openJoinRequest(code: string): Promise<JoinRequest> {
  return delay(() => {
    const normalized = code.trim().toUpperCase();
    if (normalized === MOCK_INVITE_CODES.windowClosed) {
      throw new ApiError(422, 'ENTRY_WINDOW_CLOSED', 'La ventana de ingreso está cerrada.', {
        opensAt: '2026-11-17T04:00:00.000Z',
      });
    }
    if (normalized === MOCK_INVITE_CODES.noSlots) {
      throw new ApiError(422, 'NO_SLOTS_AVAILABLE', 'El grupo no tiene cupos.');
    }
    if (normalized !== MOCK_INVITE_CODES.valid) {
      throw new ApiError(422, 'INVALID_INVITE_CODE', 'Código inválido.');
    }
    return openRequest();
  });
}

export function listJoinRequests(params: ListJoinRequestsParams): Promise<JoinRequestsPage> {
  return delay(() => {
    const ids = params.role === 'titular' ? HOST_IDS : APPLICANT_IDS;
    const items = ids
      .map((id) => find(id))
      .filter((request) => !params.status?.length || params.status.includes(request.phase.status))
      .filter((request) => !params.groupId || request.group.id === params.groupId);
    return { items, nextCursor: null };
  });
}

export function getJoinRequest(requestId: string): Promise<JoinRequest> {
  return delay(() => find(requestId));
}

export function sendPaymentData(
  requestId: string,
  input: SendPaymentDataRequest,
): Promise<JoinRequest> {
  return delay(() => {
    const request = find(requestId);
    requireAction(request, 'sendPaymentData');
    checkVersion(request, input.version);
    if (!input.text?.trim() && !input.qr) {
      throw new ApiError(422, 'PAYMENT_INFO_MISSING', 'Faltan los datos de pago.');
    }
    return move(
      request,
      {
        phase: phase('esperando_pago', 'pago', minutes(15)),
        quote: QUOTE_MAX,
        paymentInfo: { text: input.text?.trim() || null, qrAvailable: Boolean(input.qr) },
        allowedActions: ['extend', 'cashPayment', 'reject', 'sendMessage'],
      },
      'datos_pago_enviados',
      request.host,
    );
  });
}

export function extendJoinRequest(
  requestId: string,
  input: { version?: number },
): Promise<JoinRequest> {
  return delay(() => {
    const request = find(requestId);
    requireAction(request, 'extend');
    checkVersion(request, input.version);
    if (request.extended) throw new ApiError(409, 'ALREADY_EXTENDED', 'Ya se dio la prórroga.');
    return move(
      request,
      {
        phase: phase(request.phase.status, request.phase.deadlineKind, minutes(25)),
        extended: true,
        allowedActions: request.allowedActions.filter((action) => action !== 'extend'),
      },
      'plazo_prorrogado',
      request.host,
    );
  });
}

function signedLink(mime: string): SignedFileLink {
  return {
    url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E',
    expiresAt: new Date(Date.now() + minutes(5)).toISOString(),
    mime,
  };
}

export function getPaymentQr(requestId: string): Promise<SignedFileLink> {
  return delay(() => {
    const request = find(requestId);
    if (!request.paymentInfo?.qrAvailable) {
      throw new ApiError(404, 'NOT_FOUND', 'La solicitud no tiene QR de pago.');
    }
    return signedLink('image/png');
  });
}

/** Referencias fijas que simulan errores del servidor en `uploadJoinProof` (T026). */
export const MOCK_PROOF_REFERENCES = {
  /** `409 REFERENCE_ALREADY_USED`. */
  alreadyUsed: 'TRX-USADA',
} as const;

const PROOF_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const IMAGE_TYPES = ['image/jpeg', 'image/png'];
const MAX_BYTES = 5 * 1024 * 1024;

function checkFile(file: File, types: string[]) {
  if (file.size > MAX_BYTES) throw new ApiError(413, 'FILE_TOO_LARGE', 'El archivo supera 5 MB.');
  if (!types.includes(file.type)) {
    throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Tipo de archivo no permitido.');
  }
}

export function uploadJoinProof(
  requestId: string,
  input: UploadJoinProofRequest,
): Promise<JoinRequest> {
  return delay(() => {
    const request = find(requestId);
    const reference = input.reference.trim();
    if (reference.length < 1 || reference.length > 100) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Datos inválidos.', {
        fields: [{ field: 'reference', message: 'Entre 1 y 100 caracteres.' }],
      });
    }
    checkFile(input.file, PROOF_TYPES);
    requireAction(request, 'uploadProof');
    checkVersion(request, input.version);
    if (reference === MOCK_PROOF_REFERENCES.alreadyUsed) {
      throw new ApiError(409, 'REFERENCE_ALREADY_USED', 'Esa referencia ya fue usada.');
    }
    return move(
      request,
      {
        phase: phase('pago_informado', 'decision', minutes(60)),
        proof: {
          method: input.method,
          reference,
          mime: input.file.type,
          sizeBytes: input.file.size,
          uploadedAt: new Date().toISOString(),
          fileAvailable: true,
        },
        allowedActions: ['sendMessage'],
      },
      'comprobante_subido',
      request.applicant,
    );
  });
}

function decide(
  requestId: string,
  action: 'confirm' | 'cashPayment',
  version: number | undefined,
): Promise<JoinRequest> {
  return delay(() => {
    const request = find(requestId);
    requireAction(request, action);
    checkVersion(request, version);
    return move(
      request,
      {
        phase: phase('aceptada', null, 0),
        finalReason: action === 'confirm' ? 'confirmada' : 'efectivo',
        chargeId: '7a1c5e00-0000-4000-8000-000000000101',
        allowedActions: [],
      },
      action === 'confirm' ? 'confirmada' : 'efectivo_registrado',
      request.host,
    );
  });
}

export function confirmJoinRequest(
  requestId: string,
  input: { version?: number },
): Promise<JoinRequest> {
  return decide(requestId, 'confirm', input.version);
}

export function registerCashPayment(
  requestId: string,
  input: { version?: number },
): Promise<JoinRequest> {
  return decide(requestId, 'cashPayment', input.version);
}

export function rejectJoinRequest(
  requestId: string,
  input: RejectJoinRequestRequest,
): Promise<JoinRequest> {
  return delay(() => {
    const request = find(requestId);
    const reason = input.reason.trim();
    if (reason.length < 1 || reason.length > 500) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Datos inválidos.', {
        fields: [{ field: 'reason', message: 'Entre 1 y 500 caracteres.' }],
      });
    }
    requireAction(request, 'reject');
    checkVersion(request, input.version);
    return move(
      request,
      {
        phase: phase('rechazada', null, 0),
        finalReason: 'rechazada',
        rejectReason: reason,
        rejectedAsFalse: Boolean(input.markProofAsFalse && request.proof),
        allowedActions: [],
      },
      'rechazada',
      request.host,
      reason,
    );
  });
}

export function cancelJoinRequest(
  requestId: string,
  input: { version?: number },
): Promise<JoinRequest> {
  return delay(() => {
    const request = find(requestId);
    requireAction(request, 'cancel');
    checkVersion(request, input.version);
    return move(
      request,
      { phase: phase('cancelada', null, 0), finalReason: 'cancelada', allowedActions: [] },
      'cancelada',
      request.applicant,
    );
  });
}

/** Chat de ejemplo. El texto llega tal cual del servidor y la interfaz lo muestra como texto. */
function messages(request: JoinRequest): JoinMessage[] {
  const base = Date.now() - minutes(10);
  return [
    {
      id: uuid('000000000501'),
      seq: 1,
      senderId: request.applicant.userId,
      body: 'Hola, ¿me confirmas cuando te llegue el pago?',
      imageAvailable: false,
      createdAt: new Date(base).toISOString(),
    },
    {
      id: uuid('000000000502'),
      seq: 2,
      senderId: request.host.userId,
      body: 'Claro. Te paso el QR por aquí. <b>Ojo</b>: la referencia es obligatoria.',
      imageAvailable: false,
      createdAt: new Date(base + minutes(2)).toISOString(),
    },
    {
      id: uuid('000000000503'),
      seq: 3,
      senderId: request.host.userId,
      body: null,
      imageAvailable: true,
      createdAt: new Date(base + minutes(3)).toISOString(),
    },
  ];
}

export function listMessages(
  requestId: string,
  params: { afterSeq?: number; limit?: number },
): Promise<JoinMessagesPage> {
  return delay(() => {
    const request = find(requestId);
    const items = messages(request).filter((message) => message.seq > (params.afterSeq ?? 0));
    return { items: items.slice(0, params.limit ?? 50), serverNow: new Date().toISOString() };
  });
}

let nextSeq = 100;

export function sendMessage(requestId: string, input: SendMessageRequest): Promise<JoinMessage> {
  return delay(() => {
    const request = find(requestId);
    if (!request.allowedActions.includes('sendMessage')) {
      throw new ApiError(409, 'CHAT_READ_ONLY', 'El chat es de solo lectura.');
    }
    const text = input.text?.trim() ?? '';
    if (!text && !input.image) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Escribe un mensaje o adjunta una foto.');
    }
    if (text.length > 1000) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Máximo 1000 caracteres.');
    }
    if (input.image) checkFile(input.image, IMAGE_TYPES);
    nextSeq += 1;
    return {
      id: uuid(String(nextSeq).padStart(12, '0')),
      seq: nextSeq,
      senderId: ANA.userId,
      body: text || null,
      imageAvailable: Boolean(input.image),
      createdAt: new Date().toISOString(),
    };
  });
}

export function getMessageImage(requestId: string, messageId: string): Promise<SignedFileLink> {
  return delay(() => {
    const message = messages(find(requestId)).find((candidate) => candidate.id === messageId);
    if (!message?.imageAvailable) throw new ApiError(410, 'FILE_DELETED', 'La foto ya no existe.');
    return signedLink('image/jpeg');
  });
}

export function markMessagesRead(requestId: string, upToSeq: number): Promise<void> {
  return delay(() => {
    find(requestId);
    if (!Number.isInteger(upToSeq) || upToSeq < 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'upToSeq inválido.');
    }
  });
}

function dispute(request: JoinRequest, id: string): Dispute {
  return {
    id,
    kind: 'pago_sin_ingreso',
    status: 'abierto',
    openedBy: { userId: request.applicant.userId, fullName: request.applicant.fullName },
    description: 'Le pagué por QR y subí el comprobante a tiempo. No me respondió.',
    evidenceAvailable: true,
    openedAt: ago(minutes(30)),
    response: null,
    resolution: null,
  };
}

function checkDisputeText(text: string, field: string) {
  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > 1000) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Datos inválidos.', {
      fields: [{ field, message: 'Entre 1 y 1000 caracteres.' }],
    });
  }
}

export function openDispute(requestId: string, input: OpenDisputeRequest): Promise<Dispute> {
  return delay(() => {
    const request = find(requestId);
    if (!request.canOpenDispute) {
      throw new ApiError(422, 'DISPUTE_NOT_ALLOWED', 'Esta solicitud no admite reclamos.');
    }
    checkDisputeText(input.description, 'description');
    if (input.evidence) checkFile(input.evidence, PROOF_TYPES);
    return {
      ...dispute(request, uuid('000000000999')),
      description: input.description.trim(),
      evidenceAvailable: Boolean(input.evidence),
      openedAt: new Date().toISOString(),
    };
  });
}

export function respondDispute(
  requestId: string,
  disputeId: string,
  input: RespondDisputeRequest,
): Promise<Dispute> {
  return delay(() => {
    const request = find(requestId);
    const ref = request.disputes.find((candidate) => candidate.id === disputeId);
    if (!ref) throw new ApiError(404, 'NOT_FOUND', 'Reclamo no encontrado.');
    if (!ref.canRespond) {
      throw new ApiError(409, 'DISPUTE_ALREADY_RESPONDED', 'El reclamo ya tiene respuesta.');
    }
    checkDisputeText(input.text, 'text');
    if (input.evidence) checkFile(input.evidence, PROOF_TYPES);
    return {
      ...dispute(request, disputeId),
      response: {
        text: input.text.trim(),
        evidenceAvailable: Boolean(input.evidence),
        respondedAt: new Date().toISOString(),
      },
    };
  });
}

export function listDisputes(requestId: string): Promise<{ items: Dispute[] }> {
  return delay(() => {
    const request = find(requestId);
    return { items: request.disputes.map((ref) => dispute(request, ref.id)) };
  });
}
