# Contrato de API — Spec 009: Administración

- **Responsable:** Leonardo Guzman (Backend), con Adrian Vargas (Frontend) para las pantallas
- **Estado:** propuesto; se congela al aprobar el plan
- Rige la parte A de `specs/000-setup-del-proyecto/contracts/api.md`. **Todos los endpoints de esta spec exigen `AdminGuard`** (rol `admin` verificado en el servidor en cada petición, RNF-009-01): un usuario normal recibe `403 FORBIDDEN` (CA-009-01). Toda acción que modifica algo escribe en `admin_audit_log` **en la misma transacción**.
- Marcado **[MVP]** lo que se construye junto con las specs 001 y 010; el resto es P2.

## Usuarios

### `GET /admin/users` [MVP] (RF-009-08; CA-009-07)
- **Query:** `q` (nombre o correo, sin tildes ni mayúsculas), `status` (`activo` | `suspendido` | `baneado`), `role`, `limit`, `cursor`. **Response 200:** `{ items: AdminUserRow[], nextCursor }`. Sin resultados: lista vacía.

### `GET /admin/users/:userId` [MVP] (RF-009-09; CA-009-08, 36)
- **Response 200:**
  ```json
  { "id": "…", "fullName": "…", "email": "…", "phone": "+59171234567", "ciMasked": "*****123",
    "status": "activo", "role": "usuario", "createdAt": "…", "lastLoginAt": "…",
    "groupsAsHost": 2, "groupsAsMember": 3,
    "reputation": { "level": "Bueno", "stars": 4.5, "consideredCharges": 8 },
    "reportsReceived": 0,
    "ban": null, "suspension": null, "hostEnablement": null }
  ```
  Nunca incluye hash de contraseña, CI en claro ni comprobantes.

### `POST /admin/users/:userId/suspend` [MVP] (RF-009-10; CA-009-09, 10, 13)
- **Request:** `{ reason: string /* 10–300 */ }`. **Response 200:** ficha actualizada. Efectos: `users.status = 'suspendido'`, sesiones cerradas (`session_version + 1`), correo con el motivo y el contacto de apelaciones (RF-009-11), evento `UserSuspended`.
- **Errores:** `400` (motivo), `422 BUSINESS_RULE` `RN-009-02` (administrador o uno mismo), `409 INVALID_TRANSITION` (ya suspendido o baneado).

### `POST /admin/users/:userId/reactivate` [MVP] (CA-009-11, 24)
- **Request:** `{ reason?: string }`. Solo desde `suspendido`. Un `baneado` responde `422 BUSINESS_RULE` `RF-009-19` (`USER_BANNED`: la reactivación no deshace un baneo).

### `POST /admin/users/:userId/ban` [MVP] (RF-009-19; CA-009-22, 23, 29, 33)
- **Request:** `{ reason: string /* 10–300 */, disputeId?: string }`. **Response 200:** `{ banId, user }`. Efectos en una transacción: estado `baneado`, sesiones cerradas, bloqueo de las cuatro huellas (correo, celular, cédula, Telegram), retiro de los grupos donde es miembro (`reason = 'baneo'`) con aviso a sus titulares, congelamiento de los grupos que posee, solicitudes activas rechazadas o canceladas (specs 001 y 010), evento `UserBanned`.
- **Errores:** `400`, `422 BUSINESS_RULE` `RN-009-07` (a sí mismo o a un administrador), `409 INVALID_TRANSITION` (ya baneado).

### `POST /admin/bans/:banId/revoke` [MVP] (RF-009-23; CA-009-34)
- **Request:** `{ reason: string /* 10–300 */ }`. **Response 200.** Libera los datos bloqueados y deja la cuenta `activo`. No restaura grupos ni cobros (ver análisis). **Errores:** `422 BUSINESS_RULE` `RF-009-23` (`SAME_ADMIN`: quien baneó no puede revertir), `409` (ya revertido).

### `POST /admin/users/:userId/role` (RF-009-03; CA-009-12)
- **Request:** `{ role: "admin" | "usuario", reason: string /* 10–300 */ }`. **Errores:** `422 BUSINESS_RULE` `RN-009-01` (`LAST_ADMIN`: "Debe existir al menos un administrador").

## Titulares habilitados [MVP]

### `GET /admin/host-enablements?active=true` y `POST /admin/users/:userId/host-enablement` (RF-009-21; CA-009-28)
- **Request:** `{ reason }` (10–300). Habilita manualmente; `POST /admin/users/:userId/host-enablement/revoke` `{ reason }` la quita. La habilitación manual es independiente de la calificación (RF-007-17).

### `POST /admin/groups/:groupId/transfer-ownership` (RF-009-24; CA-009-35)
- **Request:** `{ toUserId, reason }`. Solo si el titular actual está `suspendido`. **Errores:** `422 BUSINESS_RULE` `RF-001-21` (`NOT_HOST_ELIGIBLE`), `RN-010-09`, `RN-001-14`.

## Reclamos [MVP]

### `GET /admin/disputes?status=abierto` (RF-009-20)
- **Response 200:** `{ items: AdminDisputeRow[], nextCursor }` con los abiertos primero: tipo, partes, fechas, `hasResponse`. **No incluye** chat ni comprobante.

### `GET /admin/disputes/:disputeId/evidence` (RF-010-23; CA-009-27, CA-010-29)
- **Response 200:** línea de tiempo de la solicitud, chat, comprobante (URL firmada), cotización, descripciones, imágenes y respuestas. **Cada llamada escribe `reclamo_abrir_evidencia` en el log de auditoría antes de devolver nada.** Sobre una solicitud sin reclamo abierto no existe esta ruta (`403`).

### `POST /admin/disputes/:disputeId/resolve` (RF-010-24, RF-009-20; CA-009-25, 26, 30)
- **Request:** `{ result: "estafa_confirmada" | "sin_falta", reason: string /* 10–300 */ }`. `estafa_confirmada` banea a la persona acusada en la misma transacción (incluye todos los efectos de `ban`). **Errores:** `409 INVALID_TRANSITION` (ya resuelto).

## Catálogo (P2)

`POST /admin/catalog/services`, `PATCH /admin/catalog/services/:id`, `POST …/activate|deactivate`, y lo mismo para `/admin/catalog/plans` (RF-009-04 a RF-009-07; CA-009-02 a 05). Reemplazan al stub de la spec 004 (`403`/`501`). `slug` único (`409 CONFLICT`), cupos 2–20, montos positivos. Las respuestas de edición incluyen `warning: "No cambia las suscripciones existentes"` cuando se tocan precios o cupos (RF-009-05).

`POST /admin/catalog/import/preview` (archivo CSV o JSON) → `{ token, changes: [...], errors: [{ row, field, message }] }`; `POST /admin/catalog/import/apply` `{ token }` aplica todo o nada (CA-009-06). Última tarea de la spec (RF-009-06).

## Moderación de cupos (P2)

`GET /admin/listings/reports`, `POST /admin/listings/:id/restore | delete | delete-and-suspend` con `{ reason }` (RF-009-12 a 14; CA-009-14, 15). Las acciones notifican al titular (spec 005).

## Estadísticas (P2)

### `GET /admin/stats` (RF-009-15 a 17; CA-009-16, 17, 21)
- **Response 200:** solo agregados — `users: { total, newThisMonth, active30d }`, `groups: { active, closed }`, `charges: { period, byStatus: { pendiente, en_revision, pagado, atrasado, cancelado }, managedCents }`, `punctualityRate`, `topServices: [{ name, groups }]`, `listings: { active }`, `joinRequestsThisMonth`, `disputesOpen`. Se cachea hasta 5 minutos (RNF-009-04). Sin detalle de cobros ni comprobantes de personas.

## Auditoría [MVP]

### `GET /admin/audit-log` (RF-009-18; CA-009-18, 19)
- **Query:** `adminId`, `action`, `targetType`, `targetId`, `from`, `to`, `limit`, `cursor`. **Response 200:** `{ items: AuditEntry[], nextCursor }`. No existen `PUT`/`PATCH`/`DELETE` sobre el log.

## Servicios internos que usan otras specs

| Servicio / puerto | Lo usa | Qué hace |
|---|---|---|
| `AuditPort.record(tx, entry)` (lo define 010, lo implementa `admin`) | Specs 010 y 009 | Escribe en `admin_audit_log` dentro de la transacción. |
| `BanPort.ban(tx, { adminId, userId, reason, disputeId })` (lo define 010, lo implementa `admin`) | Spec 010 | Baneo completo (arriba). |
| `HostEligibilityPort` (adaptador en `app-adapters/`) | Spec 001 | Habilitación manual vigente **o** calificación (spec 007). |
| Eventos `UserSuspended`, `UserReactivated`, `UserBanned`, `UserUnbanned` | Specs 001, 002, 005, 007, 010 | Ver plan §5. |

## Errores propios de la spec

| `code` | HTTP | Cuándo |
|---|---|---|
| `LAST_ADMIN` | 422 | RN-009-01. |
| `ADMIN_TARGET_FORBIDDEN` | 422 | RN-009-02, RN-009-07. |
| `USER_BANNED` | 422 | Reactivar a un baneado. |
| `SAME_ADMIN` | 422 | RF-009-23. |
| `DISPUTE_NOT_OPEN` | 409 | Resolver un reclamo ya resuelto. |

> **Contrato congelado** al aprobarse el plan. Los cambios se hacen por PR sobre este archivo avisando a las otras dos capas.
