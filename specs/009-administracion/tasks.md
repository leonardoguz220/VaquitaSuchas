# Tareas — Spec 009: Administración

- **Spec:** `spec.md` · **Plan:** `plan.md` · **Modelo:** `data-model.md` · **Contrato:** `contracts/api.md` · **Guía:** `quickstart.md`
- Capas: **BD** = Camila · **BE** = Leonardo · **FE** = Adrian. Cada tarea pertenece a **una** sola capa.
- Formato: `- [ ] Tnnn [P] [USn] [CAPA] Descripción con ruta — Depende: … · Cubre: …`. Los commits citan la tarea: `feat(009): add ban service [T012]`.
- Historias: **US1** administrar usuarios: buscar, suspender, reactivar, banear, revertir y promover (HU-009-02, HU-009-06; **núcleo MVP**) · **US2** auditoría de las acciones (HU-009-05; núcleo MVP) · **US3** habilitar titulares y transferir titularidad (HU-009-08; núcleo MVP) · **US4** reclamos de ingreso con evidencia y sanción (HU-009-07; núcleo MVP) · **US5** catálogo e importación (HU-009-01; P2) · **US6** moderación de cupos (HU-009-03; P2) · **US7** estadísticas (HU-009-04; P2).
- La spec es P2, pero su **núcleo** (`bans`, `host_enablements`, `admin_audit_log`, `user_suspensions`, usuarios, titulares, reclamos y auditoría) es una dependencia del MVP: las specs 001, 003 y 010 lo necesitan (`BanPort`, `AuditPort`, `HostEligibilityPort`, eventos `UserBanned` y `UserSuspended`). Se construye justo antes de los reclamos de la spec 010 (T037 en adelante). Catálogo, moderación y estadísticas (US5 a US7) quedan al final.
- Depende de las specs 000, 003 (`IdentityService` T011, `UserAccountService` T012, `AuthGuard` T013, CLI `seed-admin` T022), 001 (eventos y `transferOwnership`), 007 (`ReputationQueryPort`) y 010 (`DisputesService`, que define `BanPort` y `AuditPort`).
- **Aclaración aprobada el 2026-10-18** (`plan.md` §2, «Reversión del baneo»): al revertir un baneo se descongelan los grupos que ese baneo congeló (evento `UserUnbanned`, spec 001 T028, CA-009-37); no se restituyen otras pertenencias ni cobros.

## Fase 1: Base común — núcleo (modelo y dominio puro)

- [x] T001 [BD] Escribir primero `database/tests/admin.integrity.test.ts`: un segundo baneo vigente del mismo usuario falla y tras revertir se permite otro; baneo con motivo de 9 o 301 caracteres falla; baneo o suspensión de un administrador falla; revertir con el mismo administrador que baneó falla; dejar al sistema sin administrador activo falla (cambio de rol o de estado); `UPDATE` y `DELETE` en `admin_audit_log` fallan y una `action` fuera de la lista falla; dos habilitaciones manuales vigentes del mismo usuario fallan; una suspensión abierta por usuario — Depende: spec 003 T002 · Cubre: CA-009-12, CA-009-13, CA-009-19, CA-009-23, CA-009-29, CA-009-34, RN-009-01, RN-009-07, RF-009-10, RF-009-21, RF-009-23
- [x] T002 [BD] Migración `database/migrations/0090_bans.sql`: `bans` (`user_id` FK RESTRICT, `reason` 10–300, `source` IN ('admin','reclamo'), `dispute_id` FK `join_disputes` con CHECK de coherencia, `banned_by`, `banned_at`, `revoked_*` con CHECK de coherencia y `revoked_by <> banned_by`, `banned_by <> user_id`), único vigente por usuario `bans_active_user_uq WHERE revoked_at IS NULL`, índice `bans_user_idx` y la FK `banned_identities.ban_ref → bans(id)` de la spec 003 — Depende: T001, spec 010 T005 · Cubre: RF-009-19, RF-009-23, RN-009-07, CA-009-23, CA-009-34
- [x] T003 [BD] Migración `0091_host_enablements.sql`: `host_enablements` (usuario, motivo 10–300, quién y cuándo, revocación con CHECK de coherencia, único vigente por usuario) — Depende: T001 · Cubre: RF-009-21, RF-007-17
- [x] T004 [BD] Migración `0092_admin_audit_log.sql`: `admin_audit_log` de solo anexado (`forbid_update_delete`) con `admin_id`, `action` CHECK IN (lista cerrada: `usuario_suspender`, `usuario_reactivar`, `usuario_banear`, `baneo_revertir`, `rol_cambiar`, `titular_habilitar`, `titular_revocar`, `titularidad_transferir`, `reclamo_evidencia`, `reclamo_resolver`, `catalogo_*`, `publicacion_*`), `target_type`, `target_id`, `reason`, `metadata` jsonb sin datos sensibles, `occurred_at`; índices por fecha, administrador y objetivo — Depende: T001 · Cubre: RF-009-18, RNF-009-03, CA-009-18, CA-009-19
- [x] T005 [BD] Migración `0093_user_suspensions.sql`: `user_suspensions` (usuario, motivo, administrador, apertura y cierre; una abierta por usuario) y `0094_admin_triggers.sql` (último administrador activo, no suspender ni banear administradores, revertir por otro administrador) — Depende: T001 · Cubre: RF-009-10, RN-009-01, RN-009-02, RN-009-07, CA-009-12, CA-009-13, CA-009-29
- [ ] T006 [BD] Seed de desarrollo: un administrador creado por el CLI `seed-admin` (spec 003 T022), dos usuarios con reclamos abiertos (spec 010 T007) y un baneo revertido para probar la interfaz — Depende: T005 · Cubre: CA-009-20
- [ ] T007 [P] [BE] `modules/admin/domain/reason.ts` (`validateReason`: 10–300 caracteres tras recortar) y `admin-rules.ts` (`canActOnUser({ actor, target, action })`, `canRemoveAdminRole({ activeAdmins, target })`, `canRevokeBan({ ban, actorId })`) con `reason.spec.ts` y `admin-rules.spec.ts` (CA-009-10, 12, 13, 24, 29, 34) — Depende: spec 000 T004 · Cubre: RN-009-01, RN-009-02, RN-009-04, RN-009-07, RF-009-23, CA-009-10, CA-009-12, CA-009-13, CA-009-23, CA-009-24, CA-009-29, CA-009-34
- [ ] T008 [P] [BE] `domain/ban-effects.ts` (`banEffects(user, groupsAsOwner, groupsAsMember)` → lista de efectos: congelar, retirar, rechazar) con `ban-effects.spec.ts`; reutilizar `maskCi` de la spec 003 T008 con `mask-ci.spec.ts` si falta — Depende: spec 000 T004 · Cubre: RF-009-19, RF-009-22, CA-009-33, CA-009-36
- [ ] T009 [BE] Repositorios `repositories/{bans,host-enablements,audit,suspensions}.repository.ts` (SQL con parámetros) y eventos internos `UserSuspended`, `UserReactivated`, `UserBanned`, `UserUnbanned` en `shared/events` — Depende: T005, spec 000 T056 · Cubre: RF-009-18, RF-009-19

**Punto de control (I1):** modelo y reglas puras disponibles; la spec 010 puede enchufar `BanPort` y `AuditPort`.

## Fase 2: US2 — Auditoría (núcleo MVP, Prioridad: P0) 🎯 MVP

**Meta:** toda acción de un administrador queda registrada en la misma transacción y el registro no se edita ni se borra.
**Prueba independiente:** suspender a un usuario crea una fila en `admin_audit_log` y `GET /admin/audit-log` la devuelve.

- [ ] T010 [P] [US2] [BE] `backend/test/admin.guard.e2e-spec.ts` (CA-009-01: un usuario normal recibe `403` en todas las rutas `/admin`, recorridas automáticamente) y `admin.audit.e2e-spec.ts` (CA-009-18 acción → auditoría, CA-009-19 el log no se edita ni se borra, filtros y paginación) — Depende: T009, spec 003 T013 · Cubre: CA-009-01, CA-009-18, CA-009-19, RNF-009-01, RF-009-18, RF-009-01
- [ ] T011 [US2] [BE] `services/audit.service.ts` que implementa `AuditPort.record(tx, entry)`, `controllers/admin-audit.controller.ts` `GET /admin/audit-log` con `AdminGuard` y registro en la misma transacción de la acción; los metadatos no incluyen datos sensibles — Depende: T010 · Cubre: RF-009-18, RNF-009-01, RNF-009-03, CA-009-18, CA-009-19, RNF-009-05

## Fase 3: US1 — Usuarios: suspender, banear, revertir, promover (núcleo MVP) 🎯 MVP

**Meta:** el equipo busca usuarios, los suspende o banea con motivo y todo se propaga a grupos y solicitudes.
**Prueba independiente:** banear a un titular congela sus grupos, retira al baneado de los grupos donde es miembro y bloquea su correo, celular, cédula y cuenta de Telegram.

- [ ] T012 [P] [US1] [BE] `backend/test/admin.users.e2e-spec.ts` (CA-009-07 buscar «camila», CA-009-08 ficha sin contraseñas ni comprobantes, CA-009-36 CI enmascarada), `admin.suspension.e2e-spec.ts` (CA-009-09 suspender cierra sesiones, CA-009-10 motivo ausente o corto, CA-009-11 reactivar, CA-009-13 suspender a otro administrador), `admin.roles.e2e-spec.ts` (CA-009-12 último administrador, RN-009-01), `admin.ban.e2e-spec.ts` (CA-009-22 baneo: sesiones y huellas, CA-009-23 sin motivo, CA-009-24 reactivar no deshace el baneo, CA-009-29 banear a otro administrador, CA-009-34 revertir por otro administrador) y `auth.ban.e2e-spec.ts` (spec 003) — Depende: T009 · Cubre: CA-009-07, CA-009-08, CA-009-09, CA-009-10, CA-009-11, CA-009-12, CA-009-13, CA-009-22, CA-009-23, CA-009-24, CA-009-29, CA-009-34, CA-009-36
- [ ] T013 [US1] [BE] `services/users-admin.service.ts` y `controllers/admin-users.controller.ts`: `GET /admin/users` (búsqueda con `unaccent` e `ILIKE`, filtros y paginación), `GET /admin/users/:userId` (ficha con CI enmascarada, grupos y nivel, por servicios de `subscriptions` y `reputation`), `POST …/suspend` (cierra sesiones y envía el correo con el motivo y `APPEAL_EMAIL`; si el correo falla la suspensión se mantiene), `POST …/reactivate` (no aplica a baneados: `USER_BANNED`) y `POST …/role` (con `canRemoveAdminRole`), todo con auditoría en la misma transacción — Depende: T011, T012, T007, spec 003 T012 · Cubre: RF-009-03, RF-009-08, RF-009-09, RF-009-10, RF-009-11, RN-009-01, RN-009-02, RN-009-03, RN-009-04, CA-009-07, CA-009-08, CA-009-09, CA-009-10, CA-009-11, CA-009-12, CA-009-13, CA-009-24, CA-009-36
- [ ] T014 [US1] [BE] `services/ban.service.ts` `ban(tx, input)` (valida con `canActOnUser`; `setStatus(baneado)` cierra sesiones; crea `bans`; `IdentityService.blockIdentities` con huellas irreversibles; auditoría `usuario_banear`; publica `UserBanned`) que implementa `BanPort.ban(tx, { adminId, userId, reason, disputeId })`, y `POST /admin/users/:userId/ban` — Depende: T013, spec 003 T011 · Cubre: RF-009-19, RF-009-22, RN-009-07, RN-009-08, CA-009-22, CA-009-23, CA-009-29
- [ ] T015 [US1] [BE] `BanService.revoke` y `POST /admin/bans/:banId/revoke` (otro administrador distinto del que baneó; `IdentityService.releaseIdentities`; estado `activo`; auditoría; evento `UserUnbanned`, los grupos que ese baneo congeló se descongelan por el manejador de la spec 001 T028; no se restituyen otras pertenencias ni cobros) — Depende: T014 · Cubre: RF-009-23, CA-009-34, CA-009-37
- [ ] T016 [P] [US1] [BE] `backend/test/admin.ban-effects.e2e-spec.ts`: CA-009-31 (grupo «titular baneado» en solo lectura), CA-009-33 (miembro baneado en 2 grupos), solicitudes activas rechazadas o canceladas, cobros abiertos de grupos congelados excluidos de la reputación (RF-009-22) y CA-009-32 en `billing.overdue.e2e-spec.ts` (el grupo congelado no pasa a `atrasado`) — Depende: T014, spec 001 T028, spec 010 T043, spec 002 T032; y CA-009-37 (revertir el baneo descongela los grupos del titular) · Cubre: CA-009-31, CA-009-32, CA-009-33, RF-009-22, CA-009-37
- [x] T017 [P] [US1] [FE] `/admin/usuarios` (búsqueda, filtros, lista paginada con estado y rol) y `/admin/usuarios/[id]` (ficha con CI enmascarada, grupos y nivel; botones **Suspender**, **Reactivar**, **Banear**, **Promover/Quitar rol**, cada uno con modal de confirmación y motivo de 10 a 300 con contador) con mock; `proxy.ts` redirige a los no administradores; listas como tarjetas en móvil — Depende: spec 000 T036 · Cubre: RF-009-08, RF-009-09, RF-009-10, RF-009-19, RNF-009-02
- [ ] T018 [US1] [FE] Conectar `/admin/usuarios` y la ficha con los endpoints de usuarios y baneo, y mostrar el aviso «grupo congelado por titular baneado» en `/grupos/[id]` con `frontend/e2e/admin-ban.spec.ts` (CA-009-31) — Depende: T015, T017, spec 001 T021 · Cubre: RF-009-08, RF-009-19, CA-009-31

## Fase 4: US3 — Titulares habilitados y transferencia por un administrador (núcleo MVP)

**Meta:** el sistema puede arrancar con titulares habilitados a mano; un administrador transfiere un grupo con titular suspendido.
**Prueba independiente:** una habilitación manual permite crear un grupo a quien tiene calificación baja.

- [ ] T019 [P] [US3] [BE] `backend/test/admin.hosts.e2e-spec.ts` (CA-009-28: la habilitación manual permite crear; revocar con motivo) y `admin.transfer.e2e-spec.ts` (CA-009-35: transferir solo con titular `suspendido`) — Depende: T011 · Cubre: CA-009-28, CA-009-35, RF-009-21, RF-009-24
- [ ] T020 [US3] [BE] `services/host-enablement.service.ts`, `controllers/admin-hosts.controller.ts` (`GET /admin/host-enablements?active=true`, `POST /admin/users/:userId/host-enablement` para habilitar y revocar con motivo y auditoría), `POST /admin/groups/:groupId/transfer-ownership` (usa `MembershipService.transferOwnership`, spec 001 T036), el adaptador `app-adapters/host-eligibility.adapter.ts` que compone la habilitación vigente con `ReputationQueryPort.checkHostRating` y el CLI `backend/src/cli/host-enable.ts` — Depende: T019, spec 001 T013, spec 007 T010 · Cubre: RF-009-21, RF-009-24, RF-007-17, CA-009-28, CA-009-35
- [x] T021 [P] [US3] [FE] `/admin/titulares` (habilitaciones vigentes, alta y baja con motivo) y acción **Transferir titularidad** en la ficha del grupo, con mock, conectado al terminar T020 — Depende: T017 · Cubre: RF-009-21, RF-009-24

## Fase 5: US4 — Reclamos de ingreso (núcleo MVP)

**Meta:** el administrador abre la evidencia (con auditoría previa) y resuelve el reclamo; solo así se banea.
**Prueba independiente:** `estafa_confirmada` banea a la persona acusada y `sin_falta` no cambia ninguna cuenta.

- [ ] T022 [P] [US4] [BE] `backend/test/admin.disputes.e2e-spec.ts`: CA-009-25 (estafa confirmada: titular baneado), CA-009-26 (sin falta: nada cambia), CA-009-27 (evidencia con auditoría; sin reclamo abierto `403`), CA-009-30 (comprobante falso: solicitante baneado), `DISPUTE_NOT_OPEN` — Depende: T014, spec 010 T038 · Cubre: CA-009-25, CA-009-26, CA-009-27, CA-009-30, RN-009-08, RF-009-20, RF-010-23, RF-010-24
- [ ] T023 [US4] [BE] `controllers/admin-disputes.controller.ts`: `GET /admin/disputes?status=abierto`, `GET /admin/disputes/:disputeId/evidence` (audita **antes** de devolver; no hay ruta de chat para el administrador) y `POST /admin/disputes/:disputeId/resolve` (llama a `DisputesService.getEvidence` y `resolve`, spec 010; `estafa_confirmada` usa `BanService`) — Depende: T022, spec 010 T038 · Cubre: RF-009-20, RF-010-23, RF-010-24, RN-009-08, CA-009-25, CA-009-26, CA-009-27, CA-009-30, RN-009-09
- [ ] T024 [P] [US4] [FE] `/admin/reclamos` (cola con abiertos primero) y `/admin/reclamos/[id]` («Ver evidencia» con el aviso «Esta apertura queda registrada», línea de tiempo, chat de solo lectura, comprobante, descripciones y respuestas; **Resolver** con resultado y motivo) con mock y `/admin/auditoria` (tabla con filtros y paginación) — Depende: T017 · Cubre: RF-009-18, RF-009-20, RNF-009-02
- [ ] T025 [US4] [FE] Conectar reclamos y auditoría con `GET /admin/disputes…`, `…/evidence`, `…/resolve` y `GET /admin/audit-log` — Depende: T011, T023, T024 · Cubre: RF-009-18, RF-009-20

**Punto de control (I2):** el núcleo de la spec 009 está listo para las specs 001, 003 y 010 y para el hito MVP.

## Fase 6: US5 — Catálogo e importación (Prioridad: P2)

**Meta:** el equipo gestiona servicios y planes sin tocar la base; la importación es todo o nada con vista previa.
**Prueba independiente:** importar un CSV con una fila inválida muestra el error de esa fila y no cambia nada hasta aplicar.

- [ ] T026 [P] [US5] [BE] `domain/catalog-validation.ts` (`validateCatalogRows`: `slug` único, cupos 2–20, montos positivos, errores por fila) y `csv-parse.ts` con `catalog-validation.spec.ts` — Depende: T007 · Cubre: RF-009-06, RF-009-07, CA-009-03
- [ ] T027 [P] [US5] [BE] `backend/test/admin.catalog.e2e-spec.ts` (CA-009-02 crear servicio y plan, CA-009-03 `slug` repetido, CA-009-04 cambiar precio no afecta suscripciones, CA-009-05 plan desactivado no se ofrece) y `admin.catalog-import.e2e-spec.ts` (CA-009-06 fila inválida) — Depende: T011, spec 004 T007 · Cubre: CA-009-02, CA-009-03, CA-009-04, CA-009-05, CA-009-06
- [ ] T028 [US5] [BE] `services/catalog-admin.service.ts` y `controllers/admin-catalog.controller.ts` (`POST/PATCH /admin/catalog/services`, `…/plans`, `activate|deactivate`; reemplazan el stub de la spec 004) y `services/catalog-import.service.ts` (`POST /admin/catalog/import/preview` con token de 15 minutos en memoria y `POST …/apply` en una transacción) — Depende: T026, T027 · Cubre: RF-009-04, RF-009-05, RF-009-06, RF-009-07, CA-009-02 a 06, RN-009-05
- [ ] T029 [P] [US5] [FE] `/admin/catalogo` (servicios y planes: crear, editar con el aviso de que no cambia suscripciones existentes, activar y desactivar; importación con vista previa y errores por fila) con mock, conectado al terminar T028 — Depende: T017 · Cubre: RF-009-04, RF-009-06

## Fase 7: US6 — Moderación de cupos (Prioridad: P2)

- [ ] T030 [P] [US6] [BE] `backend/test/admin.listings.e2e-spec.ts`: CA-009-14 (restaurar una publicación), CA-009-15 (eliminar notifica al titular) — Depende: T011, spec 008 (publicaciones y reportes) · Cubre: CA-009-14, CA-009-15
- [ ] T031 [US6] [BE] `services/listings-moderation.service.ts` y `controllers/admin-listings.controller.ts` (`GET /admin/listings/reports`, `POST /admin/listings/:id/restore | delete | delete-and-suspend` con motivo y auditoría; notifica con la spec 005) — Depende: T030 · Cubre: RF-009-12, RF-009-13, RF-009-14, CA-009-14, CA-009-15
- [x] T032 [P] [US6] [FE] `/admin/moderacion` (publicaciones reportadas u ocultas con motivos; restaurar, eliminar, eliminar y suspender) con mock, conectado al terminar T031 — Depende: T017 · Cubre: RF-009-12

## Fase 8: US7 — Estadísticas (Prioridad: P2)

- [ ] T033 [P] [US7] [BE] `backend/test/admin.stats.e2e-spec.ts` (CA-009-16 totales por estado coinciden, CA-009-17 solo agregados) y `admin.stats.perf-spec.ts` (CA-009-21: tablero con 10.000 usuarios en menos de 2 s) — Depende: T011 · Cubre: CA-009-16, CA-009-17, CA-009-21
- [ ] T034 [US7] [BE] `services/stats.service.ts`, `repositories/stats.repository.ts` (consultas agregadas con caché en memoria de 5 minutos) y `controllers/admin-stats.controller.ts` `GET /admin/stats` — Depende: T033 · Cubre: RF-009-15, RF-009-16, RF-009-17, CA-009-16, CA-009-17, CA-009-21, RN-009-06, RNF-009-04
- [x] T035 [P] [US7] [FE] `/admin` (tarjetas y tablas de estadísticas con alternativa en tabla, sin depender del color) con mock, conectado al terminar T034 — Depende: T017 · Cubre: RF-009-15, RNF-009-02

## Fase 9: Cierre

- [ ] T036 [BE] Revisión de seguridad: `AdminGuard` en todo el módulo, el administrador no ve contraseñas, CI completa, comprobantes ni chats fuera de un reclamo, sin exportaciones masivas, log de solo anexado, CLI del primer administrador exige `--allow-production` — Depende: T023, T031 · Cubre: RNF-009-01, RN-009-08, CA-009-20, RF-009-02
- [ ] T037 [BD] Revisar con Camila los planes de consulta de la búsqueda de usuarios, el log de auditoría y las estadísticas con 10.000 usuarios de prueba — Depende: T034 · Cubre: CA-009-21
- [ ] T038 [FE] Accesibilidad y móvil primero de las pantallas de administración (confirmación explícita en acciones sensibles, tarjetas en lugar de tablas anchas) — Depende: T025, T035 · Cubre: RNF-009-02, RNF-009-06
- [ ] T039 [BE] Ejecutar `/speckit-converge`: actualizar `spec.md` y `plan.md` con lo implementado (reversión del baneo, estadísticas) y marcar las tareas hechas — Depende: T036, T037, T038 · Cubre: —

## Dependencias y orden de ejecución

- **Núcleo MVP:** Fase 1 → US2 → US1 → US3 → US4 (T001–T025). Se construye antes de los reclamos de la spec 010 (T037–T040) y de la reputación (spec 007 T014).
- **P2:** US5, US6 y US7 son independientes entre sí y dependen solo de T011 y T017.
- Esta spec necesita de otras: spec 003 T011, T012, T013 y T022; spec 001 T013, T028 y T036; spec 007 T010; spec 010 T005 (`join_disputes`) y T038 (`DisputesService`); spec 004 T007 (stub del catálogo); spec 008.
- Las specs 001, 003 y 010 necesitan de esta: T009 (eventos), T011 (`AuditPort`), T014 (`BanPort`) y T020 (`HostEligibilityPort`).

## Ejemplos de paralelización

- Después de T001: T002 a T005 (BD) y T007 y T008 (BE) a la vez.
- Pruebas de historias: T010, T012, T019, T022, T027, T030 y T033 pueden escribirse en paralelo antes de sus implementaciones.
- Frontend con mock: T017, T021, T024, T029, T032 y T035 en paralelo con el backend.

## Estrategia de implementación

1. **Núcleo MVP primero:** Fase 1 → auditoría → usuarios y baneo → titulares → reclamos. Con eso las specs 001, 003 y 010 quedan completas.
2. **P2 al final:** catálogo con importación (última tarea de código), moderación y estadísticas.
3. Al revertir un baneo se descongelan los grupos que congeló (aprobado el 2026-10-18).

## Puntos de integración (hitos)

- [ ] **I1:** modelo de datos y puertos `AuditPort` y `BanPort` disponibles (T002 a T011)
- [ ] **I2:** núcleo MVP completo: usuarios, baneo, titulares, reclamos y auditoría (T025)
- [ ] **I3:** frontend conectado al backend real (T018, T021, T025, T029, T032, T035)
- [ ] **I4:** `HostEligibilityPort` conectado con la spec 007 (T020)

## Bloqueos y decisiones durante la implementación

| Fecha | Situación | Decisión | ¿Cambió la spec o el contrato? |
|---|---|---|---|
| 2026-10-18 | Revertir un baneo | Aprobado: se descongelan los grupos que congeló (CA-009-37) | Sí: RF-009-23 en `spec.md` |
| 2026-10-18 | Correo de apelación (`APPEAL_EMAIL`) y proveedor de correo | Resend con dominio gratis o Brevo con remitente único (spec 000 R4); el correo de apelación se configura por variable de entorno | No |
