// Spec 000 (CA-000-01, RNF-000-01; quickstart.md §1): sin DATABASE_URL ni TEST_DATABASE_URL, los
// scripts usan el PostgreSQL local de docker-compose.yml en el puerto DB_PORT, el mismo con el que
// se levantó la base (DB_PORT=5435 npm run db:up). Sin DB_PORT, el 5432.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { databaseUrl, testDatabaseUrl } from '../src/config.ts';

const KEYS = ['DATABASE_URL', 'TEST_DATABASE_URL', 'DB_PORT'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

test('CA-000-01: sin variables, las bases locales usan el puerto 5432', () => {
  assert.equal(databaseUrl(), 'postgres://vaquita:vaquita@localhost:5432/vaquita');
  assert.equal(testDatabaseUrl(), 'postgres://vaquita:vaquita@localhost:5432/vaquita_test');
});

test('CA-000-01: con DB_PORT, las bases locales usan ese puerto', () => {
  process.env.DB_PORT = '5435';
  assert.equal(databaseUrl(), 'postgres://vaquita:vaquita@localhost:5435/vaquita');
  assert.equal(testDatabaseUrl(), 'postgres://vaquita:vaquita@localhost:5435/vaquita_test');
});

test('CA-000-01: un DB_PORT que no es un puerto se rechaza en lugar de ir a otra base', () => {
  for (const port of ['abc', '0', '70000', '54 32']) {
    process.env.DB_PORT = port;
    assert.throws(() => databaseUrl(), /DB_PORT/);
  }
});

test('CA-000-01: DATABASE_URL y TEST_DATABASE_URL mandan sobre DB_PORT', () => {
  process.env.DB_PORT = '5435';
  process.env.DATABASE_URL = 'postgres://otra:otra@db:6543/dev';
  process.env.TEST_DATABASE_URL = 'postgres://otra:otra@db:6543/test';
  assert.equal(databaseUrl(), 'postgres://otra:otra@db:6543/dev');
  assert.equal(testDatabaseUrl(), 'postgres://otra:otra@db:6543/test');
});
