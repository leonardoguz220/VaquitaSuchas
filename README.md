# Vaquita

Grupo Suchas: Camila Fuentes (base de datos), Leonardo Guzman (backend) y Adrian Vargas (frontend).

Vaquita es una aplicación web para organizar las suscripciones que comparten amigos, familias o compañeros de departamento (Netflix, Spotify, Disney+, YouTube Premium y similares). Calcula la cuota de cada miembro, convierte los montos de dólares a bolivianos, genera los cobros de cada mes, envía recordatorios y guarda un historial: cada miembro sube su comprobante y el titular lo confirma. Quien quiere entrar a un grupo abre una solicitud, conversa con el titular en un chat, paga y entra cuando el titular confirma su pago. Incluye además un panel de gasto y ahorro, reputación por puntualidad, cupos libres y administración.

El proyecto se desarrolla con Spec Driven Development: la especificación se escribe y se revisa primero, y el código se deriva de ella.

## Estado

Las once specs y sus planes están aprobados por las tres capas (2026-10-18). La implementación empieza por la spec 000 (`specs/000-setup-del-proyecto/tasks.md`). Ya existe la raíz del monorepo (`package.json` con npm workspaces, `.nvmrc`, formato común) y el backend base se está incorporando; la base de datos (Docker Compose, migraciones y seed) y el frontend se están incorporando también. Hasta que se fusionen esas tareas (T002 a T005), las carpetas que aún no tienen su proyecto contienen solo su guía de capa.

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

> Algunos comandos y páginas estarán disponibles conforme se fusionen las tareas de la spec 000: la base y Docker Compose (T002 y siguientes de base de datos), el backend (T004) y el frontend (T005). Hasta entonces, `npm run db:up` y `npm run dev` pueden no encontrar su destino.

## Variables de entorno

Cada parte documenta sus variables en un archivo `.env.example` sin valores reales. Se copia a un archivo propio y se completa en local. Los archivos `.env*` reales están en `.gitignore`: nunca se suben al repositorio, y gitleaks revisa cada PR en busca de secretos.

| Archivo de ejemplo      | Se copia a            | Contenido                                                                                                                                                                                                                                                                                   |
| ----------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/.env.example`  | `backend/.env`        | `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `FINGERPRINT_KEY`, `CI_ENCRYPTION_KEY`, `JOBS_TOKEN`, `MAIL_MODE`, `TELEGRAM_MODE` y `STORAGE_DRIVER`; en modo `prod` además `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` y las credenciales del almacén de archivos |
| `frontend/.env.example` | `frontend/.env.local` | `BACKEND_URL`, la dirección del backend a la que el proxy `/api` reenvía las llamadas                                                                                                                                                                                                       |
| `database/.env.example` | `database/.env`       | `DATABASE_URL` de desarrollo para las migraciones, el seed y el respaldo                                                                                                                                                                                                                    |

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
├── .github/              plantilla de PR
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
