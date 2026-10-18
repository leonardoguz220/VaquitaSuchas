// PreToolUse (Read, Edit, Write, MultiEdit, NotebookEdit).
// - Bloquea leer o escribir archivos con secretos (.env, claves, credenciales).
// - Bloquea editar una migración que ya está en main (RN-000-02: los cambios van en una migración nueva).
// - Avisa, sin bloquear, al tocar documentos que gobiernan a las tres capas o tests ligados a criterios CA.
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  readInput,
  relPath,
  isInsideRepo,
  isSecretPath,
  existsInMain,
  denyPreToolUse,
  noticePreToolUse,
} from './lib.mjs';

const input = await readInput();
const tool = input.tool_name;
const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
if (!filePath) process.exit(0);

const rel = relPath(filePath);

if (isSecretPath(rel)) {
  denyPreToolUse(
    `"${rel}" puede contener secretos y los agentes no lo leen ni lo escriben (CLAUDE.md §8, constitución IV). ` +
      'Usa el .env.example correspondiente; los valores reales los carga cada persona a mano.',
  );
}

if (tool === 'Read' || !isInsideRepo(rel)) process.exit(0);

if (/^database\/migrations\/[^/]+\.sql$/.test(rel) && existsInMain(rel)) {
  denyPreToolUse(
    `La migración "${rel}" ya está en main y no se edita (RN-000-02, database/CLAUDE.md). ` +
      'Crea una migración nueva con el siguiente número del rango de la spec (database/README.md).',
  );
}

const governing = [
  [/^specs\/[^/]+\/spec\.md$/, 'una spec'],
  [/^specs\/[^/]+\/data-model\.md$/, 'el modelo de datos congelado'],
  [/^specs\/[^/]+\/contracts\//, 'el contrato de API congelado'],
  [/^\.specify\/memory\/constitution\.md$/, 'la constitución'],
  [/^CLAUDE\.md$/, 'el CLAUDE.md raíz'],
  [/^context\//, 'el contexto compartido'],
];
for (const [pattern, what] of governing) {
  if (pattern.test(rel)) {
    noticePreToolUse(
      `Aviso Vaquita: estás cambiando ${what} (${rel}). Según CLAUDE.md §2 el cambio va en un PR, ` +
        'en el mismo PR que el código que lo motiva, y se avisa a las otras capas (BD, BE, FE).',
    );
  }
}

const isTest = /(\.spec|\.test|\.e2e-spec)\.(ts|tsx|js|mjs)$/.test(rel);
if (isTest && tool !== 'Write' && existsSync(path.join(ROOT, rel))) {
  noticePreToolUse(
    `Aviso Vaquita: editas un test existente (${rel}). No debilites ni quites aserciones ligadas a un CA-xxx; ` +
      'si el criterio cambió, se actualiza primero la spec (CLAUDE.md §2.4 y §2.5).',
  );
}
