/**
 * Datos simulados de la spec 002 mientras el backend no está conectado (T018; se quita en T019).
 * Los montos, estados y `allowedActions` ya vienen resueltos, como los entregaría la API: aquí no
 * se calcula nada. Filtrar por la query de `GET /me/charges` simula al servidor. Nombres,
 * montos y cuentas inventados.
 */
import { billingSummary, groupChargesPage, ownerGroupCharge } from './group-billing.mock';
import { ApiError } from './http';
import type {
  BillingSummary,
  Charge,
  ChargeEvent,
  ChargeGroupRef,
  ChargePublic,
  ConfirmChargeInput,
  GroupChargesParams,
  ListMyChargesParams,
  MyCharge,
  Page,
  PersonRef,
  Receipt,
  ReceiptFile,
  RejectChargeInput,
  UploadReceiptInput,
} from './charges';

const LATENCY_MS = 350;

function delay<T>(value: () => T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        resolve(value());
      } catch (error) {
        reject(error);
      }
    }, LATENCY_MS);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

const uuid = (suffix: string) => `7a1c5e00-0000-4000-8000-${suffix}`;

const ME: PersonRef = {
  userId: '9c4e2f10-0000-4000-8000-000000000201',
  fullName: 'Ana Quispe Mamani',
};
const MARCO: PersonRef = {
  userId: '9c4e2f10-0000-4000-8000-000000000301',
  fullName: 'Marco Vargas Rojas',
};
const LUIS: PersonRef = {
  userId: '9c4e2f10-0000-4000-8000-000000000501',
  fullName: 'Luis Arce Medina',
};
const PAOLA: PersonRef = {
  userId: '9c4e2f10-0000-4000-8000-000000000601',
  fullName: 'Paola Rivera',
};

const QR_URL =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7" shape-rendering="crispEdges">' +
      '<rect width="7" height="7" fill="#fff"/>' +
      '<path d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM4 4h1v1H4zM6 4h1v3H6zM4 6h2v1H4z" fill="#1d2622"/>' +
      '</svg>',
  );

const SPOTIFY: ChargeGroupRef = {
  id: '5b0d7c3e-0000-4000-8000-000000000103',
  name: 'Spotify depa',
  serviceName: 'Spotify',
  logoUrl: null,
};
const CANVA: ChargeGroupRef = {
  id: '5b0d7c3e-0000-4000-8000-000000000104',
  name: 'Canva del equipo',
  serviceName: 'Canva Pro',
  logoUrl: null,
};
const DISNEY: ChargeGroupRef = {
  id: '5b0d7c3e-0000-4000-8000-000000000105',
  name: 'Disney+ primos',
  serviceName: 'Disney+',
  logoUrl: null,
};
const PARAMOUNT: ChargeGroupRef = {
  id: '5b0d7c3e-0000-4000-8000-000000000106',
  name: 'Paramount+ del curso',
  serviceName: 'Paramount+',
  logoUrl: null,
};
const YOUTUBE: ChargeGroupRef = {
  id: '5b0d7c3e-0000-4000-8000-000000000107',
  name: 'YouTube de la U',
  serviceName: 'YouTube Premium',
  logoUrl: null,
};

export const MOCK_CHARGE_IDS = {
  pendingRejected: uuid('000000000501'),
  overdueFormer: uuid('000000000502'),
  inReviewNoPaymentInfo: uuid('000000000503'),
  paid: uuid('000000000504'),
  entryPaid: uuid('000000000505'),
  cancelled: uuid('000000000506'),
  /** Prime Video, la persona es titular: `en_revision` con comprobante y archivo (T026). */
  ownerInReview: uuid('000000001002'),
  /** Prime Video, titular: `en_revision` ya vencido; rechazar da `atrasado`; archivo `410`. */
  ownerInReviewOverdue: uuid('000000000507'),
  /** De otro miembro del grupo: `403`. */
  forbidden: uuid('000000000599'),
} as const;

function event(
  id: string,
  type: ChargeEvent['type'],
  actor: PersonRef | null,
  fromStatus: ChargeEvent['fromStatus'],
  toStatus: ChargeEvent['toStatus'],
  occurredAt: string,
  reason: string | null = null,
): ChargeEvent {
  return { id: uuid(`00000000${id}`), type, actor, fromStatus, toStatus, reason, occurredAt };
}

const SPOTIFY_PAYMENT = {
  text: 'BNB · Cuenta 4501-998877 · Marco Vargas Rojas',
  qrUrl: QR_URL,
  configured: true,
};

/** Sin `receipts`: `GET /me/charges` no los trae; `getCharge` los agrega desde `RECEIPTS`. */
const MY_CHARGES: MyCharge[] = [
  {
    id: MOCK_CHARGE_IDS.pendingRejected,
    groupId: SPOTIFY.id,
    group: SPOTIFY,
    cycleId: uuid('000000000701'),
    period: '2026-10',
    origin: 'ciclo',
    member: { ...ME, isFormerMember: false },
    amountCents: 1980,
    status: 'pendiente',
    issuedAt: '2026-10-18T04:00:00.000Z',
    dueAt: '2026-10-22T03:59:59.000Z',
    paidAt: null,
    firstSubmittedAt: '2026-10-18T14:30:00.000Z',
    priceCents: 1707,
    currency: 'USD',
    exchangeRate: '6.9600',
    totalBsCents: 11881,
    memberCount: 6,
    settlement: null,
    settledBy: null,
    manualNote: null,
    cancelReason: null,
    lastRejection: {
      reason: 'El monto del comprobante no coincide con la cuota.',
      invalidReceipt: false,
      at: '2026-10-18T22:05:00.000Z',
    },
    currentReceipt: null,
    timeline: [
      event('0011', 'generado', null, null, 'pendiente', '2026-10-18T04:00:00.000Z'),
      event(
        '0012',
        'comprobante_subido',
        ME,
        'pendiente',
        'en_revision',
        '2026-10-18T14:30:00.000Z',
      ),
      event(
        '0013',
        'rechazado',
        MARCO,
        'en_revision',
        'pendiente',
        '2026-10-18T22:05:00.000Z',
        'El monto del comprobante no coincide con la cuota.',
      ),
    ],
    paymentInfo: SPOTIFY_PAYMENT,
    allowedActions: ['uploadReceipt'],
    version: 3,
  },
  {
    id: MOCK_CHARGE_IDS.paid,
    groupId: DISNEY.id,
    group: DISNEY,
    cycleId: uuid('000000000704'),
    period: '2026-10',
    origin: 'ciclo',
    member: { ...ME, isFormerMember: false },
    amountCents: 2210,
    status: 'pagado',
    issuedAt: '2026-10-12T04:00:00.000Z',
    dueAt: '2026-10-16T03:59:59.000Z',
    paidAt: '2026-10-13T19:40:00.000Z',
    firstSubmittedAt: '2026-10-13T12:00:00.000Z',
    priceCents: 8840,
    currency: 'BS',
    exchangeRate: null,
    totalBsCents: 8840,
    memberCount: 4,
    settlement: 'comprobante',
    settledBy: LUIS,
    manualNote: null,
    cancelReason: null,
    lastRejection: null,
    currentReceipt: {
      id: uuid('000000000804'),
      uploadedAt: '2026-10-13T12:00:00.000Z',
      uploadedBy: ME,
      method: 'qr',
      reference: 'QR-90311',
      mime: 'application/pdf',
      sizeBytes: 310_000,
      status: 'confirmado',
      fileAvailable: true,
    },
    timeline: [
      event('0041', 'generado', null, null, 'pendiente', '2026-10-12T04:00:00.000Z'),
      event(
        '0042',
        'comprobante_subido',
        ME,
        'pendiente',
        'en_revision',
        '2026-10-13T12:00:00.000Z',
      ),
      event('0043', 'confirmado', LUIS, 'en_revision', 'pagado', '2026-10-13T19:40:00.000Z'),
    ],
    paymentInfo: null,
    allowedActions: [],
    version: 3,
  },
  {
    id: MOCK_CHARGE_IDS.inReviewNoPaymentInfo,
    groupId: CANVA.id,
    group: CANVA,
    cycleId: uuid('000000000703'),
    period: '2026-10',
    origin: 'ciclo',
    member: { ...ME, isFormerMember: false },
    amountCents: 1500,
    status: 'en_revision',
    issuedAt: '2026-10-05T04:00:00.000Z',
    dueAt: '2026-10-09T03:59:59.000Z',
    paidAt: null,
    firstSubmittedAt: '2026-10-07T15:12:00.000Z',
    priceCents: 6000,
    currency: 'BS',
    exchangeRate: null,
    totalBsCents: 6000,
    memberCount: 4,
    settlement: null,
    settledBy: null,
    manualNote: null,
    cancelReason: null,
    lastRejection: null,
    currentReceipt: {
      id: uuid('000000000803'),
      uploadedAt: '2026-10-07T15:12:00.000Z',
      uploadedBy: ME,
      method: 'transferencia',
      reference: 'TRX-88213',
      mime: 'image/jpeg',
      sizeBytes: 1_250_000,
      status: 'vigente',
      fileAvailable: true,
    },
    timeline: [
      event('0031', 'generado', null, null, 'pendiente', '2026-10-05T04:00:00.000Z'),
      event(
        '0032',
        'comprobante_subido',
        ME,
        'pendiente',
        'en_revision',
        '2026-10-07T15:12:00.000Z',
      ),
    ],
    paymentInfo: { text: null, qrUrl: null, configured: false },
    allowedActions: ['uploadReceipt'],
    version: 2,
  },
  {
    id: MOCK_CHARGE_IDS.cancelled,
    groupId: YOUTUBE.id,
    group: YOUTUBE,
    cycleId: uuid('000000000706'),
    period: '2026-10',
    origin: 'ciclo',
    member: { ...ME, isFormerMember: false },
    amountCents: 1640,
    status: 'cancelado',
    issuedAt: '2026-10-02T04:00:00.000Z',
    dueAt: '2026-10-06T03:59:59.000Z',
    paidAt: null,
    firstSubmittedAt: null,
    priceCents: 6560,
    currency: 'BS',
    exchangeRate: null,
    totalBsCents: 6560,
    memberCount: 4,
    settlement: null,
    settledBy: null,
    manualNote: null,
    cancelReason: 'Este mes el plan lo pagó una promoción.',
    lastRejection: null,
    currentReceipt: null,
    timeline: [
      event('0061', 'generado', null, null, 'pendiente', '2026-10-02T04:00:00.000Z'),
      event(
        '0062',
        'cancelado',
        PAOLA,
        'pendiente',
        'cancelado',
        '2026-10-03T16:20:00.000Z',
        'Este mes el plan lo pagó una promoción.',
      ),
    ],
    paymentInfo: null,
    allowedActions: [],
    version: 2,
  },
  {
    id: MOCK_CHARGE_IDS.entryPaid,
    groupId: SPOTIFY.id,
    group: SPOTIFY,
    cycleId: uuid('000000000705'),
    period: '2026-09',
    origin: 'ingreso',
    member: { ...ME, isFormerMember: false },
    amountCents: 1980,
    status: 'pagado',
    issuedAt: '2026-09-19T15:00:00.000Z',
    dueAt: '2026-09-19T15:00:00.000Z',
    paidAt: '2026-09-19T15:00:00.000Z',
    firstSubmittedAt: null,
    priceCents: 1707,
    currency: 'USD',
    exchangeRate: '6.9600',
    totalBsCents: 11881,
    memberCount: 6,
    settlement: 'ingreso',
    settledBy: MARCO,
    manualNote: null,
    cancelReason: null,
    lastRejection: null,
    currentReceipt: null,
    timeline: [
      event('0051', 'ingreso_registrado', MARCO, null, 'pagado', '2026-09-19T15:00:00.000Z'),
    ],
    paymentInfo: null,
    allowedActions: [],
    version: 1,
  },
  {
    id: MOCK_CHARGE_IDS.overdueFormer,
    groupId: PARAMOUNT.id,
    group: PARAMOUNT,
    cycleId: uuid('000000000702'),
    period: '2026-09',
    origin: 'ciclo',
    member: { ...ME, isFormerMember: true },
    amountCents: 1420,
    status: 'atrasado',
    issuedAt: '2026-09-05T04:00:00.000Z',
    dueAt: '2026-09-09T03:59:59.000Z',
    paidAt: null,
    firstSubmittedAt: null,
    priceCents: 5680,
    currency: 'BS',
    exchangeRate: null,
    totalBsCents: 5680,
    memberCount: 4,
    settlement: null,
    settledBy: null,
    manualNote: null,
    cancelReason: null,
    lastRejection: null,
    currentReceipt: null,
    timeline: [
      event('0021', 'generado', null, null, 'pendiente', '2026-09-05T04:00:00.000Z'),
      event('0022', 'atrasado', null, 'pendiente', 'atrasado', '2026-09-09T04:00:00.000Z'),
      event('0023', 'retiro_por_mora', null, 'atrasado', 'atrasado', '2026-09-09T04:00:00.000Z'),
    ],
    paymentInfo: { text: 'Tigo Money 70011223 · Rocío Gutiérrez', qrUrl: null, configured: true },
    allowedActions: ['uploadReceipt'],
    version: 3,
  },
];

const GABRIEL: PersonRef = {
  userId: '9c4e2f10-0000-4000-8000-000000000306',
  fullName: 'Gabriel Choque Limachi',
};

/**
 * Cobro que la persona revisa como titular y que ya venció. Solo llega por `getCharge`: no está
 * en el historial ni en el resumen de Prime Video para no alterar sus totales simulados.
 */
const OWNER_OVERDUE_IN_REVIEW: Charge = {
  id: MOCK_CHARGE_IDS.ownerInReviewOverdue,
  groupId: '5b0d7c3e-0000-4000-8000-000000000102',
  cycleId: uuid('000000000709'),
  period: '2026-09',
  origin: 'ciclo',
  member: { ...GABRIEL, isFormerMember: false },
  amountCents: 1564,
  status: 'en_revision',
  issuedAt: '2026-09-17T04:00:00.000Z',
  dueAt: '2026-09-21T03:59:59.000Z',
  paidAt: null,
  firstSubmittedAt: '2026-09-20T23:30:00.000Z',
  priceCents: 899,
  currency: 'USD',
  exchangeRate: '6.9600',
  totalBsCents: 6257,
  memberCount: 4,
  settlement: null,
  settledBy: null,
  manualNote: null,
  cancelReason: null,
  lastRejection: null,
  currentReceipt: {
    id: uuid('000000000807'),
    uploadedAt: '2026-09-20T23:30:00.000Z',
    uploadedBy: GABRIEL,
    method: 'qr',
    reference: 'QR-40021',
    mime: 'image/png',
    sizeBytes: 540_000,
    status: 'vigente',
    fileAvailable: true,
  },
  receipts: [],
  timeline: [
    event('0071', 'generado', null, null, 'pendiente', '2026-09-17T04:00:00.000Z'),
    event(
      '0072',
      'comprobante_subido',
      GABRIEL,
      'pendiente',
      'en_revision',
      '2026-09-20T23:30:00.000Z',
    ),
  ],
  paymentInfo: null,
  allowedActions: ['confirm', 'reject'],
  version: 2,
};

/** Comprobantes cuyo archivo ya se borró por antigüedad: `410 FILE_DELETED`. */
const DELETED_RECEIPT_IDS = new Set([uuid('000000000807')]);

/** Estado fijo que devuelve el servidor al rechazar cada cobro del titular. */
const REJECT_RESULT: Record<string, 'pendiente' | 'atrasado'> = {
  [MOCK_CHARGE_IDS.ownerInReviewOverdue]: 'atrasado',
};

const RECEIPTS: Record<string, Receipt[]> = {
  [MOCK_CHARGE_IDS.pendingRejected]: [
    {
      id: uuid('000000000801'),
      uploadedAt: '2026-10-18T14:30:00.000Z',
      uploadedBy: ME,
      method: 'qr',
      reference: 'QR-55120',
      mime: 'image/png',
      sizeBytes: 820_000,
      status: 'rechazado',
      fileAvailable: true,
    },
  ],
};

/** El detalle agrega el historial de comprobantes; el `group` extra no estorba. */
function toCharge(item: MyCharge): Charge {
  return { ...item, receipts: RECEIPTS[item.id] ?? [] };
}

export function listMyCharges(
  params: ListMyChargesParams,
  signal?: AbortSignal,
): Promise<Page<MyCharge>> {
  return delay(() => {
    const items = MY_CHARGES.filter(
      (charge) =>
        (!params.status?.length || params.status.includes(charge.status)) &&
        (!params.period || charge.period === params.period) &&
        (!params.groupId || charge.groupId === params.groupId),
    );
    return { items, nextCursor: null };
  }, signal);
}

/** `403` para el cobro de otro miembro; `404` para cualquier id desconocido (CA-002-23). */
export function getCharge(chargeId: string, signal?: AbortSignal): Promise<Charge> {
  return delay(() => findAny(chargeId).charge, signal);
}

/** `owned`: el cobro es de la persona (miembro); si no, la persona lo ve como titular. */
function findAny(chargeId: string): { charge: Charge; owned: boolean } {
  const asOwner =
    chargeId === MOCK_CHARGE_IDS.ownerInReviewOverdue
      ? OWNER_OVERDUE_IN_REVIEW
      : ownerGroupCharge(chargeId);
  if (asOwner) return { charge: asOwner, owned: false };
  return { charge: toCharge(find(chargeId)), owned: true };
}

function find(chargeId: string) {
  if (chargeId === MOCK_CHARGE_IDS.forbidden) {
    throw new ApiError(403, 'FORBIDDEN', 'No tienes acceso a este cobro.');
  }
  const charge = MY_CHARGES.find((candidate) => candidate.id === chargeId);
  if (!charge) throw new ApiError(404, 'NOT_FOUND', 'Cobro no encontrado.');
  return charge;
}

function requireAction(
  charge: Pick<Charge, 'allowedActions' | 'status'>,
  action: Charge['allowedActions'][number],
) {
  if (!charge.allowedActions.includes(action)) {
    throw new ApiError(409, 'INVALID_TRANSITION', 'Este cobro ya no admite cambios.', {
      from: charge.status,
      action,
    });
  }
}

/** Referencias fijas que simulan errores del servidor en `uploadReceipt` (T022). */
export const MOCK_RECEIPT_REFERENCES = {
  /** `409 REFERENCE_ALREADY_USED`. */
  alreadyUsed: 'TRX-USADA',
  /** `503 SERVICE_UNAVAILABLE` (falla del almacén). */
  storageDown: 'TRX-SIN-ALMACEN',
} as const;

function checkVersion(charge: Pick<Charge, 'version'>, version: number | undefined) {
  if (version !== undefined && version !== charge.version) {
    throw new ApiError(409, 'STALE_STATE', 'El cobro cambió.');
  }
}

const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

function checkUpload(charge: MyCharge, input: UploadReceiptInput) {
  const reference = input.reference.trim();
  if (reference.length < 1 || reference.length > 100 || !input.method) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Datos inválidos.', {
      fields: [{ field: 'reference', message: 'Entre 1 y 100 caracteres.' }],
    });
  }
  if (input.file.size > RECEIPT_MAX_BYTES) {
    throw new ApiError(413, 'FILE_TOO_LARGE', 'El archivo supera 5 MB.');
  }
  if (!RECEIPT_TYPES.includes(input.file.type)) {
    throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Tipo de archivo no permitido.');
  }
  requireAction(charge, 'uploadReceipt');
  checkVersion(charge, input.version);
  if (reference === MOCK_RECEIPT_REFERENCES.alreadyUsed) {
    throw new ApiError(409, 'REFERENCE_ALREADY_USED', 'Esa referencia ya fue usada en este grupo.');
  }
  if (reference === MOCK_RECEIPT_REFERENCES.storageDown) {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'No se pudo guardar el archivo.');
  }
}

/**
 * `201` con el cobro en `en_revision`, el comprobante vigente y un evento nuevo. Si ya estaba en
 * revisión, el comprobante anterior pasa a `reemplazado` (RF-002-08). No guarda el cambio: cada
 * `getCharge` vuelve al dato inicial.
 */
export function uploadReceipt(chargeId: string, input: UploadReceiptInput): Promise<Charge> {
  return delay(() => {
    const charge = find(chargeId);
    checkUpload(charge, input);
    const current = toCharge(charge);
    const replacing = charge.status === 'en_revision' && charge.currentReceipt !== null;
    const uploadedAt = '2026-10-19T15:00:00.000Z';
    const previous: Receipt[] =
      replacing && charge.currentReceipt
        ? [{ ...charge.currentReceipt, status: 'reemplazado' }]
        : [];
    return {
      ...current,
      status: 'en_revision',
      firstSubmittedAt: charge.firstSubmittedAt ?? uploadedAt,
      version: charge.version + 1,
      currentReceipt: {
        id: uuid('000000000899'),
        uploadedAt,
        uploadedBy: ME,
        method: input.method,
        reference: input.reference.trim(),
        mime: input.file.type,
        sizeBytes: input.file.size,
        status: 'vigente',
        fileAvailable: true,
      },
      receipts: [...previous, ...current.receipts],
      timeline: [
        ...charge.timeline,
        event(
          '0099',
          replacing ? 'comprobante_reemplazado' : 'comprobante_subido',
          ME,
          charge.status,
          'en_revision',
          uploadedAt,
        ),
      ],
    };
  });
}

export function getReceiptFile(
  chargeId: string,
  receiptId: string,
  signal?: AbortSignal,
): Promise<ReceiptFile> {
  return delay(() => {
    const { charge } = findAny(chargeId);
    const receipt = [charge.currentReceipt, ...charge.receipts].find(
      (candidate) => candidate?.id === receiptId,
    );
    if (!receipt) throw new ApiError(404, 'NOT_FOUND', 'Comprobante no encontrado.');
    if (DELETED_RECEIPT_IDS.has(receipt.id)) {
      throw new ApiError(410, 'FILE_DELETED', 'El archivo fue eliminado.');
    }
    return { url: QR_URL, expiresAt: '2026-10-19T15:10:00.000Z', mime: receipt.mime };
  }, signal);
}

const forbiddenForMember = () =>
  new ApiError(403, 'FORBIDDEN', 'Solo el titular puede revisar este cobro.');

/**
 * `200` con el cobro `pagado`, quién y cuándo, el comprobante confirmado y el evento. A la
 * persona sobre sus propios cobros responde `403` (CA-002-12). No guarda el cambio.
 */
export function confirmCharge(chargeId: string, input: ConfirmChargeInput): Promise<Charge> {
  return delay(() => {
    const { charge, owned } = findAny(chargeId);
    if (owned) throw forbiddenForMember();
    requireAction(charge, 'confirm');
    checkVersion(charge, input.version);
    const at = '2026-10-19T15:30:00.000Z';
    return {
      ...charge,
      status: 'pagado',
      paidAt: at,
      settlement: 'comprobante',
      settledBy: ME,
      currentReceipt: charge.currentReceipt && { ...charge.currentReceipt, status: 'confirmado' },
      paymentInfo: null,
      allowedActions: [],
      version: charge.version + 1,
      timeline: [...charge.timeline, event('0098', 'confirmado', ME, 'en_revision', 'pagado', at)],
    };
  });
}

/**
 * `200` con el cobro en el estado fijo de `REJECT_RESULT` (`pendiente` por defecto), el último
 * rechazo y el evento. Motivo de 5 a 200 caracteres o `400 VALIDATION_ERROR`.
 */
export function rejectCharge(chargeId: string, input: RejectChargeInput): Promise<Charge> {
  return delay(() => {
    const { charge, owned } = findAny(chargeId);
    if (owned) throw forbiddenForMember();
    const reason = input.reason.trim();
    if (reason.length < 5 || reason.length > 200) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Datos inválidos.', {
        fields: [{ field: 'reason', message: 'Entre 5 y 200 caracteres.' }],
      });
    }
    requireAction(charge, 'reject');
    checkVersion(charge, input.version);
    const at = '2026-10-19T15:30:00.000Z';
    const next = REJECT_RESULT[charge.id] ?? 'pendiente';
    const rejected: Receipt[] = charge.currentReceipt
      ? [{ ...charge.currentReceipt, status: 'rechazado' }]
      : [];
    return {
      ...charge,
      status: next,
      lastRejection: { reason, invalidReceipt: input.invalidReceipt, at },
      currentReceipt: null,
      receipts: [...rejected, ...charge.receipts],
      allowedActions: ['manualPayment', 'cancel'],
      version: charge.version + 1,
      timeline: [
        ...charge.timeline,
        event('0097', 'rechazado', ME, 'en_revision', next, at, reason),
      ],
    };
  });
}

/** Historial del grupo (T037): datos en `group-billing.mock.ts`. */
export function getGroupCharges(
  groupId: string,
  params: GroupChargesParams,
  signal?: AbortSignal,
): Promise<Page<ChargePublic | Charge>> {
  return delay(() => groupChargesPage(groupId, params), signal);
}

/** Resumen del período (T037): `404` si el grupo no tiene ciclo en ese período. */
export function getBillingSummary(
  groupId: string,
  period: string | undefined,
  signal?: AbortSignal,
): Promise<BillingSummary> {
  return delay(() => billingSummary(groupId, period), signal);
}
