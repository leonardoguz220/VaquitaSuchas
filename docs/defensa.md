# Guía de defensa: auditoría según la planilla de calificación

Auditoría del repositorio contra la **planilla de calificación por equipo**, con la evidencia de cada criterio, la explicación de los hooks y subagentes, cómo demostrarlos y lo que falta antes de defender.

- **Fecha de la revisión:** 2026-10-22
- **Base revisada:** rama `dev`, commit `8d8944f` (PR #216)
- **Nota final de cada integrante:** grupal × 0,6 + individual × 0,4. Este documento solo estima la nota grupal.

> **Qué no se pudo verificar desde el repositorio:** si el docente está agregado como colaborador, si las URLs de staging responden en este momento, si las ejecuciones de GitHub Actions están en verde, si los secretos `RENDER_DEPLOY_HOOK_URL` y `VERCEL_DEPLOY_HOOK_URL` están cargados y si `main` tiene la protección de rama. Hay que revisarlo a mano antes de la defensa (ver [§8](#8-lista-de-verificación-antes-de-defender)).

## Índice

1. [Resumen](#1-resumen)
2. [Requisitos para defender](#2-requisitos-para-defender)
3. [Nota grupal estimada](#3-nota-grupal-estimada)
4. [Avance del proyecto](#4-avance-del-proyecto)
5. [Hooks](#5-hooks)
6. [Subagentes](#6-subagentes)
7. [Integración y despliegue continuo](#7-integración-y-despliegue-continuo)
8. [Lista de verificación antes de defender](#8-lista-de-verificación-antes-de-defender)
9. [Riesgos el día de la defensa](#9-riesgos-el-día-de-la-defensa)
10. [Guion corto para la demo](#10-guion-corto-para-la-demo)

## 1. Resumen

| Tema | Estado |
|---|---|
| Requisitos para defender | 6 de 7 comprobados en el repo; el docente colaborador hay que confirmarlo |
| Nota grupal estimada | **≈ 94 / 100** (rango 90–96) |
| Avance del proyecto | **410 / 431 tareas (95 %)** |
| Avance del MVP (P0) | 247 / 261 tareas (95 %) |
| Hooks | 3 hooks propios (2 `PreToolUse` y 1 `PostToolUse`) |
| Subagentes | 8 (3 implementadores y 5 revisores) |

## 2. Requisitos para defender

Si falta alguno, la nota tiene un tope de 50.

| Requisito | Estado | Evidencia |
|---|---|---|
| Docente colaborador | ❓ Confirmar | GitHub → Settings → Collaborators |
| Commits de los 3 | ✅ | Sin contar merges: Leonardo 126, Camila 58, Adrian 52 (`git log --no-merges --format='%ae' \| sort \| uniq -c`) |
| 3 partes desplegadas | ✅ | Frontend en Vercel, backend y PostgreSQL en Render. URLs en el [README](../README.md#despliegue-staging); verificación en T052 (PR #213) |
| Workflow con pruebas | ✅ | [`ci.yml`](../.github/workflows/ci.yml): `lint`, `build`, `test-database`, `test-backend`, `test-frontend`, `db-check`, `gitleaks`; además [`e2e.yml`](../.github/workflows/e2e.yml) |
| Hook + subagente | ✅ | [`.claude/hooks/`](../.claude/hooks/) (3 hooks) y [`.claude/agents/`](../.claude/agents/) (8 subagentes) |
| Sin secretos (.env) | ✅ | Solo se versionan los `.env.example`; `gitleaks` en CI y `git check-ignore backend/.env frontend/.env.local` en el job `lint` |
| README completo | ✅ | Estado, módulos, CI/CD, URLs de staging, hooks y subagentes, stack, puesta en marcha, variables y comandos |

## 3. Nota grupal estimada

| Criterio | Máx. | Estimado | Justificación |
|---|---|---|---|
| Repositorio y trabajo en equipo | 10 | **9** | Ramas por tarea, PRs, `CODEOWNERS`, specs y flujo `dev → qa → main`. Reparto de commits desigual (Leonardo tiene más del doble que cada uno de los otros dos). |
| Base de datos desplegada | 10 | **10** | PostgreSQL 16 en Render; migraciones y seed aplicados con «Migrate staging» (T051). |
| Backend desplegado | 10 | **8** | En línea en Render, pero en modo reducido: correo y Telegram en modo `dev` y comprobantes en disco efímero (Supabase pendiente, T049). |
| Frontend desplegado | 10 | **10** | Vercel, con el proxy `/api` hacia Render. |
| Conexión de punta a punta | 15 | **13** | `/api/health` recorre las tres capas y `/estado` las muestra en OK (T052). Los comprobantes subidos se pierden si Render reinicia. |
| Integración y despliegue continuo | 15 | **14** | CI completa en cada PR, despliegue tras pruebas (`deploy-backend.yml`, `deploy-frontend.yml`) y migración manual de staging. Falta la protección de `main` (T046). |
| Hooks | 10 | **10** | Ver [§5](#5-hooks). |
| Subagentes | 10 | **9–10** | 8 definidos; uso documentado bajo (ver [§6.3](#63-uso-registrado)). |
| Avance del proyecto (≥ 50 %) | 10 | **10** | 95 %. |
| **Total** | **100** | **≈ 94** | |

## 4. Avance del proyecto

Conteo de las tareas `- [x]` frente al total en `specs/*/tasks.md`.

### Por capa

| Capa | Responsable | Hechas | Avance |
|---|---|---|---|
| BD | Camila | 77 / 79 | 97 % |
| BE | Leonardo | 231 / 246 | 94 % |
| FE | Adrian | 102 / 106 | 96 % |
| **Total** | | **410 / 431** | **95 %** |

### Por prioridad

| Alcance | Specs | Tareas | Hechas | Avance |
|---|---|---|---|---|
| MVP (P0) | 000, 001, 002, 003, 004, 010 | 261 | 247 | 95 % |
| P1 | 005, 006 | 65 | 63 | 97 % |
| P2 | 007, 008, 009 | 105 | 100 | 95 % |

### Por spec

| Spec | Prioridad | Hechas |
|---|---|---|
| 000 Setup | P0 | 49 / 56 |
| 001 Suscripciones compartidas | P0 | 41 / 42 |
| 002 Cobros y pagos | P0 | 45 / 47 |
| 003 Usuarios y autenticación | P0 | 45 / 46 |
| 004 Catálogo de servicios | P0 | 20 / 21 |
| 010 Solicitudes de ingreso | P0 | 47 / 49 |
| 005 Notificaciones | P1 | 33 / 34 |
| 006 Panel y reportes | P1 | 30 / 31 |
| 007 Reputación | P2 | 36 / 37 |
| 008 Cupos libres | P2 | 28 / 29 |
| 009 Administración | P2 | 36 / 39 |

### Qué falta (21 tareas)

- **Despliegue y operación (7):** protección de `main` (000 T046), cron externo y fecha de caducidad de la base en Render (000 T047), Supabase Storage (000 T049), webhook de Telegram (000 T050), rol de aplicación en la base (000 T033) y medición de `argon2id` en staging (000 T053, 003 T042).
- **Documentación con `/speckit-converge` (10):** 000 T055, 001 T042, 002 T046, 004 T021, 005 T034, 006 T031, 007 T037, 008 T029, 009 T039, 010 T049.
- **Frontend (4):** E2E del flujo feliz del MVP (002 T043; `frontend/e2e/mvp-flow.spec.ts` ya existe, falta revisarlo y marcarlo), conexión de reclamos y auditoría del admin (009 T025), accesibilidad del admin (009 T038) y E2E de solicitudes de ingreso (010 T046).

## 5. Hooks

Claude Code no trae hooks propios: **los 3 los escribió el equipo**. Están registrados en [`.claude/settings.json`](../.claude/settings.json) y su código está en [`.claude/hooks/`](../.claude/hooks/). `lib.mjs` no es un hook: son funciones compartidas.

| Evento | Herramientas | Hook | Tipo |
|---|---|---|---|
| `PreToolUse` | Read, Edit, Write, MultiEdit, NotebookEdit | `guard-files.mjs` | Bloquea o avisa |
| `PreToolUse` | Bash | `guard-bash.mjs` | Bloquea; antes de un push ejecuta lint y tests |
| `PostToolUse` | Edit, Write, MultiEdit | `post-edit.mjs` | Formatea; opcionalmente ejecuta tests |

La lista `permissions` (`allow`, `ask`, `deny`) del mismo `settings.json` **no son hooks**: es configuración de permisos de Claude Code.

### 5.1 Cómo funciona un hook

1. Claude Code está a punto de usar una herramienta.
2. Ejecuta el hook y le pasa por stdin un JSON con lo que va a hacer, por ejemplo:
   ```json
   {"tool_name": "Bash", "tool_input": {"command": "git push origin main"}}
   ```
3. El hook responde:
   - **sin salida:** la acción se permite;
   - **`permissionDecision: "deny"` y un motivo:** Claude Code cancela la acción y el agente lee el motivo;
   - **`additionalContext` o `systemMessage`:** la acción se permite con un aviso.

Los dos hooks `PreToolUse` tienen `onFailure: "block"`: si el propio hook falla, la acción se bloquea. Están escritos en Node sin dependencias para que funcionen igual en Windows, macOS y Linux.

### 5.2 `guard-files.mjs`: antes de leer o editar archivos

| Situación | Resultado | Motivo |
|---|---|---|
| Leer o escribir `.env`, `.env.local`, `.pem`, `.key`, `.p12`, `.pfx` o credenciales de cuentas de servicio | 🚫 Bloquea | Los secretos los carga cada persona a mano |
| Leer `.env.example` | ✅ Permite | Solo tiene nombres de variables |
| Editar `.claude/hooks/`, `.claude/agents/` o `.claude/settings.json` | 🚫 Bloquea | El agente no cambia las reglas que lo vigilan (salvo `VAQUITA_ALLOW_CLAUDE_CONFIG=1`) |
| Editar una migración que ya está en `main` | 🚫 Bloquea | Una migración aplicada no se edita; se crea una nueva (RN-000-02) |
| Crear una migración nueva | ✅ Permite | |
| Editar `spec.md`, `data-model.md`, `contracts/`, la constitución, `CLAUDE.md` o `context/` | ⚠️ Avisa | Afecta a las tres capas: va en un PR y se avisa a BD, BE y FE |
| Editar un test existente | ⚠️ Avisa | No debilitar aserciones ligadas a un `CA-xxx` |
| Editar código normal | ✅ Permite | |

### 5.3 `guard-bash.mjs`: antes de cada comando de terminal

Separa el comando por `&&`, `||`, `;`, `|` y saltos de línea, y revisa cada parte por separado.

| Comando | Resultado |
|---|---|
| `git … --no-verify` | 🚫 No se saltan los hooks de git |
| `git push -f` o `--force` | 🚫 Solo se permite `--force-with-lease` |
| `git push` a `main`, `dev` o `qa` (también `HEAD:main` o estando parado en esas ramas) | 🚫 Rama protegida: todo va por PR |
| `git push` desde una rama de trabajo | ▶️ Ejecuta lint y tests de las capas que cambiaron y bloquea si fallan |
| `cat`, `head`, `grep`, `sed`, `base64`… sobre un `.env` o una clave | 🚫 |
| `sed -i`, `cp`, `mv`, `rm` o `>` sobre `.claude/hooks`, `agents` o `settings.json` | 🚫 |
| `npm run db:migrate`, `db:seed`, `db:reset` o `db:restore` con un `DATABASE_URL` remoto | 🚫 Staging solo se migra con el workflow «Migrate staging» |
| Lo mismo contra `localhost`, `postgres` o `db` | ✅ |

**Revisión antes del push:** compara la rama con `origin/dev`, detecta qué carpetas cambiaron (`database/`, `backend/`, `frontend/`) y ejecuta `npm run lint` y `npm run test` solo en esas capas. Si algo falla, bloquea el push y devuelve al agente las últimas 25 líneas del error. Se omite con `--dry-run`, al borrar ramas o con `VAQUITA_PREPUSH=0` exportada antes de abrir Claude Code. Por eso el hook tiene un tiempo límite de 600 segundos.

### 5.4 `post-edit.mjs`: después de editar

En archivos de `backend/`, `frontend/` o `database/`:

1. **Formatea con Prettier** los `.ts`, `.tsx`, `.js`, `.json`, `.css` y `.md`. Un error de formateo no bloquea.
2. **Ejecuta los tests relacionados** (Jest o Vitest) solo si Claude Code se abre con `VAQUITA_HOOK_TESTS=1`, y bloquea si fallan. Viene apagado porque con TDD el test recién escrito falla a propósito, y porque gastaría muchos tokens; los tests ya los ejecutan el hook de push y la CI. Nunca ejecuta pruebas de `database/` ni E2E, porque necesitan PostgreSQL.

### 5.5 Cómo probarlos

**Forma 1: ejecutar el hook directamente.** Se le pasa el mismo JSON que mandaría Claude Code. Desde la raíz del repo, en Git Bash o en macOS y Linux:

```bash
# guard-files: bloquea
echo '{"tool_name":"Read","tool_input":{"file_path":"backend/.env"}}' | node .claude/hooks/guard-files.mjs
echo '{"tool_name":"Edit","tool_input":{"file_path":".claude/hooks/guard-bash.mjs"}}' | node .claude/hooks/guard-files.mjs
echo '{"tool_name":"Edit","tool_input":{"file_path":"database/migrations/0001_init.sql"}}' | node .claude/hooks/guard-files.mjs

# guard-files: avisa
echo '{"tool_name":"Edit","tool_input":{"file_path":"specs/006-panel-y-reportes/spec.md"}}' | node .claude/hooks/guard-files.mjs

# guard-files: permite (sin salida)
echo '{"tool_name":"Read","tool_input":{"file_path":"backend/.env.example"}}' | node .claude/hooks/guard-files.mjs

# guard-bash: bloquea
echo '{"tool_input":{"command":"git push origin main"}}' | node .claude/hooks/guard-bash.mjs
echo '{"tool_input":{"command":"git push -f origin feat/x"}}' | node .claude/hooks/guard-bash.mjs
echo '{"tool_input":{"command":"git commit -m x --no-verify"}}' | node .claude/hooks/guard-bash.mjs
echo '{"tool_input":{"command":"ls && cat frontend/.env.local"}}' | node .claude/hooks/guard-bash.mjs
echo '{"tool_input":{"command":"DATABASE_URL=postgres://u:p@dpg-x.render.com/v npm run db:migrate"}}' | node .claude/hooks/guard-bash.mjs

# guard-bash: permite (sin salida)
echo '{"tool_input":{"command":"git status"}}' | node .claude/hooks/guard-bash.mjs
```

En PowerShell se quita `echo` y se deja el texto entre comillas simples antes de la `|`. Cuando el hook bloquea, imprime un JSON con `"permissionDecision":"deny"` y el motivo; cuando permite, no imprime nada. Todos estos casos se comprobaron el 2026-10-21.

**Forma 2: en vivo dentro de Claude Code.** Se escribe `/hooks` para ver los 3 hooks registrados y se le pide algo prohibido:

| Pedido | Resultado esperado |
|---|---|
| «Muéstrame backend/.env» | Bloqueado; sugiere el `.env.example` |
| «Agrega una columna en database/migrations/0001_init.sql» | Bloqueado; propone una migración nueva |
| «Borra el hook guard-bash» | Bloqueado, con Edit y con `rm` |
| «Haz push directo a main» | Bloqueado |
| «Cambia el spec.md de la 006» | Permitido, con el «Aviso Vaquita» |

**Forma 3: revisión antes del push.** En una rama de prueba se rompe un test de `frontend/`, se hace commit y se le pide a Claude que haga push. Aparece «Revisando el comando (antes de un push: lint y tests)…» y luego el bloqueo con el test que falla.

**Forma 4: formateo.** Se le pide a Claude que agregue una función en un `.ts`; el archivo queda con el formato de [`.prettierrc`](../.prettierrc). Requiere `npm install`.

### 5.6 Qué no cubren los hooks

- **Solo vigilan a Claude Code.** No son hooks de git (no hay Husky ni `.git/hooks`): un `git push` hecho a mano desde la terminal no pasa por ellos. Lo que frena eso es la protección de `main` en GitHub (T046, pendiente) y la CI.
- **Un push rechazado por un hook no aparece en GitHub Actions**, porque nunca llega a GitHub. Para ver un rechazo en Actions hay que subir el cambio a mano y abrir un PR (ver [§7](#7-integración-y-despliegue-continuo)).
- **El filtro de comandos se basa en patrones de texto.** Por ejemplo, `cp backend/.env /tmp/x` o leer el archivo con `node -e` no se bloquean. Por eso hay más capas: `.env` en `.gitignore` comprobado en CI, `gitleaks` y los `deny` de `permissions`.

## 6. Subagentes

Claude Code es el agente principal y delega tareas a los **8 subagentes** de [`.claude/agents/`](../.claude/agents/). No hay otros agentes aparte de esos.

### 6.1 Implementadores (uno por capa)

| Subagente | Capa | Qué hace | Herramientas |
|---|---|---|---|
| `db-engineer` | BD (Camila) | Migraciones SQL, seeds y pruebas de integridad en `database/` | Read, Grep, Glob, Edit, Write, Bash |
| `backend-engineer` | BE (Leonardo) | Módulos NestJS, endpoints según `contracts/api.md`, tests con Jest | Read, Grep, Glob, Edit, Write, Bash |
| `frontend-engineer` | FE (Adrian) | Pantallas Next.js, componentes, servicios, tests de componentes y Playwright | Read, Grep, Glob, Edit, Write, Bash |

### 6.2 Revisores

| Subagente | Qué revisa | Herramientas |
|---|---|---|
| `contract-checker` | Que el código respete el contrato de API y el modelo de datos de la spec | Solo lectura: Read, Grep, Glob, Bash |
| `ca-traceability-checker` | Que cada `CA-xxx` tenga un test que lo cite y que se cumpla la definición de terminado | Solo lectura: Read, Grep, Glob, Bash |
| `code-reviewer` | Corrección, legibilidad, arquitectura, seguridad y rendimiento | No las limita (hereda todas) |
| `security-auditor` | Vulnerabilidades, modelo de amenazas y prácticas seguras | No las limita (hereda todas) |
| `test-engineer` | Estrategia de pruebas, cobertura y calidad de los tests | No las limita (hereda todas) |

`code-reviewer`, `security-auditor` y `test-engineer` vienen de una colección externa (ver [`ia/herramientas-y-skills.md`](../ia/herramientas-y-skills.md)): están en inglés, son genéricos y, como no declaran `tools`, en la práctica podrían editar archivos. Los revisores propios del proyecto (`contract-checker` y `ca-traceability-checker`) sí están restringidos a solo lectura.

[`CLAUDE.md`](../CLAUDE.md) §9 indica cuándo usar cada uno: implementar con el subagente de la capa, `contract-checker` solo si el PR toca `contracts/`, DTO o `frontend/src/services/`, y `ca-traceability-checker` al cerrar una historia o una spec.

Además hay 15 skills en [`.claude/skills/`](../.claude/skills/) (Spec Kit y convenciones propias de Vaquita) que los subagentes usan como guía.

### 6.3 Uso registrado

El uso exacto queda en los historiales de sesión de Claude Code de cada computadora, no en el repositorio. En el repo solo hay evidencia donde un commit lo anota. Contando cada uso una vez (los squash repiten párrafos):

| Subagente | Usos con evidencia | Dónde |
|---|---|---|
| `ca-traceability-checker` | 5 | T020, T024 y T032 de la spec 000 (backend); base del frontend T005/T035 y perfil T039 |
| `contract-checker` | 3 | T020 y T024 (backend); ingreso T029 (frontend) |
| `security-auditor` | 1 | T032, guards de autenticación (backend) |
| `db-engineer`, `backend-engineer`, `frontend-engineer` | 0 con evidencia | Solo en el commit que los creó |
| `code-reviewer`, `test-engineer` | 0 | — |

Hay además 5 commits del backend titulados «security review» que no nombran al subagente.

**Para contar el uso real**, cada integrante puede revisar sus historiales:

```powershell
# Windows (PowerShell)
Get-ChildItem "$env:USERPROFILE\.claude\projects" -Recurse -Filter *.jsonl |
  Select-String -Pattern '"subagent_type":"([a-z-]+)"' -AllMatches |
  ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value } |
  Group-Object | Sort-Object Count -Descending | Format-Table Count, Name
```

```bash
# macOS o Linux
grep -rhoE '"subagent_type":"[a-z-]+"' ~/.claude/projects | sort | uniq -c | sort -rn
```

Solo cuenta las sesiones de esa computadora: hay que ejecutarlo en las tres y sumar.

## 7. Integración y despliegue continuo

```
rama de trabajo ──PR──► dev ──PR──► qa ──PR──► main
        │                │                       │
   hooks de Claude   CI en el PR            CI en el push
   (local)           deploy-backend.yml     deploy-frontend.yml
                     (Render, tras tests)   (Vercel, tras tests)
```

| Workflow | Cuándo corre | Qué hace |
|---|---|---|
| [`ci.yml`](../.github/workflows/ci.yml) | Cada PR a `dev`, `qa` o `main` y cada push a `main` | `lint`, `build`, `test-database`, `test-backend`, `test-frontend`, `db-check`, `gitleaks` |
| [`branch-flow.yml`](../.github/workflows/branch-flow.yml) | Cada PR | Check `flow`: a `main` solo desde `qa`, a `qa` solo desde `dev` |
| [`auto-merge.yml`](../.github/workflows/auto-merge.yml) | Al abrir un PR | Activa el auto-merge (squash hacia `dev`, merge commit hacia `qa` y `main`), salvo ramas `manual/*` y borradores |
| [`deploy-backend.yml`](../.github/workflows/deploy-backend.yml) | Push a `dev` que toca `backend/`, `database/` o `render.yaml` | Ejecuta las pruebas del backend y, si pasan, pide el despliegue a Render (secreto `RENDER_DEPLOY_HOOK_URL`) |
| [`deploy-frontend.yml`](../.github/workflows/deploy-frontend.yml) | Push a `main` que toca `frontend/` | Ejecuta las pruebas del frontend y, si pasan, pide el despliegue a Vercel (secreto `VERCEL_DEPLOY_HOOK_URL`) |
| [`migrate-staging.yml`](../.github/workflows/migrate-staging.yml) | Manual, solo desde `main` | Aplica las migraciones en la base de staging |
| [`e2e.yml`](../.github/workflows/e2e.yml), [`gitleaks-weekly.yml`](../.github/workflows/gitleaks-weekly.yml), [`jobs-tick.yml`](../.github/workflows/jobs-tick.yml) | Varios | E2E, escaneo semanal de secretos y respaldo del disparador de tareas programadas |

Si falta el secreto del Deploy Hook, los workflows de despliegue terminan sin error y sin desplegar. Hay que confirmar que estén cargados.

**Demo de un rechazo en GitHub Actions:** crear una rama, romper un test, subirla **a mano** (si lo pide Claude, el hook la bloquea antes) y abrir un PR hacia `dev`. En los checks del PR, `test-frontend` queda en rojo. Con la protección de `main` configurada (T046), además el merge queda bloqueado.

## 8. Lista de verificación antes de defender

- [ ] Agregar al docente como colaborador (Settings → Collaborators).
- [ ] Abrir `https://vaquita-suchas.vercel.app/estado` y confirmar las tres capas en OK.
- [ ] Revisar que la última ejecución de `CI` en GitHub Actions esté en verde.
- [ ] Confirmar los secretos `RENDER_DEPLOY_HOOK_URL` y `VERCEL_DEPLOY_HOOK_URL`.
- [ ] Configurar la protección de `main` (000 T046) y probarla con un PR con un test roto.
- [ ] Anotar la fecha de caducidad de la base gratuita de Render (000 T047).
- [ ] Revisar y marcar 002 T043 (`mvp-flow.spec.ts` ya existe).
- [ ] Ejecutar al menos una vez `code-reviewer` y `test-engineer` sobre un PR y anotar en el PR lo que encontraron.
- [ ] Opcional: Supabase Storage (000 T049) para que los comprobantes no se pierdan.

## 9. Riesgos el día de la defensa

1. **La base gratuita de Render caduca a los 30 días de creada.** Si caduca antes de la defensa, se pierden «Base de datos desplegada» y el requisito de las 3 partes desplegadas.
2. **El servicio gratuito de Render se duerme tras 15 minutos sin tráfico.** La primera petición tarda cerca de un minuto: abrir `/estado` unos minutos antes de presentar.
3. **Los comprobantes se guardan en disco efímero** (`STORAGE_DRIVER=local`). Si Render reinicia, se pierden. En la demo de pagos, subirlos en el momento.
4. **Correo y Telegram están en modo `dev`.** El registro en staging usa el simulador `/dev/telegram`, no el bot real.

## 10. Guion corto para la demo

1. **Despliegue (1 min):** abrir `/estado` en Vercel y mostrar frontend, backend y base en OK.
2. **CI/CD (1 min):** mostrar en Actions un PR con `ci.yml` en verde y explicar `deploy-backend.yml` y `deploy-frontend.yml` (despliegan solo si pasan las pruebas).
3. **Hook (1 min):** ejecutar `guard-files.mjs` con `backend/.env` (bloquea) y con `backend/.env.example` (permite). Si queda tiempo, `guard-bash.mjs` con `git push origin main`.
4. **Subagentes (1 min):** mostrar `.claude/agents/`, explicar implementadores y revisores, y abrir un commit donde `contract-checker` o `ca-traceability-checker` encontraron algo (por ejemplo, PR #37 o PR #38).
5. **Avance (30 s):** 410 de 431 tareas, 95 %.
