// Utilidades comunes de los hooks de Claude Code de Vaquita.
// Sin dependencias: solo Node.js, para que funcionen igual en Windows, macOS y Linux.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function readInput() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  try {
    return JSON.parse(data || '{}');
  } catch {
    return {};
  }
}

// Ruta relativa a la raíz del repo, con barras normales. Fuera del repo empieza con "../".
export function relPath(filePath) {
  const rel = path.relative(ROOT, path.resolve(ROOT, filePath));
  return rel.split(path.sep).join('/');
}

export function isInsideRepo(rel) {
  return rel !== '' && !rel.startsWith('../') && !path.isAbsolute(rel);
}

// Archivos con secretos: .env y variantes (salvo .env.example) y credenciales.
export function isSecretPath(rel) {
  const base = rel.split('/').pop() ?? '';
  if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') return true;
  if (/\.(pem|key|p12|pfx)$/i.test(base)) return true;
  if (/^serviceAccount.*\.json$/i.test(base)) return true;
  if (/-service-account.*\.json$/i.test(base)) return true;
  if (/-firebase-adminsdk-.*\.json$/i.test(base)) return true;
  return false;
}

export function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

// ¿El archivo ya existe en main (local u origin)? Sirve para saber si una migración está aplicada.
export function existsInMain(rel) {
  return ['origin/main', 'main'].some((ref) => git(['cat-file', '-e', `${ref}:${rel}`]) !== null);
}

export function denyPreToolUse(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

export function noticePreToolUse(message) {
  process.stdout.write(
    JSON.stringify({
      systemMessage: message,
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: message },
    }),
  );
  process.exit(0);
}
