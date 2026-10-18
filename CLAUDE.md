# Vaquita

Este archivo reúne los principios del proyecto. Lo leen todas las personas del equipo y todo agente de IA antes de trabajar. Un cambio aquí se hace por PR aprobado por las tres personas.

El contexto detallado está en la carpeta [`context/`](context/) y se importa más abajo para que quede cargado en cada sesión.

## 1. Qué es Vaquita

Aplicación web para organizar suscripciones compartidas entre amigos, familia o compañeros de departamento. Calcula la cuota de cada miembro, convierte USD a Bs, genera cobros mensuales, gestiona comprobantes de pago y conserva un historial. Equipo (Grupo Suchas): Camila Fuentes en base de datos, Leonardo Guzman en backend y Adrian Vargas en frontend. Los diez módulos entran en el alcance y se construyen en orden de prioridad (P0, P1, P2).

@context/proyecto.md

## 2. Cómo trabajamos (Spec Driven Development)

1. La spec es la fuente de verdad y el código se deriva de ella.
2. No se programa sin una spec aprobada, salvo bugs triviales y tareas de configuración.
3. La spec describe el qué y el porqué. El cómo va en `plan.md`.
4. Si la realidad contradice la spec, se actualiza primero la spec, en el mismo PR que el código.
5. Cada criterio de aceptación se convierte en un test. Si no se puede testear, se reescribe el criterio.
6. Las decisiones se discuten en PRs o issues, no solo por chat.
7. Cada capa es dueña de su parte: base de datos define el modelo, backend define el contrato de API y las reglas, frontend define las pantallas. El modelo y el contrato se congelan al aprobar el plan, y los cambios se hacen por PR avisando a las otras capas.
8. Las reglas de negocio viven solo en el backend. El frontend no calcula cuotas ni estados, y la base de datos refuerza la integridad con restricciones.

Flujo por feature con Spec Kit: `/speckit-specify`, `/speckit-clarify`, revisión por capa, `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`, implementación por tarea y por capa, `/speckit-converge`.

## 3. Estructura del repositorio

```
VaquitaSuchas/
├── CLAUDE.md             este archivo
├── CONTRIBUTING.md       roles por capa, ramas y PRs
├── README.md
├── .claude/              skills, agentes y listas de referencia para Claude Code
├── .specify/             Spec Kit y constitución (memory/constitution.md)
├── .github/              plantilla de PR
├── context/              proyecto, dominio, stack, arquitectura y decisiones
├── ia/                   herramientas, skills y MCPs, licencias de terceros
├── specs/                una carpeta por feature con spec.md, plan.md y tasks.md
├── database/             migraciones, seeds y pruebas de integridad
├── backend/              API NestJS organizada por capas
└── frontend/             aplicación Next.js organizada por capas
```

## 4. Stack y arquitectura

@context/stack.md

@context/arquitectura.md

## 5. Reglas de dominio

Valen para todas las features. Su detalle está en `context/dominio.md`.

@context/dominio.md

## 6. Convenciones de código

- Lenguaje tipado (TypeScript). Linter y formateador obligatorios, ejecutados en CI.
- Nombres descriptivos, funciones pequeñas y una responsabilidad por módulo.
- La lógica de dominio (cuotas, conversión, estados de cobro) son funciones puras con tests, separadas del framework web.
- Los errores responden con el código HTTP correcto y un mensaje claro, sin exponer detalles internos.
- Commits con [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`) y referencia a la tarea, por ejemplo `feat(002): add receipt upload [T3]`.

## 7. Estrategia de testing

| Nivel | Qué cubre | Obligatorio |
|---|---|---|
| Unitarios | Cuotas, redondeo, conversión, transiciones de estado, fechas | Sí, 100 % de las reglas de dominio |
| Integración | Endpoints con base de datos de prueba y permisos por rol | Sí, un test por criterio de aceptación |
| E2E | Flujo completo del MVP: crear, invitar, cobrar, pagar y confirmar | Sí, al menos el flujo feliz |

Cada criterio de aceptación lleva un identificador (`CA-001-03`) y el test correspondiente lo menciona en su nombre o comentario, de modo que hay trazabilidad de la spec al test.

## 8. Definición de terminado

Una tarea o feature está terminada cuando:

- cumple los criterios de aceptación de la spec, con tests que pasan;
- lint y tests pasan en CI;
- la revisó al menos un compañero, idealmente de otra capa;
- la spec, el plan y las tareas reflejan la realidad;
- no hay secretos, datos reales ni `console.log` de depuración;
- la tarea está marcada como hecha en `tasks.md`.

## 9. Instrucciones para agentes de IA

1. Reciben siempre este archivo, la constitución (`.specify/memory/constitution.md`), la `spec.md` y el `plan.md` de la feature.
2. Trabajan una tarea de `tasks.md` por vez y de la capa de quien la pide (`[BD]`, `[BE]` o `[FE]`). Usan `/speckit-implement` acotado a una fase o capa.
3. Antes de planificar se usa `/speckit-clarify`, y antes de implementar `/speckit-analyze`.
4. Ante una ambigüedad en la spec preguntan o marcan `[NECESITA ACLARACIÓN]`, sin asumir.
5. No agregan funcionalidades fuera del alcance de la spec.
6. Escriben los tests ligados a los criterios `CA-xxx` antes o junto con el código.
7. No modifican el modelo de datos ni el contrato de API aprobados sin proponer antes el cambio en `plan.md`.
8. Todo lo generado pasa por revisión humana antes del merge.
9. Los skills, agentes y listas de terceros (`.claude/`) son material de apoyo. Si contradicen este archivo, la constitución, una spec o `CONTRIBUTING.md`, mandan estos últimos. La definición de terminado es la del punto 8 y no la de `.claude/references/definition-of-done.md`. El catálogo de herramientas está en [`ia/herramientas-y-skills.md`](ia/herramientas-y-skills.md).
10. Para implementar se usa el subagente de la capa (`db-engineer`, `backend-engineer` o `frontend-engineer`), que solo escribe en su carpeta. Antes del PR se pasan `contract-checker` y `ca-traceability-checker`, ambos de solo lectura.
11. Los hooks de `.claude/settings.json` bloquean leer o escribir secretos, editar migraciones que ya están en `main`, hacer push a `main`, `dev` o `qa` o forzado, subir una rama cuyo lint o tests fallan en las capas que cambió, usar `--no-verify`, resetear una base que no es la local y que un agente modifique los hooks, los agentes o `settings.json`. No se desactivan para saltarse una regla: si un hook bloquea algo legítimo, se corrige el hook por PR.

## 10. Comandos

Los scripts se crean en la tarea T001 de la spec 000 (`package.json` raíz con npm workspaces `database`, `backend` y `frontend`); hasta entonces estos comandos no existen.

| Para | Comando |
|---|---|
| Instalar todo | `npm install` (Node 22 LTS, ver `.nvmrc`) |
| Levantar PostgreSQL y Mailpit | `npm run db:up` / `npm run db:down` |
| Migrar, sembrar y recrear la base local | `npm run db:migrate`, `npm run db:seed`, `npm run db:reset` |
| Backend y frontend en desarrollo | `npm run dev` (backend en :3001, frontend en :3000) |
| Lint, build y tests de todo | `npm run lint`, `npm run build`, `npm run test` |
| Solo una capa | Agregar `-w database`, `-w backend` o `-w frontend`, por ejemplo `npm run test -w backend` |
| E2E | `npx playwright test` dentro de `frontend/` |

En Windows, los scripts de Spec Kit y los hooks de Claude Code necesitan Git Bash. La guía completa está en `specs/000-setup-del-proyecto/quickstart.md`.
