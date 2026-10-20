# Vaquita

Este archivo se carga en cada sesión de Claude Code, así que se mantiene corto a propósito. El detalle vive en `context/` y `specs/` y se abre **solo cuando la tarea lo necesita**. Un cambio aquí va por PR avisando a las tres personas. Los números de sección se conservan porque los citan hooks y skills.

## 1. Qué es Vaquita

App web para suscripciones compartidas: cuota por miembro, USD → Bs, cobros mensuales, comprobantes e historial. Grupo Suchas: Camila (BD, `database/`), Leonardo (BE, `backend/`), Adrian (FE, `frontend/`). Alcance y prioridades: `context/proyecto.md` y `specs/00-roadmap.md`.

## 2. Cómo trabajamos (Spec Driven Development)

1. La spec (`specs/NNN-*/spec.md`) es la fuente de verdad y el código se deriva de ella.
2. No se programa sin spec aprobada, salvo bugs triviales y configuración.
3. La spec dice el qué y el porqué; el cómo va en `plan.md` y el contrato en `contracts/api.md`.
4. Si la realidad contradice la spec, se actualiza la spec en el mismo PR que el código.
5. Cada criterio `CA-xxx` tiene un test que cita su identificador. Si no se puede testear, se reescribe el criterio.
6. Las decisiones se discuten en PRs o issues.
7. Cada capa es dueña de su parte. Modelo de datos y contrato de API se congelan al aprobar el plan; cambiarlos requiere PR avisando a las otras capas.
8. Las reglas de negocio viven solo en el backend. El frontend no calcula cuotas ni estados; la BD refuerza la integridad con restricciones.

Flujo Spec Kit: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` (una vez por spec, no por tarea) → implementación → `/speckit-converge`.

## 3. Dónde está cada cosa

- Estructura y roles: `CONTRIBUTING.md` · Stack: `context/stack.md` · Arquitectura: `context/arquitectura.md`
- Reglas de dominio completas: `context/dominio.md` · Flujo del sistema: `context/funcionamiento-del-sistema.md`
- Guías por capa: `frontend/CLAUDE.md`, `backend/CLAUDE.md`, `database/CLAUDE.md` · Herramientas de IA: `ia/herramientas-y-skills.md`

## 4. Stack

Next.js + React + TypeScript + Tailwind (FE, proxy `/api` con cookie httpOnly) · NestJS (BE) · PostgreSQL con migraciones SQL numeradas (BD) · Jest, Vitest y Playwright · GitHub Actions.

## 5. Reglas de dominio (resumen)

- Dinero en centavos enteros, nunca `float`. Formato `Bs 25,50`. Los centavos sobrantes van al titular y la suma de cuotas es igual al total.
- Cada cobro guarda una copia del tipo de cambio y del precio. El tipo de cambio lo ingresa el titular.
- Fechas en UTC, mostradas en America/La_Paz. Día de cobro 1–31; si el mes es más corto, el último día.
- Estados de cobro: `pendiente`, `en_revision`, `pagado`, `atrasado`, `cancelado` (transiciones en spec 002, RN-002-01). No se inventan estados.
- Permisos, montos y estados se validan en el servidor. Un usuario solo ve sus grupos. CI cifrada y nunca visible para otros.
- Sin contraseñas, tokens ni datos personales en logs. Secretos solo en variables de entorno.
- Interfaz y specs en español (Bolivia); código, ramas y commits en inglés.

## 6. Convenciones de código

TypeScript con lint y formateo en CI. Lógica de dominio en funciones puras con tests. Errores con el código HTTP correcto sin detalles internos. Commits Conventional Commits con la tarea: `feat(002): add receipt upload [T3]`.

## 7. Testing

Unitarios para el 100 % de las reglas de dominio; integración con un test por `CA` de endpoint; E2E al menos del flujo feliz del MVP.

## 8. Definición de terminado

Cumple sus `CA-xxx` con tests en verde; lint y CI pasan (`flow` y CI; revisión humana opcional); spec, plan y tareas reflejan la realidad; sin secretos, datos reales ni `console.log` de depuración; tarea marcada `[x]` en `tasks.md`.

## 9. Instrucciones para agentes de IA

1. **Lee lo mínimo.** `CLAUDE.md` ya está cargado. Empieza por la línea de la tarea en `tasks.md` y lee solo la sección del contrato, modelo o plan que cita (búscala con `Grep` por su identificador). Abre `spec.md` o `plan.md` completos solo si la tarea no se entiende sin ellos.
2. **Agrupa.** En una sesión se pueden hacer varias tareas de la misma capa y la misma pantalla o módulo (por ejemplo: pantalla con mock + conexión + E2E). Márcalas todas en `tasks.md`.
3. **Implementa con el subagente de la capa** (`db-engineer`, `backend-engineer`, `frontend-engineer`), que solo escribe en su carpeta.
4. **No te detengas por detalles menores.** Ante una ambigüedad pequeña, elige la opción más simple coherente con la spec, anótala en el PR y sigue. Detente o marca `[NECESITA ACLARACIÓN]` solo si hay que cambiar el modelo, el contrato o una regla de dominio.
5. No agregues funcionalidades fuera de la spec.
6. Escribe los tests de los `CA-xxx` junto con el código.
7. `contract-checker` solo si el PR toca `contracts/`, DTO del backend o `frontend/src/services/`. `ca-traceability-checker` solo al cerrar una historia de usuario o una spec, no en cada tarea.
8. Flujo `dev → qa → main`, sin aprobación humana obligatoria. Nunca se fusiona `main` hacia `dev`: los arreglos van a `dev` y suben por promoción.
9. Los hooks bloquean secretos, push a ramas protegidas o forzado, `--no-verify`, editar migraciones ya en `main`, resetear bases no locales, que un agente edite hooks/agentes/`settings.json`, y push con lint o tests rotos. Si un hook bloquea algo legítimo, se corrige el hook por PR.
10. Las skills y referencias de `.claude/` e `ia/skills-archivadas/` son apoyo opcional. Si contradicen este archivo, la constitución, una spec o `CONTRIBUTING.md`, mandan estos.

## 10. Comandos

| Para | Comando |
|---|---|
| Instalar | `npm install` (Node 22, `.nvmrc`) |
| PostgreSQL y Mailpit | `npm run db:up` / `npm run db:down` |
| Base local | `npm run db:migrate`, `npm run db:seed`, `npm run db:reset` |
| Desarrollo | `npm run dev` (backend :3001, frontend :3000) |
| Lint, build, tests | `npm run lint`, `npm run build`, `npm run test` (una capa: `-w frontend`) |
| E2E | `npx playwright test` dentro de `frontend/` |

En Windows, Spec Kit y los hooks necesitan Git Bash. Guía completa: `specs/000-setup-del-proyecto/quickstart.md`.
