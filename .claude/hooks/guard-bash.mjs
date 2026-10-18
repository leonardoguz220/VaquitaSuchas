// PreToolUse (Bash). Bloquea comandos que rompen las reglas del equipo:
// - push directo a main o push forzado (RF-000-02, CONTRIBUTING.md §5);
// - saltarse los hooks de git (--no-verify);
// - leer archivos con secretos desde la terminal;
// - db:reset, db:restore, db:migrate o db:seed contra una base que no es la local (RF-000-21: staging migra por workflow).
import { readInput, isSecretPath, git, denyPreToolUse } from './lib.mjs';

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
    const pushesMain = /(\s|:)main(\s|$)/.test(part);
    const hasRefspec = part.split(/\s+/).filter((t) => !t.startsWith('-')).length > 3;
    if (pushesMain || (!hasRefspec && git(['rev-parse', '--abbrev-ref', 'HEAD']) === 'main')) {
      denyPreToolUse('main está protegida: no se hace push directo. Trabaja en una rama y abre un PR (CONTRIBUTING.md §5).');
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

function isLocalDatabase(url) {
  try {
    const host = new URL(url).hostname;
    return ['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'db'].includes(host);
  } catch {
    return false;
  }
}
