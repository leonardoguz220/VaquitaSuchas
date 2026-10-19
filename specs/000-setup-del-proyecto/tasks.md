# Tareas — Spec 000: Setup del proyecto

- **Spec:** `spec.md` · **Plan:** `plan.md` · **Modelo:** `data-model.md` · **Contrato:** `contracts/api.md` · **Guía:** `quickstart.md`
- Capas: **BD** = Camila · **BE** = Leonardo · **FE** = Adrian. Cada tarea pertenece a **una** sola capa.
- Formato: `- [ ] Tnnn [P] [USn] [CAPA] Descripción con ruta — Depende: … · Cubre: …`. `[P]` = se puede hacer en paralelo con otras tareas sin dependencia pendiente. Las tareas de infraestructura sin historia propia no llevan `[USn]`.
- Una tarea se marca hecha (`[x]`) cuando cumple la definición de terminado del `CLAUDE.md` (§8). Los commits la citan: `chore(000): add migration runner [T008]`.
- Las **historias** de esta spec son bloques de trabajo (la spec no define historias de usuario): **US1** entorno local y base de datos · **US2** backend base · **US3** frontend base · **US4** CI, protección de `main` y staging.
- Orden de ejecución: esta spec va primero (P0). Las tareas T001 a T006 destrabajan a las tres capas.

## Fase 1: Preparación (estructura del repositorio)

- [x] T001 [BE] Crear la raíz del monorepo: `package.json` con workspaces `backend`, `frontend`, `database`; `.nvmrc` (Node 22 LTS) y `engines`; revisar el `.gitignore` existente (ya cubre `.env*`, builds y credenciales); `.editorconfig`; `.prettierrc`; scripts raíz `dev`, `build`, `lint`, `test`, `db:up`, `db:down`, `db:migrate`, `db:seed`, `db:reset`, `db:dump`, `db:restore` — Depende: — · Cubre: RF-000-01, RF-000-03, CA-000-16
- [x] T002 [P] [BD] Crear `docker-compose.yml` en la raíz con PostgreSQL 16 (volumen con nombre, puerto del host configurable `${DB_PORT:-5432}:5432` para no chocar con otro PostgreSQL local) y Mailpit (SMTP `1025`, interfaz `8025`); documentar `DATABASE_URL` de desarrollo en `database/.env.example` — Depende: T001 · Cubre: RF-000-04, RF-000-12
- [x] T003 [P] [BD] Crear el paquete `database/` con `package.json`, `tsconfig`, carpetas `migrations/`, `seeds/`, `tests/` y configuración de `node:test` + `pg`, según `context/arquitectura.md` — Depende: T001 · Cubre: RF-000-01
- [x] T004 [P] [BE] Crear el proyecto NestJS en `backend/` con versiones exactas en `package.json` (NestJS, `pg`, `argon2`, `class-validator`, `class-transformer`, `@nestjs/config`, `@nestjs/swagger`, `@nestjs/schedule`, `nestjs-pino`, `helmet`), ESLint, Prettier, Jest + supertest y las carpetas de `plan.md` §5; `backend/.env.example` con todas las variables sin valores reales — Depende: T001 · Cubre: RF-000-01, RF-000-03
- [x] T005 [P] [FE] Crear el proyecto Next.js (App Router, TypeScript, Tailwind) en `frontend/` con versiones exactas, ESLint, Prettier, la carpeta `src/` de `plan.md` §6 y la herramienta de pruebas de componentes elegida (Vitest o Jest + Testing Library); `frontend/.env.example` (`BACKEND_URL`, sin valores reales) — Depende: T001 · Cubre: RF-000-01, RF-000-03
- [x] T006 [P] [BE] Escribir el `README.md` raíz (RNF-000-01 y RNF-000-04): requisitos, cómo levantar base, backend y frontend, correr pruebas, migrar y sembrar; enlazar `CONTRIBUTING.md` y `quickstart.md` — Depende: T001 · Cubre: RNF-000-04, RNF-000-01

**Punto de control:** el equipo clona, ejecuta `npm install` y las tres capas tienen su carpeta lista.

## Fase 2: US1 — Entorno local y base de datos (Camila)

**Meta:** `npm run db:up && npm run db:migrate && npm run db:seed` funciona en un clon limpio y las migraciones son seguras.
**Prueba independiente:** `database/tests/` pasa contra el PostgreSQL de Docker.

- [x] T007 [US1] [BD] Pruebas primero: `database/tests/migrations.apply.test.ts` (base vacía → aplica todo y registra en `schema_migrations`), `migrations.idempotent.test.ts` (segunda ejecución sin cambios) y `migrations.atomic.test.ts` (migración de prueba que falla a la mitad no deja cambios y el error nombra el archivo) — Depende: T003 · Cubre: CA-000-02, CA-000-03, CA-000-04
- [x] T008 [US1] [BD] Implementar el ejecutor de migraciones `database/src/migrate.ts` (research R6): lee `database/migrations/NNNN_nombre.sql` en orden, una transacción por archivo, crea `schema_migrations` (`version` text PK, `name` text NOT NULL, `checksum` text NOT NULL = SHA-256, `applied_at` timestamptz NOT NULL default now()), toma un bloqueo asesor, **se niega a continuar** si el checksum de una migración aplicada cambió (RN-000-02) y muestra cuál migración falló — Depende: T007 · Cubre: RF-000-05, RN-000-02, RN-000-03, CA-000-02, CA-000-03, CA-000-04
- [x] T009 [US1] [BD] Escribir `database/migrations/0001_init.sql`: `CREATE EXTENSION IF NOT EXISTS unaccent`, funciones `set_updated_at()` (`NEW.updated_at := now()`), `forbid_update_delete()` (lanza `append-only table`) e `immutable_unaccent(text)` (envoltura `IMMUTABLE`); sin `pgcrypto` (usa `gen_random_uuid()` nativa) — Depende: T008 · Cubre: RF-000-07
- [x] T010 [P] [US1] [BD] Escribir `0002_job_runs.sql`: `job_runs` con `id` uuid PK default `gen_random_uuid()`, `job_name` text NOT NULL, `trigger` text NOT NULL CHECK IN ('cron','external','manual','startup'), `status` text NOT NULL CHECK IN ('running','ok','error','skipped'), `started_at` timestamptz NOT NULL default now(), `finished_at` timestamptz NULL, `processed_count` integer NOT NULL default 0, `error_message` text NULL, `created_at`, `updated_at`; índice `job_runs_name_started_idx (job_name, started_at DESC)`; disparador `set_updated_at` — Depende: T009 · Cubre: RF-000-14, RF-000-07
- [x] T011 [P] [US1] [BD] Escribir `0003_rate_limit_events.sql`: `rate_limit_events` con `id` uuid PK, `bucket` text NOT NULL, `key_hash` text NOT NULL (HMAC-SHA256, nunca el valor), `occurred_at` timestamptz NOT NULL default now(), `created_at`, `updated_at`; índice `rate_limit_events_lookup_idx (bucket, key_hash, occurred_at DESC)`; disparadores `set_updated_at` y `forbid_update_delete` (solo anexado; la limpieza la hace un rol con permiso, ver T033) — Depende: T009 · Cubre: RF-000-07
- [x] T012 [P] [US1] [BD] Escribir `0004_telegram_updates.sql`: `telegram_updates` con `update_id` bigint PK, `received_at` timestamptz NOT NULL default now(), `created_at`, `updated_at`; disparador `set_updated_at` — Depende: T009 · Cubre: RF-000-22
- [x] T013 [US1] [BD] Pruebas de integridad `database/tests/schema.conventions.test.ts` (toda tabla salvo `schema_migrations` tiene `id uuid`, `created_at`, `updated_at`; ninguna columna `float`, `real`, `double precision` ni `timestamp without time zone`; todo estado usa `text` + `CHECK`), `append_only.triggers.test.ts` (`UPDATE` y `DELETE` sobre `rate_limit_events` fallan) y `numbering.check.ts` (prefijos únicos, sin migraciones editadas respecto de `main`) — Depende: T010, T011, T012 · Cubre: RF-000-07, RN-000-01, RN-000-02
- [x] T014 [US1] [BD] Implementar `db:seed`, `db:reset` (recrea esquema y siembra), `db:dump` y `db:restore` (envoltorios de `pg_dump`/`psql`) en `database/src/`; el seed carga el catálogo de la spec 004 y datos de prueba, **sin** contraseña de administrador en el repositorio (el administrador de desarrollo lo crea `seed:admin`, T027) — Depende: T008 · Cubre: RF-000-06
- [x] T015 [US1] [BD] Documentar en `database/README.md` los rangos de numeración (0001–09 spec 000, 0010–19 usuarios, 0020–29 catálogo, 0030–39 grupos, 0040–49 cobros, 0050–59 solicitudes, 0060–69 reputación, 0070–79 notificaciones, 0080–89 cupos, 0090–99 administración, 0100–09 reportes) y las convenciones del esquema de `data-model.md` §1 — Depende: T009 · Cubre: RF-000-07, RN-000-02
- [ ] T016 [US1] [BD] Recorrido de reproducibilidad: un integrante que no escribió el README sigue `quickstart.md` §1 en un clon limpio y registra el tiempo (meta: menos de 15 minutos) y los fallos; corregir README y scripts — Depende: T006, T014 · Cubre: CA-000-01, RNF-000-01

**Punto de control (I1):** modelo y ejecutor de migraciones disponibles para las demás specs.

## Fase 3: US2 — Backend base (Leonardo)

**Meta:** el backend arranca validado, expone `/health`, Swagger y el disparador de tareas, y trae los puertos de correo, Telegram y archivos.
**Prueba independiente:** `npm run test -w backend` pasa con PostgreSQL y Mailpit arriba.

- [x] T017 [US2] [BE] Pruebas primero de configuración: `backend/src/shared/config/env.validation.spec.ts` (si falta `DATABASE_URL` el proceso falla y el mensaje **nombra todas** las variables faltantes) — Depende: T004 · Cubre: CA-000-05
- [x] T018 [US2] [BE] Implementar `backend/src/shared/config/env.validation.ts` (`EnvVars` con `class-validator`, `validateEnv()` reúne todos los errores) para `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `FINGERPRINT_KEY`, `CI_ENCRYPTION_KEY`, `JOBS_TOKEN`, `MAIL_MODE`, `TELEGRAM_MODE`, `STORAGE_DRIVER` y las del modo `prod` (`RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, credenciales del almacén); completar `.env.example` — Depende: T017 · Cubre: RF-000-08, RF-000-03, CA-000-05
- [x] T019 [P] [US2] [BE] Implementar `shared/errors/` (`DomainError(code, httpStatus, message, details)`, `AllExceptionsFilter` que convierte errores de `class-validator` en `VALIDATION_ERROR`, el código `23505` de PostgreSQL en `CONFLICT` y todo lo demás en `INTERNAL_ERROR` genérico, con la traza solo en el log) según `contracts/api.md` A.2 y A.3, más `backend/test/error-filter.e2e-spec.ts` con un controlador de prueba que lanza — Depende: T004 · Cubre: RF-000-11, CA-000-08
- [x] T020 [P] [US2] [BE] Implementar `shared/logging/` con `nestjs-pino`, `reqId` por petición y redacción de `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.token`, `*.ci`, `*.phone`, `*.reference` y cuerpos `multipart`; prueba de integración que registra un alta con contraseña y CI y comprueba que ninguno queda en la salida — Depende: T004 · Cubre: RF-000-13
- [x] T021 [P] [US2] [BE] Implementar `shared/db/DbService` (pool `pg`, `withTransaction`, helpers de bloqueo asesor) y `shared/clock/` (`Clock` con `now()`, `SystemClock` y `FakeClock.advance(ms)`) — Depende: T004 · Cubre: RF-000-14, RN-000-01
- [x] T022 [P] [US2] [BE] Implementar `shared/domain/la-paz.ts` (`toLaPazParts(date)`, fuente única de UTC−4 sin horario de verano) y `formatBsCents(cents)` (`Bs 25,50`, punto de miles) con `la-paz.spec.ts` y `format-bs.spec.ts` (02:00 UTC del día 1 → 22:00 del día anterior) — Depende: T004 · Cubre: CA-000-12, RN-000-01
- [x] T023 [US2] [BE] Implementar `modules/health/` — `GET /health` con `SELECT 1` y tiempo máximo de 2 s, nunca lanza, responde `status: degraded` si la base falla y no devuelve texto de errores ni credenciales — y `backend/test/health.e2e-spec.ts` (base arriba, base caída) — Depende: T018, T019, T021 · Cubre: RF-000-09, CA-000-06
- [x] T024 [P] [US2] [BE] Publicar Swagger en `/api/docs` solo en `development` y `test` (`main.ts`), `helmet` y CORS cerrado al origen del frontend; `backend/test/swagger.e2e-spec.ts` (200 en `test`, 404 con `NODE_ENV=production`) — Depende: T018 · Cubre: RF-000-10, CA-000-07
- [ ] T025 [US2] [BE] Implementar el puerto `MailService.send({ to, subject, html, text })` con módulo dinámico por `MAIL_MODE`: `dev` (SMTP a Mailpit `localhost:1025`) y `prod` (`POST https://api.resend.com/emails`; Brevo como alternativa por `MAIL_PROVIDER`); prueba `backend/test/mail.dev.e2e-spec.ts` que envía, lee la API de Mailpit y verifica que no hay llamada externa — Depende: T018 · Cubre: RF-000-12, CA-000-09
- [ ] T026 [P] [US2] [BE] Implementar el puerto `FileStorage` (`put`, `copy`, `signedUrl`, `delete`, `exists`) con módulo dinámico por `STORAGE_DRIVER`: `local` (carpeta no pública), `supabase` (Supabase Storage con URLs firmadas); sin driver `firebase` en el MVP (`research.md` R3); prueba de contrato común a los drivers (el driver `local` en CI) — Depende: T018 · Cubre: RF-000-12, RF-000-22
- [ ] T027 [P] [US2] [BE] Implementar `backend/src/cli/seed-admin.ts` (`npm run seed:admin -w backend`): crea el administrador de desarrollo solo si `NODE_ENV` no es `production` y existen `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`; reutiliza el hash y la normalización de la spec 003 (se completa cuando exista `users`, ver `specs/003`) — Depende: T018 · Cubre: RF-000-06
- [x] T028 [US2] [BE] Implementar `shared/jobs/` (`JobsModule`, `ScheduledJob { name; intervalSeconds; run(ctx): Promise<number> }`, registro central, `JobRunner.runAll(trigger)` con `pg_try_advisory_lock(hashtext(name))`, fila `running` → `ok`/`error` en `job_runs` y liberación en `finally`; `@Cron('* * * * *')` solo si `JOBS_INPROCESS=true`; tareas `example.noop` y `maintenance.cleanup` que borra `job_runs` de más de 30 días, `rate_limit_events` de más de 24 horas y `telegram_updates` de más de 7 días) — Depende: T011, T021 · Cubre: RF-000-14
- [x] T029 [US2] [BE] Implementar `POST /internal/jobs/tick` con `JobsTokenGuard` (token de 32 bytes, comparación en tiempo constante, límite de 1 llamada por segundo) según `contracts/api.md` B; prueba `jobs.tick.e2e-spec.ts` (sin token `401`, tarea idempotente, bloqueo asesor evita doble ejecución) — Depende: T028 · Cubre: RF-000-14
- [ ] T030 [US2] [BE] Implementar `modules/telegram/`: `TelegramGateway` (`sendMessage`, `parseUpdate`) con implementación `dev` (outbox en memoria) y `prod` (HTTPS a `api.telegram.org`), `POST /telegram/webhook` (valida `secret_token` con `crypto.timingSafeEqual`, inserta `update_id` en `telegram_updates` con `ON CONFLICT DO NOTHING` y entrega el `Update` al despachador de la spec 003), y solo en `TELEGRAM_MODE=dev` `POST /dev/telegram/simulate` y `GET /dev/telegram/outbox` (`404` fuera del modo `dev`); comando `cli/telegram-set-webhook.ts` — Depende: T012, T018, T019 · Cubre: RF-000-22, CA-000-17
- [ ] T031 [US2] [BE] Prueba `backend/test/telegram.dev.e2e-spec.ts`: simula `start` y `contact` con un token válido, verifica que el backend lo recibe, que un `update_id` repetido no se procesa dos veces y que el cliente HTTP externo no se invoca — Depende: T030 · Cubre: CA-000-17
- [x] T032 [US2] [BE] Prueba de roles en guards: `AuthGuard`, `AdminGuard` y `JobsTokenGuard` en `shared/guards/` (los de grupo viven en `subscriptions`) con códigos `401` y `403` de `contracts/api.md` A.4 — Depende: T019 · Cubre: RF-000-11
- [ ] T033 [US2] [BE] Rol de aplicación en la base: documentar y probar que el backend se conecta con un rol sin `DROP` ni `CREATE EXTENSION`; permitir a `maintenance.cleanup` borrar de `rate_limit_events` y `telegram_updates` (función `SECURITY DEFINER` o permiso explícito acordado con Camila) — Depende: T028 · Cubre: RF-000-07, RNF-000-02
- [x] T056 [P] [US2] [BE] Implementar `backend/src/shared/events/tx-event-bus.ts` (`TxEventBus.register(eventType, handler)` y `publish(tx, event)`: ejecuta los manejadores registrados **dentro de la misma transacción** y propaga cualquier error para revertirla; sin dependencia de NestJS en los tipos de evento) con `tx-event-bus.spec.ts` (manejador que falla revierte el hecho) — Depende: T021 · Cubre: RF-000-14 (base de las specs 001, 002, 007, 009 y 010; `specs/001-suscripciones-compartidas/research.md` R3)

**Punto de control (I2):** contrato técnico congelado (`contracts/api.md` partes A, B y C).

## Fase 4: US3 — Frontend base (Adrian)

**Meta:** layout móvil primero, componentes `ui/`, proxy `/api`, utilidades de dinero y fecha y la página `/estado`.
**Prueba independiente:** `frontend/e2e/estado.spec.ts` muestra las tres tarjetas.

- [x] T034 [P] [US3] [FE] Pruebas primero: `frontend/src/lib/money.test.ts` (`formatBs(250050)` → `Bs 2.500,50`, `formatBs(2550)` → `Bs 25,50`, `0`) y `frontend/src/lib/dates.test.ts` (2026-02-01T02:00Z → 22:00 del 31 de enero en La Paz) — Depende: T005 · Cubre: CA-000-11, CA-000-12
- [x] T035 [US3] [FE] Implementar `lib/money.ts` (`formatBs`, `parse`; solo formatea, no calcula cuotas) y `lib/dates.ts` (`formatDateTimeLaPaz`, `formatDateLaPaz`, `lapazDayOf` con `Intl.DateTimeFormat` y `timeZone: 'America/La_Paz'`) — Depende: T034 · Cubre: RF-000-17, CA-000-11, CA-000-12, RN-000-01
- [x] T036 [P] [US3] [FE] Implementar `components/ui/` (`Button` con variantes primario, secundario, peligro y estado `loading`; `Card`; `Field` con etiqueta, ayuda y error; `Modal` accesible que cierra con Esc y atrapa el foco; `Select`; `Badge` con variantes por estado de cobro; `Alert`) con diseño móvil primero, tamaño táctil mínimo de 44 px, contraste AA y sin depender solo del color; pruebas de accesibilidad básicas — Depende: T005 · Cubre: RF-000-16
- [x] T037 [US3] [FE] Implementar `app/layout.tsx` (fuentes, tema, avisos globales) y la lista de rutas públicas `/ingresar`, `/registro`, `/recuperar`, `/estado` en una constante; `app/page.tsx` redirige según la sesión — Depende: T036 · Cubre: RF-000-16
- [x] T038 [US3] [FE] Implementar el proxy `app/api/[...path]/route.ts` según `contracts/api.md` parte C (reenvía al backend, guarda y envía el token en una cookie `httpOnly`, tiempo de espera de 30 s con mensaje claro) y `src/proxy.ts` (redirige a `/ingresar` si falta la cookie en rutas protegidas); pruebas del reenvío y de la cookie — Depende: T005 · Cubre: RF-000-15
- [ ] T039 [US3] [FE] Implementar la página `/estado` (`services/health.ts`, tres tarjetas Frontend, Backend y Base de datos con estado `ok`/`degradado`/`sin respuesta`, esqueleto de carga, aviso «No se pudo contactar con el servidor» si falla o tarda más de 5 s, botón «Reintentar») — Depende: T036, T038 · Cubre: RF-000-18, CA-000-10
- [ ] T040 [US3] [FE] Prueba E2E `frontend/e2e/estado.spec.ts` (Playwright) contra backend y base locales y con el backend apagado — Depende: T039, T023 · Cubre: CA-000-10, CA-000-14

**Punto de control (I3):** frontend conectado al backend real a través del proxy.

## Fase 5: US4 — CI, protección de `main` y staging (todos)

**Meta:** ningún PR se fusiona sin lint, build, pruebas y gitleaks en verde; staging con las tres capas.
**Prueba independiente:** un PR de prueba con un test roto no se puede fusionar y un secreto de prueba hace fallar `gitleaks`.

- [ ] T041 [US4] [BE] Crear `.github/workflows/ci.yml` con jobs en paralelo `lint` (ESLint + Prettier + `tsc --noEmit` de ambos paquetes), `build`, `test-database` (servicio PostgreSQL), `test-backend` (PostgreSQL + Mailpit), `test-frontend`, `db-check` (numeración + checksums) y `gitleaks`, con caché de npm; paso `git check-ignore backend/.env frontend/.env.local` — Depende: T013, T023, T034 · Cubre: RF-000-19, RNF-000-03, CA-000-13, CA-000-16
- [ ] T042 [P] [US4] [BE] Crear `.github/workflows/gitleaks-weekly.yml` (historial completo) y la configuración `.gitleaks.toml`; verificar con una rama de prueba que agrega una clave de ejemplo y hace fallar el job — Depende: T041 · Cubre: RNF-000-02, CA-000-18
- [ ] T043 [P] [US4] [FE] Crear `.github/workflows/e2e.yml` (PR con etiqueta `e2e` y push a `main`; levanta todo en modo `dev` y corre Playwright) — Depende: T040 · Cubre: RF-000-19
- [x] T044 [P] [US4] [BD] Crear `.github/workflows/migrate-staging.yml` (manual con entorno protegido; ejecuta `npm run db:migrate` contra el `DATABASE_URL` de staging; las migraciones nunca corren al arrancar) y documentarlo — Depende: T008 · Cubre: RF-000-21, RN-000-03
- [ ] T045 [P] [US4] [BE] Crear `.github/workflows/jobs-tick.yml` (respaldo cada 10 min con `JOBS_TOKEN`, desactivable) y `.github/CODEOWNERS` (`database/` → Camila, `backend/` → Leonardo, `frontend/` → Adrian, `specs/` y `context/` → las tres personas) — Depende: T029 · Cubre: RF-000-02, RF-000-14
- [ ] T046 [US4] [BE] Configurar la protección de `main` en GitHub (sin push directo, sin aprobación humana (decisión del 2026-10-18), check `flow` y checks `lint`, `build`, `test-backend`, `test-frontend`, `test-database`, `gitleaks` obligatorios, ramas actualizadas, historial lineal solo en `dev` con squash; `qa` y `main` con merge commit; auto-merge activado) y comprobarlo con un PR de prueba con test fallido y un push directo rechazado, según `quickstart.md` §7 — Depende: T041 · Cubre: RF-000-02, CA-000-13, CA-000-15
- [ ] T047 [US4] [BE] Crear el servicio web y la base PostgreSQL en Render (plan gratuito), `render.yaml` o pasos documentados, variables de entorno de staging, y el disparador externo cada 5 minutos con cron-job.org (`POST /internal/jobs/tick` con `JOBS_TOKEN`); anotar la fecha de caducidad de la base (30 días) — Depende: T029, T044 · Cubre: RF-000-20, RF-000-14
- [ ] T048 [P] [US4] [FE] Desplegar el frontend en Vercel con `BACKEND_URL` de staging y comprobar que el proxy `/api` funciona (necesita servidor, no exportación estática) — Depende: T038, T047 · Cubre: RF-000-20
- [ ] T049 [P] [US4] [BE] Crear el proyecto gratuito de Supabase Storage (buckets privados), cargar sus claves en las variables de entorno de staging y la llamada diaria al almacén dentro de `maintenance.cleanup` para evitar la pausa por inactividad — Depende: T026, T047 · Cubre: RF-000-20, RF-000-22
- [ ] T050 [US4] [BE] Configurar el webhook de Telegram de staging (`telegram-set-webhook`) con el bot propio y `TELEGRAM_WEBHOOK_SECRET`; decidir con el equipo el proveedor de correo de staging (Resend con correos de integrantes o Brevo) y registrar la decisión en `context/decisiones/` — Depende: T030, T047 · Cubre: RF-000-22, RF-000-12
- [ ] T051 [US4] [BD] Aplicar las migraciones en staging con `Migrate staging`, sembrar el catálogo y comprobar que la segunda ejecución no cambia nada — Depende: T044, T047 · Cubre: RF-000-21, CA-000-14
- [ ] T052 [US4] [FE] Verificar staging: abrir `/estado` y comprobar las tres capas (captura en el PR de despliegue) y ejecutar `estado.spec.ts` con `BASE_URL` de staging — Depende: T048, T051 · Cubre: CA-000-14, RF-000-20

## Fase 6: Cierre y verificación

- [ ] T053 [BE] Medir el costo de `argon2id` en el servicio gratuito tras el primer despliegue (tiempo de hash en staging) y ajustar los parámetros si pasa de 500 ms; dejar el resultado en `research.md` R5 — Depende: T047 · Cubre: riesgo R-07, RNF-000-05
- [x] T054 [BE] Actualizar `context/stack.md` (Supabase Storage en lugar de Firebase; argon2id en lugar de bcrypt) y `context/arquitectura.md` (módulo `join-requests`, carpeta `app-adapters/`) en un PR aprobado por las tres capas — Hecho en el PR #4; las skills y `ia/` se alinearon en `chore/claude-code-setup` · Cubre: riesgos R-03 y R-07
- [ ] T055 [BD] Ejecutar `/speckit-converge`: actualizar `spec.md` y `plan.md` con lo que cambió durante la implementación y registrar en la tabla de decisiones — Depende: T052 · Cubre: RNF-000-04

## Dependencias y orden de ejecución

- **Fase 1** primero (T001 destraba a las demás). **Fase 2** (BD), **Fase 3** (BE) y **Fase 4** (FE) corren en paralelo después de T001 y de sus paquetes (T003, T004, T005).
- **US4** necesita que existan pruebas (T013, T023, T034) para que `ci.yml` tenga algo que ejecutar; los despliegues (T047 a T052) esperan a `/health` y al proxy.
- Antes de que otra spec empiece, deben estar hechas: T008, T009, T018, T019, T021, T023, T028, T029 (backend y base) y T035, T036, T038 (frontend).

## Ejemplos de paralelización

- Después de T001: T002, T003, T004, T005 y T006 a la vez (una persona por capa).
- Después de T009: T010, T011 y T012 (tres migraciones independientes) a la vez.
- En el backend: T019, T020, T021, T022 y T024 a la vez, antes de T023.

## Estrategia de implementación

1. Primero, T001 a T006 y T008/T009 (esqueleto y migraciones): con eso las otras specs ya pueden empezar su modelo.
2. `/health` + `/estado` + CI en verde (T023, T039, T041) forman el primer **hito visible**: el recorrido completo de punta a punta.
3. Después, tareas programadas, correo, archivos y Telegram (las necesitan 002, 003 y 010).
4. Staging (T047 a T052) puede empezar en cuanto exista `/health`, para detectar pronto problemas del plan gratuito.

## Puntos de integración (hitos)

- [ ] **I1:** migraciones y convenciones disponibles para el backend (T008 a T012)
- [ ] **I2:** contrato técnico congelado (`contracts/api.md` A, B y C)
- [ ] **I3:** frontend conectado al backend real (T039, T040)
- [ ] **I4:** CI obligatorio y `main` protegida (T041, T046)
- [ ] **I5:** staging con tres capas respondiendo (T052)

## Bloqueos y decisiones durante la implementación

| Fecha | Situación | Decisión | ¿Cambió la spec o el contrato? |
|---|---|---|---|
| 2026-10-18 | Proveedor de correo y dominio (R-02) | Resend con dominio gratis; si no, Brevo con remitente único | No |
| 2026-10-18 | Supabase Storage en lugar de Firebase (R-03, R-04) | Aprobado; la llamada diaria de mantenimiento evita la pausa | Sí: `context/stack.md` (ya actualizado) |
| 2026-10-18 | argon2id en lugar de bcrypt (R-07) | Aprobado; medir en T053 y volver a bcrypt solo si tarda demasiado | Sí: `context/stack.md` (ya actualizado) |
| 2026-10-18 | El puerto 5432 puede estar ocupado por otro PostgreSQL local (T002) | `docker-compose.yml` publica `${DB_PORT:-5432}:5432` (y Mailpit `${MAIL_SMTP_PORT:-1025}`/`${MAIL_UI_PORT:-8025}`); `DB_PORT` documentado en `database/.env.example` | No |
| 2026-10-18 | `research.md` R7 nombra un servicio `db-test` aparte (T002) | La base de pruebas `vaquita_test` vive en el mismo contenedor `db` (script `database/docker/init/01-create-test-db.sql`); ajustar R7 en `/speckit-converge` (T055) | Pendiente: `research.md` R7 |
| 2026-10-18 | `forbid_update_delete` bloquea también el `DELETE` de `maintenance.cleanup` sobre `rate_limit_events` (T011, T028): un disparador corre para cualquier rol | Pendiente con backend en T033: la vía (función `SECURITY DEFINER` que respete una variable de sesión, u otra) va en una migración nueva del rango 0005–0009 | Pendiente: `plan.md` §3 y §5 |
| 2026-10-18 | Se propusieron `CHECK` de refuerzo no previstos en el modelo (`job_runs.processed_count >= 0`, `finished_at >= started_at`; `rate_limit_events.key_hash` HMAC hex de 64, `bucket <> ''`) | Se quitaron de 0002/0003 para respetar el modelo congelado; quedan como propuesta para el plan (PR #23) | No |
| 2026-10-18 | `data-model.md` §1 y §4 solo exceptúan `schema_migrations` de la regla `id uuid`, pero §3 define `telegram_updates` con PK natural `update_id` (T012, T013) | Manda §3: `schema.conventions.test.ts` exime una lista explícita de claves naturales (`telegram_updates.update_id`) | Pendiente: `data-model.md` §1/§4 y redacción de T013, en T055 |
| 2026-10-18 | `db:restore` contra staging (riesgo R-01, research R1) | Se niega con un host no local salvo `--allow-remote` explícito, que usa una persona a mano; `db:reset` solo corre en local | Pendiente: `plan.md` §3 «Respaldo», en T055 |
| 2026-10-18 | El seed del catálogo depende de las tablas de la spec 004 (T014) | T014 deja el mecanismo `db:seed` y `seeds/` sin datos; el catálogo lo carga 004 T005 (`catalog.json` + `applyCatalog`), que debe conectarse a `seed()` | No |
