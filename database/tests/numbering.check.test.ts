// Implementa la prueba `numbering.check` de data-model.md §4 (tasks.md T013 la nombra
// numbering.check.ts; lleva .test.ts para que la ejecute el runner de `npm run test`).
// RN-000-02 y spec 000 §8 "Dos integrantes crean migraciones con el mismo número": src/check.ts
// detecta prefijos repetidos, nombres mal formados y migraciones de la rama base editadas o borradas.
// Las pruebas de git usan un repositorio temporal en os.tmpdir(); el repositorio real no se toca.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { checkNumbering, checkUnchanged, resolveBase } from '../src/check.ts';

const execFileAsync = promisify(execFile);
const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));

describe('checkNumbering', () => {
  test('RN-000-02 / spec 000 §8: dos migraciones con el mismo prefijo se reportan', () => {
    const problems = checkNumbering(['0001_init.sql', '0002_job_runs.sql', '0002_other.sql']);
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? '', /0002/);
    assert.match(problems[0] ?? '', /0002_job_runs\.sql/);
    assert.match(problems[0] ?? '', /0002_other\.sql/);
  });

  test('RN-000-02: un nombre con mayúsculas se reporta', () => {
    const problems = checkNumbering(['0005_AddUsers.sql']);
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? '', /0005_AddUsers\.sql/);
  });

  test('RN-000-02: un nombre sin guion bajo tras el número se reporta', () => {
    assert.equal(checkNumbering(['0005-users.sql']).length, 1);
    assert.equal(checkNumbering(['0005users.sql']).length, 1);
  });

  test('RN-000-02: un prefijo de 3 dígitos se reporta', () => {
    const problems = checkNumbering(['001_init.sql']);
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? '', /001_init\.sql/);
  });

  test('RN-000-02: nombres correctos no dan problemas e ignora lo que no es .sql', () => {
    assert.deepEqual(
      checkNumbering([
        '.gitkeep',
        '0001_init.sql',
        '0002_job_runs.sql',
        'README.md',
        '0010_users.sql',
      ]),
      [],
    );
  });

  test('RN-000-02: la carpeta real database/migrations no tiene problemas de numeración', async () => {
    assert.deepEqual(checkNumbering(await readdir(migrationsDir)), []);
  });
});

describe('resolveBase', () => {
  test('usa --base, luego DB_CHECK_BASE y por defecto origin/main', () => {
    assert.equal(resolveBase(['--base', 'origin/dev'], {}), 'origin/dev');
    assert.equal(resolveBase(['--base=main'], { DB_CHECK_BASE: 'x' }), 'main');
    assert.equal(resolveBase([], { DB_CHECK_BASE: 'origin/qa' }), 'origin/qa');
    assert.equal(resolveBase([], {}), 'origin/main');
  });
});

describe('checkUnchanged (repositorio git temporal)', () => {
  const FILE = '0001_a.sql';
  const CONTENT = 'CREATE TABLE a (id uuid PRIMARY KEY);\nSELECT 1;\n';
  let repo: string;
  let migrations: string;

  const git = async (...args: string[]): Promise<void> => {
    await execFileAsync('git', args, { cwd: repo, windowsHide: true });
  };

  before(async () => {
    repo = await mkdtemp(path.join(tmpdir(), 'vaquita-dbcheck-'));
    migrations = path.join(repo, 'database', 'migrations');
    await mkdir(migrations, { recursive: true });
    const hooks = path.join(repo, '.no-hooks');
    await mkdir(hooks);

    await git('init', '--quiet');
    await git('symbolic-ref', 'HEAD', 'refs/heads/main');
    await git('config', 'user.name', 'Vaquita Test');
    await git('config', 'user.email', 'test@example.com');
    await git('config', 'core.autocrlf', 'false');
    await git('config', 'commit.gpgsign', 'false');
    await git('config', 'core.hooksPath', hooks);

    await writeFile(path.join(migrations, FILE), CONTENT, 'utf8');
    await writeFile(path.join(migrations, '.gitkeep'), '', 'utf8');
    await git('add', 'database/migrations');
    await git('commit', '--quiet', '-m', 'add migration');
  });

  beforeEach(async () => {
    await writeFile(path.join(migrations, FILE), CONTENT, 'utf8');
  });

  after(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  test('RN-000-02: sin cambios no hay problemas (también desde una subcarpeta)', async () => {
    assert.deepEqual(await checkUnchanged('main', repo), []);
    assert.deepEqual(await checkUnchanged('main', migrations), []);
  });

  test('RN-000-02: una migración de main editada se reporta', async () => {
    await writeFile(path.join(migrations, FILE), `${CONTENT}SELECT 2;\n`, 'utf8');
    const problems = await checkUnchanged('main', repo);
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? '', /0001_a\.sql/);
    assert.match(problems[0] ?? '', /editada/);
  });

  test('RN-000-02: cambiar solo LF por CRLF no cuenta como edición', async () => {
    await writeFile(path.join(migrations, FILE), CONTENT.replace(/\n/g, '\r\n'), 'utf8');
    assert.deepEqual(await checkUnchanged('main', repo), []);
  });

  test('RN-000-02: una migración de main borrada se reporta', async () => {
    await unlink(path.join(migrations, FILE));
    const problems = await checkUnchanged('main', repo);
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? '', /0001_a\.sql/);
    assert.match(problems[0] ?? '', /borrada/);
  });

  test('RN-000-02: una migración nueva que no está en main no se reporta', async () => {
    const extra = path.join(migrations, '0002_b.sql');
    await writeFile(extra, 'SELECT 2;\n', 'utf8');
    try {
      assert.deepEqual(await checkUnchanged('main', repo), []);
    } finally {
      await unlink(extra);
    }
  });

  test('RN-000-02: una referencia base inexistente da un problema claro y no lanza', async () => {
    const problems = await checkUnchanged('origin/does-not-exist', repo);
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? '', /origin\/does-not-exist/);
    assert.match(problems[0] ?? '', /no existe/);
  });

  test('RN-000-02: una referencia que parece opción se rechaza', async () => {
    const problems = await checkUnchanged('--output=x', repo);
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? '', /no es válida/);
  });

  test('RN-000-02: una carpeta fuera de un repositorio da un problema y no lanza', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'vaquita-nogit-'));
    try {
      const problems = await checkUnchanged('main', outside);
      assert.equal(problems.length, 1);
      assert.match(problems[0] ?? '', /repositorio git/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
