import { randomBytes } from 'node:crypto';
import type request from 'supertest';
import { MailService, type MailMessage } from '../../src/shared/ports/mail.service.js';
import type { AuthTestApp } from './auth-app.js';
import { jest } from '@jest/globals';

// Utilidades de las e2e de administración (spec 009). Las contraseñas se generan en cada corrida.

export interface AdminActor {
  id: string;
  email: string;
  password: string;
  token: string;
}

export const randomPassword = (): string => randomBytes(12).toString('hex');

/** Cuenta con rol `admin` ya con sesión iniciada. */
export async function createAdmin(t: AuthTestApp): Promise<AdminActor> {
  const password = randomPassword();
  const user = await t.createUser({ password });
  await t.db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [user.id]);
  const login = await t.login(user.email, password);
  return { id: user.id, email: user.email, password, token: login.body.sessionToken as string };
}

export const asAdmin = (t: AuthTestApp, admin: AdminActor, method: 'get' | 'post', url: string) =>
  t.http()[method](url).set('Authorization', `Bearer ${admin.token}`) as request.Test;

/** Sustituye el envío real de correo por un doble; devuelve los mensajes «enviados». */
export function spyOnMail(t: AuthTestApp, failWith?: Error) {
  const sent: MailMessage[] = [];
  const spy = jest.spyOn(t.app.get(MailService), 'send').mockImplementation((message) => {
    if (failWith) return Promise.reject(failWith);
    sent.push(message);
    return Promise.resolve();
  });
  return { sent, spy };
}

let groupSeq = 0;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Grupo activo con su titular como miembro (SQL directo en una transacción: no depende del catálogo). */
export async function insertGroup(t: AuthTestApp, ownerId: string): Promise<string> {
  groupSeq += 1;
  const code = Array.from(randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  const client = await t.db.connect();
  try {
    await client.query('BEGIN');
    const group = await client.query<{ id: string }>(
      `INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency,
                           billing_day, total_slots, invite_code)
       VALUES ($1, $2, 'Servicio', 10001, 'BS', 15, 5, $3) RETURNING id`,
      [ownerId, `Grupo ${groupSeq}`, code],
    );
    const id = group.rows[0]!.id;
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role, join_source)
       VALUES ($1, $2, 'titular', 'creacion')`,
      [id, ownerId],
    );
    await client.query('COMMIT');
    return id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Miembro de un grupo: `join_source = 'solicitud'` exige una solicitud (se deja cerrada). */
export async function addMember(t: AuthTestApp, groupId: string, userId: string): Promise<void> {
  const requestId = await openJoinRequest(t, groupId, userId);
  await t.db.query(
    `UPDATE join_requests SET status = 'cancelada', final_at = now(),
            final_reason = 'cancelada_solicitante', version = version + 1 WHERE id = $1`,
    [requestId],
  );
  await t.db.query(
    `INSERT INTO group_members (group_id, user_id, role, join_source, join_request_id)
     VALUES ($1, $2, 'miembro', 'solicitud', $3)`,
    [groupId, userId, requestId],
  );
}

/** Solicitud de ingreso abierta. */
export async function openJoinRequest(
  t: AuthTestApp,
  groupId: string,
  applicantId: string,
): Promise<string> {
  const inserted = await t.db.query<{ id: string }>(
    `INSERT INTO join_requests (group_id, applicant_id, opened_at, open_deadline_at)
     VALUES ($1, $2, now(), now() + interval '1 day') RETURNING id`,
    [groupId, applicantId],
  );
  const id = inserted.rows[0]!.id;
  await t.db.query(
    `INSERT INTO join_request_events (request_id, type, actor_kind, actor_id, to_status, occurred_at)
     VALUES ($1, 'abierta', 'usuario', $2, 'abierta', now())`,
    [id, applicantId],
  );
  return id;
}

export async function statusOf(t: AuthTestApp, userId: string): Promise<string> {
  const r = await t.db.query<{ status: string }>('SELECT status FROM users WHERE id = $1', [
    userId,
  ]);
  return r.rows[0]!.status;
}

export async function auditActions(t: AuthTestApp, targetId: string): Promise<string[]> {
  const r = await t.db.query<{ action: string }>(
    'SELECT action FROM admin_audit_log WHERE target_id = $1 ORDER BY occurred_at, id',
    [targetId],
  );
  return r.rows.map((row) => row.action);
}
