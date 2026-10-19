# Tareas — Spec 003: Usuarios y autenticación

- **Spec:** `spec.md` · **Plan:** `plan.md` · **Modelo:** `data-model.md` · **Contrato:** `contracts/api.md` · **Guía:** `quickstart.md`
- Capas: **BD** = Camila · **BE** = Leonardo · **FE** = Adrian. Cada tarea pertenece a **una** sola capa.
- Formato: `- [ ] Tnnn [P] [USn] [CAPA] Descripción con ruta — Depende: … · Cubre: …`. `[P]` = en paralelo con otras tareas sin dependencia pendiente. Las pruebas van antes o junto con el código (CLAUDE.md §9.6); el nombre de cada prueba incluye el `CA-003-xx` que verifica.
- Commits: `feat(003): add login lockout [T020]`.
- Historias: **US1** registro con verificación de celular por Telegram (HU-003-01, HU-003-07) · **US2** iniciar y cerrar sesión (HU-003-02) · **US3** recuperar la contraseña (HU-003-03) · **US4** perfil, cambio de celular y de contraseña (HU-003-04, HU-003-05) · **US5** bloqueo temporal por intentos (HU-003-06).
- Prioridad P0. Depende de la spec 000 (T008–T012 migraciones, T018 entorno, T019 errores, T021 reloj y base, T025 correo, T028–T030 tareas y bot, T036–T038 frontend).

## Fase 1: Base común (modelo, dominio puro y servicios de identidad)

**Propósito:** lo que necesitan todas las historias. Ninguna historia empieza sin esto.

- [x] T001 [BD] Escribir primero `database/tests/users.integrity.test.ts`: correos iguales en distinta capitalización fallan; mismo celular, misma CI o mismo Telegram fallan; celular que no sea `+591` + 6/7 + 7 dígitos falla; `usuario` verificado sin celular o sin Telegram falla y `admin` pasa; `role` y `status` fuera de los valores permitidos fallan; `banned_identities` rechaza una huella repetida del mismo `kind`; ninguna columna de `banned_identities` guarda correo, celular, CI o Telegram en claro (revisión del catálogo de columnas); borrar un usuario borra sus tokens; dos cuentas con el mismo `registration_secret_hash` fallan y un hash sin `registration_secret_expires_at` (o al revés) falla — Depende: spec 000 T009 · Cubre: CA-003-02, CA-003-15, CA-003-19, CA-003-24, CA-003-26, CA-003-27, RN-003-01, RN-003-02, RN-003-03
- [x] T002 [BD] Migración `database/migrations/0010_users.sql`: `users` con `id` uuid PK; `full_name` text NOT NULL CHECK `char_length(btrim(full_name)) BETWEEN 2 AND 80`; `email` text NOT NULL UNIQUE CHECK `email = lower(btrim(email))`; `email_fingerprint` text NOT NULL (índice, no único); `password_hash` text NOT NULL; `role` text NOT NULL default 'usuario' CHECK IN ('usuario','admin'); `status` text NOT NULL default 'activo' CHECK IN ('activo','suspendido','baneado'); `ci_encrypted` bytea NOT NULL; `ci_fingerprint` text NOT NULL UNIQUE; `phone_e164` text NULL UNIQUE CHECK `phone_e164 ~ '^\+591[67][0-9]{7}$'`; `telegram_user_id` bigint NULL UNIQUE; `verified_at` timestamptz NULL; `data_policy_accepted_at` timestamptz NOT NULL; `data_policy_version` text NOT NULL; `session_version` integer NOT NULL default 0 CHECK >= 0; `last_login_at` timestamptz NULL; `registration_secret_hash` text NULL UNIQUE, `registration_secret_expires_at` timestamptz NULL, `registration_secret_redeemed_at` timestamptz NULL con CHECK `users_registration_secret_pair` (`(registration_secret_hash IS NULL) = (registration_secret_expires_at IS NULL)`, cambio aprobado en el PR #31); `created_at`, `updated_at`; CHECK `users_verified_requires_identity` (`verified_at IS NULL OR role = 'admin' OR (phone_e164 IS NOT NULL AND telegram_user_id IS NOT NULL)`); índices `users_unverified_idx (created_at) WHERE verified_at IS NULL`, `users_email_fingerprint_idx`, `users_name_search_idx ON (immutable_unaccent(lower(full_name)))`; disparador `set_updated_at` — Depende: T001 · Cubre: RF-003-02, RF-003-05, RF-003-22, RN-003-01, RN-003-02, RN-003-03
- [x] T003 [P] [BD] Migración `0011_phone_verification_tokens.sql`: `user_id` FK a `users` ON DELETE CASCADE (excepción justificada), `purpose` CHECK IN ('registro','cambio_celular'), `token_hash` text NOT NULL UNIQUE, `expires_at` timestamptz NOT NULL, `started_at`, `started_by_telegram_id` bigint, `used_at`, `outcome` CHECK IN ('verificado','rechazado_no_boliviano','rechazado_contacto_ajeno','rechazado_duplicado','rechazado_bloqueado'), `requested_ip_hash` text NOT NULL (el secreto de sondeo vive en `users` desde el PR #31), índices `phone_tokens_user_idx (user_id, created_at DESC)` y `phone_tokens_started_idx (started_by_telegram_id) WHERE used_at IS NULL AND started_at IS NOT NULL` — Depende: T002 · Cubre: RF-003-21
- [x] T004 [P] [BD] Migración `0012_password_reset_tokens.sql`: `user_id` FK ON DELETE CASCADE, `token_hash` text NOT NULL UNIQUE, `expires_at` timestamptz NOT NULL, `used_at` timestamptz NULL, índice `password_reset_open_idx (user_id) WHERE used_at IS NULL` — Depende: T002 · Cubre: RF-003-10, RF-003-11, RF-003-13 (parte BD: índice y unicidad; el envío y la invalidación los hace el backend)
- [x] T005 [P] [BD] Migración `0013_banned_identities.sql`: `kind` CHECK IN ('email','phone','ci','telegram'), `fingerprint` text NOT NULL, `ban_ref` uuid NULL (la FK a `bans` la agrega la spec 009), UNIQUE `(kind, fingerprint)`; no es de solo anexado — Depende: T002 · Cubre: RF-003-19, CA-003-24
- [x] T006 [P] [BE] `backend/src/modules/auth/domain/email.ts` con `normalizeEmail` (`trim` + minúsculas) y `canonicalEmailForBan` (Gmail y googlemail: sin puntos ni `+alias` en la parte local) y `email.spec.ts` (alias de Gmail, otros dominios intactos) — Depende: spec 000 T004 · Cubre: RF-003-02, RF-003-19, CA-003-35
- [x] T007 [P] [BE] `domain/password-policy.ts` con `validatePassword(password, email)` (≥ 10 caracteres, ≥ 1 letra, ≥ 1 número, distinta del correo sin distinguir mayúsculas; devuelve la lista de reglas incumplidas) y `password-policy.spec.ts` — Depende: spec 000 T004 · Cubre: RF-003-03, CA-003-03
- [x] T008 [P] [BE] `domain/ci.ts` (`normalizeCi`: quita espacios, solo dígitos, 5 a 10) y `users/domain/ci-mask.ts` (`maskCi` → `*****123`) con `ci.spec.ts` y `ci-mask.spec.ts` — Depende: spec 000 T004 · Cubre: RF-003-22, CA-003-31
- [x] T009 [P] [BE] `domain/phone.ts` con `normalizeBolivianPhone` (acepta `591…`, `+591…` y 8 dígitos que empiezan con 6 o 7; devuelve `+591XXXXXXXX` o error) y `phone.spec.ts` — Depende: spec 000 T004 · Cubre: RF-003-05, CA-003-15
- [x] T010 [P] [BE] `domain/login-lock.ts` (`loginLockStatus(failureTimestamps, now)`: con ≥ 5 fallos en 15 min, bloqueado hasta 15 min después del 5.º; `resetRequestAllowed(count, limit = 3)`) y `domain/tokens.ts` (`tokenIsUsable` → `usable` | `expired` | `used`; generación de 32 bytes base64url; SHA-256; comparación en tiempo constante) con `login-lock.spec.ts` y `tokens.spec.ts` — Depende: spec 000 T004 · Cubre: RF-003-17, RF-003-18, CA-003-06, CA-003-11
- [ ] T011 [BE] `users/services/identity.service.ts`: cifrado de la CI con AES-256-GCM (`CI_ENCRYPTION_KEY`, prefijo de 1 byte con la versión de clave), `fingerprint(kind, value, key)` con HMAC-SHA256 (`FINGERPRINT_KEY`), `isBlocked(kinds)`, `blockIdentities(userId, banId)` (inserta las cuatro huellas: correo canónico, celular, CI y Telegram) y `releaseIdentities(banId)`; repositorios `users.repository.ts` y `banned-identities.repository.ts`; pruebas unitarias del cifrado (ida y vuelta, versión de clave, etiqueta alterada falla) — Depende: T005, T006, T008, T009 · Cubre: RF-003-19, RF-003-22, CA-003-24
- [ ] T012 [BE] `users/services/user-account.service.ts`: `UserAccountService.setStatus(tx, userId, status)` (`activo`, `suspendido`, `baneado`; es el único punto que escribe `users.status`, incrementa `session_version` con `UPDATE … RETURNING`, registra el cambio sin datos personales y publica `UserSuspended`, `UserReactivated` o `UserBanned` por el `TxEventBus`) y `setRole(tx, userId, role)` — Depende: T002, spec 000 T056 · Cubre: RF-003-20, CA-003-18, CA-003-23, CA-003-33
- [ ] T013 [BE] `auth/services/session.service.ts` (`issue(user)` firma el JWT HS256 con `sub`, `sv`, `iat`, `exp` de 7 días; renovación deslizante con la cabecera `X-Session-Token` cuando quedan menos de 6 días) y `shared/guards/auth.guard.ts` y `admin.guard.ts` (verifica firma, `exp`, usuario existente, `status = 'activo'`, `verified_at` no nulo y `sv` igual a `session_version`; si no, `401 UNAUTHENTICATED`) — Depende: T002, spec 000 T032 · Cubre: RF-003-06, RF-003-07, RF-003-08, CA-003-07, CA-003-20, CA-003-33

**Punto de control (I1):** modelo de identidad disponible para el backend y para las specs 001, 009 y 010.

## Fase 2: US1 — Registro con verificación de celular por Telegram (Prioridad: P0) 🎯 MVP

**Meta:** una persona se registra, comparte su contacto con el bot y entra con sesión.
**Prueba independiente:** con el bot simulado, `POST /auth/register`, `/dev/telegram/simulate` y `GET /auth/register/status` dejan una sesión válida.

### Pruebas de la historia

- [ ] T014 [P] [US1] [BE] `backend/test/auth.register.e2e-spec.ts`: CA-003-01 (registro + simulación + sondeo → sesión, `password_hash` en argon2id), CA-003-02 (correo repetido con otra capitalización), CA-003-03 (contraseña de 8 caracteres), CA-003-25 (sin CI), CA-003-34 (sin aceptar la política) — Depende: T013 · Cubre: CA-003-01, CA-003-02, CA-003-03, CA-003-25, CA-003-34
- [ ] T015 [P] [US1] [BE] `backend/test/telegram.verify.e2e-spec.ts`: CA-003-25 (celular no boliviano), CA-003-26 (celular, Telegram o CI repetidos), CA-003-27 (token válido + contacto propio → verificado), CA-003-28 (token vencido, usado o contacto ajeno), CA-003-29 (sexto token en una hora) y el secuestro del enlace (otra cuenta de Telegram que pulsa Iniciar después) — Depende: T013 · Cubre: CA-003-25, CA-003-26, CA-003-27, CA-003-28, CA-003-29
- [ ] T016 [P] [US1] [BE] `backend/test/auth.register.concurrency.e2e-spec.ts`: `Promise.all` de dos registros con el mismo correo → un solo éxito (la base resuelve la carrera) — Depende: T013 · Cubre: CA-003-19
- [ ] T017 [P] [US1] [BE] `backend/test/auth.ban.e2e-spec.ts` (parte de registro): CA-003-21 (correo de cuenta baneada con otras mayúsculas), CA-003-22 (mismo celular con correo distinto → rechazo en la verificación), CA-003-30 (CI o Telegram baneados con otros datos), CA-003-35 (alias de Gmail), con huellas sembradas por `IdentityService.blockIdentities` — Depende: T011, T013 · Cubre: CA-003-21, CA-003-22, CA-003-30, CA-003-35

### Implementación de la historia

- [ ] T018 [US1] [BE] `auth/services/registration.service.ts` (`register`): validar con las funciones puras; límite `register:ip` (10/h) con `rate_limit_events`; huellas de correo y CI contra `banned_identities` (`403 REGISTRATION_NOT_ALLOWED` con mensaje genérico); en una transacción crear o actualizar (si estaba sin verificar) el usuario con CI cifrada, aceptación de la política (`data_policy_accepted_at`, `data_policy_version`), token del enlace y secreto de sondeo (solo hashes) y eventos `tg_token:ip` y `tg_token:email` (máximo 5 por hora cada uno); responder `telegramUrl` (`https://t.me/<TELEGRAM_BOT_USERNAME>?start=<token>`) y `registrationSecret`; `POST /auth/register` y `POST /auth/register/link` en `auth.controller.ts` con DTO y Swagger — Depende: T011, T013, T007, T010, T014 · Cubre: RF-003-01, RF-003-02, RF-003-03, RF-003-04, RF-003-23, CA-003-01, CA-003-02, CA-003-03, CA-003-34
- [ ] T019 [US1] [BE] `auth/services/telegram-verification.handler.ts`, registrado en el despachador del webhook (spec 000): `/start <token>` (guarda `started_at` y `started_by_telegram_id`; rechaza si lo inició otra cuenta; teclado con `request_contact`) y mensaje con contacto (en una transacción con `SELECT … FOR UPDATE` del token: (a) `contact.user_id === from.id`, (b) `normalizeBolivianPhone`, (c) huellas de celular y Telegram no bloqueadas, (d) celular y `telegram_user_id` no usados; marca `verified_at` o cambia el celular, marca el token usado con su `outcome` y responde «Listo, vuelve a Vaquita»); cualquier otro mensaje devuelve ayuda corta — Depende: T018, spec 000 T030, T015, T017 · Cubre: RF-003-21, RF-003-05, RF-003-19, CA-003-22, CA-003-25, CA-003-26, CA-003-27, CA-003-28
- [ ] T020 [US1] [BE] `GET /auth/register/status`: busca la cuenta por `users.registration_secret_hash` vigente y no canjeado; si el usuario quedó verificado emite `sessionToken` una sola vez y marca `registration_secret_redeemed_at` (sin borrar el hash, PR #31); estados `esperando`, `vencido`, `rechazado` (con `code`) y `verificado`; `GET /auth/policy` con el texto versionado `DATA_POLICY_VERSION` en `auth/policy.ts` — Depende: T018, T019 · Cubre: RF-003-04, RF-003-21, RF-003-23, CA-003-27
- [ ] T021 [US1] [BE] Tarea `auth.purge_unverified` (cada hora, idempotente): `DELETE FROM users WHERE verified_at IS NULL AND created_at < now() - interval '24 hours'` y `purge-unverified.job.spec.ts` (con `FakeClock`) — Depende: T002, spec 000 T028 · Cubre: RF-003-04
- [ ] T022 [P] [US1] [BE] Completar `backend/src/cli/seed-admin.ts`: crea un `admin` verificado sin celular ni Telegram con CI sintética `ADMIN-<uuid>` cifrada y con huella, idempotente por correo, y en producción solo con `--allow-production`; leyendo `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, `SEED_ADMIN_PASSWORD` — Depende: T011, spec 000 T027 · Cubre: RF-003-22, RN-003-03
- [x] T023 [P] [US1] [FE] Pantalla `/registro` (`features/auth/`: `AuthShell`, `PasswordRules` con lista de reglas en vivo, `PolicyModal`) con datos simulados (mock): nombre, correo, CI, contraseña y confirmación, casilla de la política; estados de carga, error y éxito — Depende: spec 000 T036, T037 · Cubre: RF-003-01, RF-003-03, RF-003-23, RNF-003-04
- [x] T024 [US1] [FE] Pantalla `/registro/verificar` (`TelegramVerifyCard`: botón **Abrir Telegram**, código QR con alternativa en texto, cuenta regresiva de 10 minutos, sondeo cada 2 s; estados esperando, vencido con «Pedir un enlace nuevo», rechazado por `code` —el bloqueo muestra el mensaje genérico— y verificado que redirige a `/`) y pantalla de desarrollo `/dev/telegram` (solo con `NEXT_PUBLIC_TELEGRAM_MODE=dev`) — Depende: T023 · Cubre: RF-003-21, RNF-003-04
- [ ] T025 [US1] [FE] Conectar `/registro` y `/registro/verificar` con el backend real (`services/auth.ts`); la cookie de sesión `vq_reg` y la de sesión final las maneja el proxy — Depende: T020, T024, spec 000 T038 · Cubre: RF-003-01, RF-003-06
- [ ] T026 [US1] [FE] E2E `frontend/e2e/register.spec.ts` (CA-003-27: registro completo con el bot simulado desde `/dev/telegram`) — Depende: T025 · Cubre: CA-003-27

**Punto de control:** US1 es funcional y probable por sí sola con el bot simulado (I3 parcial).

## Fase 3: US2 — Iniciar y cerrar sesión (Prioridad: P0) 🎯 MVP

**Meta:** entrar con correo y contraseña, ver la sesión y cerrarla; la versión de sesión invalida tokens viejos.
**Prueba independiente:** login → `GET /auth/me` → logout → el token anterior responde `401`.

- [ ] T027 [P] [US2] [BE] `backend/test/auth.login.e2e-spec.ts` (CA-003-05 mensaje genérico idéntico para correo inexistente y contraseña errónea comparando cuerpo y estado; CA-003-18 suspendido no entra; CA-003-23 baneado no entra), `auth.session.e2e-spec.ts` (CA-003-08 logout invalida; CA-003-33 versión de sesión) y `auth.guard.e2e-spec.ts` (CA-003-07 sin sesión `401`; CA-003-20 JWT manipulado) — Depende: T013 · Cubre: CA-003-05, CA-003-07, CA-003-08, CA-003-18, CA-003-20, CA-003-23, CA-003-33
- [ ] T028 [US2] [BE] `POST /auth/login` (verifica con argon2id, o contra un hash de relleno si la cuenta no existe o no está habilitada, para igualar el tiempo; rechaza `suspendido` y `baneado`; actualiza `last_login_at`; mismo mensaje siempre), `POST /auth/logout` (incrementa `session_version`) y `GET /auth/me` (`UserSelf` con CI enmascarada y `lastLoginAt`) — Depende: T013, T012, T027 · Cubre: RF-003-06, RF-003-07, RF-003-08, RF-003-09, RF-003-20, RNF-003-02, RNF-003-03
- [x] T029 [P] [US2] [FE] Pantalla `/ingresar` con mock (correo, contraseña, errores genéricos, enlaces a `/recuperar` y `/registro`, conserva `?codigo=` y `next=`) y redirección a `/ingresar?next=…` cuando `GET /auth/me` devuelve `401` en `proxy.ts` y el cliente — Depende: spec 000 T036, T038 · Cubre: RF-003-08, RNF-003-04
- [ ] T030 [US2] [FE] Conectar `/ingresar` y el cierre de sesión con el backend; E2E `frontend/e2e/auth.spec.ts` que comprueba CA-003-04 (la cookie existe con `httpOnly` y `document.cookie` no la lista) — Depende: T028, T029 · Cubre: RF-003-06, CA-003-04

**Punto de control:** US2 funciona sobre una cuenta creada por el `seed:admin` o por US1.

## Fase 4: US5 — Bloqueo temporal por intentos fallidos (Prioridad: P0)

**Meta:** 5 fallos en 15 minutos bloquean por correo (y por IP con umbral mayor) con tiempo de espera claro.
**Prueba independiente:** seis intentos con la contraseña mal → `429 RATE_LIMITED` con `retryAfterSeconds`; pasados 15 minutos, entra.

- [ ] T031 [US5] [BE] Agregar al inicio de sesión (T028) `loginLockStatus` por correo y por IP (cubos `login_fail:email` y `login_fail:ip`; 5 en 15 min por correo, umbral de 20 por IP), registro del evento en cada fallo y `RATE_LIMITED` con `details.retryAfterSeconds`; prueba en `auth.login.e2e-spec.ts` con `FakeClock` — Depende: T028, T010 · Cubre: RF-003-17, CA-003-06
- [ ] T032 [US5] [FE] En `/ingresar` mostrar el mensaje de espera con cuenta regresiva a partir de `retryAfterSeconds` y deshabilitar el botón mientras dure — Depende: T030, T031 · Cubre: RF-003-17, RNF-003-04

## Fase 5: US3 — Recuperar la contraseña (Prioridad: P0)

**Meta:** recuperar el acceso desde el correo sin revelar si la cuenta existe.
**Prueba independiente:** `forgot` → correo en Mailpit → `reset` con el token → login con la nueva contraseña; el enlace no sirve dos veces.

- [ ] T033 [P] [US3] [BE] `backend/test/auth.password.e2e-spec.ts`: CA-003-09 (respuesta idéntica exista o no la cuenta), CA-003-10 (reset válido: nueva contraseña, enlace muerto, otras sesiones cerradas), CA-003-11 (enlace de más de 30 min), CA-003-12 (dos enlaces seguidos: el primero muere), CA-003-13 (límite de 3 por hora), CA-003-16 (cambio autenticado con aviso en Mailpit) — Depende: T013 · Cubre: CA-003-09, CA-003-10, CA-003-11, CA-003-12, CA-003-13, CA-003-16
- [ ] T034 [US3] [BE] `auth/services/password.service.ts`, `password.controller.ts` y `reset-tokens.repository.ts`: `POST /auth/password/forgot` (cuenta un evento `reset:email` por correo escrito, 3 por hora; si la cuenta existe, está activa y verificada invalida los tokens anteriores con `used_at = now()` y crea uno nuevo de 32 bytes con vigencia de 30 min, guarda su hash y envía el correo con `MailService` después de confirmar la transacción; respuesta siempre igual), `POST /auth/password/reset` (valida la política, marca el token usado, cambia el hash, incrementa `session_version`, envía el aviso de cambio) y la tarea `auth.retry_mail` (hasta 3 reintentos si falla el envío) — Depende: T013, T007, T010, spec 000 T025, T033 · Cubre: RF-003-10, RF-003-11, RF-003-12, RF-003-13, RF-003-18, CA-003-09, CA-003-10, CA-003-11, CA-003-12, CA-003-13
- [x] T035 [P] [US3] [FE] Pantallas `/recuperar` (mismo mensaje de éxito siempre) y `/recuperar/[token]` (nueva contraseña y confirmación con reglas en vivo; token inválido con botón para pedir otro) con mock — Depende: spec 000 T036, T023 · Cubre: RF-003-10, RF-003-12, RNF-003-04
- [ ] T036 [US3] [FE] Conectar `/recuperar` y `/recuperar/[token]` con `forgot` y `reset` — Depende: T034, T035 · Cubre: RF-003-10, RF-003-12

## Fase 6: US4 — Perfil, cambio de celular y de contraseña (Prioridad: P0)

**Meta:** editar el nombre, cambiar el celular verificándolo otra vez con Telegram y cambiar la contraseña dentro de la app.
**Prueba independiente:** `PATCH /users/me` cambia el nombre; `phone-change` solo reemplaza el celular cuando el bot confirma.

- [ ] T037 [P] [US4] [BE] `backend/test/users.profile.e2e-spec.ts` (CA-003-14 nombre editado visible), `users.phone-change.e2e-spec.ts` (CA-003-14 celular, CA-003-32 el celular no cambia sin verificar), `auth.leak.e2e-spec.ts` (CA-003-17 las respuestas no traen `password`, `hash`, `ci` ni correos ajenos; CA-003-31 CI propia enmascarada y ajena nunca) — Depende: T013 · Cubre: CA-003-14, CA-003-17, CA-003-31, CA-003-32
- [ ] T038 [US4] [BE] `users/controllers/users.controller.ts` y `users.service.ts`: `PATCH /users/me` (solo `full_name`, 2 a 80), `POST /users/me/phone-change` (token `cambio_celular`, mismo flujo del bot) y `GET /users/me/phone-change/status`; el manejador del bot (T019) actualiza celular y Telegram solo al confirmar; `POST /auth/password/change` (contraseña actual + política, aviso por correo, incrementa `session_version` y emite sesión nueva) — Depende: T019, T013, T007, T037 · Cubre: RF-003-14, RF-003-15, RF-003-16, CA-003-14, CA-003-16, CA-003-17, CA-003-31, CA-003-32
- [x] T039 [P] [US4] [FE] Pantalla `/perfil` con mock: nombre editable; correo, CI enmascarada y celular de solo lectura; último ingreso; **Cambiar celular** (reutiliza `TelegramVerifyCard`); **Cambiar contraseña**; **Cerrar sesión** — Depende: T024, spec 000 T036 · Cubre: RF-003-14, RF-003-15, RNF-003-04
- [ ] T040 [US4] [FE] Conectar `/perfil` con `GET /auth/me`, `PATCH /users/me`, `phone-change`, `password/change` y `logout` — Depende: T038, T039 · Cubre: RF-003-14, RF-003-15

## Fase 7: Seguridad, privacidad y cierre

- [ ] T041 [BE] Prueba de privacidad de logs: un registro con contraseña, CI, celular y tokens no deja esos valores en la salida del log; revisar que no exista `GET /users/:id` (nadie ve el perfil de otro) y que la visibilidad de nombres y celulares entre miembros quede para la spec 001 (`UserPublic`) — Depende: T038 · Cubre: RNF-003-05, RF-003-16, RN-003-04, RN-003-05
- [ ] T042 [BE] Medir el tiempo de `argon2id` en staging (19 MiB / 2 iteraciones / 1 hilo) y el tiempo de `POST /auth/login` (RNF-003-06); registrar el resultado en `research.md` de la spec 000 (R5) — Depende: T028, spec 000 T053 · Cubre: RNF-003-01, RNF-003-06
- [ ] T043 [FE] Ajustes de accesibilidad de las pantallas de `features/auth/` (etiquetas asociadas, errores con `aria-live`, QR con alternativa en texto) y revisión móvil primero — Depende: T040 · Cubre: RNF-003-04
- [ ] T044 [BD] Revisar con Camila que `users` no reciba columnas de otras specs (preferencias en `notification_preferences` `0071`; baneos en `bans` `0090`) y que la FK `banned_identities.ban_ref → bans` la agregue la spec 009 — Depende: T005 · Cubre: RF-003-19
- [ ] T046 [P] [BE] `backend/src/cli/seed-dev-users.ts` (`npm run seed:dev-users -w backend`): crea, solo si `NODE_ENV` no es `production`, cuatro usuarios de prueba verificados (un titular y tres miembros) con correos fijos `titular@dev.vaquita`, `miembro1@dev.vaquita`…, celular y Telegram ficticios, CI sintética cifrada y la contraseña de `SEED_DEV_PASSWORD` (nunca en el repositorio); idempotente por correo. El seed de BD de la spec 001 (T005) los referencia por correo (spec 001, PR #43 C2) — Depende: T022 · Cubre: RF-000-06
- [ ] T045 [BE] Ejecutar `/speckit-converge`: actualizar `spec.md` y `plan.md` con lo implementado (CI aceptada solo dígitos 5 a 10, límites exactos, `auth.retry_mail`) y marcar las tareas hechas — Depende: T043, T044 · Cubre: —

## Dependencias y orden de ejecución

- **Fase 1** primero (T001–T013). T003, T004 y T005 son paralelas entre sí; T006–T010 (funciones puras) son paralelas entre sí y con las migraciones.
- **US1** es la historia mínima del MVP: sin ella no hay usuarios verificados. **US2** puede avanzar en paralelo con **US1** desde T013 usando una cuenta del `seed:admin`.
- **US5** depende de **US2**; **US3** y **US4** dependen de T013 y de los servicios de **US1** (el cambio de celular reutiliza el bot).
- Frontend: las pantallas con mock (T023, T029, T035, T039) pueden empezar cuando el contrato esté congelado; la conexión (T025, T030, T036, T040) espera al backend.

## Ejemplos de paralelización

- Con T002 hecho: T003, T004 y T005 (BD) + T006 a T010 (BE) a la vez.
- Pruebas de US1: T014, T015, T016 y T017 a la vez antes de T018.
- Pantallas con mock: T023, T029, T035 y T039 a la vez (Adrian).

## Estrategia de implementación

1. **MVP primero:** Fase 1 → US1 → US2. Con eso existe el primer flujo de punta a punta (registrarse, entrar, salir).
2. Luego US5 (bloqueo), US3 (recuperación) y US4 (perfil), que no frenan a las demás specs.
3. La spec 009 consume `IdentityService`, `UserAccountService` y `AuthGuard`: T011, T012 y T013 deben estar estables antes de empezarla.

## Puntos de integración (hitos)

- [ ] **I1:** modelo de identidad y `AuthGuard` disponibles para las demás specs (T002, T011, T012, T013)
- [ ] **I2:** contrato de API congelado (`contracts/api.md`)
- [ ] **I3:** frontend conectado al backend real (T025, T030)
- [ ] **I4:** flujo completo de registro con el bot simulado en CI (T026)

## Bloqueos y decisiones durante la implementación

| Fecha | Situación | Decisión | ¿Cambió la spec o el contrato? |
|---|---|---|---|
| 2026-10-18 | CI aceptada: solo dígitos de 5 a 10 (plan §2) | Aprobado | No |
| — | Proveedor de correo (spec 000 R-02) condiciona CA-003-09 a CA-003-13 en producción | Decidir en spec 000 T050 | No |
