# Contrato de API — Spec 003: Usuarios y autenticación

- **Responsable:** Leonardo Guzman (Backend)
- **Estado:** propuesto; se congela al aprobar el plan
- Rige la parte A de `specs/000-setup-del-proyecto/contracts/api.md` (formato, errores, códigos). El proxy del frontend mueve `sessionToken` y `registrationSecret` a cookies (parte C de ese archivo); el navegador no los ve.

## Objetos

```ts
// UserSelf: lo que ve la propia persona. Nunca incluye hash, correo ajeno ni CI en claro.
UserSelf {
  id: string; fullName: string; email: string;
  ciMasked: string;            // "*****123": solo los últimos 3 dígitos (CA-003-31)
  phone: string;               // "+59171234567"
  role: "usuario" | "admin";
  status: "activo";            // un usuario no activo no llega a ver este objeto
  lastLoginAt: string | null;  // RF-003-09
  createdAt: string;
}

// UserPublic: lo que ven otros dentro de un grupo (RN-003-03). No existe un GET /users/:id general.
UserPublic { id: string; fullName: string; phone?: string }   // phone solo entre titular y miembros del mismo grupo
```

## Registro y verificación del celular

### `POST /auth/register`
- **Auth:** pública. **Límite:** 10 registros por hora por IP (`RATE_LIMITED`).
- **Request:** `{ fullName, email, ci, password, passwordConfirmation, acceptDataPolicy: true }`
  - `ci`: solo dígitos, 5 a 10. `password`: mínimo 10 caracteres, al menos una letra y un número, distinta del correo (RF-003-03).
- **Response 201:**
  ```json
  { "registrationSecret": "…", "verification": { "telegramUrl": "https://t.me/<bot>?start=<token>", "expiresAt": "…Z" } }
  ```
  El proxy guarda `registrationSecret` en la cookie `vq_reg`. No se emite sesión todavía (RF-003-04).
- **Errores:**
  - `400 VALIDATION_ERROR` (`details.fields`: `password` → `WEAK_PASSWORD` con las reglas incumplidas, `ci` → `INVALID_CI`, `acceptDataPolicy` → `POLICY_NOT_ACCEPTED`).
  - `409 EMAIL_TAKEN` "Ese correo ya está registrado" (el registro revela esto, decisión de la spec). `409 CI_TAKEN`.
  - `403 REGISTRATION_NOT_ALLOWED` "No es posible crear la cuenta con estos datos" cuando el correo o la CI tienen huella bloqueada, **sin indicar cuál** (CA-003-21, 30, 35).
  - `429 RATE_LIMITED` (5 tokens por hora por IP y por correo, RF-003-21).
- Si ya existe una cuenta **sin verificar** con ese correo, se actualiza con los datos nuevos y se emite un token nuevo (no es un duplicado); si la CI pertenece a otra cuenta sin verificar, `409 CI_TAKEN`.

### `GET /auth/register/status`
- **Auth:** encabezado `X-Registration-Secret` (lo agrega el proxy).
- **Response 200:**
  - `{ "status": "pending", "expiresAt": "…Z" }`
  - `{ "status": "expired" }` (el token venció; se puede pedir otro)
  - `{ "status": "rejected", "code": "REGISTRATION_NOT_ALLOWED" | "PHONE_NOT_BOLIVIAN" | "PHONE_ALREADY_REGISTERED" | "TELEGRAM_ALREADY_REGISTERED" }` (CA-003-22, 25, 26, 28; el mensaje de bloqueo es el genérico)
  - `{ "status": "verified", "sessionToken": "…", "user": UserSelf }` — **una sola vez**; el proxy guarda la cookie de sesión.
- **Errores:** `401 UNAUTHENTICATED` si el secreto no existe o venció (24 h).
- Se consulta cada 2 s mientras la pantalla está abierta.

### `POST /auth/register/link`
- **Auth:** `X-Registration-Secret`. **Uso:** pedir un enlace nuevo si el anterior venció (los anteriores dejan de servir).
- **Response 200:** `{ "verification": { "telegramUrl", "expiresAt" } }`. **Errores:** `429 RATE_LIMITED` (5 por hora), `401`, `409 ALREADY_VERIFIED`.

> El resto de la verificación ocurre entre Telegram y `POST /telegram/webhook` (spec 000); no hay otro endpoint público.

## Sesión

### `POST /auth/login`
- **Auth:** pública. **Request:** `{ email, password }`.
- **Response 200:** `{ "sessionToken": "…", "user": UserSelf }` (el proxy mueve el token a la cookie).
- **Errores:** `401 INVALID_CREDENTIALS` "Correo o contraseña incorrectos" (igual para correo inexistente, contraseña errónea, cuenta sin verificar, suspendida o baneada: CA-003-05, 18, 23); `429 RATE_LIMITED` con `details.retryAfterSeconds` cuando hay 5 fallos en 15 minutos para ese correo o el límite por IP (CA-003-06).
- El tiempo de respuesta se iguala con un hash de relleno cuando el correo no existe (RNF-003-03).

### `POST /auth/logout`
- **Auth:** sesión. **Response 204.** Incrementa `session_version` (CA-003-08, 33); el proxy borra la cookie.

### `GET /auth/me`
- **Auth:** sesión. **Response 200:** `UserSelf`. **Errores:** `401`.

## Recuperación de contraseña

### `POST /auth/password/forgot`
- **Auth:** pública. **Request:** `{ email }`.
- **Response 202:** `{ "message": "Si el correo está registrado, recibirás un enlace en unos minutos." }` **idéntica** exista o no la cuenta (CA-003-09). Una cuenta baneada, suspendida o sin verificar no recibe correo y la respuesta es la misma (CA-003-23).
- **Errores:** `429 RATE_LIMITED` si ya hubo 3 pedidos en la última hora para ese correo (CA-003-13). Este error sí se muestra aunque el correo no exista, para no filtrar existencia por diferencia de respuesta: el contador es por correo escrito, exista o no.

### `POST /auth/password/reset`
- **Auth:** pública (el token del enlace). **Request:** `{ token, newPassword, newPasswordConfirmation }`.
- **Response 204.** Marca el token usado, incrementa `session_version`, envía correo de aviso (CA-003-10, 16).
- **Errores:** `400 VALIDATION_ERROR` (política); `410 RESET_TOKEN_INVALID` (vencido, usado o reemplazado: CA-003-11, 12) con `details.canRequestNew: true`.

### `POST /auth/password/change`
- **Auth:** sesión. **Request:** `{ currentPassword, newPassword, newPasswordConfirmation }`.
- **Response 200:** `{ "sessionToken": "…" }` (token nuevo, porque la versión de sesión cambió; las demás sesiones se cierran, CA-003-16) y correo de aviso.
- **Errores:** `422 CURRENT_PASSWORD_WRONG` (cuenta como intento fallido), `400 VALIDATION_ERROR`, `429 RATE_LIMITED`.

## Perfil

### `PATCH /users/me`
- **Auth:** sesión. **Request:** `{ fullName }` (2–80). **Response 200:** `UserSelf`.
- El correo y la CI no se editan (RF-003-14): se rechazan con `400 FIELD_NOT_EDITABLE` si llegan en el cuerpo.

### `POST /users/me/phone-change`
- **Auth:** sesión. **Response 201:** `{ "verification": { "telegramUrl", "expiresAt" } }`. Límite compartido de 5 tokens por hora.
- El número nuevo se obtiene de la cuenta de Telegram que comparta su contacto con el bot; hasta entonces el celular anterior sigue vigente (CA-003-32).

### `GET /users/me/phone-change/status`
- **Response 200:** `{ "status": "pending" | "expired" | "rejected" | "verified", "code"?: …, "user"?: UserSelf }`.

## Errores propios de la spec

| `code` | HTTP | Mensaje (es-BO) |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Correo o contraseña incorrectos. |
| `REGISTRATION_NOT_ALLOWED` | 403 | No es posible crear la cuenta con estos datos. |
| `EMAIL_TAKEN` | 409 | Ese correo ya está registrado. |
| `CI_TAKEN` | 409 | Ya existe una cuenta con esa cédula. |
| `PHONE_ALREADY_REGISTERED` / `TELEGRAM_ALREADY_REGISTERED` | (estado en `status`) | Ya existe una cuenta con ese celular / esa cuenta de Telegram. |
| `RESET_TOKEN_INVALID` | 410 | Este enlace venció o ya se usó. Pide uno nuevo. |
| `WEAK_PASSWORD` | 400 | La contraseña debe tener al menos 10 caracteres, una letra y un número, y no ser igual al correo. |

> **Contrato congelado** al aprobarse el plan. Los cambios se hacen por PR sobre este archivo avisando a las otras dos capas.
