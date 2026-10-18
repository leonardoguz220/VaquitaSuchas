// RF-000-01: el paquete database corre sus pruebas con node:test + pg contra el PostgreSQL local.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { testDatabaseUrl } from '../src/config.ts';

test('RF-000-01: conecta a la base de pruebas y responde SELECT 1', async () => {
  const client = new pg.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<{ ok: number }>('SELECT 1 AS ok');
    assert.equal(rows[0]?.ok, 1);
  } finally {
    await client.end();
  }
});
