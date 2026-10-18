# Modelo de datos — Spec 003: Usuarios y autenticación

- **Responsable:** Camila Fuentes (Base de datos)
- **Migraciones:** `0010` a `0019`
- **Estado:** propuesto; se congela al aprobar el plan
- Convenciones de `specs/000-setup-del-proyecto/data-model.md` (uuid, `timestamptz`, `snake_case`, `created_at`/`updated_at`).

## 1. Tablas

### `users` — `0010_users.sql`

```
users
- id: uuid (PK)
- full_name: text (NOT NULL)                       CHECK char_length(btrim(full_name)) BETWEEN 2 AND 80
- email: text (NOT NULL, UNIQUE)                   CHECK email = lower(btrim(email)); formato validado en el backend
- email_fingerprint: text (NOT NULL)               HMAC del correo normalizado para bloqueo (Gmail sin puntos ni alias); INDEX, no único
- password_hash: text (NOT NULL)                   argon2id; nunca se devuelve
- role: text (NOT NULL, default 'usuario')         CHECK IN ('usuario','admin')
- status: text (NOT NULL, default 'activo')        CHECK IN ('activo','suspendido','baneado')
- ci_encrypted: bytea (NOT NULL)                   AES-256-GCM: versión_de_clave(1) ‖ iv(12) ‖ etiqueta(16) ‖ texto cifrado
- ci_fingerprint: text (NOT NULL, UNIQUE)          HMAC de la CI normalizada
- phone_e164: text (NULL, UNIQUE)                  CHECK phone_e164 ~ '^\+591[67][0-9]{7}$'
- telegram_user_id: bigint (NULL, UNIQUE)
- verified_at: timestamptz (NULL)                  NULL = registro sin completar
- data_policy_accepted_at: timestamptz (NOT NULL)
- data_policy_version: text (NOT NULL)
- session_version: integer (NOT NULL, default 0)   CHECK >= 0
- last_login_at: timestamptz (NULL)
- created_at, updated_at
CHECK users_verified_requires_identity:
  verified_at IS NULL OR role = 'admin' OR (phone_e164 IS NOT NULL AND telegram_user_id IS NOT NULL)
INDEX users_unverified_idx (created_at) WHERE verified_at IS NULL           -- limpieza a las 24 h
INDEX users_email_fingerprint_idx (email_fingerprint)
INDEX users_name_search_idx ON (immutable_unaccent(lower(full_name)))        -- búsqueda del admin (spec 009)
```

Notas de integridad:
- **Unicidad de celular, CI, Telegram y correo** en la base (RF-003-05, RF-003-22, CA-003-19, CA-003-26). Las cuentas sin verificar también ocupan correo y CI (se liberan al borrarse a las 24 h, ver caso borde de la spec).
- El administrador creado por comando puede no tener celular ni Telegram (CHECK de arriba). Un usuario común verificado siempre los tiene (RN-003-03).
- La CI nunca se guarda en claro. `ci_fingerprint` sirve para la unicidad y para el bloqueo de baneo.
- El **estado de verificación** no es un valor de `status`: se deduce de `verified_at`.

### `phone_verification_tokens` — `0011_phone_verification_tokens.sql`

Un token de un solo uso por intento de verificación del celular (RF-003-21).

```
phone_verification_tokens
- id: uuid (PK)
- user_id: uuid (NOT NULL, FK users ON DELETE CASCADE)
- purpose: text (NOT NULL)                         CHECK IN ('registro','cambio_celular')
- token_hash: text (NOT NULL, UNIQUE)              SHA-256 del token que va en el enlace al bot
- registration_secret_hash: text (NULL)            SHA-256 del secreto de sondeo; solo en 'registro'
- expires_at: timestamptz (NOT NULL)               creación + 10 min
- started_at: timestamptz (NULL)                   cuando el bot recibió /start con el token
- started_by_telegram_id: bigint (NULL)            cuenta de Telegram que pulsó Iniciar
- used_at: timestamptz (NULL)
- outcome: text (NULL)                             CHECK IN ('verificado','rechazado_no_boliviano','rechazado_contacto_ajeno','rechazado_duplicado','rechazado_bloqueado')
- requested_ip_hash: text (NOT NULL)               HMAC de la IP (sin guardar la IP)
- created_at, updated_at
CHECK (purpose <> 'registro' OR registration_secret_hash IS NOT NULL)
INDEX phone_tokens_user_idx (user_id, created_at DESC)
INDEX phone_tokens_started_idx (started_by_telegram_id) WHERE used_at IS NULL AND started_at IS NOT NULL
```

El borrado en cascada es una **excepción justificada** a la regla de `RESTRICT`: son datos técnicos descartables de una cuenta que no se completó.

### `password_reset_tokens` — `0012_password_reset_tokens.sql`

```
password_reset_tokens
- id: uuid (PK)
- user_id: uuid (NOT NULL, FK users ON DELETE CASCADE)
- token_hash: text (NOT NULL, UNIQUE)              SHA-256; el token real solo viaja por correo (RF-003-11)
- expires_at: timestamptz (NOT NULL)               creación + 30 min
- used_at: timestamptz (NULL)                      también se marca al pedir uno nuevo (RF-003-13)
- created_at, updated_at
INDEX password_reset_open_idx (user_id) WHERE used_at IS NULL
```

### `banned_identities` — `0013_banned_identities.sql`

Huellas irreversibles de los datos de cuentas baneadas (RF-003-19). Se crean al banear (spec 009) y se conservan de forma permanente.

```
banned_identities
- id: uuid (PK)
- kind: text (NOT NULL)                            CHECK IN ('email','phone','ci','telegram')
- fingerprint: text (NOT NULL)                     HMAC-SHA256(clave del servidor, 'kind:valor normalizado')
- ban_ref: uuid (NULL)                             id del baneo (la FK a `bans` la agrega la spec 009)
- created_at, updated_at
UNIQUE (kind, fingerprint)
```

No es de solo anexado: revertir un baneo (spec 009, RF-009-23) borra las filas con ese `ban_ref`. Ninguna columna contiene datos en claro (CA-003-24).

## 2. Datos que otras specs agregan a estas tablas

| Spec | Qué | Migración |
|---|---|---|
| 009 | `bans` (FK desde `banned_identities.ban_ref`), `host_enablements`, `admin_audit_log` | `0090`–`0092` |
| 005 | Preferencias de aviso y estado del bot (`telegram_blocked_at`) en una tabla propia, `notification_preferences` | `0071` |

`users` no se modifica con columnas de otras specs para que el modelo de identidad quede congelado.

## 3. Consultas frecuentes e índices

| Consulta | Índice |
|---|---|
| Iniciar sesión por correo | `users.email` (único) |
| Revisar bloqueo de correo / CI al registrar | `banned_identities (kind, fingerprint)` (único) |
| Buscar el token al compartir el contacto | `phone_verification_tokens.token_hash` (único) y `phone_tokens_started_idx` |
| Limpieza de cuentas sin verificar | `users_unverified_idx` |
| Conteo de intentos de inicio de sesión | `rate_limit_events_lookup_idx` (spec 000) |

## 4. Pruebas de integridad (`database/tests/users.integrity.test.ts`)

| Prueba | Criterio |
|---|---|
| Dos correos iguales en distinta capitalización fallan | CA-003-02, CA-003-19 |
| Dos usuarios con el mismo celular, la misma CI o el mismo Telegram fallan | CA-003-26 |
| Celular que no sea `+591` + 6/7 + 7 dígitos falla | CA-003-15, CA-003-25 |
| Usuario `usuario` verificado sin celular o sin Telegram falla; `admin` pasa | RN-003-03 |
| `role` y `status` fuera de los valores permitidos fallan | RN-003-01, RN-003-02 |
| `banned_identities` rechaza una huella repetida del mismo `kind` | RF-003-19 |
| No existe en el esquema ninguna columna de `banned_identities` que guarde correo, celular, CI o Telegram en claro (revisión del catálogo de columnas) | CA-003-24 |
| Borrar un usuario borra sus tokens de verificación y de recuperación | caso borde "sin verificar a las 24 h" |
