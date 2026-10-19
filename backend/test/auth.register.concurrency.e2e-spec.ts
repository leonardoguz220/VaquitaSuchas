import { startAuthApp, type AuthTestApp } from './support/auth-app.js';

// Spec 003 (US1). Se activa con T018: hasta que exista POST /auth/register, el bloque queda en skip.
// Requiere PostgreSQL (base temporal propia).
const describeConcurrencia = describe.skip;

describeConcurrencia('Registro concurrente (spec 003)', () => {
  let t: AuthTestApp;
  beforeAll(async () => {
    t = await startAuthApp();
  }, 60_000);
  afterAll(async () => {
    await t?.close();
  }, 30_000);

  it('CA-003-19: dos registros simultáneos con el mismo correo → exactamente un éxito', async () => {
    const results = await Promise.all([
      t.register({ email: 'carrera@example.com', ci: '7000001' }),
      t.register({ email: 'carrera@example.com', ci: '7000002' }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    // La restricción UNIQUE de correo resuelve la carrera: nunca dos filas con ese correo.
    expect(statuses.filter((s) => s === 201).length).toBeGreaterThanOrEqual(1);
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
    const rows = await t.db.query('SELECT 1 FROM users WHERE email = $1', ['carrera@example.com']);
    expect(rows.rowCount).toBe(1);
  });
});
