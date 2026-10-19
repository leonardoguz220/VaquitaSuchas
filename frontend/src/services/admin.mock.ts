/**
 * Datos simulados de la spec 009 mientras el backend no tiene los endpoints de administración. El
 * estado vive en memoria: cada acción cambia la lista para que la pantalla se vea coherente al
 * probarla a mano. Los valores (cifras, estados, niveles) ya vienen resueltos, como los entregaría
 * la API. Las validaciones de motivo y de transición imitan lo que respondería el servidor; no
 * son reglas de negocio del frontend. Nombres y montos inventados.
 */
import type {
  AdminRole,
  AdminStats,
  AdminUserDetail,
  AdminUserRow,
  AdminUsersPage,
  HostEnablementRow,
  ListAdminUsersParams,
} from './admin';
import { ApiError } from './http';

const LATENCY_MS = 350;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const REASON_MIN = 10;
const REASON_MAX = 300;

/** Espera la latencia simulada; si la petición se cancela, rechaza con `AbortError`. */
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

/** Id de la administradora que usa la demo: no puede suspenderse ni banearse a sí misma. */
export const MOCK_CURRENT_ADMIN_ID = 'u-admin-camila';

export const MOCK_ADMIN_USER_IDS = {
  kevin: 'u-kevin',
  ana: 'u-ana',
  rodrigo: 'u-rodrigo',
  patricia: 'u-patricia',
  raul: 'u-raul',
  valeria: 'u-valeria',
  marco: 'u-marco',
} as const;

interface MockUser extends AdminUserRow {
  email: string;
  ciMasked: string;
  lastLoginAt: string | null;
  groupsAsHost: number;
  groupsAsMember: number;
  reputation: AdminUserDetail['reputation'];
  reportsReceived: number;
  ban: AdminUserDetail['ban'];
  suspension: AdminUserDetail['suspension'];
  hostEnablement: AdminUserDetail['hostEnablement'];
}

function user(overrides: Partial<MockUser> & Pick<MockUser, 'id' | 'fullName'>): MockUser {
  return {
    phone: '+59170000000',
    email: `${overrides.id}@ejemplo.bo`,
    role: 'usuario',
    status: 'activo',
    createdAt: '2026-01-10T12:00:00Z',
    ciMasked: '*****000',
    lastLoginAt: null,
    groupsAsHost: 0,
    groupsAsMember: 0,
    reputation: { level: 'Nuevo', stars: null, starsLabel: null, consideredCharges: 0 },
    reportsReceived: 0,
    ban: null,
    suspension: null,
    hostEnablement: null,
    ...overrides,
  };
}

function seedUsers(): MockUser[] {
  return [
    user({
      id: MOCK_ADMIN_USER_IDS.kevin,
      fullName: 'Kevin Rojas',
      phone: '+59175550123',
      email: 'kevin.rojas@gmail.com',
      ciMasked: '*****471',
      createdAt: '2026-05-02T12:00:00Z',
      lastLoginAt: '2026-10-18T14:20:00Z',
      groupsAsHost: 1,
      groupsAsMember: 2,
      reputation: { level: 'Regular', stars: 3, starsLabel: '3 de 5', consideredCharges: 8 },
      reportsReceived: 1,
    }),
    user({
      id: MOCK_ADMIN_USER_IDS.ana,
      fullName: 'Ana Quispe',
      phone: '+59171234567',
      createdAt: '2026-02-01T12:00:00Z',
      lastLoginAt: '2026-10-17T09:00:00Z',
      groupsAsMember: 1,
      reputation: { level: 'Bueno', stars: 4, starsLabel: '4 de 5', consideredCharges: 6 },
    }),
    user({
      id: MOCK_ADMIN_USER_IDS.rodrigo,
      fullName: 'Rodrigo Salazar',
      phone: '+59178123456',
      createdAt: '2026-01-10T12:00:00Z',
      groupsAsHost: 1,
      reputation: { level: 'Excelente', stars: 4.5, starsLabel: '4,5 de 5', consideredCharges: 14 },
      hostEnablement: {
        reason: 'Primer titular del grupo de prueba',
        by: 'Leonardo Guzman',
        at: '2026-01-10T12:00:00Z',
      },
    }),
    user({
      id: MOCK_ADMIN_USER_IDS.patricia,
      fullName: 'Patricia Mendoza',
      phone: '+59170998877',
      createdAt: '2026-09-01T12:00:00Z',
      status: 'suspendido',
      suspension: { reason: 'Reclamo abierto por pago sin ingreso.', at: '2026-10-02T10:00:00Z' },
    }),
    user({
      id: MOCK_ADMIN_USER_IDS.raul,
      fullName: 'Raúl Flores',
      phone: '+59177001122',
      createdAt: '2026-07-01T12:00:00Z',
      status: 'baneado',
      ban: {
        reason: 'Estafa confirmada en reclamo de pago.',
        by: 'Camila Fuentes',
        at: '2026-08-15T16:00:00Z',
      },
    }),
    user({
      id: MOCK_CURRENT_ADMIN_ID,
      fullName: 'Camila Fuentes',
      phone: '+59176000222',
      role: 'admin',
      createdAt: '2025-12-01T12:00:00Z',
      lastLoginAt: '2026-10-19T08:00:00Z',
    }),
    user({
      id: 'u-admin-leonardo',
      fullName: 'Leonardo Guzman',
      phone: '+59176000111',
      role: 'admin',
      createdAt: '2026-01-01T12:00:00Z',
    }),
    user({
      id: MOCK_ADMIN_USER_IDS.valeria,
      fullName: 'Valeria Choque',
      phone: '+59172223344',
      createdAt: '2026-10-05T12:00:00Z',
    }),
    user({
      id: MOCK_ADMIN_USER_IDS.marco,
      fullName: 'Marco Vargas',
      phone: '+59173334455',
      createdAt: '2026-01-12T12:00:00Z',
      groupsAsHost: 2,
      reputation: { level: 'Excelente', stars: 5, starsLabel: '5 de 5', consideredCharges: 20 },
      hostEnablement: {
        reason: 'Titular conocido del equipo para arrancar',
        by: 'Camila Fuentes',
        at: '2026-01-12T12:00:00Z',
      },
    }),
  ];
}

let users: MockUser[] = seedUsers();

/** Vuelve a los datos iniciales (pruebas y recarga controlada de la demo). */
export function resetMockState() {
  users = seedUsers();
}

const findUser = (userId: string): MockUser => {
  const found = users.find((item) => item.id === userId);
  if (!found) throw new ApiError(404, 'NOT_FOUND', 'Usuario no encontrado.');
  return found;
};

/** Sin tildes ni mayúsculas, como indica el contrato para `q`. */
const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function assertReason(reason: unknown, required = true): string | undefined {
  if (reason === undefined || reason === null || reason === '') {
    if (!required) return undefined;
    throw new ApiError(400, 'VALIDATION_ERROR', 'Escribe el motivo.');
  }
  if (typeof reason !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'El motivo no es válido.');
  }
  const trimmed = reason.trim();
  if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `El motivo debe tener de ${REASON_MIN} a ${REASON_MAX} caracteres.`,
    );
  }
  return trimmed;
}

function toRow(item: MockUser): AdminUserRow {
  return {
    id: item.id,
    fullName: item.fullName,
    phone: item.phone,
    role: item.role,
    status: item.status,
    createdAt: item.createdAt,
  };
}

function toDetail(item: MockUser): AdminUserDetail {
  return {
    ...toRow(item),
    email: item.email,
    ciMasked: item.ciMasked,
    lastLoginAt: item.lastLoginAt,
    groupsAsHost: item.groupsAsHost,
    groupsAsMember: item.groupsAsMember,
    reputation: item.reputation,
    reportsReceived: item.reportsReceived,
    ban: item.ban,
    suspension: item.suspension,
    hostEnablement: item.hostEnablement,
  };
}

/** Compara ids de administradores: no se puede actuar sobre uno mismo (RN-009-02, RN-009-07). */
function assertNotSelfOrAdmin(target: MockUser, code: 'RN-009-02' | 'RN-009-07') {
  if (target.id === MOCK_CURRENT_ADMIN_ID) {
    throw new ApiError(422, 'BUSINESS_RULE', `No puedes aplicar esta acción sobre ti (${code}).`);
  }
  if (target.role === 'admin') {
    throw new ApiError(422, 'BUSINESS_RULE', `No se puede aplicar a un administrador (${code}).`);
  }
}

export function listUsers(params: ListAdminUsersParams): Promise<AdminUsersPage> {
  return delay(() => {
    const limit = params.limit ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new ApiError(400, 'VALIDATION_ERROR', `El límite va de 1 a ${MAX_LIMIT}.`);
    }
    const offset = params.cursor ? Number(params.cursor) : 0;
    if (!Number.isInteger(offset) || offset < 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Cursor inválido.');
    }
    const q = params.q ? normalize(params.q) : '';
    const matching = users.filter((item) => {
      if (q && !normalize(`${item.fullName} ${item.email} ${item.phone}`).includes(q)) return false;
      if (params.status && item.status !== params.status) return false;
      if (params.role && item.role !== params.role) return false;
      return true;
    });
    const page = matching.slice(offset, offset + limit);
    const next = offset + limit < matching.length ? String(offset + limit) : null;
    return { items: page.map(toRow), nextCursor: next };
  });
}

export function getUser(userId: string): Promise<AdminUserDetail> {
  return delay(() => toDetail(findUser(userId)));
}

export function suspend(userId: string, reason: string): Promise<AdminUserDetail> {
  return delay(() => {
    const text = assertReason(reason) as string;
    const target = findUser(userId);
    assertNotSelfOrAdmin(target, 'RN-009-02');
    if (target.status !== 'activo') {
      throw new ApiError(409, 'INVALID_TRANSITION', 'La cuenta ya está suspendida o baneada.');
    }
    target.status = 'suspendido';
    target.suspension = { reason: text, at: new Date().toISOString() };
    return toDetail(target);
  });
}

export function reactivate(userId: string, reason?: string): Promise<AdminUserDetail> {
  return delay(() => {
    assertReason(reason, false);
    const target = findUser(userId);
    if (target.status === 'baneado') {
      throw new ApiError(
        422,
        'BUSINESS_RULE',
        'La reactivación no deshace un baneo (USER_BANNED).',
      );
    }
    if (target.status !== 'suspendido') {
      throw new ApiError(409, 'INVALID_TRANSITION', 'La cuenta no está suspendida.');
    }
    target.status = 'activo';
    target.suspension = null;
    return toDetail(target);
  });
}

export function ban(userId: string, reason: string): Promise<AdminUserDetail> {
  return delay(() => {
    const text = assertReason(reason) as string;
    const target = findUser(userId);
    assertNotSelfOrAdmin(target, 'RN-009-07');
    if (target.status === 'baneado') {
      throw new ApiError(409, 'INVALID_TRANSITION', 'La cuenta ya está baneada.');
    }
    target.status = 'baneado';
    target.suspension = null;
    target.ban = { reason: text, by: 'Camila Fuentes', at: new Date().toISOString() };
    return toDetail(target);
  });
}

export function changeRole(
  userId: string,
  role: AdminRole,
  reason: string,
): Promise<AdminUserDetail> {
  return delay(() => {
    assertReason(reason);
    const target = findUser(userId);
    if (role === 'usuario' && target.role === 'admin') {
      const admins = users.filter((item) => item.role === 'admin').length;
      if (admins <= 1) {
        throw new ApiError(
          422,
          'BUSINESS_RULE',
          'Debe existir al menos un administrador (LAST_ADMIN).',
        );
      }
    }
    target.role = role;
    return toDetail(target);
  });
}

export function listHostEnablements(): Promise<HostEnablementRow[]> {
  return delay(() =>
    users
      .filter((item) => item.hostEnablement)
      .map((item) => ({
        userId: item.id,
        fullName: item.fullName,
        reason: item.hostEnablement?.reason ?? '',
        grantedBy: item.hostEnablement?.by ?? '',
        grantedAt: item.hostEnablement?.at ?? '',
      })),
  );
}

export function grantHostEnablement(userId: string, reason: string): Promise<HostEnablementRow> {
  return delay(() => {
    const text = assertReason(reason) as string;
    const target = findUser(userId);
    if (target.hostEnablement) {
      throw new ApiError(409, 'CONFLICT', 'La persona ya está habilitada como titular.');
    }
    const at = new Date().toISOString();
    target.hostEnablement = { reason: text, by: 'Camila Fuentes', at };
    return {
      userId: target.id,
      fullName: target.fullName,
      reason: text,
      grantedBy: 'Camila Fuentes',
      grantedAt: at,
    };
  });
}

export function revokeHostEnablement(userId: string, reason: string): Promise<void> {
  return delay(() => {
    assertReason(reason);
    const target = findUser(userId);
    if (!target.hostEnablement) {
      throw new ApiError(409, 'INVALID_TRANSITION', 'La habilitación ya no está vigente.');
    }
    target.hostEnablement = null;
  });
}

export function getStats(): Promise<AdminStats> {
  return delay(() => ({
    users: {
      total: users.length + 79,
      newThisMonth: 12,
      active30d: 64,
    },
    groups: { active: 24, closed: 6 },
    charges: {
      period: '2026-10',
      byStatus: { pendiente: 14, en_revision: 9, pagado: 61, atrasado: 3, cancelado: 2 },
      managedCents: 1842500,
    },
    punctualityRate: 0.93,
    topServices: [
      { name: 'Netflix', groups: 7 },
      { name: 'Spotify Familiar', groups: 5 },
      { name: 'Prime Video', groups: 4 },
    ],
    listings: { active: 5 },
    joinRequestsThisMonth: 31,
    disputesOpen: 2,
  }));
}

export function transferOwnership(
  groupId: string,
  toUserId: string,
  reason: string,
): Promise<void> {
  return delay(() => {
    assertReason(reason);
    findUser(toUserId);
    if (!groupId) throw new ApiError(404, 'NOT_FOUND', 'Grupo no encontrado.');
  });
}
