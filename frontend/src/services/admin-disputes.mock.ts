/**
 * Datos simulados de los reclamos de ingreso (spec 009, RF-009-20) mientras el backend no los
 * entrega. Los rótulos, horas y nombres ya vienen listos, como los daría la API; aquí no se
 * calcula ninguna regla. Nombres y montos inventados.
 */
import type {
  AdminDispute,
  AdminDisputeEvidence,
  AdminDisputeResult,
  AdminDisputeStatus,
  AdminDisputesPage,
} from './admin-disputes';
import { ApiError } from './http';

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

function seedDisputes(): AdminDispute[] {
  return [
    {
      id: 'rec-1',
      type: 'pago_sin_ingreso',
      status: 'abierto',
      result: null,
      requesterName: 'Ana Quispe',
      accusedName: 'Kevin Rojas',
      groupName: 'Crunchyroll anime',
      quoteCents: 1200,
      reference: 'TRF-554210',
      createdAt: '2026-10-17T09:12:00Z',
      resolvedAt: null,
      hasResponse: true,
    },
    {
      id: 'rec-2',
      type: 'comprobante_falso',
      status: 'abierto',
      result: null,
      requesterName: 'Valeria Choque',
      accusedName: 'Jorge Calle',
      groupName: 'Prime Video casa',
      quoteCents: 2500,
      reference: null,
      createdAt: '2026-10-15T18:30:00Z',
      resolvedAt: null,
      hasResponse: false,
    },
    {
      id: 'rec-3',
      type: 'pago_sin_ingreso',
      status: 'resuelto',
      result: 'sin_falta',
      requesterName: 'Bruno Paz',
      accusedName: 'Iván Céspedes',
      groupName: 'Spotify familiar',
      quoteCents: 1707,
      reference: null,
      createdAt: '2026-10-02T11:00:00Z',
      resolvedAt: '2026-10-03T10:00:00Z',
      hasResponse: true,
    },
  ];
}

let disputes: AdminDispute[] = seedDisputes();

/** Vuelve a los datos iniciales (pruebas). */
export function resetDisputesMock() {
  disputes = seedDisputes();
}

type EvidenceData = Omit<AdminDisputeEvidence, 'openedAt'>;

const EVIDENCE: Record<string, EvidenceData> = {
  'rec-1': {
    timeline: [
      { at: '2026-10-16T19:41:00Z', label: 'Ana pidió el cupo' },
      { at: '2026-10-16T20:02:00Z', label: 'Kevin envió los datos de pago' },
      { at: '2026-10-16T20:11:00Z', label: 'Ana subió el comprobante' },
      { at: '2026-10-16T21:10:00Z', label: 'Expiró: el titular no respondió' },
    ],
    chat: [
      { author: 'Ana', at: '2026-10-16T19:41:00Z', text: 'Hola, ¿tienes cupo en Crunchyroll?' },
      { author: 'Kevin', at: '2026-10-16T20:01:00Z', text: 'Sí, te paso el QR.' },
      { author: 'Ana', at: '2026-10-16T20:11:00Z', text: 'Listo, ya pagué y subí el comprobante.' },
    ],
    receipt: {
      label: 'Comprobante de Ana · 16 oct. 20:10',
      url: 'https://ejemplo.bo/comprobante-rec-1',
    },
    quoteCents: 1200,
    descriptions: [
      {
        by: 'Ana',
        text: 'Le pagué Bs 12,00 por QR el 16 de octubre y subí el comprobante a tiempo.',
      },
    ],
    responses: [
      { by: 'Kevin', text: 'No vi el aviso a tiempo. Reviso mi banco y no encuentro ese pago.' },
    ],
  },
  'rec-2': {
    timeline: [{ at: '2026-10-15T18:30:00Z', label: 'Valeria abrió el reclamo' }],
    chat: [],
    receipt: {
      label: 'Comprobante de Valeria · 15 oct.',
      url: 'https://ejemplo.bo/comprobante-rec-2',
    },
    quoteCents: 2500,
    descriptions: [{ by: 'Valeria', text: 'El comprobante no aparece en el banco.' }],
    responses: [],
  },
  'rec-3': {
    timeline: [{ at: '2026-10-02T11:00:00Z', label: 'Bruno abrió el reclamo' }],
    chat: [],
    receipt: null,
    quoteCents: 1707,
    descriptions: [],
    responses: [],
  },
};

const find = (disputeId: string): AdminDispute => {
  const found = disputes.find((item) => item.id === disputeId);
  if (!found) throw new ApiError(404, 'NOT_FOUND', 'Reclamo no encontrado.');
  return found;
};

export function listDisputes(status: AdminDisputeStatus | undefined): Promise<AdminDisputesPage> {
  return delay(() => {
    const matching = disputes
      .filter((item) => !status || item.status === status)
      // Los abiertos primero; dentro de cada grupo, los más recientes primero.
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'abierto' ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
    return { items: matching.map((item) => ({ ...item })), nextCursor: null };
  });
}

export function getDispute(disputeId: string): Promise<AdminDispute> {
  return delay(() => ({ ...find(disputeId) }));
}

export function getEvidence(disputeId: string): Promise<AdminDisputeEvidence> {
  return delay(() => {
    find(disputeId);
    const data = EVIDENCE[disputeId];
    if (!data) throw new ApiError(403, 'FORBIDDEN', 'Esta solicitud no tiene un reclamo abierto.');
    return { ...data, openedAt: new Date().toISOString() };
  });
}

export function resolve(
  disputeId: string,
  result: AdminDisputeResult,
  reason: string,
): Promise<AdminDispute> {
  return delay(() => {
    const trimmed = reason.trim();
    if (trimmed.length < 10 || trimmed.length > 300) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'El motivo va de 10 a 300 caracteres.');
    }
    const target = find(disputeId);
    if (target.status === 'resuelto') {
      throw new ApiError(409, 'INVALID_TRANSITION', 'El reclamo ya está resuelto.');
    }
    target.status = 'resuelto';
    target.result = result;
    target.resolvedAt = new Date().toISOString();
    return { ...target };
  });
}
