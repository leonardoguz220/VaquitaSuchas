# Contrato de API — Spec 000: Setup del proyecto

- **Responsable:** Leonardo Guzman (Backend), con Adrian Vargas (Frontend) para el proxy
- **Estado:** propuesto; se congela al aprobar el plan

Este archivo tiene dos partes: (A) las **convenciones de contrato** que valen para todas las specs, y (B) los endpoints técnicos de la spec 000. Los contratos de las demás specs (`specs/NNN/contracts/api.md`) se rigen por la parte A y no la repiten.

---

## A. Convenciones para todos los contratos

### A.1 Forma general

| Tema | Regla |
|---|---|
| Formato | JSON UTF-8. Las propiedades van en `camelCase`; las columnas de la base de datos en `snake_case` (el repositorio traduce). |
| Prefijo | Sin prefijo de versión. El proxy del frontend publica `/api/<ruta>` y reenvía a `{BACKEND_URL}/<ruta>`. Swagger está en `/api/docs` del backend. |
| Identificadores | `uuid` en texto. |
| Fechas | Texto ISO 8601 en UTC con `Z` (`2026-10-18T17:00:00.000Z`), propiedades terminadas en `At`. Las fechas de calendario sin hora (período, día de corte) son `YYYY-MM-DD` o `YYYY-MM`. El frontend convierte a America/La_Paz. |
| Dinero | Enteros en centavos de Bs, propiedades terminadas en `Cents` (`totalBsCents: 6960`). Una moneda original se acompaña de `currency: "USD" \| "BS"`. Nunca decimales. |
| Tipo de cambio | Texto decimal con 4 decimales (`"6.9600"`) para no perder precisión en JSON. |
| Estados | Los valores exactos de la spec, en español (`pendiente`, `en_revision`, `esperando_pago`). |
| Listas | `GET` de colecciones aceptan `limit` (1–100, por defecto 20) y `cursor` (opaco) y devuelven `{ "items": [...], "nextCursor": string \| null }`. |
| Concurrencia | Los recursos con transiciones de estado (cobros, solicitudes) exponen `version: number`. Las acciones lo reciben opcionalmente en el cuerpo; si no coincide responde `409 STALE_STATE`. Aun sin `version`, el servidor serializa con bloqueo de fila. |
| Idempotencia | Las acciones que repiten el mismo resultado (por ejemplo generar cobros) son idempotentes por diseño; no se usa `Idempotency-Key` en el MVP. |
| Subidas | `multipart/form-data` con el campo `file` (y los demás campos como texto). Tamaño y tipos según cada spec. |
| Autenticación | Encabezado `Authorization: Bearer <jwt>` en el backend. El navegador nunca lo ve: el proxy lo agrega desde la cookie `vq_session`. |
| Renovación de sesión | Si al token le queda menos de 6 días de vida, la respuesta incluye `X-Session-Token` con uno nuevo (renovación deslizante, spec 003 RF-003-07). |
| Trazabilidad | Cada petición lleva `X-Request-Id` (se genera si falta) y se devuelve en la respuesta. |

### A.2 Formato de error (RF-000-11)

```json
{
  "statusCode": 409,
  "code": "INVALID_TRANSITION",
  "message": "Este cobro ya no admite cambios.",
  "details": { "from": "pagado", "action": "uploadReceipt" }
}
```

- `code`: texto estable en inglés `SCREAMING_SNAKE_CASE`; el frontend decide la UX por `code`, nunca por `message`.
- `message`: en español (Bolivia), sin trazas ni datos internos.
- `details`: opcional. Para validaciones: `{ "fields": { "email": ["INVALID_EMAIL"] } }`.

### A.3 Códigos HTTP y códigos de error comunes

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Cuerpo o parámetros inválidos (`details.fields`). |
| 401 | `UNAUTHENTICATED` | Sin sesión, token vencido, manipulado o con versión de sesión vieja. El proxy borra la cookie. |
| 403 | `FORBIDDEN` | Autenticado pero sin permiso dentro de un recurso que sí puede ver (por ejemplo un miembro que quiere confirmar su propio pago). |
| 404 | `NOT_FOUND` | El recurso no existe **o el usuario no tiene derecho a saber que existe** (grupos ajenos, solicitudes ajenas). |
| 409 | `INVALID_TRANSITION` / `STALE_STATE` / `CONFLICT` | Transición de estado no permitida; versión desactualizada; violación de unicidad. |
| 413 | `FILE_TOO_LARGE` | Archivo mayor al máximo. |
| 415 | `UNSUPPORTED_FILE_TYPE` | Tipo real del archivo no permitido. |
| 422 | `BUSINESS_RULE` | Regla de negocio incumplida; `details.rule` lleva el identificador (`RN-001-14`) y `details` los datos para explicarla. |
| 429 | `RATE_LIMITED` | Límite de intentos; `details.retryAfterSeconds`. |
| 500 | `INTERNAL_ERROR` | Error no controlado; mensaje genérico, sin traza. |
| 503 | `SERVICE_UNAVAILABLE` | Dependencia caída (por ejemplo, el almacén de archivos). |

**Regla 404 vs 403** (RNF-001-01, RNF-010-01): quien no pertenece al grupo recibe siempre `404`. `403` se usa solo cuando la persona sí puede ver el recurso pero no ejecutar la acción, o cuando la spec lo fija expresamente (CA-002-13, CA-010-20).

### A.4 Roles en los guards

| Guard | Efecto |
|---|---|
| `AuthGuard` | Exige JWT válido, `session_version` vigente y usuario `activo` y verificado. |
| `AdminGuard` | Exige `role = 'admin'`. |
| `GroupMemberGuard` | Exige ser miembro activo del grupo `:groupId`; si no, `404`. |
| `GroupOwnerGuard` | Exige ser el titular del grupo; si es miembro, `403`; si no pertenece, `404`. |
| `JobsTokenGuard` | Exige el encabezado `X-Jobs-Token` (comparación en tiempo constante). |

---

## B. Endpoints técnicos de la spec 000

### `GET /health` (RF-000-09, CA-000-06)
- **Auth / rol:** pública.
- **Response 200:**
  ```json
  {
    "status": "ok",
    "version": "0.1.0",
    "uptimeSeconds": 1234,
    "database": { "status": "up", "latencyMs": 4 },
    "time": "2026-10-18T17:00:00.000Z"
  }
  ```
- **Response 200 degradado:** si la base no responde en 2 s, `status: "degraded"` y `database.status: "down"`. El proceso no cae. Nunca se incluyen credenciales, URL de conexión ni mensajes de error de la base.
- **Errores:** ninguno esperado.

### `GET /api/docs` (RF-000-10, CA-000-07)
- Swagger UI. Solo si `NODE_ENV` es `development` o `test`. En producción responde `404`.

### `POST /internal/jobs/tick` (RF-000-14)
- **Auth:** `X-Jobs-Token` (variable `JOBS_TOKEN`); no usa sesión de usuario.
- **Request:** sin cuerpo. Parámetro opcional `?job=<nombre>` para ejecutar una sola tarea.
- **`?now=<fecha>` (solo `NODE_ENV` `development` o `test`):** fecha simulada que las tareas reciben como "ahora" (`YYYY-MM-DD`, tomada a las 12:00 UTC, o fecha y hora ISO con `Z` o desfase). Sirve para generar el siguiente ciclo de cobro en local y en E2E. Ignora el intervalo mínimo de la tarea y `job_runs` conserva la hora real. Formato inválido → `400 VALIDATION_ERROR` con `details.fields.now = ["INVALID_SIMULATED_NOW"]`. Con cualquier otro `NODE_ENV` (producción) se rechaza con `400` y `details.fields.now = ["NOT_ALLOWED_IN_PRODUCTION"]`, sin ejecutar nada. Sigue exigiendo `X-Jobs-Token`.
- **Cobros emitidos con `?now=` (solo `development`/`test`):** un cobro generado con fecha simulada futura tiene `issued_at` posterior a la hora real. Para que el titular pueda revisarlo, `POST /charges/:id/confirm`, `/reject` y `/manual-payment` usan `max(hora real, issued_at)` como instante de la acción (`paidAt`, fecha del evento). No hay parámetro ni encabezado nuevo: el front solo llama al endpoint de siempre. Con cualquier otro `NODE_ENV` (producción) se usa siempre la hora real y no cambia nada.
- **Response 200:**
  ```json
  { "ran": [ { "job": "billing.generate", "status": "ok", "processed": 3 },
             { "job": "billing.overdue", "status": "skipped", "reason": "locked" } ] }
  ```
- **Errores:** `400 VALIDATION_ERROR` (`job` o `now` inválidos, o `now` en producción), `401 UNAUTHENTICATED` (token incorrecto o ausente).
- Cada tarea toma `pg_try_advisory_lock(hashtext(job_name))`; si otra ejecución la tiene, responde `skipped`. Se registra una fila en `job_runs`.
- En el MVP el endpoint corre la lista de tareas registradas por las specs 002, 005 y 010. La spec 000 incluye una tarea de ejemplo, `example.noop`, y la tarea `maintenance.cleanup` (limpieza de `job_runs`, `rate_limit_events` y `telegram_updates`).

### `POST /telegram/webhook` (RF-000-22)
- **Auth:** encabezado `X-Telegram-Bot-Api-Secret-Token` igual a `TELEGRAM_WEBHOOK_SECRET`.
- **Request:** objeto `Update` de Telegram.
- **Response 200:** `{ "ok": true }` siempre que el encabezado sea correcto (aunque la actualización se ignore o ya se haya procesado).
- **Errores:** `401` si falta o no coincide el secreto.
- El manejo de las actualizaciones (token de verificación, contacto compartido) lo define la spec 003; la spec 000 entrega el endpoint, la validación, la deduplicación por `update_id` y la interfaz `TelegramGateway`.

### Solo en `TELEGRAM_MODE=dev` (CA-000-17)
- `POST /dev/telegram/simulate` — cuerpo `{ "kind": "start" \| "contact", "telegramUserId": number, "token"?: string, "phoneNumber"?: string, "contactUserId"?: number }`. Construye un `Update` con la misma forma que el de Telegram y lo procesa como si llegara por el webhook.
- `GET /dev/telegram/outbox?telegramUserId=` — mensajes que el bot "envió" a esa cuenta (texto y botones).
- `GET /dev/mail/last` no existe: el correo de desarrollo se mira en Mailpit (`http://localhost:8025`).
- En cualquier otro modo estas rutas responden `404`.

---

## C. Proxy del frontend (RF-000-15)

| Aspecto | Contrato |
|---|---|
| Ruta | `ALL /api/[...path]` en Next.js (Route Handler). |
| Destino | `{BACKEND_URL}/{path}` con los mismos método, `query` y cuerpo (incluye `multipart` sin cargarlo entero en memoria). |
| Encabezados que pasan | `Content-Type`, `Accept`, `X-Request-Id`; `Authorization` lo construye el proxy. No se reenvían `Cookie` ni `Host`. |
| Sesión | Lee la cookie `vq_session` (`httpOnly; Secure; SameSite=Lax; Path=/`). Si el backend devuelve `X-Session-Token`, reemplaza la cookie. |
| Secretos en el cuerpo de la respuesta | Si la respuesta del backend trae `sessionToken`, el proxy lo guarda en la cookie `vq_session` y **lo quita del cuerpo**. Si trae `registrationSecret`, lo guarda en la cookie `vq_reg` (`httpOnly; Secure; SameSite=Lax; Max-Age=24 h`) y también lo quita. En las rutas `/auth/register/*` el proxy agrega el encabezado `X-Registration-Secret` desde `vq_reg`. `POST /api/auth/logout` borra ambas cookies. |
| `401` | El proxy borra la cookie y devuelve el error tal cual. |
| Tiempo de espera | 30 s por petición (cubre el arranque en frío del backend). Al agotarse devuelve `504 UPSTREAM_TIMEOUT` con el formato de error. |
| Seguridad | Solo reenvía rutas dentro de `BACKEND_URL`; rechaza `..` y esquemas en `path`. |

> **Contrato congelado** al aprobarse este plan. Los cambios se hacen por PR sobre este archivo avisando a las otras dos capas.
