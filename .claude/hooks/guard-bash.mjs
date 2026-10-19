// PreToolUse (Bash). Bloquea comandos que rompen las reglas del equipo:
// - push directo a main, dev o qa, o push forzado (RF-000-02, CONTRIBUTING.md §5);
// - push de una rama cuyo lint o tests fallan en las capas que cambió (definición de terminado, CLAUDE.md §8);
// - saltarse los hooks de git (--no-verify);
// - leer archivos con secretos desde la terminal;
// - modificar desde la terminal los hooks, los agentes o settings.json de Claude Code;
// - db:reset, db:restore, db:migrate o db:seed contra una base que no es la local (RF-000-21: staging migra por workflow).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, readInput, isSecretPath, git, denyPreToolUse } from './lib.mjs';

const PROTECTED_BRANCHES = ['main', 'dev', 'qa'];
const PROTECTED_PUSH = new RegExp(`(?:\\s|:)(${PROTECTED_BRANCHES.join('|')})(?:\\s|$)`);
const WORKSPACES = ['database', 'backend', 'frontend'];
const CLAUDE_CONFIG = String.raw`\.claude[\\/](?:hooks|agents|settings\.json)`;

const input = await readInput();
const cmd = input.tool_input?.command;
if (typeof cmd !== 'string' || cmd.trim() === '') process.exit(0);

// Cada comando de una cadena (a && b; c | d) se revisa por separado.
const parts = cmd.split(/&&|\|\||;|\||\n/).map((s) => s.trim()).filter(Boolean);

for (const part of parts) {
  if (/\bgit\b.*\s--no-verify\b/.test(part)) {
    denyPreToolUse('No se usa --no-verify: los hooks de git y los checks de CI son obligatorios (CLAUDE.md §8).');
  }

  if (/\bgit\s+push\b/.test(part)) {
    if (/\s(--force(?!-with-lease)|-f)(\s|$)/.test(part)) {
      denyPreToolUse('Push forzado bloqueado. Si de verdad hace falta en tu propia rama, usa --force-with-lease a mano.');
    }
    const target = part.match(PROTECTED_PUSH)?.[1];
    const hasRefspec = part.split(/\s+/).filter((t) => !t.startsWith('-')).length > 3;
    const current = hasRefspec ? null : git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = target ?? (PROTECTED_BRANCHES.includes(current) ? current : null);
    if (branch) {
      denyPreToolUse(`${branch} está protegida: no se hace push directo. Trabaja en una rama y abre un PR (CONTRIBUTING.md §5).`);
    }
    checkBeforePush(part);
  }

  if (process.env.VAQUITA_ALLOW_CLAUDE_CONFIG !== '1') {
    const writesConfig =
      new RegExp(`>>?\\s*["']?\\S*${CLAUDE_CONFIG}`).test(part) ||
      new RegExp(`\\b(sed\\s+-i|tee|cp|mv|rm|truncate|Set-Content|Add-Content|Out-File|Remove-Item)\\b.*${CLAUDE_CONFIG}`, 'i').test(part) ||
      new RegExp(`\\bgit\\s+(checkout|restore)\\b.*${CLAUDE_CONFIG}`).test(part);
    if (writesConfig) {
      denyPreToolUse(
        'Los hooks, los agentes y .claude/settings.json no los modifica un agente. ' +
          'Un cambio ahí lo hace una persona por PR (ia/herramientas-y-skills.md §7).',
      );
    }
  }

  if (/^(\S+\/)?(cat|type|less|more|head|tail|bat|grep|rg|sed|awk|strings|xxd|od|base64|Get-Content|gc)\b/i.test(part)) {
    const tokens = part.split(/\s+/).map((t) => t.replace(/^['"]|['"]$/g, ''));
    const secret = tokens.slice(1).find((t) => !t.startsWith('-') && isSecretPath(t.replaceAll('\\', '/')));
    if (secret) {
      denyPreToolUse(`"${secret}" puede contener secretos y los agentes no lo leen. Usa el .env.example correspondiente.`);
    }
  }

  if (/\bnpm\s+run\s+db:(reset|restore|migrate|seed)\b/.test(part)) {
    const inline = cmd.match(/DATABASE_URL=("[^"]*"|'[^']*'|\S+)/)?.[1]?.replace(/^['"]|['"]$/g, '');
    const url = inline ?? process.env.DATABASE_URL;
    if (url && !isLocalDatabase(url)) {
      denyPreToolUse(
        'db:reset, db:restore, db:migrate y db:seed solo corren contra la base local desde un agente. ' +
          'Staging se migra con el workflow manual "Migrate staging" (RF-000-21).',
      );
    }
  }
}

// Antes de subir una rama, corre lint y tests de cada capa que cambió respecto de dev.
// Se omite en --dry-run, al borrar ramas y si la persona exportó VAQUITA_PREPUSH=0 antes de abrir Claude Code
// (una variable puesta dentro del mismo comando no cuenta: el hook lee su propio entorno).
function checkBeforePush(part) {
  if (/\s(--dry-run|-n|--delete|-d)(\s|$)/.test(part) || /\s:\S/.test(part)) return;
  if (process.env.VAQUITA_PREPUSH === '0') return;

  const base = ['origin/dev', 'origin/main'].find((ref) => git(['rev-parse', '--verify', '--quiet', ref]) !== null);
  if (!base) return;
  const changed = (git(['diff', '--name-only', `${base}...HEAD`]) ?? '').split('\n').filter(Boolean);
  const touched = WORKSPACES.filter((ws) => changed.some((file) => file.startsWith(`${ws}/`)));
  const runnable = touched.filter((ws) => existsSync(path.join(ROOT, ws, 'package.json')));
  if (runnable.length === 0) return;

  if (!existsSync(path.join(ROOT, 'node_modules'))) {
    denyPreToolUse('Antes del push hay que correr lint y tests, pero faltan las dependencias. Corre npm install y vuelve a intentarlo.');
  }

  const failures = [];
  for (const ws of runnable) {
    for (const script of ['lint', 'test']) {
      const result = spawnSync(`npm run ${script} -w ${ws} --if-present`, {
        cwd: ROOT,
        shell: true,
        encoding: 'utf8',
        timeout: 180_000,
        env: { ...process.env, CI: 'true' },
      });
      if (result.status !== 0) {
        const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-25).join('\n');
        failures.push(`npm run ${script} -w ${ws}:\n${output || result.error?.message || 'falló sin salida'}`);
      }
    }
  }
  if (failures.length > 0) {
    denyPreToolUse(
      'Push bloqueado: fallan el lint o los tests de las capas que cambiaste. Corrige el código (no los tests ni los hooks), ' +
        `haz un commit nuevo y vuelve a intentar el push.\n\n${failures.join('\n\n')}`,
    );
  }
}

function isLocalDatabase(url) {
  try {
    const host = new URL(url).hostname;
    return ['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'db'].includes(host);
  } catch {
    return false;
  }
}
