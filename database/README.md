# Base de datos de Vaquita

Paquete `@vaquita/database`: migraciones SQL numeradas, seed y pruebas de integridad de PostgreSQL. Responsable: Camila Fuentes. Las reglas de la capa están en [`CLAUDE.md`](CLAUDE.md) y el modelo de la spec 000 en [`../specs/000-setup-del-proyecto/data-model.md`](../specs/000-setup-del-proyecto/data-model.md).

## 1. Contenido y comandos

| Carpeta        | Contiene                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `migrations/`  | Archivos `NNNN_nombre.sql`, uno por cambio, aplicados en orden numérico                        |
| `seeds/`       | Catálogo inicial (spec 004) y datos de prueba                                                  |
| `tests/`       | Pruebas de integridad con `node:test` y `pg`; `tests/helpers/` crea bases temporales           |
| `src/`         | Ejecutor de migraciones (`migrate.ts`), configuración (`config.ts`), seed, reinicio y respaldo |
| `docker/init/` | Scripts que PostgreSQL corre al crear el volumen (crea la base `vaquita_test`)                 |

Los comandos se ejecutan desde la raíz del repositorio.

| Para                                                    | Comando                                  |
| ------------------------------------------------------- | ---------------------------------------- |
| Levantar y apagar PostgreSQL y Mailpit                  | `npm run db:up` / `npm run db:down`      |
| Aplicar las migraciones pendientes                      | `npm run db:migrate`                     |
| Cargar el seed (catálogo y datos de prueba)             | `npm run db:seed`                        |
| Recrear el esquema desde cero y sembrar (solo local)    | `npm run db:reset`                       |
| Respaldar y restaurar (envoltorios de `pg_dump`/`psql`) | `npm run db:dump` / `npm run db:restore` |
| Validar numeración y migraciones sin editar (CI)        | `npm run db:check -w database`           |
| Pruebas de integridad                                   | `npm run test -w database`               |
| ESLint, Prettier y `tsc --noEmit`                       | `npm run lint -w database`               |

Variables (copiar [`.env.example`](.env.example) a `database/.env`; el `.env` real no se sube):

| Variable            | Uso                                                                                   | Valor local por defecto                                  |
| ------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`      | Base de desarrollo: migraciones, seed y respaldo                                      | `postgres://vaquita:vaquita@localhost:5432/vaquita`      |
| `TEST_DATABASE_URL` | Servidor de pruebas; cada prueba crea en él una base temporal y la borra al terminar  | `postgres://vaquita:vaquita@localhost:5432/vaquita_test` |
| `DB_PORT`           | Puerto del host donde `docker compose` publica PostgreSQL (lo lee el entorno, ver §7) | `5432`                                                   |

Las credenciales `vaquita:vaquita` son de desarrollo local y las define `docker-compose.yml`; no son secretos. Las pruebas no tocan `vaquita` ni dejan datos en `vaquita_test`: se conectan a `TEST_DATABASE_URL`, crean una base `vaquita_t_<aleatorio>`, aplican las migraciones y la eliminan con `DROP DATABASE ... WITH (FORCE)`.

## 2. Rangos de numeración por spec

Cada spec tiene un rango reservado para que dos integrantes no usen el mismo número (`research.md` R6, spec 000 §8).

| Rango     | Spec | Módulo                                                |
| --------- | ---- | ----------------------------------------------------- |
| 0001–0009 | 000  | Base: extensiones, funciones y tablas técnicas        |
| 0010–0019 | 003  | Usuarios y autenticación                              |
| 0020–0029 | 004  | Catálogo de servicios                                 |
| 0030–0039 | 001  | Suscripciones compartidas (grupos), división y moneda |
| 0040–0049 | 002  | Cobros y pagos                                        |
| 0050–0059 | 010  | Solicitudes de ingreso y chat                         |
| 0060–0069 | 007  | Reputación                                            |
| 0070–0079 | 005  | Notificaciones                                        |
| 0080–0089 | 008  | Cupos libres                                          |
| 0090–0099 | 009  | Administración                                        |
| 0100–0109 | 006  | Panel y reportes (vistas)                             |

Migraciones existentes de la spec 000:

| Archivo                      | Crea                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `0001_init.sql`              | Extensión `unaccent` y funciones `set_updated_at()`, `forbid_update_delete()` e `immutable_unaccent(text)` |
| `0002_job_runs.sql`          | `job_runs`: ejecuciones de tareas programadas                                                              |
| `0003_rate_limit_events.sql` | `rate_limit_events`: eventos de límites por ventana, de solo anexado                                       |
| `0004_telegram_updates.sql`  | `telegram_updates`: deduplicación de actualizaciones del bot                                               |

`schema_migrations` no la crea ninguna migración: la crea y mantiene el ejecutor (`version`, `name`, `checksum` SHA-256 y `applied_at`).

## 3. Cómo agregar una migración

1. Nombre `NNNN_snake_case.sql`: cuatro dígitos, minúsculas, números y guion bajo (por ejemplo `0011_user_sessions.sql`). El ejecutor ignora los archivos que no cumplen el patrón y rechaza dos archivos con el mismo prefijo.
2. Usa el siguiente número libre **del rango de su spec**, también cuando corrige una migración anterior.
3. Una transacción por archivo: el ejecutor abre `BEGIN` y hace `COMMIT` o `ROLLBACK`. No escribas `BEGIN` ni `COMMIT` en el archivo. Si algo falla, la base queda sin cambios parciales y el error nombra el archivo (CA-000-04).
4. **Nunca se edita una migración que ya está en `main` o `dev`** (RN-000-02). El ejecutor guarda el checksum de cada archivo aplicado y se niega a seguir si cambió o fue renombrado; `db:check` lo valida contra una rama base (por defecto `origin/main`; en CI, la rama destino del PR), y el hook de Claude Code bloquea la edición. El cambio va en una migración nueva.
5. Pruébala desde una base vacía (`npm run db:reset` en local y `npm run test -w database`) y agrega la prueba que intenta violar cada restricción nueva (§5).

## 4. Convenciones del esquema

Resumen de `data-model.md` §1 (RF-000-07). Valen para todas las migraciones.

| Tema             | Regla                                                                                                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nombres          | Tablas en plural y columnas en `snake_case`, en inglés (`billing_cycles`, `paid_at`). Los valores de los estados son los de la spec, en español (`pendiente`, `en_revision`).                                                                |
| Claves primarias | `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` (nativa desde PostgreSQL 13, sin `pgcrypto`). Excepciones de clave natural: `schema_migrations` (`version`, la crea el ejecutor) y `telegram_updates` (`update_id bigint`, según el modelo). |
| Fechas           | `timestamptz` guardado en UTC; nunca `timestamp` sin zona. La conversión a America/La_Paz ocurre solo al mostrar.                                                                                                                            |
| Dinero           | `bigint` en centavos de Bs con `CHECK (... >= 0)` y sufijo `_cents`. Nunca `float`, `real`, `double precision` ni `numeric` sin escala.                                                                                                      |
| Tipo de cambio   | `numeric(10,4)` con `CHECK (... > 0)`.                                                                                                                                                                                                       |
| Estados          | `text` con `CHECK (col IN (...))` y los valores exactos de la spec. No se usa `ENUM`: agregar un valor a un `ENUM` no se puede revertir dentro de una transacción.                                                                           |
| Marcas de tiempo | Toda tabla tiene `created_at` y `updated_at` (`timestamptz NOT NULL DEFAULT now()`); `updated_at` lo mantiene el disparador `set_updated_at()`. `schema_migrations` usa `applied_at` en su lugar.                                            |
| Solo anexado     | Las tablas de eventos y auditoría llevan además `forbid_update_delete()`: todo `UPDATE` o `DELETE` lanza un error. Su `updated_at` es igual a `created_at`.                                                                                  |
| Claves foráneas  | Siempre con la acción explícita; por defecto `ON DELETE RESTRICT`. Ningún historial se borra en cascada.                                                                                                                                     |
| Índices          | Uno por cada consulta frecuente que menciona el plan de la spec, justificado con esa consulta en un comentario.                                                                                                                              |
| Texto sensible   | Nada de contraseñas, tokens, CI ni correos en claro fuera de `users`; los tokens solo como hash.                                                                                                                                             |

Líneas estándar al final de cada migración que crea una tabla:

```sql
CREATE TRIGGER <tabla>_set_updated_at
  BEFORE UPDATE ON <tabla>
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Solo en tablas de solo anexado. Los disparadores BEFORE corren en orden alfabético de nombre,
-- así que ..._forbid_update_delete corre antes que ..._set_updated_at y bloquea la operación.
CREATE TRIGGER <tabla>_forbid_update_delete
  BEFORE UPDATE OR DELETE ON <tabla>
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
```

## 5. Pruebas de integridad

Cada restricción tiene una prueba que intenta violarla, y cada prueba cita en su nombre o comentario el criterio o la regla que cubre (`CA-000-03`, `RN-000-02`, `RF-000-07`). Corren con `node:test` contra PostgreSQL real, sin mocks (`research.md` R7).

| Archivo de `tests/`                     | Cubre                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke.connection.test.ts`              | Conexión a la base de pruebas (RF-000-01)                                                                                                                                                                                                                                                                                                                                                                                                 |
| `migrations.apply.test.ts`              | Aplicación en orden sobre base vacía (CA-000-02), solo las nuevas en ejecuciones posteriores (RN-000-03), bloqueo asesor (RF-000-05) y prefijos repetidos (spec 000 §8)                                                                                                                                                                                                                                                                   |
| `migrations.idempotent.test.ts`         | Una segunda ejecución no cambia nada (CA-000-03)                                                                                                                                                                                                                                                                                                                                                                                          |
| `migrations.atomic.test.ts`             | Una migración que falla a la mitad no deja cambios y el error nombra el archivo (CA-000-04)                                                                                                                                                                                                                                                                                                                                               |
| `migrations.checksum.test.ts`           | Rechazo de migraciones aplicadas que cambiaron; los finales de línea no alteran el checksum (RN-000-02)                                                                                                                                                                                                                                                                                                                                   |
| `init.functions.test.ts`                | `unaccent`, `gen_random_uuid()`, `immutable_unaccent`, `set_updated_at()` y `forbid_update_delete()` (RF-000-07)                                                                                                                                                                                                                                                                                                                          |
| `job_runs.constraints.test.ts`          | Valores por defecto, `CHECK` de `trigger` y `status`, `NOT NULL`, disparador e índice de `job_runs` (RF-000-14, RF-000-07)                                                                                                                                                                                                                                                                                                                |
| `rate_limit_events.constraints.test.ts` | Columnas obligatorias, índice de búsqueda y disparadores de `rate_limit_events` (RF-000-07)                                                                                                                                                                                                                                                                                                                                               |
| `telegram_updates.constraints.test.ts`  | `update_id` único y `bigint`, `ON CONFLICT DO NOTHING` y disparador de `telegram_updates` (RF-000-22)                                                                                                                                                                                                                                                                                                                                     |
| `schema.conventions.test.ts`            | Toda tabla salvo `schema_migrations` tiene `id uuid` (o la clave natural del modelo, hoy solo `telegram_updates.update_id`), `created_at` y `updated_at`; ninguna columna `float`, `real`, `double precision` ni `timestamp without time zone`; los estados usan `text` + `CHECK` (RF-000-07, RN-000-01)                                                                                                                                  |
| `append_only.triggers.test.ts`          | `UPDATE` y `DELETE` sobre `rate_limit_events` fallan (RF-000-07)                                                                                                                                                                                                                                                                                                                                                                          |
| `numbering.check`                       | Prefijos únicos y de 4 dígitos, nombres válidos y ninguna migración editada respecto de `main` (RN-000-02, spec 000 §8)                                                                                                                                                                                                                                                                                                                   |
| `seed.test.ts`                          | El seed se aplica en orden y en una transacción, es idempotente, nombra el archivo que falla y rechaza contraseñas (RF-000-06, RF-009-02)                                                                                                                                                                                                                                                                                                 |
| `reset.test.ts`                         | `db:reset` recrea el esquema, migra y siembra, y se niega con un host remoto o en producción (RF-000-06)                                                                                                                                                                                                                                                                                                                                  |
| `backup.test.ts`                        | `db:dump` y `db:restore` llevan una base migrada con datos a otra, restore es todo o nada y se niega con un host remoto (RF-000-06)                                                                                                                                                                                                                                                                                                       |
| `notifications.performance.test.ts`     | Planes de consulta de la spec 005 con volumen ficticio (200 usuarios, 21.000 avisos, 5.000 envíos): lista paginada y por cursor con `notifications_user_idx` en menos de 300 ms medidos en la base (RNF-005-05), contador con `notifications_unread_idx`, lote de envíos con `notification_deliveries_due_idx`, cancelación por entidad con `notifications_entity_idx` y existencia de `notifications_purge_idx` (data-model.md §2, T032) |

## 6. Seed

- Solo contiene el catálogo de servicios (spec 004) y datos de prueba. Nunca datos reales.
- Es idempotente: correr `npm run db:seed` dos veces deja el mismo resultado.
- No hay contraseñas en el repositorio. El administrador de desarrollo se crea con `npm run seed:admin -w backend` (T027), que reutiliza el hash del backend y solo funciona si `NODE_ENV` no es `production` y existen `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` (RF-009-02).
- Los precios del catálogo se verifican con fuentes oficiales.
- `npm run db:seed` ejecuta `seeds/NNNN_nombre.sql` en orden numérico y todos en una sola transacción: si uno falla no queda nada sembrado y el error nombra el archivo. Antes de ejecutar rechaza cualquier archivo que mencione `password` fuera de comentarios. Las reglas para escribir seeds están en [`seeds/README.md`](seeds/README.md).

### Catálogo de servicios y actualización de precios (spec 004, T018)

El catálogo vive en `seeds/catalog.json` (versionado, RNF-004-04). `db:seed` lo valida entero con `applyCatalog` antes de escribir y lo aplica en la misma transacción que los `.sql`: si un plan es inválido no se aplica nada (CA-004-06), y una segunda ejecución no cambia ninguna fila (CA-004-05).

Para actualizar un precio o un cupo (RF-004-07, RN-004-06):

1. Abrir la página oficial de la plataforma **desde Bolivia** y comprobar que muestra los precios de Bolivia. Nunca se copian precios de sitios de terceros.
2. En `seeds/catalog.json`, editar el plan: `priceCents` en centavos enteros y `currency` tal como la publica la plataforma (`USD` o `BS`), `maxSlots` (personas en total, titular incluido: en video, pantallas a la vez; en música, cuentas del plan) e `individualPriceCents` si existe un plan individual.
3. Actualizar en ese plan `verifiedOn` (fecha `AAAA-MM-DD` de la verificación) y `verifiedSource` (URL https de la fuente oficial). Son obligatorios: sin ellos `db:seed` rechaza el archivo.
4. Correr `npm run test -w database` (valida el archivo real en `tests/catalog.seed.test.ts`) y `npm run db:seed` en local. Abrir un PR con la fuente en la descripción.
5. En staging, el catálogo se siembra con el workflow `Migrate staging` marcando la opción `seed` (`.github/workflows/migrate-staging.yml`, T044).

Qué no hace el seed:

- **No hay borrado físico del catálogo** (RF-004-06): un servicio o plan que se quita del archivo no se borra de la base, y borrar un servicio con planes falla por `RESTRICT`. Para retirarlo se desactiva (`is_active = false`) desde la administración (spec 009).
- El seed **nunca cambia `is_active`**: no reactiva lo que un administrador desactivó.
- Un `slug` no cambia de servicio: si el archivo pone un plan existente bajo otro servicio, el seed falla y no aplica nada. Los `slug` no se renombran; un plan nuevo lleva un `slug` nuevo.
- Cambiar el precio del catálogo **no altera las suscripciones existentes**: cada suscripción guarda su propia copia del precio (spec 001, CA-004-07).

### Reinicio y respaldo

- `npm run db:reset` borra y recrea el esquema `public` (dueño `pg_database_owner` y `USAGE` para `PUBLIC`, como lo deja PostgreSQL 15+), aplica las migraciones (`0001_init.sql` vuelve a crear `unaccent`) y siembra. Se niega si el host no es `localhost`, `127.0.0.1`, `::1`, `db` o `postgres`, o si `NODE_ENV=production`.
- `npm run db:dump [-- backups/archivo.sql]` escribe un respaldo en SQL plano (`--no-owner --no-privileges --clean --if-exists`), por defecto en `database/backups/vaquita-<fecha UTC>.sql`. La carpeta `backups/` no se sube. Sirve también para respaldar staging antes de que caduque la base gratuita de Render (riesgo R-01), con su `DATABASE_URL` solo en el entorno de la terminal.
- `npm run db:restore -- backups/archivo.sql` lo aplica con `psql -v ON_ERROR_STOP=1 --single-transaction` (todo o nada), sobre una base vacía o ya migrada. Si el destino es PostgreSQL 16 se quita la línea `SET transaction_timeout = 0;` que escribe `pg_dump` 17 o posterior.
- `db:restore` se niega contra un host que no es local. Staging lo restaura a mano una persona del equipo: exporta la `DATABASE_URL` de staging solo en su terminal (nunca en el repositorio) y agrega `--allow-remote`.
- Si `pg_dump` o `psql` no están en el PATH y la base es local, se usan los del contenedor `db` (`docker compose exec -T db ...`), que respaldan y restauran la base de ese contenedor.

### Migrar producción

Workflow manual `Migrate production` (`.github/workflows/migrate-production.yml`). Solo corre desde `main`.

1. **Una vez, en GitHub:** crear el entorno `production` (Settings → Environments) con revisores obligatorios y agregarle el secreto `PRODUCTION_DATABASE_URL` (URL externa de PostgreSQL de producción, con el usuario dueño del esquema).
2. Fusionar la migración a `main` (flujo `dev → qa → main`).
3. Actions → `Migrate production` → Run workflow sobre `main`, escribir `production` en `confirm` y aprobar el entorno.
4. **Respaldo automático:** antes de migrar, el workflow hace `db:dump` de producción (instala el `pg_dump` de la versión del servidor si hace falta), comprueba que el archivo esté completo y lo sube como artefacto `respaldo-produccion-<run>` con **retención de 7 días**. Si el respaldo o la subida fallan, la migración no corre. La URL de producción nunca sale de GitHub Actions.
5. Si algo falla, descargar el artefacto desde la página de la ejecución (Artifacts) y restaurar con `db:restore -- --allow-remote`, con la `DATABASE_URL` de producción solo en el entorno de tu terminal. El artefacto contiene datos de usuarios: si lo guardas más de 7 días, que sea fuera del repositorio, y bórralo después.

## 7. Problemas frecuentes

- **El puerto 5432 está ocupado** por otro PostgreSQL: levanta la base en otro puerto del host con `DB_PORT=5435 npm run db:up` y usa ese mismo puerto en `DATABASE_URL` y `TEST_DATABASE_URL` de `database/.env`. `docker compose` no lee `database/.env`; toma `DB_PORT` del entorno o del `.env` de la raíz.
- **No existe `vaquita_test`**: se crea en el mismo contenedor con `docker/init/01-create-test-db.sql`, que PostgreSQL ejecuta una sola vez al inicializar un volumen vacío. Si el volumen se creó antes de ese script, recréalo con `docker compose down -v && npm run db:up` (borra los datos locales).
- **`db:reset` solo se usa contra la base local.**

## 8. Rol de aplicación (T033, RNF-000-02)

Las migraciones corren con el rol dueño del esquema; el backend se conecta con un rol que solo hace DML (sin `DROP`, `ALTER`, `TRUNCATE` ni `CREATE EXTENSION`). La limpieza de `maintenance.cleanup` funciona con ese rol: `rate_limit_events` permite `DELETE` solo de filas de más de 24 horas (migración `0005`) y `telegram_updates` no tiene restricción de borrado. `tests/app_role.privileges.test.ts` comprueba estos permisos.

```sql
-- Con el rol dueño; cambia la contraseña y el nombre de la base.
CREATE ROLE vaquita_app LOGIN PASSWORD '<contraseña>' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE vaquita TO vaquita_app;
GRANT USAGE ON SCHEMA public TO vaquita_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vaquita_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vaquita_app;
-- Tablas que creen migraciones futuras:
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vaquita_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO vaquita_app;
```

`DATABASE_URL` del backend usa `vaquita_app`; el workflow `Migrate staging` y `db:migrate` usan el dueño. **Limitación en Render (plan gratuito):** la base trae un solo usuario, así que ahí el backend usa el mismo usuario hasta crear este rol a mano.
