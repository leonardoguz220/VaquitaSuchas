# Modelo de datos — Spec 000: Setup del proyecto

- **Responsable:** Camila Fuentes (Base de datos)
- **Migraciones:** `0001` a `0009` (rango reservado para la spec 000, ver `research.md` R6)
- **Estado:** propuesto; se congela al aprobar el plan

Esta spec no tiene entidades de negocio. Define las convenciones que **todas** las migraciones siguientes respetan y las pocas tablas técnicas que usan varias specs.

## 1. Convenciones del esquema (RF-000-07)

| Tema | Regla |
|---|---|
| Nombres | Tablas en plural y columnas en `snake_case`, en inglés (`billing_cycles`, `paid_at`). Los valores de dominio de los estados son los de la spec, en español (`pendiente`, `en_revision`, `esperando_pago`). |
| Claves primarias | `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`. Excepción: tablas de configuración de clave natural (`schema_migrations`). |
| Fechas | `timestamptz` guardado en UTC. Nunca `timestamp` sin zona. La conversión a America/La_Paz ocurre solo al mostrar. |
| Dinero | `bigint` en centavos de Bs con `CHECK (… >= 0)`; la columna se llama `…_cents`. Nunca `float`, `real`, `double precision` ni `numeric` sin escala. |
| Tipo de cambio | `numeric(10,4)` con `CHECK (> 0)`. |
| Estados | `text` con `CHECK (col IN (...))` (valores exactos de la spec), no `ENUM` de PostgreSQL: agregar un valor en un `ENUM` no se puede revertir dentro de una transacción. |
| Marcas de tiempo | Toda tabla tiene `created_at timestamptz NOT NULL DEFAULT now()` y `updated_at timestamptz NOT NULL DEFAULT now()`; `updated_at` lo mantiene el disparador `set_updated_at()`. |
| Tablas de solo anexado | (eventos, auditoría) llevan además el disparador `forbid_update_delete()`: cualquier `UPDATE` o `DELETE` lanza un error. Su `updated_at` es igual a `created_at`. |
| Claves foráneas | Siempre con la acción explícita; por defecto `ON DELETE RESTRICT`. Ningún historial se borra en cascada. |
| Índices | Uno por cada consulta frecuente que el plan de cada spec menciona; se justifica con la consulta. |
| Texto sensible | Nada de contraseñas, tokens, CI ni correos en claro fuera de `users`; tokens solo como hash. |

**Excepción documentada:** `schema_migrations` la crea y mantiene el ejecutor de migraciones y usa `applied_at` en lugar de `created_at`/`updated_at`.

## 2. Extensiones y funciones (`0001_init.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;      -- búsqueda del catálogo sin tildes (spec 004)
-- gen_random_uuid() es nativa desde PostgreSQL 13; no hace falta pgcrypto.

CREATE FUNCTION set_updated_at() RETURNS trigger ...      -- NEW.updated_at := now()
CREATE FUNCTION forbid_update_delete() RETURNS trigger ... -- RAISE EXCEPTION 'append-only table'
CREATE FUNCTION immutable_unaccent(text) RETURNS text ...  -- envoltura IMMUTABLE para usar en índices
```

Cada migración posterior que crea una tabla agrega al final el disparador `set_updated_at` (y `forbid_update_delete` si es de solo anexado) con una línea estándar.

## 3. Tablas técnicas

### `schema_migrations` (la crea el ejecutor, no una migración)

```
schema_migrations
- version: text (PK)               -- '0001'
- name: text (NOT NULL)            -- '0001_init.sql'
- checksum: text (NOT NULL)        -- SHA-256 del archivo
- applied_at: timestamptz (NOT NULL, default now())
```

### `job_runs` — `0002_job_runs.sql`

Registro de ejecuciones de tareas programadas (observabilidad y recuperación, RF-000-14, RNF-002-05).

```
job_runs
- id: uuid (PK)
- job_name: text (NOT NULL)                       -- 'billing.generate', 'billing.overdue', ...
- trigger: text (NOT NULL) CHECK IN ('cron','external','manual','startup')
- status: text (NOT NULL) CHECK IN ('running','ok','error','skipped')
- started_at: timestamptz (NOT NULL, default now())
- finished_at: timestamptz (NULL)
- processed_count: integer (NOT NULL, default 0)
- error_message: text (NULL)                      -- sin datos personales
- created_at, updated_at
INDEX job_runs_name_started_idx (job_name, started_at DESC)
```

Retención: se borran las ejecuciones con más de 30 días (tarea `maintenance.cleanup`).

### `rate_limit_events` — `0003_rate_limit_events.sql`

Límites por ventana de tiempo compartidos por varias specs: intentos de inicio de sesión (003, RF-003-17), recuperación de contraseña (RF-003-18), tokens de verificación (RF-003-21), intentos de código de invitación (001, RNF-001-02), mensajes de chat (010, RF-010-10), registro por IP (003).

```
rate_limit_events
- id: uuid (PK)
- bucket: text (NOT NULL)          -- 'login_fail:email', 'login_fail:ip', 'reset:email', 'tg_token:ip', ...
- key_hash: text (NOT NULL)        -- HMAC-SHA256(clave del servidor, valor): no se guarda el correo ni la IP
- occurred_at: timestamptz (NOT NULL, default now())
- created_at, updated_at
INDEX rate_limit_events_lookup_idx (bucket, key_hash, occurred_at DESC)
```

El backend cuenta eventos con `occurred_at > now() - ventana`. Se limpian los de más de 24 horas (`maintenance.cleanup`). Es de solo anexado.

### `telegram_updates` — `0004_telegram_updates.sql`

Deduplicación de las actualizaciones del bot (Telegram puede repetirlas, ver `research.md` R2).

```
telegram_updates
- update_id: bigint (PK)
- received_at: timestamptz (NOT NULL, default now())
- created_at, updated_at
```

Se limpian los de más de 7 días.

## 4. Pruebas de integridad (`database/tests/`)

| Prueba | Garantiza |
|---|---|
| `migrations.idempotent` | `db:migrate` dos veces no cambia nada (CA-000-03). |
| `migrations.atomic` | Una migración con error deja la base sin cambios parciales (CA-000-04, usa una migración de prueba que falla a la mitad). |
| `schema.conventions` | Toda tabla (salvo `schema_migrations`) tiene `id uuid`, `created_at`, `updated_at`; ninguna columna es `float`/`real`/`double precision`/`timestamp without time zone` (RF-000-07). |
| `append_only.triggers` | `UPDATE` y `DELETE` sobre `rate_limit_events` fallan. |
| `numbering.check` | Prefijos únicos y sin editar migraciones ya fusionadas (sección 8 de la spec). |
