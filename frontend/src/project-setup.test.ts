/** @jest-environment node */
// Estructura del frontend y variables de entorno de ejemplo (T005).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const FRONTEND_ROOT = path.resolve(__dirname, '..');

describe('estructura del frontend (T005)', () => {
  it.each([
    'src/app',
    'src/components/ui',
    'src/components/features',
    'src/hooks',
    'src/services',
    'src/lib',
    'e2e',
  ])('RF-000-01 existe la carpeta %s de la estructura por capas (plan 000 §6)', (folder) => {
    expect(existsSync(path.join(FRONTEND_ROOT, folder))).toBe(true);
  });
});

describe('frontend/.env.example (T005)', () => {
  const envExample = readFileSync(path.join(FRONTEND_ROOT, '.env.example'), 'utf8');
  const variables = envExample
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  it('RF-000-03 declara BACKEND_URL', () => {
    expect(variables.some((line) => line.startsWith('BACKEND_URL='))).toBe(true);
  });

  it('RF-000-03 no trae valores reales: toda variable queda vacía', () => {
    for (const line of variables) {
      expect(line).toMatch(/^[A-Z][A-Z0-9_]*=$/);
    }
  });
});
