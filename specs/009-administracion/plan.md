# Plan técnico — Spec 009: Administración

- **Spec relacionada:** `specs/009-administracion/spec.md` (debe estar **aprobada** por BD, Backend y Frontend)
- **Líder de la spec:** Adrian Vargas (Frontend)
- **Última actualización:** 2026-10-18
- **Artefactos:** [`data-model.md`](data-model.md) · [`contracts/api.md`](contracts/api.md) · [`quickstart.md`](quickstart.md)

| Capa | Responsable | Secciones | Visto bueno |
|---|---|---|---|
| Base de datos | Camila | §3 (y `data-model.md`) | aprobado |
| Backend | Leonardo | §4, §5, §7 | aprobado |
| Frontend | Adrian | §6 | aprobado |

## Constitución: verificación

| Principio | ¿Cumple? | Nota |
|---|---|---|
| I. Spec primero | Sí, con aclaraciones | Un hueco resuelto el 2026-10-18 (los grupos congelados se descongelan al revertir el baneo del titular, CA-009-37) y las tablas y servicios del núcleo que la prioridad P2 deja fuera del MVP (ver §2). |
| II. Dinero exacto | Sí | Las estadísticas suman enteros en centavos con SQL. |
| III. Criterios verificables | Sí | CA-009-01 a 36 mapeados en §8. |
| IV. Seguridad | Sí | `AdminGuard` en cada petición; evidencia solo con reclamo abierto y auditoría; CI enmascarada; sin exportaciones. |
| V. Contratos primero | Sí | `data-model.md` y `contracts/api.md`. |
| VI. Simplicidad | Sí | Estadísticas con consultas agregadas y caché de 5 min, sin tablas nuevas. |
| VII. Capas | Sí | Reglas de baneo y validaciones en `domain/` puro; efectos sobre otros módulos por eventos y puertos. |

## 1. Resumen de la solución

Módulo `admin` con el panel del equipo: usuarios (suspender, reactivar, banear, revertir, promover), titulares habilitados, reclamos de ingreso, catálogo, moderación de cupos, estadísticas y el log de auditoría. **La spec es P2, pero su núcleo es una dependencia de P0** (la spec 001 necesita la habilitación manual para que alguien pueda crear el primer grupo; la spec 010 necesita auditoría, baneo y resolución de reclamos; el flujo de suspensión y baneo se prueba en 003 y 010). Por eso el plan divide la spec en dos entregas: **009-núcleo** (junto con 001 y 010) y **009-completa** (P2).

## 2. Decisiones técnicas

| Decisión | Opción elegida | Alternativas descartadas | Motivo |
|---|---|---|---|
| Partición | Núcleo en el MVP: `bans`, `host_enablements`, `admin_audit_log`, `user_suspensions`, endpoints de usuarios, titulares, reclamos y auditoría. P2: catálogo, moderación, estadísticas, importación | Hacer toda la 009 al final | Las specs 001 y 010 son P0 y dependen de ello (CA-001-25, CA-010-29/30/31/43). |
| Auditoría | Se escribe en la misma transacción que la acción (`AuditPort`) | Registro asíncrono | Una acción sin registro no puede existir (RF-009-18). |
| Evidencia de reclamos | Ruta que audita **antes** de devolver; no hay ruta de chat para el admin | Permiso general de lectura | RN-009-08. |
| Baneo | Una transacción: estado, sesiones, huellas, retiro de grupos, congelamiento, eventos | Pasos separados | Evita estados a medias. |
| Efectos entre módulos | Eventos `UserBanned`, `UserSuspended`, etc. del `TxEventBus` | Importar servicios de grupos y solicitudes | Sin ciclos entre módulos (spec 001 R3). |
| Último administrador | Disparador con bloqueo + validación del servicio | Solo servicio | RN-009-01 con concurrencia. |
| Estadísticas | Consultas agregadas con caché en memoria de 5 min | Tablas materializadas | Basta para 10.000 usuarios (CA-009-21) y es simple. |
| Importación del catálogo | Vista previa con token + aplicación atómica | Importar directo | RF-009-06, CA-009-06. Última tarea. |
| Habilitación para ser titular | `host_enablements` + adaptador `HostEligibilityPort` | Columna en `users` | `users` queda congelado (spec 003). |
| Reversión del baneo | Descongela los grupos que ese baneo congeló (evento `UserUnbanned` → spec 001); no restituye pertenencias a otros grupos ni rehace cobros o solicitudes (RF-009-23, CA-009-37) | Dejar el grupo congelado | Aprobado 2026-10-18: el titular baneado no salió de sus grupos, solo se congelaron; sin esto el titular revertido quedaría sin salida. |

## 3. Modelo de datos — _Camila (BD)_

Detalle en [`data-model.md`](data-model.md): `bans` (0090), `host_enablements` (0091), `admin_audit_log` (0092), `user_suspensions` (0093), disparadores (0094). Pruebas de integridad en `database/tests/admin.integrity.test.ts`.

## 4. Contratos de API — _Leonardo (Backend)_

Detalle en [`contracts/api.md`](contracts/api.md): `/admin/users…`, `/admin/bans/:id/revoke`, `/admin/host-enablements`, `/admin/groups/:id/transfer-ownership`, `/admin/disputes…`, `/admin/catalog…`, `/admin/listings…`, `/admin/stats`, `/admin/audit-log`.

> **Contrato congelado** al aprobarse este plan. Los cambios se hacen por PR sobre este archivo y avisando a las otras dos capas.

## 5. Lógica de dominio — _Leonardo (Backend)_

### Estructura

```text
backend/src/modules/admin/
├── controllers/   admin-users.controller.ts, admin-hosts.controller.ts, admin-disputes.controller.ts,
│                  admin-catalog.controller.ts, admin-listings.controller.ts, admin-stats.controller.ts, admin-audit.controller.ts
├── services/      users-admin.service.ts, ban.service.ts, host-enablement.service.ts, audit.service.ts,
│                  catalog-admin.service.ts, catalog-import.service.ts, listings-moderation.service.ts, stats.service.ts
├── domain/        admin-rules.ts, ban-effects.ts, reason.ts, catalog-validation.ts, csv-parse.ts
└── repositories/  bans.repository.ts, host-enablements.repository.ts, audit.repository.ts,
                   suspensions.repository.ts, stats.repository.ts
backend/src/app-adapters/   host-eligibility.adapter.ts   # compone host_enablements (009) + reputación (007)
backend/src/cli/            seed-admin.ts (spec 003), host-enable.ts
```

### Funciones puras

| Función | Reglas |
|---|---|
| `validateReason(text)` | 10–300 caracteres tras recortar (RN-009-04, RN-009-07). |
| `canActOnUser({ actor, target, action })` | Nadie se suspende, banea ni quita el rol a sí mismo; no se suspende ni banea a un administrador (RN-009-02, RN-009-07); `reactivate` no aplica a `baneado` (CA-009-24). |
| `canRemoveAdminRole({ activeAdmins, target })` | Falla si deja cero administradores activos (RN-009-01). |
| `canRevokeBan({ ban, actorId })` | Otro administrador distinto del que baneó (RF-009-23). |
| `banEffects(user, groupsAsOwner, groupsAsMember)` | Lista de efectos a aplicar: congelar, retirar, rechazar (sirve para probar sin base). |
| `validateCatalogRows(rows)` | `slug` único, cupos 2–20, montos positivos; errores por fila (RF-009-07). |
| `maskCi(ciPlain)` | Últimos 3 dígitos (compartida con la spec 003). |

### Servicios

- **`BanService.ban(tx, input)`**: valida con `canActOnUser`; `UserAccountService.setStatus(tx, userId, 'baneado')` (cierra sesiones); crea `bans`; `IdentityService.blockIdentities(userId, banId)` (spec 003); `AuditPort.record(…, 'usuario_banear')`; `TxEventBus.publish(UserBanned)`. Los manejadores de otros módulos corren en la misma transacción:
  - `subscriptions`: retira al usuario de los grupos donde es miembro (`reason = 'baneo'`, evento `MemberRemoved`) y congela los que posee (`frozen_at`, `frozen_reason = 'titular_baneado'`).
  - `join-requests`: rechaza las solicitudes activas de sus grupos (`titular_baneado`) y cancela las que él abrió.
  - `billing`: nada que hacer; las tareas de generación y atrasos ya saltan los grupos congelados.
  - `reputation`: los cobros abiertos de grupos congelados por baneo se excluyen de la calificación (consulta, RF-009-22).
  - `notifications`: avisos a los titulares de los grupos que perdió y a los miembros de los grupos congelados.
- **`BanService.revoke`**: `canRevokeBan`; `bans.revoked_*`; `IdentityService.releaseIdentities(banId)`; estado `activo`; auditoría; evento `UserUnbanned`, que la spec 001 usa para descongelar los grupos del titular (no restaura otras pertenencias).
- **`UsersAdminService`**: búsqueda (`unaccent` + `ILIKE`), ficha con conteos (consultas de lectura a través de servicios de `subscriptions` y `reputation`), suspender, reactivar, rol (con `canRemoveAdminRole`), transferencia de titularidad por un administrador (RF-009-24: solo con titular `suspendido`; usa `MembershipService.transferOwnership` con el destinatario ya validado como habilitado).
- **`HostEnablementService`**: habilitar y revocar con motivo y auditoría; el adaptador `HostEligibilityAdapter.check(userId)` devuelve `manual` si hay habilitación vigente, o `calificacion` si la spec 007 lo permite (RF-007-15). CLI `npm run host:enable -w backend -- <correo> "<motivo>"` para el arranque (registra auditoría con el administrador del seed).
- **`AuditService`** implementa `AuditPort`; `list` con filtros.
- **`DisputesAdmin` (controlador)** llama a `DisputesService` de la spec 010 (`getEvidence`, `resolve`).
- **P2:** `CatalogAdminService` (crear/editar/activar con avisos, reemplaza el stub de 004), `CatalogImportService` (vista previa con token de 15 min guardado en memoria; aplica en una transacción), `ListingsModerationService` (spec 008), `StatsService` (consultas agregadas y caché de 5 min).

### Correo de suspensión

`MailService.send` con el motivo y `APPEAL_EMAIL` de configuración (RF-009-11). Si el correo falla, la suspensión se mantiene y queda en reintentos (spec 005).

## 6. Interfaz de usuario — _Adrian (Frontend)_

Todas las rutas bajo `/admin`; `proxy.ts` redirige a los no administradores a su panel (el servidor igualmente responde `403`).

| Ruta | Contenido | Endpoints | Entrega |
|---|---|---|---|
| `/admin` | Tablero (P2: tarjetas y tablas de estadísticas con alternativa en tabla y sin depender del color) y accesos | `GET /admin/stats` | P2 |
| `/admin/usuarios` | Búsqueda y filtros, lista paginada con estado y rol | `GET /admin/users` | MVP |
| `/admin/usuarios/[id]` | Ficha (CI enmascarada, grupos, nivel), botones **Suspender**, **Reactivar**, **Banear**, **Habilitar como titular**, **Promover/Quitar rol**, cada uno con modal de confirmación y motivo (10–300, contador de caracteres) | acciones | MVP |
| `/admin/reclamos` | Cola con abiertos primero | `GET /admin/disputes` | MVP |
| `/admin/reclamos/[id]` | Botón "Ver evidencia" (aviso: "Esta apertura queda registrada"), línea de tiempo, chat de solo lectura, comprobante, descripciones y respuestas; **Resolver** con resultado y motivo | `…/evidence`, `…/resolve` | MVP |
| `/admin/titulares` | Habilitaciones vigentes, alta y baja con motivo | `host-enablements` | MVP |
| `/admin/auditoria` | Tabla con filtros y paginación | `GET /admin/audit-log` | MVP |
| `/admin/catalogo` | Servicios y planes: crear, editar (aviso de que no cambia suscripciones existentes), activar/desactivar; importación con vista previa y errores por fila | `/admin/catalog/…` | P2 |
| `/admin/moderacion` | Publicaciones reportadas u ocultas con motivos; restaurar, eliminar, eliminar y suspender | `/admin/listings/…` | P2 |

Pantallas de lista utilizables en celular (tarjetas en lugar de tablas anchas); las acciones sensibles piden confirmación explícita escribiendo el nombre o pulsando un botón de doble paso (RNF-009-02).

## 7. Seguridad y permisos — _Leonardo (Backend), con revisión de BD_

- `AdminGuard` en todo el módulo; ninguna ruta de administración depende de lo que muestre el frontend (RNF-009-01).
- El administrador **no** ve: contraseñas, CI completa, comprobantes ni chats fuera de un reclamo abierto (RN-009-08); no hay exportaciones masivas.
- Toda acción: motivo validado, auditoría en la misma transacción, `metadata` sin datos sensibles.
- El log es de solo anexado en la base y la API no expone cambios ni borrados.
- La creación del primer administrador solo por CLI con variables de entorno (spec 003); en producción exige `--allow-production`.
- Las huellas de baneo son HMAC irreversibles (spec 003).

## 8. Estrategia de pruebas

| Criterio | Nivel | Capa | Test |
|---|---|---|---|
| CA-009-01 (usuario normal → 403) | Integración | BE | `admin.guard.e2e-spec.ts` (recorre todas las rutas `/admin`) |
| CA-009-02 (crear servicio y plan) | Integración | BE | `admin.catalog.e2e-spec.ts` (P2) |
| CA-009-03 (`slug` repetido) | Integración + unitario | BE | `admin.catalog.e2e-spec.ts`; `catalog-validation.spec.ts` (P2) |
| CA-009-04 (cambiar precio no afecta suscripciones) | Integración | BE | `admin.catalog.e2e-spec.ts` (P2) |
| CA-009-05 (plan desactivado no se ofrece) | Integración | BE | `admin.catalog.e2e-spec.ts` (P2) |
| CA-009-06 (importación con fila inválida) | Integración | BE | `admin.catalog-import.e2e-spec.ts` (P2) |
| CA-009-07 (buscar "camila") | Integración | BE | `admin.users.e2e-spec.ts` |
| CA-009-08 (ficha sin contraseñas ni comprobantes) | Integración | BE | `admin.users.e2e-spec.ts` |
| CA-009-09 (suspender cierra sesiones) | Integración | BE | `admin.suspension.e2e-spec.ts` |
| CA-009-10 (motivo ausente o corto) | Unitario + integración | BE | `reason.spec.ts`; `admin.suspension.e2e-spec.ts` |
| CA-009-11 (reactivar) | Integración | BE | `admin.suspension.e2e-spec.ts` |
| CA-009-12 (último administrador) | Unitario + integración + integridad | BE, BD | `admin-rules.spec.ts`; `admin.roles.e2e-spec.ts`; `admin.integrity.test.ts` |
| CA-009-13 (suspender a otro admin) | Unitario + integración | BE | `admin-rules.spec.ts`; `admin.suspension.e2e-spec.ts` |
| CA-009-14 (restaurar publicación) | Integración | BE | `admin.listings.e2e-spec.ts` (P2, requiere 008) |
| CA-009-15 (eliminar publicación notifica) | Integración | BE | `admin.listings.e2e-spec.ts` (P2) |
| CA-009-16 (totales por estado coinciden) | Integración | BE | `admin.stats.e2e-spec.ts` (P2) |
| CA-009-17 (estadísticas sin detalle personal) | Integración | BE | `admin.stats.e2e-spec.ts` (P2) |
| CA-009-18 (acción → auditoría) | Integración | BE | `admin.audit.e2e-spec.ts` |
| CA-009-19 (el log no se edita ni borra) | Integración + integridad | BE, BD | `admin.audit.e2e-spec.ts`; `admin.integrity.test.ts` |
| CA-009-20 (CLI del primer admin) | Integración | BE | `cli.seed-admin.spec.ts` (spec 003) |
| CA-009-21 (tablero con 10.000 usuarios < 2 s) | Rendimiento | BE | `admin.stats.perf-spec.ts` (P2) |
| CA-009-22 (baneo: sesiones, huellas) | Integración | BE | `admin.ban.e2e-spec.ts`; `auth.ban.e2e-spec.ts` |
| CA-009-23 (baneo sin motivo) | Unitario + integración + integridad | BE, BD | `reason.spec.ts`; `admin.ban.e2e-spec.ts`; `admin.integrity.test.ts` |
| CA-009-24 (reactivar no deshace baneo) | Integración | BE | `admin.ban.e2e-spec.ts` |
| CA-009-25 (estafa confirmada: titular baneado) | Integración | BE | `admin.disputes.e2e-spec.ts` |
| CA-009-26 (sin falta: nada cambia) | Integración | BE | `admin.disputes.e2e-spec.ts` |
| CA-009-27 (evidencia con auditoría; sin reclamo 403) | Integración | BE | `admin.disputes.e2e-spec.ts` |
| CA-009-28 (habilitación manual permite crear) | Integración | BE | `admin.hosts.e2e-spec.ts`; `groups.create.e2e-spec.ts` |
| CA-009-29 (banear a otro admin) | Unitario + integración + integridad | BE, BD | `admin-rules.spec.ts`; `admin.ban.e2e-spec.ts`; `admin.integrity.test.ts` |
| CA-009-30 (comprobante falso: solicitante baneado) | Integración | BE | `admin.disputes.e2e-spec.ts` |
| CA-009-31 (grupo "titular baneado" en solo lectura) | Integración + E2E | BE, FE | `admin.ban-effects.e2e-spec.ts`; `frontend/e2e/admin-ban.spec.ts` |
| CA-009-32 (grupo congelado no pasa a atrasado) | Integración | BE | `billing.overdue.e2e-spec.ts` (spec 002) |
| CA-009-33 (miembro baneado en 2 grupos) | Integración | BE | `admin.ban-effects.e2e-spec.ts` |
| CA-009-34 (revertir baneo por otro admin) | Unitario + integración + integridad | BE, BD | `admin-rules.spec.ts`; `admin.ban.e2e-spec.ts`; `admin.integrity.test.ts` |
| CA-009-35 (transferir con titular suspendido) | Integración | BE | `admin.transfer.e2e-spec.ts` |
| CA-009-36 (CI enmascarada) | Unitario + integración | BE | `mask-ci.spec.ts`; `admin.users.e2e-spec.ts` |
| CA-009-37 (revertir el baneo descongela los grupos del titular) | Integración | BE | `admin.ban-effects.e2e-spec.ts`; `groups.events.e2e-spec.ts` (spec 001) |

Pruebas de reglas: RN-009-01 → `admin.roles.e2e-spec.ts`; RN-009-02 y RN-009-07 → `admin-rules.spec.ts`; RN-009-03 → `admin.suspension.e2e-spec.ts` (los grupos y cobros no cambian); RN-009-04 → `reason.spec.ts`; RN-009-05 → `admin.catalog.e2e-spec.ts`; RN-009-06 → `admin.stats.e2e-spec.ts`; RN-009-08 → `admin.disputes.e2e-spec.ts`; RN-009-09 → `admin.disputes.e2e-spec.ts` (abrir un reclamo no banea).

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| El núcleo de 009 (P2) bloquea el MVP | Alta | Alto | Se construye junto con 001 y 010 (§1, `tasks.md`). |
| Un baneo equivocado | Media | Alto | Motivo obligatorio, auditoría, reversión por otro administrador (RF-009-23). |
| Grupo congelado sin salida tras revertir un baneo | Media | Medio | Señalado para decisión del equipo (análisis); mientras tanto, la transferencia por administrador solo aplica a suspendidos. |
| El administrador abusa de la evidencia | Baja | Alto | Auditoría previa a la entrega; solo con reclamo abierto (RN-009-08). |
| Baneo en cascada lento (muchos grupos) | Baja | Bajo | Un usuario tiene como máximo 5 grupos como titular; miembro sin límite pero acotado en la práctica; todo en una transacción corta. |
| Suspender al último admin activo por error | Baja | Alto | Disparador `last_admin_guard`. |

## 10. Trazabilidad

| Requisito | Cubierto en |
|---|---|
| RF-009-01 a RF-009-03 (acceso, primer admin, roles) | §5, §7, spec 003 (CLI) |
| RF-009-04 a RF-009-07 (catálogo) | §4, §5 (P2) |
| RF-009-08 a RF-009-11 (usuarios, suspensión, correo) | §4, §5 `UsersAdminService`, `MailService` |
| RF-009-12 a RF-009-14 (moderación) | §4, §5 (P2) |
| RF-009-15 a RF-009-17 (estadísticas) | §4, §5 `StatsService` (P2) |
| RF-009-18 (auditoría) | `data-model.md`, §5 `AuditService` |
| RF-009-19 a RF-009-24 (baneo, reclamos, titulares, efectos, revisión, titular suspendido) | §5 `BanService`, `HostEnablementService`, `UsersAdminService`; spec 010 |
| RNF-009-01 a RNF-009-06 | §7, §6, `StatsService` (caché) |
| RN-009-01 a RN-009-09 | §8 (pruebas de reglas) |
| CA-009-01 a CA-009-36 | §8 |
