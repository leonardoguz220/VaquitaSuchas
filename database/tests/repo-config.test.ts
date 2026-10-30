// Spec 000, criterios de configuración del repositorio (CA-000-13, CA-000-15, CA-000-16, CA-000-18).
// La protección de rama vive en GitHub; estas pruebas verifican lo que el repo sí controla: que CI
// declare los checks que la protección exige, que el flujo de ramas se imponga y que `.env` esté ignorado.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file: string): string => readFileSync(root + file, 'utf8');

describe('configuración del repositorio (spec 000)', () => {
  const ci = read('.github/workflows/ci.yml');

  test('CA-000-13: CI corre lint, build y las pruebas de cada capa en cada PR a main, qa y dev', () => {
    assert.match(ci, /pull_request:\s*\n\s*branches: \[main, qa, dev\]/);
    for (const job of ['lint', 'build', 'test-database', 'test-backend', 'test-frontend']) {
      assert.match(ci, new RegExp(`^  ${job}:`, 'm'), `falta el job ${job}`);
    }
  });

  test('CA-000-15: el check `flow` de branch-flow impone dev → qa → main sobre los PR', () => {
    const flow = read('.github/workflows/branch-flow.yml');
    assert.match(flow, /branches: \[main, qa, dev\]/);
    assert.match(flow, /name: flow/);
  });

  test('CA-000-16: los archivos .env reales están ignorados por git', () => {
    for (const file of ['backend/.env', 'frontend/.env.local']) {
      assert.doesNotThrow(
        () => execFileSync('git', ['check-ignore', '-q', file], { cwd: root }),
        file,
      );
    }
    assert.throws(() =>
      execFileSync('git', ['check-ignore', '-q', 'backend/.env.example'], { cwd: root }),
    );
  });

  test('CA-000-18: CI corre gitleaks sobre el diff del PR y un workflow semanal sobre el historial', () => {
    assert.match(ci, /^ {2}gitleaks:/m);
    assert.match(read('.github/workflows/gitleaks-weekly.yml'), /schedule:/);
  });
});
