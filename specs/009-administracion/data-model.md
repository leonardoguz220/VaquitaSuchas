# Modelo de datos — Spec 009: Administración

- **Responsable:** Camila Fuentes (Base de datos)
- **Migraciones:** `0090` a `0094` (rango de la spec 009)
- **Estado:** propuesto; se congela al aprobar el plan
- Convenciones de `specs/000-setup-del-proyecto/data-model.md`. **Núcleo del MVP:** `bans`, `host_enablements`, `admin_audit_log` y `user_suspensions` (0090 a 0093) se construyen junto con las specs 001 y 010, porque las usan (habilitar titulares, reclamos, baneo). El resto de la spec (catálogo, moderación, estadísticas) no agrega tablas.

## 1. Tablas

### `bans` — `0090_bans.sql`

```
bans
- id: uuid (PK)
- user_id: uuid (NOT NULL, FK users ON DELETE RESTRICT)
- reason: text (NOT NULL)                         CHECK char_length(btrim(reason)) BETWEEN 10 AND 300 (RN-009-07)
- source: text (NOT NULL)                         CHECK IN ('admin','reclamo')
- dispute_id: uuid (NULL, FK join_disputes)       CHECK ((source = 'reclamo') = (dispute_id IS NOT NULL))
- banned_by: uuid (NOT NULL, FK users)            administrador
- banned_at: timestamptz (NOT NULL, default now())
- revoked_at: timestamptz (NULL), revoked_by: uuid (NULL, FK users), revoke_reason: text (NULL)       CHECK BETWEEN 10 AND 300
CHECK ((revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL) = (revoke_reason IS NULL))
CHECK (revoked_by IS NULL OR revoked_by <> banned_by)                         otro administrador revierte (RF-009-23, CA-009-34)
CHECK (banned_by <> user_id)                                                  nadie se banea a sí mismo (RN-009-07)
UNIQUE INDEX bans_active_user_uq (user_id) WHERE revoked_at IS NULL           un baneo vigente por persona
INDEX bans_user_idx (user_id, banned_at DESC)
- created_at, updated_at
```

La migración también agrega la clave foránea `banned_identities.ban_ref → bans(id)` (columna de la spec 003). Un baneo no se borra: se revierte (`revoked_*`), y las filas de `banned_identities` con ese `ban_ref` se eliminan en la misma transacción (spec 003, RF-003-19).

### `host_enablements` — `0091_host_enablements.sql`

Habilitación manual para ser titular (RF-009-21, RF-007-17).

```
host_enablements
- id: uuid (PK)
- user_id: uuid (NOT NULL, FK users ON DELETE RESTRICT)
- reason: text (NOT NULL)                         CHECK BETWEEN 10 AND 300
- enabled_by: uuid (NOT NULL, FK users)
- enabled_at: timestamptz (NOT NULL, default now())
- revoked_at: timestamptz (NULL), revoked_by: uuid (NULL, FK users), revoke_reason: text (NULL)
CHECK ((revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL) = (revoke_reason IS NULL))
UNIQUE INDEX host_enablements_active_uq (user_id) WHERE revoked_at IS NULL
- created_at, updated_at
```

### `admin_audit_log` — `0092_admin_audit_log.sql`

Registro de todas las acciones de administración y de cada apertura de evidencia (RF-009-18). **Solo anexado.**

```
admin_audit_log
- id: uuid (PK)
- admin_id: uuid (NOT NULL, FK users)
- action: text (NOT NULL)        CHECK IN ('catalogo_crear','catalogo_editar','catalogo_activar','catalogo_desactivar','catalogo_importar',
                                           'usuario_suspender','usuario_reactivar','usuario_banear','baneo_revertir','rol_promover','rol_quitar',
                                           'titular_habilitar','titular_quitar_habilitacion','reclamo_abrir_evidencia','reclamo_resolver',
                                           'publicacion_restaurar','publicacion_eliminar','publicacion_eliminar_y_suspender','titularidad_transferir')
- target_type: text (NOT NULL)   CHECK IN ('user','group','catalog_service','catalog_plan','join_dispute','listing','ban')
- target_id: uuid (NULL)
- reason: text (NULL)            motivo (10–300) cuando la acción lo exige
- metadata: jsonb (NOT NULL, default '{}')    cambios (antes/después) sin datos sensibles: nunca CI, contraseñas ni contenido de chats
- occurred_at: timestamptz (NOT NULL, default now())
- created_at, updated_at         updated_at = created_at (solo anexado)
INDEX admin_audit_log_admin_idx (admin_id, occurred_at DESC)
INDEX admin_audit_log_target_idx (target_type, target_id, occurred_at DESC)
INDEX admin_audit_log_action_idx (action, occurred_at DESC)
```

### `user_suspensions` — `0093_user_suspensions.sql`

Historial de suspensiones (el estado vigente está en `users.status`).

```
user_suspensions
- id: uuid (PK)
- user_id: uuid (NOT NULL, FK users ON DELETE RESTRICT)
- reason: text (NOT NULL)        CHECK BETWEEN 10 AND 300 (RN-009-04)
- suspended_by: uuid (NOT NULL, FK users)
- suspended_at: timestamptz (NOT NULL, default now())
- reactivated_at: timestamptz (NULL), reactivated_by: uuid (NULL, FK users)
CHECK ((reactivated_at IS NULL) = (reactivated_by IS NULL))
CHECK (suspended_by <> user_id)
UNIQUE INDEX user_suspensions_open_uq (user_id) WHERE reactivated_at IS NULL
- created_at, updated_at
```

### Disparadores (`0094_admin_triggers.sql`)

| Disparador | Qué impone | Criterio |
|---|---|---|
| `admin_audit_log_append_only` | `UPDATE` y `DELETE` fallan (`forbid_update_delete`). | RNF-009-05, CA-009-19 |
| `last_admin_guard` (en `users`, antes de `UPDATE OF role, status`) | Con `pg_advisory_xact_lock`, una actualización que deje cero `admin` activos falla. | RN-009-01, CA-009-12 |
| `admin_not_banned_or_suspended` (en `bans` y `user_suspensions`, antes de `INSERT`) | El usuario objetivo no tiene `role = 'admin'`. | RN-009-02, RN-009-07, CA-009-13, CA-009-29 |
| `bans_immutable_fields` (antes de `UPDATE` en `bans`) | Solo se pueden fijar las columnas `revoked_*` una vez. | integridad |

## 2. Consultas frecuentes

| Consulta | Índice |
|---|---|
| Búsqueda de usuarios por nombre o correo | `users_name_search_idx` y `users.email` (spec 003) |
| Cola de reclamos (abiertos primero) | `join_disputes_open_idx` (spec 010) |
| Log de auditoría con filtros | los tres índices de `admin_audit_log` |
| ¿Tiene habilitación vigente? (spec 001, RF-001-21) | `host_enablements_active_uq` |
| ¿Tiene baneo vigente? | `bans_active_user_uq` |

## 3. Pruebas de integridad (`database/tests/admin.integrity.test.ts`)

| Prueba | Criterio |
|---|---|
| Un segundo baneo vigente del mismo usuario falla; tras revertir se permite otro | RF-009-23 |
| Baneo con motivo de 9 o 301 caracteres falla | CA-009-23, RN-009-07 |
| Baneo o suspensión de un administrador falla | CA-009-13, CA-009-29 |
| Revertir con el mismo administrador que baneó falla | CA-009-34 |
| Dejar al sistema sin administrador activo falla (cambio de rol o de estado) | CA-009-12, RN-009-01 |
| `UPDATE` y `DELETE` en `admin_audit_log` fallan; `action` fuera de la lista falla | CA-009-19 |
| Dos habilitaciones manuales vigentes del mismo usuario fallan | RF-009-21 |
| Una suspensión abierta por usuario; reactivar permite otra | RF-009-10 |
