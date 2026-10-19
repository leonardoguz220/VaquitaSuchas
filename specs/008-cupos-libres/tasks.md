# Tareas — Spec 008: Cupos libres

- **Spec:** `spec.md` · **Plan:** `plan.md` · **Modelo:** `data-model.md` · **Contrato:** `contracts/api.md` · **Guía:** `quickstart.md`
- Capas: **BD** = Camila · **BE** = Leonardo · **FE** = Adrian. Cada tarea pertenece a **una** sola capa.
- Formato: `- [ ] Tnnn [P] [USn] [CAPA] Descripción con ruta — Depende: … · Cubre: …`. Los commits citan la tarea: `feat(008): add listing publish [T012]`.
- Historias: **US1** publicar los cupos libres del grupo (HU-008-01, HU-008-07) · **US2** buscar cupos y ver el detalle (HU-008-02) · **US3** solicitar un cupo y que el titular decida (HU-008-03, HU-008-04, HU-008-05) · **US4** reportar una publicación sospechosa (HU-008-06) · **US5** vencimiento y eventos de grupo (RF-008-05, RF-008-14, RN-008-04).
- Prioridad P2. Es el último módulo del orden de construcción. Depende de las specs 001 (grupos, `entryWindow`, `splitShares`), 010 (solicitudes: `JoinRequestsService`, `ReservedSlotsQuery`, `ListingQuotaPort`), 007 (`ReputationQueryPort`), 005 (avisos) y 009 (moderación).
- **Cambios pedidos a otras specs** (se aplican por PR antes de T012): la spec 010 expone `openFromListing(userId, listing, message)`, `rejectOpenForListing(tx, listingId, reason)`, define `ListingQuotaPort.remainingOffered(tx, listingId)` y publica `JoinRequestAccepted{listingId?}` (spec 010 T036); la spec 005 agrega el aviso `publicacion_transferida` (ya en su catálogo).
- **Decisiones del plan aprobadas el 2026-10-18:** tope de cupos ofrecidos por el puerto de cuotas, límite de 10 reportes por día y descripción opcional.

## Fase 1: Base común (modelo y dominio puro)

- [x] T001 [BD] Escribir primero `database/tests/listings.integrity.test.ts`: publicar con grupo lleno falla (CA-008-02); dos publicaciones activas u ocultas del mismo grupo fallan y `expirada` no bloquea otra (CA-008-03); `slots_offered >= 1` salvo en `cerrada`; `cerrada`/`retirada` exigen `ended_at` y `end_reason`; estados finales inmutables; transición inválida falla; un reporte por persona y publicación (CA-008-18); `join_requests.listing_id` con FK válida — Depende: spec 010 T001 · Cubre: CA-008-02, CA-008-03, CA-008-18, RF-008-02
- [x] T002 [BD] Migración `database/migrations/0080_listings.sql`: `listings` (`group_id` FK RESTRICT, `owner_id`, `slots_offered`, `description`, `conditions`, `status` IN ('activa','oculta','expirada','retirada','cerrada'), `published_at`, `expires_at`, `hidden_at`, `moderation_cleared_at`, `ended_at`, `end_reason`, `version`) con `CHECK (status = 'cerrada' OR slots_offered >= 1)`, los de coherencia de `ended_at` y `hidden_at`, `expires_at > published_at`, único `listings_group_active_uq (group_id) WHERE status IN ('activa','oculta')` e índices `listings_search_idx (expires_at) WHERE status = 'activa'` y `listings_group_idx` — Depende: T001 · Cubre: RF-008-01, RF-008-02, RF-008-05, RNF-008-02
- [x] T003 [BD] Migración `0081_listing_reports.sql`: `listing_reports` (publicación, quien reporta, motivo spam/dañado/engañoso/otro con comentario opcional, fecha; único por persona y publicación) — Depende: T002 · Cubre: RF-008-17, CA-008-18
- [ ] T004 [BD] Migración `0082_listing_links.sql`: FK `join_requests.listing_id → listings(id)`, disparador `listings_transition_guard` (publicar, ocultar, restaurar, expirar, renovar, retirar, cerrar; `retirada` y `cerrada` finales) y seed de desarrollo con tres publicaciones (activa, oculta, expirada) — Depende: T003, spec 010 T002 · Cubre: RF-008-05, RF-008-06, RF-008-18
- [ ] T005 [P] [BE] `modules/listings/domain/estimated-share.ts` (`estimatedShare(total, miembros, cupos)` = `splitShares(total, miembros + cupos).baseShare`) y `offered-slots.ts` (`offeredNow`, `clampOffered`) con `estimated-share.spec.ts` (Bs 90,00 con 2 miembros y 1 cupo → Bs 30,00: CA-008-04) y `offered-slots.spec.ts` — Depende: spec 001 T007 · Cubre: RN-008-02, RN-008-04, CA-008-04
- [ ] T006 [P] [BE] `domain/listing-lifecycle.ts` (`canPublish`, `expiresAt` = +30 días, `nextStatus(current, action)`) y `report-rules.ts` (`shouldHide`: `>= 3` reportes distintos desde `moderation_cleared_at`) con `listing-lifecycle.spec.ts` y `report-rules.spec.ts` (CA-008-14, 17) — Depende: spec 000 T004 · Cubre: RF-008-01, RF-008-05, RF-008-18, CA-008-02, CA-008-14, CA-008-17
- [ ] T007 [P] [BE] `domain/plain-text.ts` (`normalizePlainText(input, max)`: recorta, normaliza saltos de línea, rechaza caracteres de control; no altera `<` ni `&`) y `entryWindowLabel(window)` («abierta hasta [fecha]» o «se abre el [fecha]») con `plain-text.spec.ts` y `entry-window-label.spec.ts` (CA-008-19, 23) — Depende: spec 001 T009 · Cubre: RN-008-07, CA-008-19, CA-008-23
- [ ] T008 [BE] Repositorios `repositories/{listings,listing-reports,listings-search}.repository.ts` (SQL con parámetros; `FOR UPDATE` del grupo y orden de bloqueo solicitud → grupo → publicación) y el adaptador `backend/src/app-adapters/listing-quota.adapter.ts` que implementa `ListingQuotaPort.remainingOffered(tx, listingId)` — Depende: T004, spec 010 T036 · Cubre: RNF-008-03

**Punto de control (I1):** modelo, puertos y funciones puras disponibles.

## Fase 2: US1 — Publicar cupos (Prioridad: P2)

**Meta:** el titular publica, edita, renueva y retira la publicación de su grupo.
**Prueba independiente:** publicar 2 cupos de un grupo con espacio crea una publicación activa con la cuota estimada; una segunda publicación del mismo grupo se rechaza.

- [ ] T009 [P] [US1] [BE] `backend/test/listings.publish.e2e-spec.ts`: CA-008-01 (publicar 2 cupos, aparece con la cuota estimada), CA-008-02 (grupo lleno), CA-008-03 (segunda publicación), CA-008-22 (usuario suspendido: `ACCOUNT_RESTRICTED`), edición, renovación (+30 días) y retiro; solo el titular, miembro ve el resumen y ajeno `404` — Depende: T008 · Cubre: CA-008-01, CA-008-02, CA-008-03, CA-008-22, RF-008-01, RF-008-02, RF-008-06
- [ ] T010 [US1] [BE] `services/listings.service.ts` (`publish` bloquea el grupo `FOR UPDATE`, comprueba `canPublish` con los cupos libres de `subscriptions` y los reservados por `ReservedSlotsQuery`; `update`, `renew`, `withdraw`, `getForOwner`, `getSummaryForMember`) y `controllers/group-listing.controller.ts` (`POST/GET/PATCH/DELETE /groups/:groupId/listing`, `POST …/renew`) — Depende: T009, T005, T006, T007, spec 010 T014 · Cubre: RF-008-01, RF-008-02, RF-008-03, RF-008-05, RF-008-06, RN-008-02, RN-008-07, CA-008-01, CA-008-02, CA-008-03, CA-008-22
- [x] T011 [P] [US1] [FE] Pestaña **Publicar cupos** de `/grupos/[id]` con mock: formulario (cupos, descripción, condiciones), vista previa como la verá el público, estado (activa hasta, oculta, expirada), **Renovar**, **Editar**, **Retirar**, aviso fijo «Aceptar a alguien cambia la cuota de todos desde el siguiente cobro»; insignia «El grupo publicó cupos» para miembros — Depende: spec 001 T020 · Cubre: RF-008-01, RF-008-05, RF-008-06, RN-008-03
- [ ] T012 [US1] [FE] Conectar la pestaña con `/groups/:id/listing` y `…/renew` — Depende: T010, T011 · Cubre: RF-008-01, RF-008-06

## Fase 3: US2 — Buscar cupos (Prioridad: P2)

**Meta:** cualquier usuario busca publicaciones con filtros, sin ver datos de los miembros ni de pago.
**Prueba independiente:** `GET /listings?service=netflix` devuelve solo publicaciones de Netflix, sin las de los grupos del usuario, y la respuesta no contiene nombres de miembros, pago ni código.

- [ ] T013 [P] [US2] [BE] `backend/test/listings.search.e2e-spec.ts` (CA-008-06 filtro por «Netflix», CA-008-07 no ve las de sus grupos, paginación, orden, rendimiento de menos de 500 ms con 5.000 publicaciones) y `listings.view.e2e-spec.ts` (CA-008-05: sin miembros, datos de pago ni código; instantánea de la forma de la respuesta con lista blanca de campos) — Depende: T008 · Cubre: CA-008-05, CA-008-06, CA-008-07, RF-008-04, RF-008-07, RF-008-08, RF-008-09, RNF-008-01, RNF-008-02
- [ ] T014 [US2] [BE] `services/listings-search.service.ts` (filtros por servicio, categoría y rango de cuota; exclusiones de propias, de grupos donde es miembro y de grupos no elegibles o con titular suspendido; `ListingView` con `entryWindow`, nivel del titular por `ReputationQueryPort`, `canRequest` y `cannotRequestReason`) y `controllers/listings.controller.ts` `GET /listings` y `GET /listings/:id` — Depende: T013, T005, spec 007 T010 · Cubre: RF-008-03, RF-008-04, RF-008-07, RF-008-08, RF-008-09, RNF-008-01, RNF-008-02, CA-008-05, CA-008-06, CA-008-07, CA-008-23
- [x] T015 [P] [US2] [FE] `/cupos` (tarjetas con servicio, cupos, **cuota estimada** rotulada «estimada», día de cobro, titular con su nivel y estado de la ventana; filtros y orden; «Cargar más»; estado vacío; móvil primero) y `/cupos/[id]` (detalle con textos como texto plano `pre-wrap` sin enlaces activos) con mock — Depende: spec 007 T015 · Cubre: RF-008-07, RF-008-09, RNF-008-05, RN-008-07
- [ ] T016 [US2] [FE] Conectar `/cupos` y `/cupos/[id]` con `GET /listings` y `GET /listings/:id`; `frontend/e2e/listings-xss.spec.ts` (CA-008-19: `<script>` como texto) — Depende: T014, T015 · Cubre: RF-008-07, CA-008-19

## Fase 4: US3 — Solicitar un cupo (Prioridad: P2)

**Meta:** el usuario solicita un cupo con un mensaje corto; el titular decide con el flujo de la spec 010.
**Prueba independiente:** `POST /listings/:id/requests` abre una solicitud `abierta` con `source = listing`, el mensaje como primera línea del chat y avisa al titular.

- [ ] T017 [P] [US3] [BE] `backend/test/listings.requests.e2e-spec.ts`: CA-008-08 (mensaje de 250 caracteres), CA-008-09 (la sexta solicitud activa), CA-008-10 (confirmar: ingresa, cuotas y avisos), CA-008-11 (1 cupo y 3 abiertas → 2 rechazadas y cierre), CA-008-13 (cancelar antes de informar el pago), CA-008-15 (24 h sin datos de pago → expirada y aviso), CA-008-20 (no titular acepta → `403`), CA-008-21 (el titular ve nivel y estrellas), CA-008-22, CA-008-24 (aceptado → otras abiertas al mismo servicio canceladas); `listings.concurrency.e2e-spec.ts`: CA-008-12 (dos compiten por el último cupo ofrecido) — Depende: T008, spec 010 T036 · Cubre: CA-008-08, CA-008-09, CA-008-10, CA-008-11, CA-008-12, CA-008-13, CA-008-15, CA-008-20, CA-008-21, CA-008-22, CA-008-24, RF-008-10, RF-008-11, RF-008-12, RF-008-13, RF-008-14, RF-008-15, RF-008-16, RN-008-01, RN-008-05, RN-008-06, RNF-008-03, RNF-008-04, RNF-008-06
- [ ] T018 [US3] [BE] `ListingRequestFacade.requestSeat(userId, listingId, message)` dentro de `ListingsService` (valida mensaje de hasta 200 caracteres y la publicación; llama a `JoinRequestsService.openFromListing`) y `POST /listings/:id/requests`; manejador de `JoinRequestAccepted{listingId}` que descuenta `slots_offered`, cierra la publicación al llegar a 0 (`cupos_completos`) y llama a `rejectOpenForListing` — Depende: T017, T010, spec 010 T036 · Cubre: RF-008-10, RF-008-12, RF-008-14, RN-008-05, CA-008-08, CA-008-10, CA-008-11, CA-008-12
- [ ] T019 [P] [US3] [FE] En `/cupos/[id]`: botón **Solicitar** con campo de mensaje (contador de 200) o deshabilitado con la causa (`cannotRequestReason`: «se abre el [fecha]», «ya tienes una solicitud» con enlace a `/solicitudes/[id]`), desactivado al enviar; en `/solicitudes/[id]` (spec 010) la marca «Desde publicación» y el modal de confirmación con la cuota nueva de todos los miembros (RN-008-03), con mock — Depende: T015, spec 010 T030 · Cubre: RF-008-10, RF-008-11, RN-008-03
- [ ] T020 [US3] [FE] Conectar **Solicitar** con `POST /listings/:id/requests` y `frontend/e2e/listing-confirm.spec.ts` (RN-008-03: el modal muestra la cuota nueva) — Depende: T018, T019 · Cubre: RF-008-10, RN-008-03

## Fase 5: US4 — Reportes (Prioridad: P2)

**Meta:** cualquiera puede reportar una publicación sospechosa; con 3 reportes de personas distintas se oculta mientras un administrador revisa.
**Prueba independiente:** el tercer reporte oculta la publicación y avisa al titular; reportar dos veces como la misma persona se rechaza.

- [ ] T021 [P] [US4] [BE] `backend/test/listings.reports.e2e-spec.ts`: CA-008-17 (tercer reporte oculta), CA-008-18 (reportar dos veces), límite de 10 reportes por día, reportes contados desde `moderation_cleared_at` — Depende: T008 · Cubre: CA-008-17, CA-008-18, RF-008-17, RF-008-18, RNF-008-04
- [ ] T022 [US4] [BE] `services/listing-reports.service.ts` y `POST /listings/:id/reports` (inserta, cuenta reportes distintos, oculta con `shouldHide` y avisa `publicacion_oculta` al titular, todo en una transacción); `ListingsService.adminRestore/adminRemove/listReported` para la spec 009 (T031) — Depende: T021, T010 · Cubre: RF-008-17, RF-008-18, CA-008-17, CA-008-18
- [x] T023 [P] [US4] [FE] Botón **Reportar** en `/cupos/[id]` (motivo y comentario opcional) y mensaje de publicación oculta para el titular, con mock, conectado al terminar T022 — Depende: T015 · Cubre: RF-008-17

## Fase 6: US5 — Vencimiento y eventos del grupo (Prioridad: P2)

**Meta:** las publicaciones siguen la vida del grupo: expiran a los 30 días, se ajustan al tamaño del grupo y se cierran con él.
**Prueba independiente:** con `FakeClock` a 30 días, la publicación pasa a `expirada` y el titular puede renovarla.

- [ ] T024 [P] [US5] [BE] `backend/test/listings.expire.e2e-spec.ts` (CA-008-14: más de 30 días → `expirada`; cierre por grupo lleno; reparación de incoherencias) y `listings.events.e2e-spec.ts` (CA-008-16 grupo cerrado, `MemberAdded`/`MemberRemoved` ajustan `slots_offered`, `OwnerChanged` avisa `publicacion_transferida`, `GroupFrozen`, `UserBanned`) — Depende: T008 · Cubre: CA-008-14, CA-008-16, RF-008-05, RN-008-04
- [ ] T025 [US5] [BE] `services/listings-expire.service.ts` (tarea `listings.expire` con `SKIP LOCKED`: `expirada`, cierre por grupo lleno y reparación) y `services/handlers/{join-requests,groups}.handlers.ts` (`MemberAdded`, `MemberRemoved`, `GroupClosed`, `GroupFrozen`, `OwnerChanged`, `UserSuspended`/`UserBanned` del titular) — Depende: T024, T018, spec 000 T028 · Cubre: RF-008-05, RF-008-14, RN-008-04, CA-008-14, CA-008-16

## Fase 7: Cierre

- [ ] T026 [BE] Revisión de seguridad: lista blanca de campos de `ListingView`, solo el titular publica y acepta, cuentas restringidas sin publicar ni solicitar, texto libre sin HTML, límites de solicitudes (spec 010) y reportes, orden de bloqueos solicitud → grupo → publicación — Depende: T018, T022, T025 · Cubre: RNF-008-01, RNF-008-03, RNF-008-04, RNF-008-06
- [ ] T027 [BD] Revisar con Camila los planes de consulta de la búsqueda con 5.000 publicaciones (p95 < 500 ms) y del barrido diario con datos del seed — Depende: T014 · Cubre: RNF-008-02
- [ ] T028 [FE] Accesibilidad y móvil primero de `/cupos`, `/cupos/[id]` y la pestaña **Publicar cupos** (esqueletos de carga, botón sin duplicados, cuota siempre «estimada») — Depende: T016, T020, T023 · Cubre: RNF-008-05
- [ ] T029 [BE] Ejecutar `/speckit-converge`: actualizar `spec.md` y `plan.md` con lo implementado (puertos con la spec 010, decisiones del plan) y marcar las tareas hechas — Depende: T026, T027, T028 · Cubre: —

## Dependencias y orden de ejecución

- **Fase 1** primero (T001–T008); T005–T007 son paralelas entre sí y con las migraciones.
- **US1** habilita al resto (sin publicación no hay qué buscar). **US2** y **US4** dependen de T008 y T010; **US3** necesita además los puertos de la spec 010 (T036); **US5** necesita US3.
- Esta spec necesita de otras: spec 010 T014 (`open`), T029 y T036 (puertos); spec 001 T007, T009, T020; spec 007 T010 (`ReputationQueryPort`); spec 005 (avisos `publicacion_oculta`, `publicacion_transferida`).
- La spec 009 necesita de esta: T022 (`adminRestore/adminRemove/listReported`).

## Ejemplos de paralelización

- Después de T002: T003 y T004 (BD) y T005 a T007 (BE) a la vez.
- Pruebas de historias: T009, T013, T017, T021 y T024 pueden escribirse en paralelo antes de sus implementaciones.
- Frontend con mock: T011, T015, T019 y T023 en paralelo con el backend.

## Estrategia de implementación

1. **Publicar → buscar → solicitar** (US1 → US2 → US3): con eso el flujo de cupos funciona de punta a punta sobre la spec 010.
2. Luego reportes (US4) y vencimiento y eventos (US5).
3. Antes de empezar, aplicar por PR los cambios pedidos a las specs 010 y 005.

## Puntos de integración (hitos)

- [ ] **I1:** modelo de datos y puertos disponibles (T004, T008)
- [ ] **I2:** contrato de API congelado (`contracts/api.md`)
- [ ] **I3:** frontend conectado al backend real (T012, T016, T020)
- [ ] **I4:** la spec 010 abre solicitudes desde publicaciones y respeta `slots_offered` (T018)
- [ ] **I5:** moderación conectada con la spec 009 (T022)

## Bloqueos y decisiones durante la implementación

| Fecha | Situación | Decisión | ¿Cambió la spec o el contrato? |
|---|---|---|---|
| 2026-10-18 | Cambios a la spec 010 (`openFromListing`, `rejectOpenForListing`, `ListingQuotaPort`, evento con `listingId`) | Aplicados en la spec 010 | Sí: spec 010 |
| 2026-10-18 | Tope de cupos ofrecidos, límite de 10 reportes por día y descripción opcional | Aprobado | No |
