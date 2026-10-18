# Plan técnico — Spec 000: Setup del proyecto

- **Spec relacionada:** `specs/000-setup-del-proyecto/spec.md` (debe estar **aprobada** por BD, Backend y Frontend)
- **Líder de la spec:** Todos (cada capa define su parte)
- **Última actualización:** 2026-10-18
- **Artefactos:** [`research.md`](research.md) · [`data-model.md`](data-model.md) · [`contracts/api.md`](contracts/api.md) · [`quickstart.md`](quickstart.md)

| Capa | Responsable | Secciones | Visto bueno |
|---|---|---|---|
| Base de datos | Camila | §3 (y `data-model.md`) | pendiente |
| Backend | Leonardo | §4, §5, §7 (y `contracts/api.md`) | pendiente |
| Frontend | Adrian | §6 | pendiente |

## Contexto técnico

| Tema | Decisión |
|---|---|
| Lenguaje | TypeScript 5.x en backend y frontend; SQL para las migraciones. |
| Entorno | Node.js 22 LTS (`.nvmrc`, `engines`), npm workspaces (`backend`, `frontend`, `database`). |
| Backend | NestJS (versión mayor vigente al crear el proyecto; se fija al crear el proyecto y queda en `package.json`), `pg`, `argon2`, `class-validator`, `@nestjs/swagger`, `@nestjs/schedule`, `nestjs-pino`. |
| Frontend | Next.js (App Router, `proxy.ts`), React, Tailwind CSS. |
| Base de datos | PostgreSQL 16 en Docker local y en Render. |
| Pruebas | Jest + supertest (backend), `node:test` + `pg` (base de datos), Vitest o Jest + Testing Library (frontend, a elegir por Adrian en la tarea de configuración del frontend), Playwright (E2E). |
| Plataforma de destino | Vercel (frontend), Render (backend y base), servicios gratuitos. |
| Tipo de proyecto | Aplicación web: tres paquetes en un solo repositorio. |
| Escala | Menos de 100 usuarios (RNF-000-05). |
| Restricciones | Plan gratuito de Render (ver `research.md` R1); cero costo por mensaje (Telegram). Sin `NEEDS CLARIFICATION` pendientes: las dudas que quedan son **decisiones de cuenta o costo** del equipo y están en §9 (R-02, R-03, R-04). |

## Constitución: verificación

| Principio | ¿Cumple? | Nota |
|---|---|---|
| I. Spec primero | Sí | Todo sale de la spec 000; los cambios de stack se piden en este PR (ver §2, filas marcadas ⚠). |
| II. Dinero exacto | Sí | Convención `bigint … _cents` y prueba de convenciones del esquema (§3). |
| III. Criterios verificables | Sí | Cada CA-000-xx tiene su prueba (§8). |
| IV. Seguridad y privacidad | Sí | Secretos solo en variables de entorno, gitleaks, logs con redacción (§7). |
| V. Contratos primero | Sí | `contracts/api.md` define también las convenciones de las demás specs. |
| VI. Etapas y simplicidad | Sí | Ejecutor de migraciones propio mínimo, sin ORM; un solo disparador externo. |
| VII. Capas | Sí | La estructura de carpetas sigue `context/arquitectura.md` (§1). |

Re-verificación tras el diseño: sin violaciones. No hay entradas en "Complejidad".

## 1. Resumen de la solución

Un repositorio con tres paquetes (`database`, `backend`, `frontend`) coordinados por npm workspaces y scripts en la raíz (`db:up`, `db:migrate`, `db:seed`, `db:reset`, `dev`, `test`, `lint`). La base se levanta con Docker Compose junto con Mailpit. Un ejecutor de migraciones propio aplica SQL numerado dentro de transacciones. El backend NestJS arranca validando su configuración, expone `/health` y Swagger, usa un filtro de errores único, logs estructurados, tres puertos intercambiables (correo, bot de Telegram, almacén de archivos) con modo `dev` y modo `prod`, y un módulo de tareas programadas que además se puede disparar desde afuera. El frontend Next.js trae el proxy `/api`, un layout móvil primero, los componentes `ui/` mínimos, las utilidades de dinero y fecha y la página `/estado`. GitHub Actions corre lint, build, pruebas y gitleaks en cada PR. El staging usa Vercel + Render con migraciones aplicadas por un comando manual.

## 2. Decisiones técnicas

| Decisión | Opción elegida | Alternativas descartadas | Motivo |
|---|---|---|---|
| Organización del repositorio | Monorepo con npm workspaces | Repos separados | Decidido por el equipo (un solo repositorio); los workspaces comparten `npm install` y scripts. |
| Ejecutor de migraciones | Script propio con `pg` (`research.md` R6) | node-pg-migrate, Prisma | La spec pide SQL numerado e idempotente; menos dependencias. |
| Numeración de migraciones | Rangos reservados por spec | Numeración global libre | Evita choques entre integrantes (caso borde de la spec). |
| Estados en la base | `text` + `CHECK` | `ENUM` de PostgreSQL | Agregar valores en un `ENUM` no es reversible dentro de una transacción. |
| Tareas programadas | `@nestjs/schedule` **más** disparador externo cada 5 min + bloqueo asesor (R1) | Solo cron interno; instancia de pago | El servicio gratuito se duerme; el disparador lo mantiene despierto y ejecuta tareas. |
| Recepción del bot | Webhook con `secret_token` y deduplicación (R2) | `getUpdates` | No exige un proceso permanente y es el modo oficial. |
| Almacén de archivos ⚠ | Interfaz `FileStorage` con `local` (dev) y `supabase` (staging/demo, plan gratuito); decidido por el equipo el 2026-10-18 (R3) | Firebase Storage | Firebase Storage parece exigir plan Blaze (tarjeta) y el equipo no paga nada. **Cambia `context/stack.md`.** |
| Correo | Interfaz `MailService`; `dev` SMTP a Mailpit, `prod` API HTTPS (Resend; Brevo como alternativa gratuita, `MAIL_PROVIDER`) (R4) | SMTP en producción; comprar un dominio | Render bloquea los puertos SMTP y no se paga nada. |
| Hash de contraseñas ⚠ | argon2id (R5) | bcrypt | Costo de CPU bajo en el plan gratuito. **Cambia la fila Backend de `context/stack.md`.** |
| Configuración | `@nestjs/config` + validación con `class-validator` | `zod` | Patrón de `BackendProyecto1`. |
| Logs | `nestjs-pino` con redacción | `console.log` | La definición de terminado prohíbe `console.log` de depuración. |
| Reloj | Dependencia `Clock` inyectable en servicios; las funciones de dominio reciben `now` como parámetro | `new Date()` en el dominio | Pruebas de plazos sin esperas y dominio puro. |
| Despliegue de migraciones | Workflow manual `Migrate staging` y comando documentado | Migrar al arrancar | RF-000-21: no migrar automáticamente en cada arranque. |
| Ramas y fusión | Squash merge; `main` protegida con 1 aprobación y checks obligatorios | Merge commits | Historial lineal y trazabilidad por tarea. |

## 3. Modelo de datos — _Camila (BD)_

Detalle completo en [`data-model.md`](data-model.md). Resumen:

- **Convenciones** para todas las migraciones (RF-000-07): `uuid`, `timestamptz` UTC, dinero `bigint` en centavos, `snake_case` en inglés, `created_at`/`updated_at` con disparador, tablas de solo anexado con `forbid_update_delete()`, claves foráneas con `RESTRICT`.
- **Migraciones 0001–0004:** extensión `unaccent` y funciones auxiliares; `job_runs`; `rate_limit_events`; `telegram_updates`. `schema_migrations` la crea el ejecutor.
- **Rangos de numeración** por spec (en `research.md` R6): 0010 usuarios, 0020 catálogo, 0030 grupos, 0040 cobros, 0050 solicitudes, 0060 reputación, 0070 notificaciones, 0080 cupos, 0090 administración, 0100 reportes.
- **Seed:** `database/seeds/` tiene el catálogo (spec 004) y datos de prueba. El administrador de desarrollo se crea con `npm run seed:admin -w backend` (reutiliza el hash y la normalización del backend) solo si `NODE_ENV` no es `production` y existen `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`. No hay contraseña en el repositorio (RF-009-02).
- **Respaldo:** `npm run db:dump` y `db:restore` (envoltorios de `pg_dump`/`psql`).

## 4. Contratos de API — _Leonardo (Backend)_

Detalle en [`contracts/api.md`](contracts/api.md). La **parte A** fija las convenciones de contrato de todo el proyecto (formato, errores, códigos, concurrencia, roles de los guards). La **parte B** define: `GET /health`, `GET /api/docs`, `POST /internal/jobs/tick`, `POST /telegram/webhook` y, solo en modo `dev`, `POST /dev/telegram/simulate` y `GET /dev/telegram/outbox`. La **parte C** define el contrato del proxy del frontend.

> **Contrato congelado** al aprobarse este plan. Los cambios se hacen por PR sobre este archivo y avisando a las otras dos capas.

## 5. Lógica de dominio y servicios técnicos — _Leonardo (Backend)_

### Estructura de `backend/`

```text
backend/
├── src/
│   ├── main.ts                      # arranque; Swagger solo en development/test
│   ├── app.module.ts
│   ├── shared/
│   │   ├── config/                  # env.validation.ts (RF-000-08), config.service
│   │   ├── errors/                  # DomainError, AllExceptionsFilter (RF-000-11)
│   │   ├── logging/                 # pino + request-id + redacción (RF-000-13)
│   │   ├── guards/                  # AuthGuard, AdminGuard, JobsTokenGuard (los de grupo viven en modulo subscriptions)
│   │   ├── clock/                   # Clock (system / fake)
│   │   ├── db/                      # DbService (pool pg, transacciones, helpers)
│   │   ├── ports/                   # MailService, TelegramGateway, FileStorage (interfaces + dev/prod)
│   │   └── jobs/                    # JobsModule, registro de tareas, tick, bloqueo asesor, job_runs
│   ├── modules/
│   │   ├── health/                  # GET /health
│   │   └── telegram/                # POST /telegram/webhook + simulador dev
│   └── cli/                         # seed-admin (spec 003/009), telegram-set-webhook
├── test/                            # pruebas de integración (supertest)
└── .env.example
```

### Piezas y reglas

- **Validación de entorno (RF-000-08, CA-000-05):** clase `EnvVars` con `class-validator`; `validateEnv()` reúne **todos** los errores y falla en el arranque con un mensaje que lista las variables faltantes. Variables obligatorias: `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `FINGERPRINT_KEY` (huellas de baneo y límites), `CI_ENCRYPTION_KEY`, `JOBS_TOKEN`, `MAIL_MODE`, `TELEGRAM_MODE`, `STORAGE_DRIVER`, y las del modo `prod` correspondiente (`RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, credenciales del almacén). `.env.example` las lista sin valores reales (RF-000-03).
- **`/health` (RF-000-09):** consulta `SELECT 1` con tiempo máximo de 2 s; nunca lanza; no devuelve texto de errores de la base.
- **Filtro de errores (RF-000-11):** convierte `DomainError(code, httpStatus, message, details)`, excepciones de `class-validator` (→ `VALIDATION_ERROR`), violaciones de unicidad de PostgreSQL (código `23505` → `CONFLICT`) y cualquier otra en `INTERNAL_ERROR` genérico. Registra la traza **solo en el log**, nunca en la respuesta.
- **Logs (RF-000-13):** `nestjs-pino`; `reqId` por petición; redacción de `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.token`, `*.ci`, `*.phone`, `*.reference` y cuerpos `multipart`.
- **Puertos (RF-000-12, RF-000-22, R3):**
  - `MailService.send({ to, subject, html, text })` → `dev`: SMTP a Mailpit (`localhost:1025`); `prod`: `POST https://api.resend.com/emails`.
  - `TelegramGateway`: `sendMessage(chatId, text, options?)`, `parseUpdate(raw)`; implementación `dev` (guarda en memoria el *outbox*, se consulta en `GET /dev/telegram/outbox`) e implementación `prod` (llamadas HTTPS a `api.telegram.org`, con el token por variable de entorno).
  - `FileStorage.put/copy/signedUrl/delete/exists` → `local`, `supabase`, `firebase`. `copy` lo necesita la spec 010 (copia del QR de pago a la solicitud).
  - Cada puerto tiene un módulo dinámico elegido por su variable de modo; **ningún** servicio de negocio importa la implementación concreta.
- **Tareas programadas (RF-000-14, R1):** `JobsModule` define `ScheduledJob { name; intervalSeconds; run(ctx): Promise<number> }`. Un registro central recibe las tareas de cada spec. `JobRunner.runAll(trigger)`:
  1. Para cada tarea toma `pg_try_advisory_lock(hashtext(name))`; si no lo consigue, devuelve `skipped`.
  2. Inserta una fila `running` en `job_runs`, ejecuta `run()`, y cierra la fila con `ok` o `error` (el mensaje de error se recorta y no incluye datos personales).
  3. Libera el bloqueo siempre (`finally`).
  - Se dispara por `@Cron('* * * * *')` (si `JOBS_INPROCESS=true`) y por `POST /internal/jobs/tick`. Una tarea siempre debe ser **idempotente**: calcula qué falta por hacer según el estado actual de la base, no según "cuánto pasó desde la última vez".
  - Tarea de ejemplo `example.noop` (RF-000-14) y `maintenance.cleanup`: borra `job_runs` > 30 días, `rate_limit_events` y `telegram_updates` viejos.
- **Webhook de Telegram (R2):** valida el secreto con `crypto.timingSafeEqual`, inserta `update_id` en `telegram_updates` (`ON CONFLICT DO NOTHING`; si ya existía, responde `200` sin procesar), y entrega el `Update` al despachador que registra la spec 003.
- **`Clock`:** `now(): Date`. En pruebas, `FakeClock.advance(ms)`.

### Funciones puras compartidas (`backend/src/shared/domain/`, con pruebas unitarias)

| Función | Entradas → salida | Reglas |
|---|---|---|
| `formatBsCents(cents)` (solo para mensajes de correo/Telegram del backend) | entero → `"Bs 25,50"` | Coma decimal, punto de miles. El frontend tiene su propia utilidad (§6). |
| `toLaPazParts(date)` | `Date` UTC → partes locales | Fuente única de la regla UTC−4 sin horario de verano. |

El resto del dominio (cuotas, estados, fechas de cobro) se define en las specs 001, 002 y 010.

## 6. Interfaz de usuario — _Adrian (Frontend)_

### Estructura de `frontend/`

```text
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # fuentes, tema, avisos globales
│   │   ├── page.tsx                   # redirige según sesión
│   │   ├── estado/page.tsx            # RF-000-18
│   │   └── api/[...path]/route.ts     # proxy (RF-000-15, contrato C)
│   ├── proxy.ts                       # redirige a /ingresar si falta la cookie en rutas protegidas
│   ├── components/ui/                 # button, card, field, modal, select, badge, alert (RF-000-16)
│   ├── components/features/           # vacío por ahora
│   ├── hooks/
│   ├── services/                      # cliente de la API tipado; health.ts
│   └── lib/
│       ├── money.ts                   # formatBs, parse (RF-000-17)
│       └── dates.ts                   # formateo en America/La_Paz (RF-000-17)
├── e2e/                               # Playwright
└── .env.example
```

### Componentes y utilidades

- **`ui/`:** `Button` (variantes primario, secundario, peligro; estado `loading`), `Card`, `Field` (etiqueta, ayuda, error), `Modal` (accesible, cierra con Esc, foco atrapado), `Select`, `Badge` (variantes por estado de cobro), `Alert`. Diseño móvil primero, tamaño táctil mínimo de 44 px, contraste AA, sin depender solo del color.
- **`lib/money.ts`:** `formatBs(cents: number): string` → `Bs 25,50`; `formatBs(250050)` → `Bs 2.500,50`. Solo formatea, no calcula cuotas (regla 8 de CLAUDE.md).
- **`lib/dates.ts`:** `formatDateTimeLaPaz(iso)`, `formatDateLaPaz(iso)`, `lapazDayOf(iso)` usando `Intl.DateTimeFormat` con `timeZone: 'America/La_Paz'`.
- **`/estado` (RF-000-18):** llama a `GET /api/health`; muestra tres tarjetas (Frontend, Backend, Base de datos) con estado `ok`/`degradado`/`sin respuesta`; si la petición falla o tarda más de 5 s muestra el aviso "No se pudo contactar con el servidor" (caso borde: base no disponible → aviso, no pantalla en blanco).
- **Proxy y `proxy.ts`:** según el contrato C de `contracts/api.md`. Lista de rutas públicas en una constante (`/ingresar`, `/registro`, `/recuperar`, `/estado`).

### Estados por pantalla

| Pantalla | Cargando | Vacío | Error |
|---|---|---|---|
| `/estado` | Esqueleto de 3 tarjetas | — | Aviso con botón "Reintentar" |

## 7. Seguridad y permisos — _Leonardo (Backend), con revisión de BD_

- **Secretos:** solo variables de entorno; `.env*` en `.gitignore` (CA-000-16); `.env.example` sin valores. **gitleaks** corre en cada PR sobre el diff y semanalmente sobre todo el historial (RNF-000-02, CA-000-18). Si se filtra un secreto, se rota (no basta con borrar el commit).
- **Rama `main` protegida (RF-000-02, CA-000-15):** sin push directo, 1 aprobación como mínimo, checks `lint`, `build`, `test-backend`, `test-frontend`, `test-database`, `gitleaks` obligatorios, ramas actualizadas antes de fusionar, historial lineal. `CODEOWNERS` pide revisión de la persona de la capa distinta a la del autor (`database/` → Camila, `backend/` → Leonardo, `frontend/` → Adrian; `specs/` y `context/` → las tres personas).
- **Disparador de tareas:** `JOBS_TOKEN` aleatorio de 32 bytes, comparación en tiempo constante, y límite de 1 llamada por segundo.
- **Webhook de Telegram:** secreto del encabezado; rutas `dev` inexistentes fuera de `TELEGRAM_MODE=dev` (se prueba que respondan `404` en `test` con modo `prod` simulado).
- **Swagger** solo en `development` y `test`.
- **Cabeceras:** `helmet` en el backend; CORS cerrado (solo el origen del frontend, aunque el navegador no llama al backend directamente).
- **Datos personales en logs:** prohibidos (RF-000-13); una prueba de integración comprueba que un registro con contraseña y CI no deja esos valores en la salida del log.
- **Privilegios de la base:** el backend se conecta con un rol de aplicación sin permiso de `DROP` ni `CREATE EXTENSION`; las migraciones corren con el rol dueño del esquema (en Render, el usuario único; se documenta como limitación).

## 8. Estrategia de pruebas

| Criterio de aceptación | Nivel | Capa | Test |
|---|---|---|---|
| CA-000-01 (clon limpio → todo corre) | E2E / manual | Todos | Workflow `smoke.yml`: `npm ci`, `db:up`, `db:migrate`, `db:seed`, arranque de los dos servidores y `GET /health` + `/estado`; más el recorrido de `quickstart.md` §1 por un integrante nuevo (RNF-000-01) |
| CA-000-02 (base vacía → migra y registra) | Integridad | BD | `database/tests/migrations.apply.test.ts` |
| CA-000-03 (segunda ejecución sin cambios) | Integridad | BD | `database/tests/migrations.idempotent.test.ts` |
| CA-000-04 (migración con error no deja cambios) | Integridad | BD | `database/tests/migrations.atomic.test.ts` (migración de prueba que falla a la mitad) |
| CA-000-05 (falta `DATABASE_URL`) | Unitario | BE | `backend/src/shared/config/env.validation.spec.ts` (nombra todas las variables faltantes) |
| CA-000-06 (`/health` 200 sin datos sensibles) | Integración | BE | `backend/test/health.e2e-spec.ts` (con base arriba y con base caída → `degraded`) |
| CA-000-07 (`/api/docs`) | Integración | BE | `backend/test/swagger.e2e-spec.ts` (200 en `test`, 404 en modo producción simulado) |
| CA-000-08 (error no controlado) | Integración | BE | `backend/test/error-filter.e2e-spec.ts` con un controlador de prueba que lanza (sin traza, formato uniforme) |
| CA-000-09 (correo `dev` a la bandeja local) | Integración | BE | `backend/test/mail.dev.e2e-spec.ts` (envía y lee la API de Mailpit; verifica que no hay llamada a internet) |
| CA-000-10 (`/estado` muestra el estado) | E2E | FE | `frontend/e2e/estado.spec.ts` (Playwright) |
| CA-000-11 (`250050` → `Bs 2.500,50`) | Unitario | FE | `frontend/src/lib/money.test.ts` |
| CA-000-12 (02:00 UTC → 22:00 día anterior) | Unitario | FE (y BE) | `frontend/src/lib/dates.test.ts`; `backend/src/shared/domain/la-paz.spec.ts` |
| CA-000-13 (PR con test fallido bloquea) | Configuración de CI | Todos | Protección de rama con checks requeridos; se verifica con un PR de prueba documentado en `quickstart.md` §7 |
| CA-000-14 (staging: tres capas responden) | E2E / manual | Todos | `frontend/e2e/estado.spec.ts` apuntando a `BASE_URL` de staging + captura en el PR de despliegue |
| CA-000-15 (push directo a `main` rechazado) | Configuración | Todos | Regla de protección de rama (`quickstart.md` §7) |
| CA-000-16 (`.env` ignorado) | Automático | Todos | Paso de CI `git check-ignore backend/.env frontend/.env.local` debe devolver éxito |
| CA-000-17 (bot `dev` recibe contacto sin salir a internet) | Integración | BE | `backend/test/telegram.dev.e2e-spec.ts` (simula `start` y `contact` por `POST /dev/telegram/simulate`; verifica que el cliente HTTP externo no se invoca) |
| CA-000-18 (gitleaks falla con un secreto) | CI | Todos | Job `gitleaks` en `ci.yml`; prueba de humo con una rama que agrega una clave de ejemplo (`quickstart.md` §7) |

Pruebas de las reglas técnicas: `RN-000-01` (UTC) → `la-paz.spec.ts` y la prueba de convenciones; `RN-000-02` (no editar migraciones aplicadas) → `numbering.check` (checksum + diff contra `main`); `RN-000-03` (migrar sobre base vacía y sobre staging sin perder datos) → `migrations.apply` más una prueba que aplica las migraciones nuevas sobre un volcado del esquema anterior.

### Flujos de CI (`.github/workflows/`)

| Archivo | Cuándo | Qué hace |
|---|---|---|
| `ci.yml` | Cada PR y push a `main` | Jobs en paralelo: `lint` (ESLint + Prettier + `tsc --noEmit` de ambos paquetes), `build` (backend y frontend), `test-database` (servicio PostgreSQL), `test-backend` (servicio PostgreSQL + Mailpit), `test-frontend`, `db-check` (numeración + checksums), `gitleaks`. Caché de npm. |
| `e2e.yml` | PR con etiqueta `e2e` y push a `main` | Levanta todo en modo `dev` y corre Playwright (flujo del MVP cuando exista). |
| `migrate-staging.yml` | Manual (`workflow_dispatch`) con entorno protegido | Ejecuta `npm run db:migrate` contra `DATABASE_URL` de staging (RF-000-21). |
| `jobs-tick.yml` | Programado cada 10 min (respaldo del disparador principal) | `curl -X POST` al endpoint con `JOBS_TOKEN`. Desactivable. |
| `gitleaks-weekly.yml` | Semanal | Escanea todo el historial. |

## 9. Riesgos y mitigaciones

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R-01 | La base gratuita de Render caduca a los 30 días y no tiene copias | Alta | Alto | Crearla ≤ 25 días antes de la demo; `db:dump`/`db:restore`; plan B con otro PostgreSQL gratuito cambiando solo `DATABASE_URL` (R1). |
| R-02 | Resend sin dominio verificado solo envía al dueño de la cuenta, y no se compra dominio | Alta | Medio (la recuperación de contraseña no llega a usuarios reales) | Demo con correos de los integrantes, o cambiar a Brevo con remitente único verificado (`MAIL_PROVIDER=brevo`) **[verificar límites y entrega]**. |
| R-03 | Firebase Storage exige tarjeta (Blaze) | Alta | Bajo (ya resuelto) | Se usa Supabase Storage; el PR de este plan actualiza `context/stack.md` (R3). |
| R-04 | El proyecto gratuito de Supabase se pausa por inactividad | Media | Medio | Llamada diaria al almacén dentro de `maintenance.cleanup`; si igual se pausa, se reactiva desde el panel de Supabase (gratis). Plan B sin costo: guardar los archivos en un segundo proyecto gratuito de Supabase. |
| R-05 | cron-job.org o GitHub fallan y el servicio duerme | Media | Bajo | Evaluación perezosa de plazos y atrasos; primera petición lenta pero correcta (R1). |
| R-06 | Arranque en frío (~1 min) rompe el tiempo de espera del proxy o de Telegram | Media | Bajo | El disparador evita dormir; proxy con 30 s y mensaje claro; Telegram reintenta. |
| R-07 | Argon2 lento en la CPU del plan gratuito | Baja | Medio | Medir tras el primer despliegue (tarea de verificación en tasks.md); ajustar costo. |
| R-08 | Dos integrantes numeran igual una migración | Media | Bajo | Rangos por spec + `db:check` en CI. |
| R-09 | Un secreto llega al historial | Baja | Alto | gitleaks en PR y semanal; rotación inmediata; hooks opcionales. |
| R-10 | Versiones de Next.js/NestJS distintas de las de la materia | Media | Bajo | Fijar versiones exactas con el primer `package.json` y copiar patrones de `proyectoFrontend1` y `BackendProyecto1`. |

## 10. Trazabilidad

| Requisito | Cubierto en |
|---|---|
| RF-000-01 (estructura) | §1, §5 y §6 (árboles); tarea de estructura |
| RF-000-02 (rama protegida) | §7, §8 (CA-000-15) |
| RF-000-03 (`.env.example`, `.gitignore`) | §5 (variables), §8 (CA-000-16) |
| RF-000-04 (docker-compose) | §1, `quickstart.md` §1 |
| RF-000-05 (migraciones idempotentes) | §3, `research.md` R6, §8 (CA-000-02/03/04) |
| RF-000-06 (seed y reset) | §3 |
| RF-000-07 (convenciones) | §3, `data-model.md` §1 y §4 |
| RF-000-08 (variables validadas) | §5, §8 (CA-000-05) |
| RF-000-09 (`/health`) | §4, §5, §8 (CA-000-06) |
| RF-000-10 (Swagger) | §4, §7, §8 (CA-000-07) |
| RF-000-11 (filtro de errores) | `contracts/api.md` A.2, §5, §8 (CA-000-08) |
| RF-000-12 (correo) | §5, `research.md` R4, §8 (CA-000-09) |
| RF-000-13 (logs) | §5, §7 |
| RF-000-14 (tareas programadas) | §5, `research.md` R1, `contracts/api.md` B |
| RF-000-15 (proxy) | §6, `contracts/api.md` C |
| RF-000-16 (layout y `ui/`) | §6 |
| RF-000-17 (dinero y fechas) | §6, §8 (CA-000-11/12) |
| RF-000-18 (página de estado) | §6, §8 (CA-000-10) |
| RF-000-19 (CI) | §8 (flujos de CI), CA-000-13 |
| RF-000-20 (staging) | §8 (CA-000-14), `quickstart.md` §8 |
| RF-000-21 (migraciones en staging por comando) | §8 (`migrate-staging.yml`) |
| RF-000-22 (bot de Telegram) | §4, §5, `research.md` R2, §8 (CA-000-17) |
| RNF-000-01 (menos de 15 min) | `quickstart.md` §1, CA-000-01 |
| RNF-000-02 (sin secretos, gitleaks) | §7, CA-000-18 |
| RNF-000-03 (CI falla con lint/tests rotos) | §8, CA-000-13 |
| RNF-000-04 (README) | Tarea de documentación |
| RNF-000-05 (menos de 100 usuarios) | Contexto técnico; sin pruebas de carga |
| RN-000-01, RN-000-02, RN-000-03 | §8 (pruebas de reglas técnicas) |
| CA-000-01 a CA-000-18 | §8 |
