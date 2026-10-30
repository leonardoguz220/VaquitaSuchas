# Vaquita

Grupo Suchas: Camila Fuentes (base de datos), Leonardo Guzman (backend) y Adrian Vargas (frontend).

Vaquita es una aplicación web para organizar las suscripciones que comparten amigos, familias o compañeros de departamento (Netflix, Spotify, Disney+, YouTube Premium y similares). Calcula la cuota de cada miembro, convierte los montos de dólares a bolivianos, genera los cobros de cada mes, envía recordatorios y guarda un historial: cada miembro sube su comprobante y el titular lo confirma. Quien quiere entrar a un grupo abre una solicitud, conversa con el titular en un chat, paga y entra cuando el titular confirma su pago. Incluye además un panel de gasto y ahorro, reputación por puntualidad, cupos libres y administración.

El proyecto se desarrolla con Spec Driven Development: la especificación se escribe y se revisa primero, y el código se deriva de ella.

## Estado

Las doce specs (000 a 011, incluida la del faltante de grupo) están implementadas y desplegadas en staging: la base de datos y el backend en Render, y el frontend en Vercel (enlaces en [Despliegue](#despliegue-staging)). El avance real de cada spec se ve en su `tasks.md` (tareas marcadas `[x]`) y el orden de construcción en [`specs/00-roadmap.md`](specs/00-roadmap.md).

## Módulos y cómo funcionan

La app tiene diez módulos de negocio más el setup. Cada uno tiene su spec (qué y por qué), su plan (cómo) y su contrato de API. Las reglas de negocio viven solo en el backend: el frontend muestra lo que el backend calcula y la base de datos refuerza la integridad con restricciones.

| #           | Módulo                                       | Qué hace y cómo funciona                                                                                                                                                                                                                                                           | Spec                                               |
| ----------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1           | Usuarios y autenticación                     | Registro, ingreso y recuperación de contraseña con JWT en cookie httpOnly. Hay roles (usuario y administrador) y los datos sensibles nunca salen en logs.                                                                                                                          | [003](specs/003-usuarios-y-autenticacion/spec.md)  |
| 2           | Catálogo de servicios                        | Plataformas (Netflix, Spotify, Disney+...) y sus planes con precio en USD. Es la base para crear un grupo; el administrador lo mantiene.                                                                                                                                           | [004](specs/004-catalogo-de-servicios/spec.md)     |
| 3 y 4       | Suscripciones compartidas, división y moneda | Un titular crea un grupo a partir de un plan, define el día de cobro y el tipo de cambio USD a Bs. El backend divide el precio en cuotas enteras en centavos; los centavos sobrantes van al titular y la suma de cuotas es igual al total. El grupo tiene un código de invitación. | [001](specs/001-suscripciones-compartidas/spec.md) |
| 5           | Cobros y pagos                               | Cada mes se generan los cobros de cada miembro con copia del precio y del tipo de cambio. El miembro sube su comprobante, el titular lo confirma o lo rechaza. Estados: `pendiente`, `en_revision`, `pagado`, `atrasado`, `cancelado`. Queda un historial exportable.              | [002](specs/002-cobros-y-pagos/spec.md)            |
| 3 (ingreso) | Solicitudes de ingreso y chat                | Quien quiere entrar abre una solicitud, conversa con el titular en un chat, paga y solo es miembro cuando el titular confirma el pago. Si algo sale mal puede abrir un reclamo.                                                                                                    | [010](specs/010-solicitudes-de-ingreso/spec.md)    |
| 6           | Notificaciones                               | Avisos en la app, por correo (Brevo en staging, Resend como alternativa) y por Telegram opcional: recordatorios de cobro, mora, retiros por mora e invitaciones. Los dispara una tarea programada (`/internal/jobs/tick`).                                                         | [005](specs/005-notificaciones/spec.md)            |
| 7           | Panel y reportes                             | Gasto mensual, ahorro frente al precio individual, calendario de cobros y deudas pendientes.                                                                                                                                                                                       | [006](specs/006-panel-y-reportes/spec.md)          |
| 8           | Reputación                                   | Calificación por puntualidad, insignias y ranking. La calificación habilita a un usuario como titular.                                                                                                                                                                             | [007](specs/007-reputacion/spec.md)                |
| 9           | Cupos libres                                 | Un titular publica cupos disponibles y otros usuarios los buscan y piden entrar.                                                                                                                                                                                                   | [008](specs/008-cupos-libres/spec.md)              |
| 10          | Administración                               | Usuarios, baneos, reclamos en disputa, catálogo, estadísticas y auditoría de acciones.                                                                                                                                                                                             | [009](specs/009-administracion/spec.md)            |

Flujo de punta a punta: el titular crea el grupo, una persona abre una solicitud y paga, el titular confirma y esa persona entra con su cobro de ingreso; cada mes el sistema genera los cobros, avisa a los miembros, ellos suben su comprobante y el titular lo confirma; el panel y la reputación se alimentan de ese historial. El detalle está en [`context/funcionamiento-del-sistema.md`](context/funcionamiento-del-sistema.md).

### Arquitectura

- **Frontend (Next.js):** pantallas por rol y un proxy `/api` que reenvía al backend con la cookie httpOnly.
- **Backend (NestJS):** un módulo por área en `backend/src/modules/` con capas `controllers`, `services`, `domain` (funciones puras con tests), `repositories` y `ports`. Documentación Swagger en `/api/docs`.
- **Base de datos (PostgreSQL):** migraciones SQL numeradas en `database/migrations`, seed del catálogo y pruebas de integridad.
- **Servicios externos:** Supabase Storage (comprobantes con URL firmada), Brevo o Resend (correo) y Telegram (opcional).

## Integración y despliegue continuo

El repositorio es un monorepo y cada capa tiene su propio workflow, además del CI general:

| Workflow                                                                                                      | Cuándo corre                                                   | Qué hace                                                                                          |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`backend.yml`](.github/workflows/backend.yml)                                                                | PR o push a `main` que toca `backend/` o `database/`           | Lint, build y pruebas del backend contra PostgreSQL 16                                            |
| [`frontend.yml`](.github/workflows/frontend.yml)                                                              | PR o push a `main` que toca `frontend/`                        | Lint, build y pruebas del frontend                                                                |
| [`ci.yml`](.github/workflows/ci.yml)                                                                          | Todo PR y push a `main`                                        | lint, build, pruebas de las tres capas, db-check y gitleaks (revisión de secretos)                |
| [`e2e.yml`](.github/workflows/e2e.yml)                                                                        | PR                                                             | Flujo completo en el navegador con Playwright                                                     |
| [`branch-flow.yml`](.github/workflows/branch-flow.yml) y [`auto-merge.yml`](.github/workflows/auto-merge.yml) | PR                                                             | Valida el flujo `dev` a `qa` a `main` y fusiona los PR de `dev` cuando pasan                      |
| [`deploy-backend.yml`](.github/workflows/deploy-backend.yml)                                                  | Push a `main` que toca `backend/`, `database/` o `render.yaml` | Prueba el backend y pide el despliegue a Render (ver [`backend/DEPLOY.md`](backend/DEPLOY.md))    |
| [`deploy-frontend.yml`](.github/workflows/deploy-frontend.yml)                                                | Push a `main` que toca `frontend/`                             | Prueba el frontend y pide el despliegue a Vercel (ver [`frontend/DEPLOY.md`](frontend/DEPLOY.md)) |
| [`migrate-staging.yml`](.github/workflows/migrate-staging.yml)                                                | Manual, solo desde `main`                                      | Aplica las migraciones en la base de staging                                                      |
| [`jobs-tick.yml`](.github/workflows/jobs-tick.yml)                                                            | Cada 10 minutos                                                | Respaldo del disparador de tareas programadas                                                     |

### Despliegue (staging)

| Parte         | Dónde                                          | URL                                                           | Cómo comprobarlo                                                                                    |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Frontend      | Vercel                                         | https://vaquita-suchas.vercel.app                             | [`/estado`](https://vaquita-suchas.vercel.app/estado) muestra frontend, backend y base en OK        |
| Backend       | Render, servicio web gratuito (`render.yaml`)  | https://vaquita-staging-api.onrender.com                      | [`/health`](https://vaquita-staging-api.onrender.com/health) responde `status: ok` con la base `up` |
| Base de datos | Render, PostgreSQL 16 gratuito (`render.yaml`) | Solo accesible desde el backend y desde `migrate-staging.yml` | Las migraciones y el catálogo se aplican con el workflow «Migrate staging»                          |

El frontend llama al backend a través de su proxy `/api` (variable `BACKEND_URL` en Vercel), así que [`/api/health`](https://vaquita-suchas.vercel.app/api/health) recorre las tres capas. Las migraciones nunca corren al arrancar el backend. El servicio gratuito de Render se duerme tras 15 minutos sin tráfico (la primera petición tarda cerca de un minuto) y la base gratuita caduca a los 30 días de creada (ver `specs/000-setup-del-proyecto/research.md`, R1).

## Hooks y subagentes de Claude Code

- **Hooks** (`.claude/hooks/`): bloquean secretos, push a ramas protegidas o forzado, `--no-verify`, edición de migraciones ya en `main` y push con lint o tests rotos; además formatean tras editar.
- **Subagentes** (`.claude/agents/`): `db-engineer`, `backend-engineer` y `frontend-engineer` implementan tareas de su capa; `contract-checker`, `ca-traceability-checker`, `code-reviewer`, `security-auditor` y `test-engineer` revisan. Ver [`ia/herramientas-y-skills.md`](ia/herramientas-y-skills.md).

## Stack

| Capa                   | Tecnología                                       |
| ---------------------- | ------------------------------------------------ |
| Frontend (Adrian)      | Next.js, React, TypeScript, Tailwind CSS         |
| Backend (Leonardo)     | NestJS, TypeScript, JWT, Swagger, Jest           |
| Base de datos (Camila) | PostgreSQL con migraciones SQL y seed            |
| Comprobantes y QR      | Supabase Storage con URLs firmadas               |
| Despliegue             | Vercel (frontend); Render (backend y PostgreSQL) |
| Calidad                | GitHub Actions y Playwright                      |

El código se organiza por capas en las tres partes del sistema. El detalle está en [`context/stack.md`](context/stack.md) y [`context/arquitectura.md`](context/arquitectura.md).

## Requisitos

- Node.js 22 LTS (la versión está en `.nvmrc`) y npm 10 o superior. En Windows, [nvm-windows](https://github.com/coreybutler/nvm-windows) permite tener la 22 junto a otras versiones; con nvm en Linux o macOS basta `nvm use`.
- Docker con Compose, para PostgreSQL y Mailpit.
- Git. Opcional: `gh` para ver el estado de la integración continua.
- En Windows, Git Bash: los scripts de Spec Kit (`.specify/scripts/bash/`) y los hooks de Claude Code se ejecutan con bash.

## Puesta en marcha

Los pasos completos y lo que debe verse en cada uno están en [`specs/000-setup-del-proyecto/quickstart.md`](specs/000-setup-del-proyecto/quickstart.md). En resumen:

```bash
git clone https://github.com/leonardoguz220/VaquitaSuchas.git && cd VaquitaSuchas
cp backend/.env.example backend/.env       # completar solo las variables marcadas con TODO
cp frontend/.env.example frontend/.env.local # completar BACKEND_URL=http://localhost:3001
npm install                                # instala los tres paquetes (workspaces)
npm run db:up                              # PostgreSQL y Mailpit con docker compose
npm run db:migrate && npm run db:seed
npm run dev                                # backend en :3001 y frontend en :3000
```

| Qué                             | Dónde                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Frontend                        | http://localhost:3000 (la página `/estado` muestra el estado del backend y de la base) |
| Backend                         | http://localhost:3001 (`/health` para la salud)                                        |
| Swagger                         | http://localhost:3001/api/docs                                                         |
| Mailpit (correos de desarrollo) | http://localhost:8025                                                                  |

Si el puerto 5432 ya lo usa otro PostgreSQL, levanta la base con otro puerto del host (`DB_PORT=5435 npm run db:up`) y usa ese mismo puerto en `DATABASE_URL`.

## Variables de entorno

Cada parte documenta sus variables en un archivo `.env.example` sin valores reales. Se copia a un archivo propio y se completa en local. Los archivos `.env*` reales están en `.gitignore`: nunca se suben al repositorio, y gitleaks revisa cada PR en busca de secretos.

| Archivo de ejemplo      | Se copia a            | Contenido                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/.env.example`  | `backend/.env`        | `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `FINGERPRINT_KEY`, `CI_ENCRYPTION_KEY`, `JOBS_TOKEN`, `MAIL_MODE`, `TELEGRAM_MODE` y `STORAGE_DRIVER`; en modo `prod` además `MAIL_PROVIDER` con `RESEND_API_KEY` o `BREVO_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` y las credenciales del almacén de archivos |
| `frontend/.env.example` | `frontend/.env.local` | `BACKEND_URL`, la dirección del backend a la que el proxy `/api` reenvía las llamadas                                                                                                                                                                                                                                             |
| `database/.env.example` | `database/.env`       | `DATABASE_URL` de desarrollo para las migraciones, el seed y el respaldo                                                                                                                                                                                                                                                          |

Si falta una variable obligatoria, el backend no arranca y el mensaje las nombra todas. El detalle de cada variable está en el `.env.example` de la capa y en `specs/000-setup-del-proyecto/plan.md`.

## Comandos

Se ejecutan desde la raíz del repositorio. Para limitar un comando a una capa se agrega `-w database`, `-w backend` o `-w frontend`, por ejemplo `npm run test -w backend`.

| Para                                    | Comando                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Instalar todo                           | `npm install`                                                                                                   |
| Levantar y apagar PostgreSQL y Mailpit  | `npm run db:up` / `npm run db:down`                                                                             |
| Migrar, sembrar y recrear la base local | `npm run db:migrate`, `npm run db:seed`, `npm run db:reset`                                                     |
| Respaldar y restaurar la base           | `npm run db:dump` / `npm run db:restore`                                                                        |
| Crear el administrador de desarrollo    | `npm run seed:admin -w backend` (necesita `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`, y no corre en producción) |
| Backend y frontend en desarrollo        | `npm run dev` (backend en :3001, frontend en :3000)                                                             |
| Lint, build y tests de todo             | `npm run lint`, `npm run build`, `npm run test`                                                                 |
| Solo una capa                           | `npm run test -w backend`, `npm run lint -w frontend`, `npm run test -w database`                               |
| E2E                                     | `npx playwright test` dentro de `frontend/`                                                                     |

`db:reset` solo se usa contra la base local.

## Pruebas

Cada criterio de aceptación (`CA-xxx`) tiene su test, y el nombre o el comentario del test lo menciona.

| Nivel                       | Qué cubre                                                                                                                       | Cómo se corre                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Unitarias                   | Reglas de dominio (cuotas, conversión, redondeo, estados, fechas), validación de variables de entorno y utilidades del frontend | `npm run test -w backend`, `npm run test -w frontend` |
| Integración                 | Endpoints del backend con supertest contra el PostgreSQL local (`npm run db:up` antes)                                          | `npm run test -w backend`                             |
| Integridad de base de datos | Cada restricción y cada migración se verifica intentando violarla, con `node:test`                                              | `npm run test -w database`                            |
| E2E                         | Flujo completo en el navegador con Playwright                                                                                   | `npx playwright test` dentro de `frontend/`           |

## Estructura del repositorio

```
VaquitaSuchas/
├── CLAUDE.md             principios del proyecto y reglas para agentes de IA
├── CONTRIBUTING.md       roles por capa, ramas y PRs
├── .claude/              skills, agentes y listas de referencia para Claude Code
├── .specify/             Spec Kit y constitución
├── .github/              workflows de CI/CD y plantilla de PR
├── context/              proyecto, dominio, stack, arquitectura y decisiones
├── ia/                   herramientas, skills y MCPs, licencias de terceros
├── specs/                una carpeta por feature con spec, plan y tareas
├── database/             migraciones, seeds y pruebas de integridad
├── backend/              API NestJS por capas
└── frontend/             aplicación Next.js por capas
```

| Carpeta                                                              | Contenido                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`context/`](context/)                                               | Qué es el proyecto ([`proyecto.md`](context/proyecto.md)), cómo funciona el sistema completo ([`funcionamiento-del-sistema.md`](context/funcionamiento-del-sistema.md)), reglas de dominio ([`dominio.md`](context/dominio.md)), stack ([`stack.md`](context/stack.md)), arquitectura por capas ([`arquitectura.md`](context/arquitectura.md)) y decisiones registradas ([`decisiones/`](context/decisiones/)) |
| [`.specify/memory/constitution.md`](.specify/memory/constitution.md) | Constitución del proyecto, que Spec Kit usa para validar specs, planes y tareas                                                                                                                                                                                                                                                                                                                                |
| [`ia/`](ia/)                                                         | Skills, agentes y MCPs que usa el equipo, con su origen y licencia ([`herramientas-y-skills.md`](ia/herramientas-y-skills.md))                                                                                                                                                                                                                                                                                 |
| [`specs/`](specs/)                                                   | Roadmap, banco de preguntas y las specs de cada módulo                                                                                                                                                                                                                                                                                                                                                         |

## Specs

El orden de construcción es P0, P1 y P2, y los diez módulos entran en el alcance.

| #   | Spec                                                                      | Prioridad | Líder         |
| --- | ------------------------------------------------------------------------- | --------- | ------------- |
| 000 | [Setup del proyecto](specs/000-setup-del-proyecto/spec.md)                | P0        | Todos         |
| 003 | [Usuarios y autenticación](specs/003-usuarios-y-autenticacion/spec.md)    | P0        | Leonardo (BE) |
| 004 | [Catálogo de servicios](specs/004-catalogo-de-servicios/spec.md)          | P0        | Camila (BD)   |
| 001 | [Suscripciones compartidas](specs/001-suscripciones-compartidas/spec.md)  | P0        | Camila (BD)   |
| 002 | [Cobros y pagos](specs/002-cobros-y-pagos/spec.md)                        | P0        | Leonardo (BE) |
| 010 | [Solicitudes de ingreso y chat](specs/010-solicitudes-de-ingreso/spec.md) | P0        | Leonardo (BE) |
| 005 | [Notificaciones](specs/005-notificaciones/spec.md)                        | P1        | Leonardo (BE) |
| 006 | [Panel y reportes](specs/006-panel-y-reportes/spec.md)                    | P1        | Adrian (FE)   |
| 007 | [Reputación](specs/007-reputacion/spec.md)                                | P2        | Camila (BD)   |
| 008 | [Cupos libres](specs/008-cupos-libres/spec.md)                            | P2        | Adrian (FE)   |
| 009 | [Administración](specs/009-administracion/spec.md)                        | P2        | Adrian (FE)   |

El mapa de módulos está en [`specs/00-roadmap.md`](specs/00-roadmap.md) y las preguntas por decidir en [`specs/00-preguntas-abiertas.md`](specs/00-preguntas-abiertas.md).

## Revisión por capa

Cada spec necesita el visto bueno de las tres capas antes de pasar al plan:

- Base de datos (Camila) revisa la integridad (unicidades, estados finales, copias de datos históricos) y las consultas costosas.
- Backend (Leonardo) revisa que las reglas de negocio estén completas y sin contradicciones, y que los permisos, la concurrencia y los criterios de aceptación se puedan probar.
- Frontend (Adrian) revisa qué ve y qué puede hacer cada rol, los estados vacíos y de error, el uso en celular y que la API ofrezca lo que las pantallas necesitan.

La revisión se registra en la línea "Revisión por capa" de cada spec, y las marcas `[NECESITA ACLARACIÓN]` se resuelven o se confirman.

## Flujo de trabajo

`/speckit-specify`, `/speckit-clarify`, revisión por capa, `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`, implementación por capa y `/speckit-converge`.

Los roles, las ramas y los PRs están en [`CONTRIBUTING.md`](CONTRIBUTING.md). Los principios y las reglas de dominio están en [`CLAUDE.md`](CLAUDE.md) y en la [constitución](.specify/memory/constitution.md).

## Ramas y PRs

- Hay tres ramas permanentes y ninguna recibe pushes directos: `dev` integra el trabajo del día a día y es la rama por defecto, `qa` recibe lo que se va a probar y `main` contiene solo lo que ya pasó por `qa`.
- Las ramas de trabajo salen de `dev` y vuelven a `dev` por PR: `spec/NNN-nombre` para la especificación y el plan, y `bd/`, `be/` o `fe/` seguido de `NNN-tX-descripcion` para una tarea de cada capa. Luego se abre un PR de `dev` a `qa` y, cuando la prueba pasa, otro de `qa` a `main`.
- Los PRs son pequeños (una tarea), usan la plantilla de `.github/pull_request_template.md` y los revisa otra capa, con una aprobación como mínimo. El merge es con squash.
- Los commits siguen Conventional Commits con referencia a la tarea, por ejemplo `feat(002): add receipt upload [T3]`.

El detalle está en [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Enlaces

- [`CONTRIBUTING.md`](CONTRIBUTING.md): roles por capa, ramas y PRs.
- [`specs/000-setup-del-proyecto/quickstart.md`](specs/000-setup-del-proyecto/quickstart.md): guía para levantar y validar el proyecto de punta a punta.
- [`context/`](context/): proyecto, dominio, stack, arquitectura y decisiones.
- [`specs/00-roadmap.md`](specs/00-roadmap.md): mapa de módulos y specs.
