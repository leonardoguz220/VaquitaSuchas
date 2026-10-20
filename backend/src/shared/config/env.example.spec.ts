import { readFileSync } from 'node:fs';
import { validateEnv } from './env.validation.js';

// RF-000-03: backend/.env.example documenta todas las variables y no trae valores reales.

const ENV_EXAMPLE = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');

/** Nombres que `validateEnv` reporta como inválidos o faltantes (una línea «  - NOMBRE: …» cada uno). */
function reportedNames(env: Record<string, unknown>): string[] {
  try {
    validateEnv(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return [...message.matchAll(/^\s+- ([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1]);
  }
  return [];
}

/** Variables activas de un .env (líneas `NOMBRE=valor`; los comentarios se ignoran). */
function parseEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  }
  return env;
}

describe('backend/.env.example', () => {
  it('RF-000-03: declara todas las variables que valida validateEnv, incluidas las del modo prod', () => {
    const validated = new Set([
      ...reportedNames({}),
      ...reportedNames({
        MAIL_MODE: 'prod',
        TELEGRAM_MODE: 'prod',
        STORAGE_DRIVER: 'supabase',
      }),
    ]);
    const documented = new Set(
      [...ENV_EXAMPLE.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]),
    );

    expect(validated.size).toBeGreaterThan(0);
    expect([...validated].filter((name) => !documented.has(name))).toEqual([]);
  });

  it('RF-000-03: no trae valores reales, así que validateEnv lo rechaza tal cual', () => {
    expect(() => validateEnv(parseEnv(ENV_EXAMPLE))).toThrow(/DATABASE_URL/);
  });
});
