# Plan técnico — Spec 003: Usuarios y autenticación

- **Spec relacionada:** `specs/003-usuarios-y-autenticacion/spec.md` (debe estar **aprobada** por BD, Backend y Frontend)
- **Líder de la spec:** Leonardo Guzman (Backend)
- **Última actualización:** 2026-10-18
- **Artefactos:** [`data-model.md`](data-model.md) · [`contracts/api.md`](contracts/api.md) · [`quickstart.md`](quickstart.md)

| Capa | Responsable | Secciones | Visto bueno |
|---|---|---|---|
| Base de datos | Camila | §3 (y `data-model.md`) | pendiente |
| Backend | Leonardo | §4, §5, §7 (y `contracts/api.md`) | pendiente |
| Frontend | Adrian | §6 | pendiente |

## Constitución: verificación

| Principio | ¿Cumple? | Nota |
|---|---|---|
| I. Spec primero | Sí | Todo sale de la spec 003; las decisiones nuevas están en §2. |
| II. Dinero exacto | N/A | Sin dinero. |
| III. Criterios verificables | Sí | CA-003-01 a 35 mapeados en §8. |
| IV. Seguridad y privacidad | Sí | argon2id, CI cifrada, huellas HMAC, tokens solo como hash (§7). |
| V. Contratos primero | Sí | `contracts/api.md`. |
| VI. Simplicidad | Sí | Sin librerías de autenticación externas; Passport solo para el JWT. |
| VII. Capas | Sí | Reglas en `domain/` puras; SQL en `repositories/`. |

## 1. Resumen de la solución

Dos módulos de NestJS: `users` (perfil, identidad y huellas) y `auth` (registro, sesión, recuperación y verificación por Telegram). El registro crea un usuario **sin verificar** con su CI cifrada y devuelve un enlace al bot con un token de un solo uso. El bot (webhook de la spec 000) recibe `/start <token>` y el contacto compartido; si el contacto es de la propia cuenta de Telegram, es boliviano, único y no está bloqueado, marca la cuenta como verificada. El frontend consulta el estado hasta que el backend emite la sesión (JWT en cookie httpOnly, con `session_version`). Una tarea horaria borra las cuentas sin verificar de más de 24 horas.

## 2. Decisiones técnicas

| Decisión | Opción elegida | Alternativas descartadas | Motivo |
|---|---|---|---|
| Hash de contraseña | argon2id, 19 MiB / 2 iteraciones / 1 hilo (spec 000, R5) | bcrypt | CPU limitada del plan gratuito; cumple RNF-003-01. |
| Token de sesión | JWT HS256 con `sub`, `sv` (session_version), `iat`, `exp` (7 días) | Sesiones en base de datos | Spec: JWT + versión de sesión (RF-003-07). |
| Renovación deslizante | Si al token le quedan < 6 días, la respuesta lleva `X-Session-Token` nuevo | Refresh tokens | Más simple; cumple "7 días desde la última actividad". |
| Validación de sesión | `AuthGuard` carga `users.session_version` y `status` por petición (consulta por clave primaria) | Caché en memoria | < 1 ms; un cambio de versión surte efecto al instante (CA-003-08, 33). |
| Registro sin sesión | `registrationSecret` aleatorio (32 bytes) distinto del token del enlace; solo su hash se guarda | Usar el mismo token | El token viaja por el enlace a Telegram; el secreto de sondeo nunca sale del navegador del registrante. |
| Estado del registro | Fila `users` con `verified_at NULL` + tokens | Tabla `pending_registrations` aparte | Reutiliza las unicidades de correo y CI y evita duplicar columnas. |
| Cifrado de la CI | AES-256-GCM, clave de `CI_ENCRYPTION_KEY` (32 bytes en base64), prefijo de 1 byte con la versión de clave | Cifrado en la base (pgcrypto) | La clave nunca llega a la base; permite rotar. |
| Huellas de bloqueo | `HMAC-SHA256(FINGERPRINT_KEY, "kind:valor")` en hex | Hash simple | Sin la clave del servidor no se pueden probar candidatos (CI y celular tienen pocos valores posibles). |
| Normalización de correo para bloqueo | minúsculas, sin espacios; si el dominio es `gmail.com` o `googlemail.com`: sin puntos y sin `+alias` en la parte local | Solo minúsculas | RF-003-19, CA-003-35. |
| Límites de intentos | `rate_limit_events` (spec 000) | Memoria del proceso | El servicio se reinicia y se duerme; los límites deben sobrevivir. |
| Verificación por Telegram | Estado en la base (`started_by_telegram_id`), bot sin estado | Sesiones de conversación en memoria | El proceso puede reiniciarse entre `/start` y el contacto. |
| CI aceptada | Solo dígitos, 5 a 10 | Formato con complemento o extensión | La spec dice "solo el número". **Aprobada el 2026-10-18**; cambiar la expresión regular es trivial. |
| Política de datos | Texto versionado en `backend/src/modules/auth/policy.ts` (`DATA_POLICY_VERSION`), con fecha de aceptación | Archivo aparte | Se muestra desde `GET /auth/policy` (contenido estático). |
| Registro con correo de cuenta sin verificar | Se actualiza esa cuenta | Rechazar | La cuenta no tiene sesión y se borra a las 24 h; evita bloquear a la persona que se equivocó. |

## 3. Modelo de datos — _Camila (BD)_

Detalle en [`data-model.md`](data-model.md): `users`, `phone_verification_tokens`, `password_reset_tokens`, `banned_identities` (migraciones 0010 a 0013), con sus restricciones (correo, CI, celular y Telegram únicos; formato del celular; `role` y `status` con `CHECK`; verificado implica celular y Telegram salvo `admin`), índices y pruebas de integridad.

Seed: ningún usuario. El administrador de desarrollo lo crea `npm run seed:admin -w backend` (§5).

## 4. Contratos de API — _Leonardo (Backend)_

Detalle en [`contracts/api.md`](contracts/api.md): `POST /auth/register`, `GET /auth/register/status`, `POST /auth/register/link`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password/forgot`, `POST /auth/password/reset`, `POST /auth/password/change`, `PATCH /users/me`, `POST /users/me/phone-change`, `GET /users/me/phone-change/status`, `GET /auth/policy`.

> **Contrato congelado** al aprobarse este plan. Los cambios se hacen por PR sobre este archivo y avisando a las otras dos capas.

## 5. Lógica de dominio — _Leonardo (Backend)_

### Estructura

```text
backend/src/modules/
├── auth/
│   ├── controllers/   auth.controller.ts, password.controller.ts
│   ├── services/      registration.service.ts, session.service.ts, password.service.ts,
│   │                  telegram-verification.handler.ts, purge-unverified.job.ts
│   ├── domain/        email.ts, password-policy.ts, ci.ts, phone.ts, login-lock.ts, tokens.ts
│   ├── repositories/  verification-tokens.repository.ts, reset-tokens.repository.ts
│   └── guards/        auth.guard.ts, admin.guard.ts (exportados a shared/guards)
└── users/
    ├── controllers/   users.controller.ts
    ├── services/      users.service.ts, identity.service.ts (cifrado, huellas, bloqueo)
    ├── domain/        ci-mask.ts
    └── repositories/  users.repository.ts, banned-identities.repository.ts
```

### Funciones puras (`domain/`, con pruebas unitarias)

| Función | Entradas → salida | Reglas |
|---|---|---|
| `normalizeEmail(raw)` | texto → texto | `trim` + minúsculas (RF-003-02). |
| `canonicalEmailForBan(email)` | correo normalizado → texto | Gmail/googlemail: quita puntos de la parte local, quita desde el primer `+`; otros dominios, igual al normalizado. |
| `validatePassword(password, email)` | → lista de reglas incumplidas | ≥ 10 caracteres, ≥ 1 letra, ≥ 1 número, distinta del correo (comparación sin mayúsculas). |
| `normalizeCi(raw)` | → texto o error | Quita espacios; solo dígitos, 5 a 10. |
| `maskCi(ci)` | → `"*****123"` | Deja los 3 últimos dígitos. |
| `normalizeBolivianPhone(raw)` | → `+591XXXXXXXX` o error | Acepta `591…`, `+591…`, `8 dígitos`; 8 dígitos que empiezan con 6 o 7 (RF-003-05). Telegram entrega el número a veces sin `+`. |
| `loginLockStatus(failureTimestamps, now)` | → `{ locked, retryAfterSeconds }` | Con ≥ 5 fallos en los últimos 15 min, bloqueado hasta 15 min después del 5.º fallo contado (CA-003-06). |
| `resetRequestAllowed(count, limit=3)` | → boolean | Límite por hora (CA-003-13). |
| `tokenIsUsable(token, now)` | → `usable` \| `expired` \| `used` | Vencimiento y un solo uso. |
| `fingerprint(kind, value, key)` | → hex | HMAC-SHA256; vive en `users/services/identity.service.ts` (usa `crypto`, no es puro del todo). |

### Servicios y flujos

**Registro (`RegistrationService.register`)**
1. Validar con las funciones puras. Verificar límite por IP (`rate_limit_events`, bucket `register:ip`).
2. Calcular `email_fingerprint` y `ci_fingerprint`; consultar `banned_identities`. Si alguno está bloqueado → `403 REGISTRATION_NOT_ALLOWED` (mismo mensaje, sin indicar cuál).
3. En una transacción: crear (o actualizar, si estaba sin verificar) el `users` con CI cifrada; crear el token del enlace y el secreto de sondeo (solo hashes); registrar un evento de límite (`tg_token:ip` y `tg_token:email`, máximo 5 por hora cada uno).
4. Responder con `telegramUrl` (`https://t.me/<TELEGRAM_BOT_USERNAME>?start=<token>`; el token en base64url de 32 bytes cabe en los 64 caracteres que admite Telegram) y `registrationSecret`.

**Verificación por Telegram (`TelegramVerificationHandler`, registrado en el despachador del webhook de la spec 000)**
- `/start <token>`: buscar el token por hash. Si no existe, vencido o usado → mensaje del bot "El enlace venció, vuelve a Vaquita y pide uno nuevo". Si sirve: guardar `started_at` y `started_by_telegram_id` (si ya estaba iniciado por otra cuenta de Telegram, se rechaza para evitar secuestro) y responder con un teclado de respuesta con el botón `request_contact` "Compartir mi número".
- Mensaje con contacto: buscar un token **iniciado por ese `from.id`**, no usado y vigente. Validar en orden: (a) `contact.user_id === from.id` (si no → `rechazado_contacto_ajeno`); (b) `normalizeBolivianPhone` (si no → `rechazado_no_boliviano`); (c) huellas de celular y de Telegram no bloqueadas (→ `rechazado_bloqueado`, mensaje genérico); (d) celular y `telegram_user_id` no usados por otra cuenta (→ `rechazado_duplicado`). Todo en una transacción con `SELECT … FOR UPDATE` del token: si pasa, guardar celular y Telegram en el usuario, marcar `verified_at` (propósito `registro`) o actualizar celular y Telegram (propósito `cambio_celular`), marcar el token usado con su `outcome`, y responder al usuario "Listo, vuelve a Vaquita" (y quitar el teclado).
- Cualquier otro mensaje: el bot responde con una ayuda corta; nunca ejecuta acciones.
- La deduplicación por `update_id` y la validación del secreto del webhook ya las hace la spec 000.

**Sondeo (`GET /auth/register/status`)**: busca el token vigente más reciente del usuario por el hash del secreto. Si el usuario quedó verificado y el secreto no se había canjeado → emite el `sessionToken` (sin cambiar `session_version`), marca el secreto como canjeado (guardando `registration_secret_hash = NULL`) y lo devuelve **una sola vez**.

**Sesión**: `SessionService.issue(user)` firma el JWT (`sub`, `sv`, `iat`, `exp`). `AuthGuard` verifica firma, `exp`, que el usuario exista, esté `activo`, `verified_at` no sea nulo y `sv` coincida; si no → `401 UNAUTHENTICATED`. `logout`, cambio de contraseña, restablecimiento y baneo/suspensión (spec 009) incrementan `session_version` en una sola sentencia `UPDATE … RETURNING`.

**Inicio de sesión**: (1) `loginLockStatus` por correo y por IP; (2) buscar usuario; (3) verificar contraseña con argon2id, o contra un hash de relleno si no existe/no está habilitado, para igualar el tiempo; (4) si falla, registrar evento `login_fail:email` y `login_fail:ip`; (5) si pasa, actualizar `last_login_at`. El mensaje es siempre el mismo (CA-003-05).

**Recuperación**: `forgot` cuenta un evento `reset:email` por correo escrito (3 por hora); si la cuenta existe, está activa y verificada, invalida los tokens anteriores (`used_at = now()`), crea uno nuevo de 32 bytes (30 min), guarda su hash y envía el correo mediante `MailService` **después** de confirmar la transacción; si el envío falla se registra el error y se reintenta con la tarea `auth.retry_mail` (hasta 3 veces); la respuesta al usuario es la misma. `reset` valida política, marca el token usado, cambia el hash, incrementa `session_version` y envía el aviso de cambio.

**Perfil**: `PATCH /users/me` solo cambia `full_name`. `phone-change` crea un token `cambio_celular`; el celular y el Telegram se reemplazan solo cuando el bot confirma (CA-003-32).

**Baneo (consumido por la spec 009)**: `IdentityService.blockIdentities(userId, banId)` inserta las cuatro huellas (correo canónico, celular, CI —se reutiliza `ci_fingerprint`— y Telegram) en `banned_identities` y `IdentityService.releaseIdentities(banId)` las borra al revertir. No requiere descifrar la CI.

**Cambios de estado de la cuenta (consumidos por la spec 009)**: `UserAccountService.setStatus(tx, userId, status)` (`activo`, `suspendido`, `baneado`) es el único punto que escribe `users.status`; incrementa `session_version` (cierra las sesiones, CA-009-09, CA-009-22), registra el cambio en el log de la aplicación (sin datos personales) y publica `UserSuspended`, `UserReactivated` o `UserBanned` por el `TxEventBus`. `AuthGuard` y el inicio de sesión rechazan `suspendido` y `baneado` (CA-003-18, CA-003-23). `UserAccountService.setRole(tx, userId, role)` hace lo mismo para el rol (RF-009-03).

**Tarea `auth.purge_unverified`** (cada hora, idempotente): `DELETE FROM users WHERE verified_at IS NULL AND created_at < now() - interval '24 hours'` (los tokens se van en cascada).

**CLI `seed:admin`** (`backend/src/cli/seed-admin.ts`): lee `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, `SEED_ADMIN_PASSWORD`; si faltan, falla con un mensaje. Crea un usuario `admin` verificado sin celular ni Telegram (permitido por el `CHECK`). Como `ci_encrypted` y `ci_fingerprint` son obligatorios, se guarda una CI sintética `ADMIN-<uuid>` (cifrada y con su huella); no cumple el formato de CI de usuarios, así que no puede chocar con una persona real. Es idempotente por correo. En `NODE_ENV=production` solo corre si se pasa `--allow-production` (spec 009, RF-009-02, CA-009-20).

## 6. Interfaz de usuario — _Adrian (Frontend)_

### Pantallas (App Router, textos en español de Bolivia)

| Ruta | Rol | Contenido | Endpoint |
|---|---|---|---|
| `/registro` | Visitante | Formulario: nombre, correo, CI, contraseña y confirmación, casilla de la política de datos (con enlace a la política en un modal). Validación en vivo de las reglas de contraseña (lista con marca de cumplida). | `POST /auth/register`, `GET /auth/policy` |
| `/registro/verificar` | Visitante con `vq_reg` | Paso 2 de 2: explica "Necesitas Telegram para verificar tu celular", botón **Abrir Telegram** (enlace `telegramUrl`) y código QR del mismo enlace para quien está en computadora; cuenta regresiva de 10 min; sondeo cada 2 s. Estados: esperando, vencido (botón "Pedir un enlace nuevo"), rechazado (mensaje según `code`; el bloqueo muestra el genérico), verificado (redirige a `/`). | `GET /auth/register/status`, `POST /auth/register/link` |
| `/ingresar` | Visitante | Correo y contraseña; errores genéricos; mensaje de espera con cuenta regresiva si hay `RATE_LIMITED`. Enlace a `/recuperar` y a `/registro`. Conserva `?codigo=` y `next=` para volver (spec 001/005). | `POST /auth/login` |
| `/recuperar` | Visitante | Campo de correo; siempre muestra el mismo mensaje de éxito. | `POST /auth/password/forgot` |
| `/recuperar/[token]` | Visitante | Nueva contraseña y confirmación con reglas en vivo; si el token falla, mensaje claro y botón para pedir otro. | `POST /auth/password/reset` |
| `/perfil` | Usuario | Datos: nombre editable; correo, CI enmascarada y celular de solo lectura; último ingreso; botón **Cambiar celular** (misma pantalla de verificación con Telegram); formulario **Cambiar contraseña**; botón **Cerrar sesión**. | `GET /auth/me`, `PATCH /users/me`, `POST /users/me/phone-change`, `POST /auth/password/change`, `POST /auth/logout` |

### Componentes de `features/auth/`
`PasswordRules`, `TelegramVerifyCard` (enlace, QR, estado), `PolicyModal`, `AuthShell` (layout móvil primero con tarjeta centrada).

### Reglas de UX
- Solo se valida en vivo; la decisión es siempre del servidor (regla 8 de CLAUDE.md). Los mensajes se eligen por `code`.
- Estados de cada pantalla: cargando (botón con `loading`), error (aviso arriba del formulario), éxito.
- Accesibilidad: etiquetas asociadas a los campos, errores anunciados (`aria-live`), el QR tiene alternativa en texto (el enlace).
- Si `GET /auth/me` devuelve `401`, `proxy.ts` y el cliente redirigen a `/ingresar?next=…`.
- Pantalla de desarrollo `/dev/telegram` (solo con `NEXT_PUBLIC_TELEGRAM_MODE=dev`): campo para pegar el token, botones "Enviar /start" y "Compartir contacto" que llaman a `POST /dev/telegram/simulate`, y la bandeja del bot. Permite probar el registro completo sin Telegram real.

## 7. Seguridad y permisos — _Leonardo (Backend), con revisión de BD_

- **Quién puede qué:** visitante → registro, ingreso, recuperación; usuario → su perfil y sesión; nadie ve el perfil de otro (no existe `GET /users/:id`). La visibilidad de nombres y celulares entre miembros la aplica la spec 001 con `UserPublic`.
- **Contraseñas:** argon2id; no se registran ni se devuelven; el redactor de logs oculta `password*`.
- **Tokens:** aleatorios de 32 bytes (`crypto.randomBytes`), base64url; en la base solo SHA-256; comparación en tiempo constante.
- **Cookie de sesión:** la maneja el proxy (`httpOnly; Secure; SameSite=Lax`). El backend no usa cookies, así que no hay CSRF clásico: la cookie `Lax` más el rechazo de métodos no seguros desde otros orígenes (el proxy exige `Origin` del propio sitio en `POST/PATCH/DELETE`) cubren el caso.
- **CI:** cifrada en reposo; nunca en logs ni en respuestas a terceros; el dueño la ve enmascarada (CA-003-31); el administrador, enmascarada (spec 009).
- **Enumeración:** la recuperación y el ingreso responden igual exista o no la cuenta; el registro sí revela "correo ya registrado" (decisión de la spec) con límite por IP.
- **Telegram:** el contacto solo se acepta si `contact.user_id === from.id`; el token del enlace está ligado a la primera cuenta de Telegram que pulsa Iniciar; el secreto de sondeo nunca viaja a Telegram.
- **Límites:** `login_fail:email` y `login_fail:ip` (5 en 15 min, la IP con umbral de 20), `reset:email` (3/h), `tg_token:ip` y `tg_token:email` (5/h), `register:ip` (10/h).
- **Privacidad de logs:** las pruebas verifican que ni el correo, la CI, el celular ni los tokens aparecen en la salida del log (RF-000-13).
- **Datos del bot:** no se guarda el nombre ni el usuario de Telegram, solo el identificador numérico.

## 8. Estrategia de pruebas

| Criterio de aceptación | Nivel | Capa | Test |
|---|---|---|---|
| CA-003-01 (registro válido → hash y sesión tras verificar) | Integración | BE | `auth.register.e2e-spec.ts` (registro + simulación de Telegram + sondeo → sesión) |
| CA-003-02 (correo repetido, otra capitalización) | Integración + integridad | BE, BD | `auth.register.e2e-spec.ts`; `users.integrity.test.ts` |
| CA-003-03 (contraseña de 8 caracteres) | Unitario + integración | BE | `password-policy.spec.ts`; `auth.register.e2e-spec.ts` |
| CA-003-04 (cookie httpOnly) | E2E | FE | `frontend/e2e/auth.spec.ts` (la cookie existe con `httpOnly` y `document.cookie` no la lista); integración del proxy |
| CA-003-05 (mensaje genérico idéntico) | Integración | BE | `auth.login.e2e-spec.ts` (compara cuerpo y estado) |
| CA-003-06 (bloqueo de 15 min) | Unitario + integración | BE | `login-lock.spec.ts`; `auth.login.e2e-spec.ts` con `FakeClock` |
| CA-003-07 (sin sesión → 401) | Integración | BE | `auth.guard.e2e-spec.ts` |
| CA-003-08 (logout invalida el token) | Integración | BE | `auth.session.e2e-spec.ts` |
| CA-003-09 (respuesta idéntica en recuperación) | Integración | BE | `auth.password.e2e-spec.ts` |
| CA-003-10 (reset válido: nueva contraseña, enlace muerto, otras sesiones cerradas) | Integración | BE | `auth.password.e2e-spec.ts` |
| CA-003-11 (enlace de más de 30 min) | Unitario + integración | BE | `tokens.spec.ts`; `auth.password.e2e-spec.ts` |
| CA-003-12 (dos enlaces seguidos: el primero muere) | Integración | BE | `auth.password.e2e-spec.ts` |
| CA-003-13 (límite de 3 por hora) | Integración | BE | `auth.password.e2e-spec.ts` |
| CA-003-14 (editar nombre y celular se ve en grupos) | Integración | BE | `users.profile.e2e-spec.ts` (nombre); el celular, `users.phone-change.e2e-spec.ts`; la vista en grupos se prueba en la spec 001 (CA-001-20) |
| CA-003-15 (celular de 7 dígitos) | Unitario + integridad | BE, BD | `phone.spec.ts`; `users.integrity.test.ts` |
| CA-003-16 (cambio de contraseña autenticado) | Integración | BE | `auth.password.e2e-spec.ts` (correo en Mailpit) |
| CA-003-17 (sin hash ni correos ajenos en respuestas) | Integración | BE | `auth.leak.e2e-spec.ts`: recorre las respuestas de la API buscando `password`, `hash`, `ci`, correos ajenos |
| CA-003-18 (suspendido no entra) | Integración | BE | `auth.login.e2e-spec.ts` |
| CA-003-19 (registros simultáneos con el mismo correo) | Integración + integridad | BE, BD | `auth.register.concurrency.e2e-spec.ts` (`Promise.all` de dos registros → un solo éxito) |
| CA-003-20 (JWT manipulado) | Integración | BE | `auth.guard.e2e-spec.ts` |
| CA-003-21 (cuenta baneada: correo con otras mayúsculas) | Integración | BE | `auth.ban.e2e-spec.ts` |
| CA-003-22 (mismo celular, correo distinto) | Integración | BE | `auth.ban.e2e-spec.ts` (el rechazo ocurre en la verificación del celular) |
| CA-003-23 (baneada: no entra ni recupera) | Integración | BE | `auth.ban.e2e-spec.ts` |
| CA-003-24 (tabla de bloqueos solo con huellas) | Integridad | BD | `users.integrity.test.ts` |
| CA-003-25 (sin CI o celular no boliviano) | Integración | BE | `auth.register.e2e-spec.ts`, `telegram.verify.e2e-spec.ts` |
| CA-003-26 (celular, Telegram o CI repetidos) | Integración + integridad | BE, BD | `telegram.verify.e2e-spec.ts`; `users.integrity.test.ts` |
| CA-003-27 (token válido + contacto propio → verificado y con sesión) | Integración + E2E | BE, FE | `telegram.verify.e2e-spec.ts`; `frontend/e2e/register.spec.ts` |
| CA-003-28 (token vencido/usado o contacto ajeno) | Integración | BE | `telegram.verify.e2e-spec.ts` |
| CA-003-29 (sexto token en una hora) | Integración | BE | `telegram.verify.e2e-spec.ts` |
| CA-003-30 (baneada: CI o Telegram con otros datos) | Integración | BE | `auth.ban.e2e-spec.ts` |
| CA-003-31 (CI ajena nunca; propia enmascarada) | Integración | BE | `auth.leak.e2e-spec.ts`; `ci-mask.spec.ts` |
| CA-003-32 (cambio de celular sin verificar) | Integración | BE | `users.phone-change.e2e-spec.ts` |
| CA-003-33 (versión de sesión) | Integración | BE | `auth.session.e2e-spec.ts` |
| CA-003-34 (sin aceptar la política) | Integración | BE | `auth.register.e2e-spec.ts` |
| CA-003-35 (alias de Gmail) | Unitario + integración | BE | `email.spec.ts`; `auth.ban.e2e-spec.ts` |

Pruebas de reglas: RN-003-01 y RN-003-02 → `users.integrity.test.ts`; RN-003-03 (visibilidad entre usuarios) → spec 001 (`groups.members.e2e-spec.ts`) y spec 010 (CA-010-13); RN-003-04 y RN-003-05 → revisión (sin lógica propia). Purga a las 24 h → `purge-unverified.job.spec.ts`. Flujo completo del MVP: `frontend/e2e/mvp.spec.ts` usa estas pantallas con el bot simulado.

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Quien no tiene Telegram no puede registrarse | Alta | Medio | Limitación aceptada (ADR 0005); el registro lo explica antes del formulario. Un respaldo de pago queda fuera. |
| El webhook llega con el servicio dormido y el sondeo no avanza | Media | Bajo | Disparador externo (spec 000, R1); Telegram reintenta; el enlace sirve 10 min y se puede pedir otro. |
| Secuestro del enlace al bot (otra persona lo abre primero) | Baja | Medio | El token se liga a la primera cuenta de Telegram que pulsa Iniciar; el contacto debe ser el propio; el secreto de sondeo evita que otro obtenga la sesión. |
| Un solo usuario agota el límite de 5 tokens por hora por IP detrás de una IP compartida (red del colegio) | Media | Bajo | Límite por correo además de por IP; mensaje con tiempo de espera. |
| Fuga de `CI_ENCRYPTION_KEY` o `FINGERPRINT_KEY` | Baja | Alto | Solo en variables de entorno; gitleaks; la rotación está prevista por el byte de versión (cifrado) y requiere recalcular huellas (procedimiento documentado, no automatizado). |
| El correo de recuperación no llega (ver spec 000, R-02) | Alta sin dominio | Medio | Proveedor configurable; demo con correos de los integrantes; el flujo siempre responde igual. |
| Argon2 lento en Render gratuito | Baja | Medio | Medir en staging; ajustar memoria/iteraciones. |
| Cuentas sin verificar ocupan correo y CI 24 h | Media | Bajo | Se permite actualizar la cuenta sin verificar con el mismo correo; la purga es horaria. |

## 10. Trazabilidad

| Requisito | Cubierto en |
|---|---|
| RF-003-01 (campos del registro) | §4 `register`, §5 registro, §6 `/registro` |
| RF-003-02 (correo único normalizado) | §3, §5 `normalizeEmail`, CA-003-02 |
| RF-003-03 (política de contraseña) | §5 `validatePassword`, CA-003-03 |
| RF-003-04 (registro se completa al verificar; 24 h) | §5 sondeo y `auth.purge_unverified` |
| RF-003-05 (celular boliviano único) | §3, §5 `normalizeBolivianPhone`, CA-003-15/26 |
| RF-003-06 (JWT en cookie httpOnly) | §5 sesión, spec 000 contrato C, CA-003-04 |
| RF-003-07 (7 días deslizante, versión de sesión) | §2, §5 sesión, CA-003-08/33 |
| RF-003-08 (401) | §5 `AuthGuard`, CA-003-07/20 |
| RF-003-09 (último ingreso) | §4 `UserSelf.lastLoginAt`, §5 inicio de sesión |
| RF-003-10 a RF-003-13 (recuperación) | §5 recuperación, §8 CA-003-09 a 13 |
| RF-003-14 (perfil; celular se verifica de nuevo) | §5 perfil, CA-003-14/32 |
| RF-003-15 (cambiar contraseña) | §4, §5, CA-003-16 |
| RF-003-16 (visibilidad) | §7, spec 001 |
| RF-003-17 (bloqueo por intentos) | §5 `loginLockStatus`, CA-003-06 |
| RF-003-18 (límite de recuperación) | §5, CA-003-13 |
| RF-003-19 (huellas de baneo) | §3 `banned_identities`, §5 baneo, CA-003-21/22/24/30/35 |
| RF-003-20 (baneada no entra) | §5 `AuthGuard` e inicio de sesión, CA-003-23 |
| RF-003-21 (verificación por Telegram) | §5 `TelegramVerificationHandler`, CA-003-25 a 29 |
| RF-003-22 (CI cifrada y única) | §2, §3, §7, CA-003-31 |
| RF-003-23 (política de datos) | §2, §6, CA-003-34 |
| RNF-003-01 a RNF-003-06 | §2, §5, §7 (hash, mensaje genérico, tiempo constante, validación en vivo, privacidad, rendimiento medido en staging) |
| RN-003-01 a RN-003-05 | §3, §8 (pruebas de reglas) |
| CA-003-01 a CA-003-35 | §8 |
