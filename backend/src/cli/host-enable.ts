import { Pool, type PoolClient } from 'pg';
import { requireReason } from '../modules/admin/services/admin-errors.js';

// Habilita a un titular desde la consola: `npm run host:enable -w backend -- <correo> "<motivo>"`
// (spec 009 T020, RF-009-21). Registra la auditoría a nombre del administrador del seed
// (SEED_ADMIN_EMAIL o, si falta, el primer administrador). No imprime correos ni motivos.
export class HostEnableError extends Error {}

export async function hostEnable(
  client: Pick<PoolClient, 'query'>,
  input: { email: string; reason: string; adminEmail?: string },
): Promise<'enabled' | 'already'> {
  let reason: string;
  try {
    reason = requireReason(input.reason);
  } catch {
    throw new HostEnableError('El motivo debe tener entre 10 y 300 caracteres.');
  }
  await client.query('BEGIN');
  try {
    const user = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE lower(email) = lower($1) FOR UPDATE',
      [input.email.trim()],
    );
    if (!user.rows[0]) throw new HostEnableError('No existe un usuario con ese correo.');
    const admin = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'admin' AND status = 'activo'
         AND ($1::text IS NULL OR lower(email) = lower($1))
       ORDER BY created_at LIMIT 1`,
      [input.adminEmail?.trim() || null],
    );
    if (!admin.rows[0]) throw new HostEnableError('No hay un administrador activo para auditar.');
    const userId = user.rows[0].id;
    const adminId = admin.rows[0].id;
    const active = await client.query(
      'SELECT 1 FROM host_enablements WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );
    if (active.rowCount) {
      await client.query('ROLLBACK');
      return 'already';
    }
    const saved = await client.query<{ id: string }>(
      `INSERT INTO host_enablements (user_id, reason, enabled_by) VALUES ($1, $2, $3) RETURNING id`,
      [userId, reason, adminId],
    );
    await client.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, reason, metadata)
       VALUES ($1, 'titular_habilitar', 'user', $2, $3, $4::jsonb)`,
      [adminId, userId, reason, JSON.stringify({ enablementId: saved.rows[0]!.id })],
    );
    await client.query('COMMIT');
    return 'enabled';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function main(): Promise<void> {
  const [email, reason] = process.argv.slice(2);
  const connectionString = process.env['DATABASE_URL']?.trim();
  if (!connectionString) throw new HostEnableError('Falta la variable DATABASE_URL.');
  if (!email || !reason) throw new HostEnableError('Uso: host:enable <correo> "<motivo>".');
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    const result = await hostEnable(client, {
      email,
      reason,
      adminEmail: process.env['SEED_ADMIN_EMAIL'],
    });
    process.stdout.write(
      result === 'enabled' ? 'Titular habilitado.\n' : 'Ya tenía una habilitación vigente.\n',
    );
  } finally {
    client.release();
    await pool.end();
  }
}

// Solo se ejecuta como programa, no al importarlo en pruebas.
if (process.argv[1]?.endsWith('host-enable.js')) {
  main().catch((error: Error) => {
    process.stderr.write(`${error instanceof HostEnableError ? error.message : error.name}\n`);
    process.exitCode = 1;
  });
}
