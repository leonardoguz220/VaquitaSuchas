/**
 * Datos simulados que respetan el contrato 009 (`contracts/api.md`), solo para las pruebas.
 * Nombres, correos, celulares y fechas son inventados.
 */
import type { HostEnablementRow } from '../admin-hosts';
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
