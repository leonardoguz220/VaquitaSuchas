# Modelo de datos — Spec 005: Notificaciones

- **Responsable:** Camila Fuentes (Base de datos)
- **Migraciones:** `0070` a `0074` (rango de la spec 005)
- **Estado:** propuesto; se congela al aprobar el plan
- **Entrega:** `notifications` (0070) forma parte del **núcleo del MVP** (RF-010-04 pide un aviso dentro de la app al titular; CA-002-28 y CA-010-14 verifican avisos). El resto (0071 a 0074) es P1.
- Convenciones de `specs/000-setup-del-proyecto/data-model.md`. La spec 003 reservó `notification_preferences` (0071).

## 1. Tablas

### `notifications` — `0070_notifications.sql` (núcleo)

La notificación dentro de la app: una fila por persona y aviso.

```
notifications
- id: uuid (PK)
- user_id: uuid (NOT NULL, FK users ON DELETE RESTRICT)
- type: text (NOT NULL)                            código del aviso (ver plan §5, catálogo)
- category: text (NOT NULL)                        CHECK IN ('recordatorios','resoluciones','titular','grupo')   (RF-005-17)
- title: text (NOT NULL)                           CHECK char_length(title) BETWEEN 1 AND 120
- body: text (NOT NULL)                            CHECK char_length(body) <= 500
- link: text (NULL)                                ruta interna de la app, p. ej. /cobros/<id>; CHECK link ~ '^/[^/]'
- entity_type: text (NULL), entity_id: uuid (NULL) para cancelar avisos pendientes de un cobro o grupo (RN-005-02)
- dedupe_key: text (NOT NULL)                      UNIQUE: tipo + entidad + período + n.º de recordatorio (RNF-005-01)
- read_at: timestamptz (NULL)
- created_at, updated_at
UNIQUE (dedupe_key)
INDEX notifications_user_idx (user_id, created_at DESC)
INDEX notifications_unread_idx (user_id) WHERE read_at IS NULL           contador de no leídas
INDEX notifications_entity_idx (entity_type, entity_id)
INDEX notifications_purge_idx (created_at)                               limpieza a los 90 días (RF-005-21)
```

`dedupe_key` incluye al destinatario cuando una misma entidad avisa a varias personas (p. ej. `cobro_generado:<chargeId>`; `solicitud_nueva:<requestId>:<titularId>`).

### `notification_preferences` — `0071_notification_preferences.sql`

Una fila por usuario (se crea con valores por defecto al verificar el celular o al primer acceso).

```
notification_preferences
- user_id: uuid (PK, FK users ON DELETE RESTRICT)
- email_recordatorios: boolean (NOT NULL, default true)    email_resoluciones, email_titular, email_grupo igual
- email_resoluciones: boolean, email_titular: boolean, email_grupo: boolean
- telegram_recordatorios: boolean (NOT NULL, default true) telegram_resoluciones, telegram_titular, telegram_grupo igual (RF-005-27)
- telegram_resoluciones: boolean, telegram_titular: boolean, telegram_grupo: boolean
- telegram_blocked_at: timestamptz (NULL)                  el usuario bloqueó el bot (RF-005-28); desactiva Telegram hasta que lo reactive
- email_bounced_at: timestamptz (NULL)                     rebote permanente (caso borde); se deja de enviar
- created_at, updated_at
```

Los correos de **seguridad** (spec 003) no pasan por estas preferencias (RF-005-17).

### `notification_deliveries` — `0072_notification_deliveries.sql`

Buzón de salida por canal: se envían de forma asíncrona sin bloquear la operación del usuario (RNF-005-04).

```
notification_deliveries
- id: uuid (PK)
- notification_id: uuid (NOT NULL, FK notifications ON DELETE RESTRICT)
- channel: text (NOT NULL)                         CHECK IN ('email','telegram')
- status: text (NOT NULL, default 'pending')       CHECK IN ('pending','sent','failed','skipped')
- respect_window: boolean (NOT NULL)               true = solo entre 08:00 y 20:00 de La Paz (RNF-005-03)
- attempts: smallint (NOT NULL, default 0)         CHECK BETWEEN 0 AND 4
- next_attempt_at: timestamptz (NOT NULL)
- sent_at: timestamptz (NULL)
- last_error: text (NULL)                          sin datos personales; CHECK char_length <= 200
- skip_reason: text (NULL)                         'preferencia_desactivada' | 'usuario_suspendido' | 'telegram_bloqueado' | 'correo_rebotado' | 'aviso_cancelado'
CHECK ((status = 'skipped') = (skip_reason IS NOT NULL))
- created_at, updated_at
UNIQUE (notification_id, channel)
INDEX notification_deliveries_due_idx (next_attempt_at) WHERE status = 'pending'
```

Reintentos a los 5 minutos, 30 minutos y 2 horas (RF-005-20): `attempts` 1, 2 y 3 programan `next_attempt_at`; al cuarto fallo `status = 'failed'`.

### `group_invitations` — `0073_group_invitations.sql`

```
group_invitations
- id: uuid (PK)
- group_id: uuid (NOT NULL, FK groups ON DELETE RESTRICT)
- invited_by: uuid (NOT NULL, FK users)
- recipient_email: text (NOT NULL)                  datos de un tercero: se borra a los 30 días (tarea de limpieza); CHECK recipient_email = lower(btrim(recipient_email))
- sent_at: timestamptz (NULL), status: text (NOT NULL, default 'pendiente')       CHECK IN ('pendiente','enviada','fallida')
- attempts: smallint (NOT NULL, default 0), next_attempt_at: timestamptz (NOT NULL)
- created_at, updated_at
INDEX group_invitations_due_idx (next_attempt_at) WHERE status = 'pendiente'
INDEX group_invitations_group_idx (group_id, created_at DESC)
```

El límite de 10 invitaciones por hora por titular usa `rate_limit_events` (spec 000, bucket `invite:user`).

### Disparadores (`0074_notification_triggers.sql`)

| Disparador | Qué impone | Criterio |
|---|---|---|
| `notifications_immutable_content` (antes de `UPDATE`) | Solo cambia `read_at` (y `updated_at`). | integridad |
| `deliveries_no_resurrect` (antes de `UPDATE`) | `sent`, `failed` y `skipped` no vuelven a `pending`. | RNF-005-01 |

## 2. Consultas frecuentes e índices

| Consulta | Índice |
|---|---|
| Lista de notificaciones paginada (< 300 ms con 1.000 filas) | `notifications_user_idx` |
| Contador de no leídas | `notifications_unread_idx` |
| Envíos pendientes (cada 5 min) | `notification_deliveries_due_idx` |
| Cancelar recordatorios de un cobro pagado o cancelado | `notifications_entity_idx` + `deliveries` por `notification_id` |
| Limpieza a los 90 días | `notifications_purge_idx` |

## 3. Pruebas de integridad (`database/tests/notifications.integrity.test.ts`)

| Prueba | Criterio |
|---|---|
| Dos notificaciones con la misma `dedupe_key` fallan | RNF-005-01, CA-005-10 |
| Un envío por canal y notificación; `skipped` sin motivo falla | RF-005-17 |
| Editar el contenido de una notificación falla; marcar `read_at` pasa | integridad |
| Un envío `sent` no vuelve a `pending`; 5 intentos fallan | RF-005-20 |
| `link` que no empiece con `/` falla (evita enlaces externos) | RNF-005-02 |
| Una fila de preferencias por usuario | RF-005-17 |
