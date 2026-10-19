import { maskCi } from './ci-mask.js';

/** Lo que ve la propia persona (contrato de la spec 003). Nunca incluye hash ni CI en claro. */
export interface UserSelf {
  id: string;
  fullName: string;
  email: string;
  ciMasked: string;
  phone: string;
  role: 'usuario' | 'admin';
  status: 'activo';
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserSelfRow {
  id: string;
  full_name: string;
  email: string;
  phone_e164: string | null;
  role: 'usuario' | 'admin';
  last_login_at: Date | null;
  created_at: Date;
}

export function toUserSelf(row: UserSelfRow, ci: string): UserSelf {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    ciMasked: maskCi(ci),
    phone: row.phone_e164 ?? '',
    role: row.role,
    status: 'activo',
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}
