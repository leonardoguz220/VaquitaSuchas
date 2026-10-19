/**
 * Datos simulados que respetan el contrato 009 (`contracts/api.md`), solo para las pruebas.
 * Nombres, correos, celulares y fechas son inventados.
 */
import type { AuditEntry } from '../admin-audit';
import type { AdminDisputeEvidence, AdminDisputeRow } from '../admin-disputes';
import type { HostEnablementRow } from '../admin-hosts';
import type { ReportedListing } from '../admin-listings';
import type { AdminStats } from '../admin-stats';
import type { AdminUserDetail, AdminUserRow } from '../admin-users';

/** Fila de la lista de usuarios: Camila, activa y usuaria (CA-009-07). */
export function adminUserRow(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id: 'u1',
    fullName: 'Camila Rojas',
    email: 'camila.rojas@example.com',
    phone: '+59175550123',
    role: 'usuario',
    status: 'activo',
    // 12 may 2026, 10:00 en La Paz.
    createdAt: '2026-05-12T14:00:00.000Z',
    ...overrides,
  };
}

/** Ficha de Camila: activa, titular de 1 grupo y miembro de 2, con la CI enmascarada. */
export function adminUserDetail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: 'u1',
    fullName: 'Camila Rojas',
    email: 'camila.rojas@example.com',
    phone: '+59175550123',
    ciMasked: '*****471',
    status: 'activo',
    role: 'usuario',
    createdAt: '2026-05-12T14:00:00.000Z',
    // 18 oct 2026, 20:30 en La Paz.
    lastLoginAt: '2026-10-19T00:30:00.000Z',
    groupsAsHost: 1,
    groupsAsMember: 2,
    reputation: { level: 'Regular', stars: 3, consideredCharges: 8 },
    reportsReceived: 1,
    ban: null,
    suspension: null,
    hostEnablement: null,
    ...overrides,
  };
}

/** Habilitación manual vigente de Rodrigo, hecha por Leonardo el 10 ene 2026 (RF-009-21). */
export function hostEnablementRow(overrides: Partial<HostEnablementRow> = {}): HostEnablementRow {
  return {
    id: 'he1',
    user: { id: 'u5', fullName: 'Rodrigo Salazar', email: 'rodrigo@example.com' },
    reason: 'Primer titular del grupo de prueba',
    enabledBy: { id: 'a1', fullName: 'Leonardo Guzman' },
    enabledAt: '2026-01-10T14:00:00.000Z',
    ...overrides,
  };
}

/** Reclamo abierto por pago sin ingreso: Ana (solicitante) contra Kevin (titular). */
export function adminDisputeRow(overrides: Partial<AdminDisputeRow> = {}): AdminDisputeRow {
  return {
    id: 'd1',
    kind: 'pago_sin_ingreso',
    status: 'abierto',
    requestId: 'r1',
    group: { id: 'g1', name: 'Crunchyroll anime', serviceName: 'Crunchyroll' },
    openedBy: { userId: 'u2', fullName: 'Ana Quispe', role: 'solicitante' },
    accused: { userId: 'u7', fullName: 'Kevin Rojas', role: 'titular' },
    // 17 oct 2026, 09:12 en La Paz.
    openedAt: '2026-10-17T13:12:00.000Z',
    resolvedAt: null,
    result: null,
    hasResponse: true,
    ...overrides,
  };
}

/** Evidencia del reclamo `d1` (contrato 009, RF-010-23). */
export function adminDisputeEvidence(
  overrides: Partial<AdminDisputeEvidence> = {},
): AdminDisputeEvidence {
  return {
    dispute: adminDisputeRow(),
    timeline: [
      {
        type: 'abierta',
        actor: { userId: 'u2', fullName: 'Ana Quispe' },
        fromStatus: null,
        toStatus: 'abierta',
        reason: null,
        occurredAt: '2026-10-15T23:41:00.000Z',
      },
      {
        type: 'expirada',
        actor: null,
        fromStatus: 'pago_informado',
        toStatus: 'expirada',
        reason: 'titular_sin_respuesta',
        occurredAt: '2026-10-17T01:10:00.000Z',
      },
    ],
    messages: [
      {
        id: 'm1',
        seq: 1,
        sender: { userId: 'u2', fullName: 'Ana Quispe' },
        body: 'Hola, ¿tienes cupo en Crunchyroll?',
        imageUrl: null,
        // 15 oct 2026, 19:41 en La Paz.
        createdAt: '2026-10-15T23:41:00.000Z',
      },
      {
        id: 'm2',
        seq: 2,
        sender: { userId: 'u7', fullName: 'Kevin Rojas' },
        body: 'Sí, te paso el QR.',
        imageUrl: 'https://files.example.com/qr.png?sig=abc',
        createdAt: '2026-10-16T00:01:00.000Z',
      },
    ],
    proof: {
      method: 'transferencia',
      reference: 'TRF-554210',
      mime: 'image/png',
      sizeBytes: 245_000,
      uploadedAt: '2026-10-17T00:10:00.000Z',
      fileAvailable: true,
      fileUrl: 'https://files.example.com/proof.png?sig=xyz',
    },
    quote: {
      amountCents: 1200,
      priceCents: 4800,
      currency: 'BS',
      exchangeRate: null,
      totalBsCents: 4800,
      memberCount: 4,
    },
    claims: [
      {
        id: 'd1',
        kind: 'pago_sin_ingreso',
        openedBy: { userId: 'u2', fullName: 'Ana Quispe' },
        description: 'Le pagué Bs 12,00 por QR y subí el comprobante a tiempo. No respondió.',
        evidenceUrl: 'https://files.example.com/banco.png?sig=1',
        openedAt: '2026-10-17T13:12:00.000Z',
        response: {
          text: 'No vi el aviso a tiempo. Reviso mi banco y no encuentro ese pago.',
          evidenceUrl: null,
          respondedAt: '2026-10-17T20:00:00.000Z',
        },
      },
    ],
    ...overrides,
  };
}

/** Entrada del log: Leonardo suspendió a Patricia (CA-009-18). */
export function auditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'al1',
    admin: { id: 'a1', fullName: 'Leonardo Guzman' },
    action: 'usuario_suspender',
    targetType: 'user',
    targetId: 'u2',
    targetLabel: 'Patricia Mendoza',
    reason: 'Comprobantes repetidos en dos grupos',
    // 17 oct 2026, 18:30 en La Paz.
    occurredAt: '2026-10-17T22:30:00.000Z',
    ...overrides,
  };
}

/** Publicación oculta por 3 reportes (CA-009-14). */
export function reportedListing(overrides: Partial<ReportedListing> = {}): ReportedListing {
  return {
    id: 'l1',
    status: 'oculta',
    service: { name: 'Netflix', planName: 'Premium' },
    slotsOffered: 1,
    owner: { userId: 'u4', fullName: 'Sofía Mamani' },
    description: 'Cupo barato, escríbeme por WhatsApp para pagar directo.',
    conditions: null,
    publishedAt: '2026-10-10T14:00:00.000Z',
    hiddenAt: '2026-10-17T14:00:00.000Z',
    reportCount: 3,
    reports: [
      {
        reason: 'conducta_indebida',
        comment: 'Pide pagar fuera de la app',
        createdAt: '2026-10-16T14:00:00.000Z',
      },
      { reason: 'datos_falsos', comment: null, createdAt: '2026-10-16T15:00:00.000Z' },
      {
        reason: 'spam',
        comment: 'Datos de contacto en la descripción',
        createdAt: '2026-10-17T14:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

/** Estadísticas de octubre de 2026 (contrato 009 § Estadísticas). */
export function adminStats(overrides: Partial<AdminStats> = {}): AdminStats {
  return {
    users: { total: 87, newThisMonth: 12, active30d: 64 },
    groups: { active: 24, closed: 3 },
    charges: {
      period: '2026-10',
      byStatus: { pendiente: 14, en_revision: 9, pagado: 61, atrasado: 3, cancelado: 1 },
      managedCents: 254_350,
    },
    punctualityRate: 0.92,
    topServices: [
      { name: 'Netflix', groups: 9 },
      { name: 'Spotify', groups: 7 },
    ],
    listings: { active: 5 },
    joinRequestsThisMonth: 31,
    disputesOpen: 2,
    ...overrides,
  };
}
