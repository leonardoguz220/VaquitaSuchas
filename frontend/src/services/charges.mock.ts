/**
 * Datos simulados de la spec 002 mientras el backend no está conectado (T018; se quita en T019).
 * Los montos, estados y `allowedActions` ya vienen resueltos, como los entregaría la API: aquí no
 * se calcula nada. Filtrar por la query de `GET /me/charges` simula al servidor. Nombres,
 * montos y cuentas inventados.
 */
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
  return delay(() => toCharge(find(chargeId)), signal);
}

function find(chargeId: string) {
  if (chargeId === MOCK_CHARGE_IDS.forbidden) {
    throw new ApiError(403, 'FORBIDDEN', 'No tienes acceso a este cobro.');
  }
  const charge = MY_CHARGES.find((candidate) => candidate.id === chargeId);
  if (!charge) throw new ApiError(404, 'NOT_FOUND', 'Cobro no encontrado.');
  return charge;
}

function requireAction(charge: MyCharge, action: Charge['allowedActions'][number]) {
  if (!charge.allowedActions.includes(action)) {
    throw new ApiError(409, 'INVALID_TRANSITION', 'Este cobro ya no admite cambios.', {
      from: charge.status,
      action,
    });
  }
}

/** Respuesta fija «ya en revisión»; T022 la reemplaza si necesita más casos. */
export function uploadReceipt(chargeId: string, input: UploadReceiptInput): Promise<Charge> {
  return delay(() => {
    const charge = find(chargeId);
    requireAction(charge, 'uploadReceipt');
    return {
      ...toCharge(charge),
      status: 'en_revision',
      version: charge.version + 1,
      currentReceipt: {
        id: uuid('000000000899'),
        uploadedAt: '2026-10-19T15:00:00.000Z',
        uploadedBy: ME,
        method: input.method,
        reference: input.reference,
        mime: input.file.type,
        sizeBytes: input.file.size,
        status: 'vigente',
        fileAvailable: true,
      },
    };
  });
}

export function getReceiptFile(
  chargeId: string,
  receiptId: string,
  signal?: AbortSignal,
): Promise<ReceiptFile> {
  return delay(() => {
    const charge = toCharge(find(chargeId));
    const receipt = [charge.currentReceipt, ...charge.receipts].find(
      (candidate) => candidate?.id === receiptId,
    );
    if (!receipt) throw new ApiError(404, 'NOT_FOUND', 'Comprobante no encontrado.');
    return { url: QR_URL, expiresAt: '2026-10-19T15:10:00.000Z', mime: receipt.mime };
  }, signal);
}

/** Los cobros simulados son de la persona, que no es titular: confirmar responde `403`. */
export function confirmCharge(chargeId: string, _input: ConfirmChargeInput): Promise<Charge> {
  return delay(() => {
    const charge = find(chargeId);
    requireAction(charge, 'confirm');
    return toCharge(charge);
  });
}

export function rejectCharge(chargeId: string, _input: RejectChargeInput): Promise<Charge> {
  return delay(() => {
    const charge = find(chargeId);
    requireAction(charge, 'reject');
    return toCharge(charge);
  });
}

export function getGroupCharges(
  groupId: string,
  params: GroupChargesParams,
  signal?: AbortSignal,
): Promise<Page<ChargePublic | Charge>> {
  return delay(() => {
    const items = MY_CHARGES.filter(
      (charge) =>
        charge.groupId === groupId &&
        (!params.period || charge.period === params.period) &&
        (!params.status?.length || params.status.includes(charge.status)),
    ).map(toCharge);
    if (items.length === 0 && !MY_CHARGES.some((charge) => charge.groupId === groupId)) {
      throw new ApiError(404, 'NOT_FOUND', 'No encontrado.');
    }
    return { items, nextCursor: null };
  }, signal);
}

const SPOTIFY_SUMMARY: BillingSummary = {
  period: '2026-10',
  cycleType: 'regular',
  cutDate: '2026-10-18',
  dueAt: '2026-10-22T03:59:59.000Z',
  totalBsCents: 11881,
  memberCount: 6,
  baseShareCents: 1980,
  ownerShareCents: 1981,
  rows: MY_CHARGES.filter(
    (charge) => charge.groupId === SPOTIFY.id && charge.period === '2026-10',
  ).map((charge) => ({ charge: toCharge(charge), isFormerMember: false })),
  availablePeriods: ['2026-10', '2026-09'],
};

/** Solo el grupo de Spotify tiene ciclo simulado. */
export function getBillingSummary(
  groupId: string,
  period: string | undefined,
  signal?: AbortSignal,
): Promise<BillingSummary> {
  return delay(() => {
    if (groupId !== SPOTIFY.id || (period && period !== SPOTIFY_SUMMARY.period)) {
      throw new ApiError(404, 'NOT_FOUND', 'No encontrado.');
    }
    return SPOTIFY_SUMMARY;
  }, signal);
}
