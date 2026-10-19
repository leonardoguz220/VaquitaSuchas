# Tareas — Spec 001: Suscripciones compartidas

- **Spec:** `spec.md` · **Plan:** `plan.md` · **Modelo:** `data-model.md` · **Contrato:** `contracts/api.md` · **Investigación:** `research.md` · **Guía:** `quickstart.md`
- Capas: **BD** = Camila · **BE** = Leonardo · **FE** = Adrian. Cada tarea pertenece a **una** sola capa.
- Formato: `- [ ] Tnnn [P] [USn] [CAPA] Descripción con ruta — Depende: … · Cubre: …`. Los commits citan la tarea: `feat(001): add share split [T012]`.
- Historias: **US1** crear una suscripción con precio, moneda, tipo de cambio y día de cobro (HU-001-01) · **US2** código de invitación y datos para solicitar el ingreso (HU-001-02, HU-001-03) · **US3** ver el grupo, los miembros y la cuota de cada uno (HU-001-05) · **US4** gestionar miembros: quitar, regenerar el código, pausar (HU-001-04) · **US5** abandonar un grupo (HU-001-06) · **US6** actualizar precio o tipo de cambio (HU-001-07) · **US7** transferir la titularidad o cerrar el grupo (HU-001-08).
- Prioridad P0. Depende de las specs 003 (usuarios), 004 (catálogo) y 000 (eventos, reloj, puertos). La apertura de la solicitud de ingreso con el código es de la spec 010 (`POST /join-requests`); aquí se entrega `InviteCodeService.resolve`, `MembershipService.addMemberTx` y la ventana de ingreso.
- **Aclaraciones aprobadas el 2026-10-18** (`research.md` R1 y R2): el ciclo inicial, el período y el vencimiento (`due_at`, con la excepción por emisión tardía de la spec 002 R1) quedan definidos; no hay nada abierto antes de T006, T012 y T030.

## Fase 1: Base común (modelo y dominio puro)

- [ ] T001 [BD] Escribir primero `database/tests/groups.integrity.test.ts` con las 12 pruebas de `data-model.md` §4: USD sin tipo de cambio y BS con tipo de cambio fallan; `total_bs_cents` generado (USD 10,00 × 6,96 = 6960; USD 3,33 × 6,9633 redondea al centavo); total fuera de Bs 1,00–5.000,00, cupos 1 o 21 y día de cobro 0 o 32 fallan; código con caracteres ambiguos o de largo distinto y código repetido fallan; dos filas activas del mismo usuario fallan y tras `left_at` puede volver a existir; dos titulares activos o un `owner_id` sin fila de titular (al confirmar) fallan; miembro con el grupo lleno falla y dos inserciones concurrentes por el último cupo dejan solo una; reducir `total_slots` bajo los miembros falla; sexto grupo activo del mismo titular falla (también concurrente); editar una columna `*_snapshot` falla; editar un grupo `cerrado` falla; `total_slots` mayor al `plan_max_slots_snapshot` falla; insertar un miembro en un grupo cerrado o congelado falla y congelar un grupo cerrado pasa; reabrir una estadía falla (PR #43) — Depende: spec 003 T002, spec 004 T002 · Cubre: CA-001-02, CA-001-03, CA-001-04, CA-001-07, CA-001-13, CA-001-16, CA-001-19, CA-001-28, RN-001-01, RN-001-05, RN-001-09, RN-001-12, RN-001-13, RN-001-14
- [ ] T002 [BD] Migración `database/migrations/0030_groups.sql`: `groups` con `owner_id` uuid NOT NULL FK users RESTRICT; `name` text NOT NULL CHECK `char_length(btrim(name)) BETWEEN 2 AND 60`; `status` text NOT NULL default 'activo' CHECK IN ('activo','cerrado'); `closed_at` con CHECK `((status = 'cerrado') = (closed_at IS NOT NULL))`; `frozen_at`, `frozen_reason` con CHECK `(frozen_reason IS NULL OR frozen_reason = 'titular_baneado')` y `((frozen_at IS NULL) = (frozen_reason IS NULL))`; copia del catálogo `catalog_plan_id` (FK RESTRICT), `service_name_snapshot` NOT NULL, `plan_name_snapshot`, `logo_url_snapshot`, `brand_color_snapshot`, `plan_max_slots_snapshot`, `individual_price_cents_snapshot` bigint, `individual_price_currency_snapshot` CHECK IN ('USD','BS') con CHECK `((catalog_plan_id IS NULL) = (plan_name_snapshot IS NULL))`; `price_cents` bigint NOT NULL CHECK > 0; `currency` CHECK IN ('USD','BS'); `exchange_rate` numeric(10,4) con CHECK `((currency = 'USD') = (exchange_rate IS NOT NULL))` y `(exchange_rate IS NULL OR exchange_rate > 0)`; `total_bs_cents` bigint GENERATED ALWAYS AS (`CASE WHEN currency = 'BS' THEN price_cents ELSE round(price_cents * exchange_rate)::bigint END`) STORED con CHECK `BETWEEN 100 AND 500000`; `billing_day` smallint CHECK BETWEEN 1 AND 31; `total_slots` smallint CHECK BETWEEN 2 AND 20 y `(plan_max_slots_snapshot IS NULL OR total_slots <= plan_max_slots_snapshot)`; `invite_code` text NOT NULL UNIQUE CHECK `invite_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'`; `accepting_members` boolean default true; `payment_info_text` CHECK `char_length <= 500`; `payment_qr_key`; `payment_qr_mime` CHECK IN ('image/jpeg','image/png'); `version` integer default 1; `created_at` = inicio de la ventana inicial; índice `groups_owner_active_idx (owner_id) WHERE status = 'activo'` — Depende: T001 · Cubre: RF-001-01, RF-001-02, RF-001-03, RF-001-06, RF-001-09, RF-001-10, RF-001-11, RF-001-20, RN-001-04, RN-001-09, RN-001-12, RN-001-13
- [ ] T003 [BD] Migración `0031_group_members.sql`: `group_members` con `group_id` y `user_id` FK RESTRICT, `role` CHECK IN ('titular','miembro'), `joined_at` default now(), `join_source` CHECK IN ('creacion','solicitud'), `join_request_id` uuid NULL (la FK la agrega la spec 010), `left_at`, `left_reason` CHECK IN ('abandono','quitado','mora','baneo') y CHECK `((left_at IS NULL) = (left_reason IS NULL))`; UNIQUE INDEX `group_members_active_uq (group_id, user_id) WHERE left_at IS NULL`; UNIQUE INDEX `group_members_owner_uq (group_id) WHERE role = 'titular' AND left_at IS NULL`; índices `group_members_user_idx (user_id) WHERE left_at IS NULL` y `group_members_group_active_idx (group_id) WHERE left_at IS NULL`; `created_at`, `updated_at` (PR #43, H2) — Depende: T002 · Cubre: RN-001-01, RN-001-05, RF-001-19
- [ ] T004 [BD] Migración `0032_group_triggers.sql` con los seis disparadores de `data-model.md` §2: `groups_owner_member_consistency` (constraint trigger diferido), `group_members_capacity` (`FOR UPDATE` del grupo; rechaza si el grupo no está `activo`, está congelado o las filas activas igualan `total_slots`; solo en `INSERT`), `group_members_left_immutable` (PR #43, M1 y M2), `groups_slots_not_below_members`, `groups_max_active_owned` (`pg_advisory_xact_lock(hashtext(owner_id::text))`, máximo 5 grupos `activo`), `groups_immutable_snapshots` y `groups_closed_readonly` (admite `updated_at`, `frozen_at` y `frozen_reason`, PR #43 M3); `set_updated_at` en ambas tablas — Depende: T003 · Cubre: RN-001-01, RN-001-07, RN-001-09, RN-001-12, RN-001-14, CA-001-07, CA-001-13, CA-001-16, CA-001-19, CA-001-28
- [ ] T005 [BD] Seed de desarrollo `seeds/0030_groups_dev.sql` (solo `NODE_ENV != production`): dos grupos de ejemplo de servicio personalizado o del catálogo, con un titular y tres miembros que referencia **por correo** a los usuarios que crea `seed:dev-users` (spec 003 T046); idempotente con `INSERT … WHERE NOT EXISTS` (los disparadores corren aunque haya `ON CONFLICT`); sin ciclos ni cobros (los siembra la spec 002); documentarlo en `database/README.md` (PR #43, C1, C2, H1, M4) — Depende: T004, spec 004 T005, spec 003 T046 · Cubre: RF-001-01
- [ ] T006 [P] [BE] Pruebas y código de `modules/subscriptions/domain/money.ts` (`computeTotalBsCents`: `BS` igual al precio; `USD` `floor((precio × tasa×10⁴ + 5000) / 10⁴)`; `parseExchangeRate`: positivo, hasta 4 decimales) con `money.spec.ts` que incluye la comparación con la columna generada de la base y miles de combinaciones — Depende: spec 000 T004 · Cubre: RF-001-11, RN-001-04, CA-001-04
- [ ] T007 [P] [BE] `domain/shares.ts` (`splitShares(totalBsCents, memberCount)` → `{ baseShareCents, ownerShareCents, remainderCents }` con `base = floor(total/n)`, `resto = total − base×n`, `ownerShare = base + resto`) y `shares.spec.ts` con prueba de propiedad: la suma de cuotas siempre es el total (CA-001-05: 100,00 entre 3 → 33,34 / 33,33 / 33,33) — Depende: spec 000 T004 · Cubre: RF-001-10, RF-001-12, RN-001-02, CA-001-05, CA-001-12
- [ ] T008 [P] [BE] `domain/billing-calendar.ts` (`adjustBillingDay`, `cutDateFor`, `periodOf`, `dueAtFor` = inicio del día corte + 4 en La Paz, `nextCutAfter`, `lastCutAtOrBefore(now, billingDay, createdAt)`) y ampliar `shared/domain/la-paz.ts` (inicio de día, días del mes) con `billing-calendar.spec.ts` para 2026, 2028 y 2100 (día 31 en febrero → 28 o 29) — Depende: spec 000 T022 · Cubre: RN-001-06, CA-001-17
- [ ] T009 [P] [BE] `domain/entry-window.ts` (`entryWindow(group, now)` → `{ isOpen, start, endExclusive, opensAt, closesAt }`; ventana `[lastCut, inicio del día (fecha(lastCut) + 3 días))` que termina a las 23:59:59 del día 3; `windowDays` por defecto 3 desde configuración) y `entry-window.spec.ts`: corte día 10 abierto el 13 a las 23:59:59 y cerrado el 14 a las 00:00 (CA-001-26); grupo nuevo con ventana inicial, incluida la creación a mitad del día y un corte posterior dentro de la misma ventana (CA-001-27) — Depende: T008 · Cubre: RF-001-22, CA-001-26, CA-001-27
- [ ] T010 [P] [BE] `domain/invite-code.ts` (`generateInviteCode(randomBytes)`: alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, descarta bytes ≥ 248 para no sesgar) y `domain/group-rules.ts` (`validateGroupInput(input, plan?)`: total entre 100 y 500000 centavos, cupos 2 a 20, día 1 a 31, cupos ≤ máximo del plan, `exchangeRate` según moneda; `canLeave(role, openCharges)`; `canReceiveOwnership({ isActiveMember, isHostEligible, activeOwnedGroups })`) con `invite-code.spec.ts` y `group-rules.spec.ts` — Depende: spec 000 T004 · Cubre: RF-001-06, RN-001-08, RN-001-09, RN-001-13, RN-001-14, CA-001-02, CA-001-03, CA-001-15
- [ ] T011 [BE] `repositories/groups.repository.ts` y `members.repository.ts` (SQL con parámetros), `ports/` (`open-charges.port.ts`, `host-eligibility.port.ts`, `ownership-blockers.port.ts`), tipos de eventos en `shared/events` (`GroupCreated`, `MemberAdded`, `MemberRemoved(reason)`, `OwnerChanged`, `GroupClosed`, `GroupFrozen`) y los guards `GroupMemberGuard` (sin fila activa → `404`) y `GroupOwnerGuard` (miembro en ruta de titular → `403`) — Depende: T004, spec 000 T056, spec 003 T013 · Cubre: RNF-001-01, CA-001-10, CA-001-11

**Punto de control (I1):** modelo de datos y funciones puras disponibles; las specs 002 y 010 ya pueden empezar su modelo.

## Fase 2: US1 — Crear una suscripción (Prioridad: P0) 🎯 MVP

**Meta:** un titular habilitado crea un grupo con servicio del catálogo o personalizado, ve el total en Bs y el código.
**Prueba independiente:** `POST /groups` con un plan del catálogo crea grupo, fila de titular y código de 8 caracteres.

- [ ] T012 [P] [US1] [BE] `backend/test/groups.create.e2e-spec.ts`: CA-001-01 (crea grupo, fila de titular activa y código de 8), CA-001-02 (USD sin tipo de cambio), CA-001-24 (no habilitado → `NOT_HOST_ELIGIBLE` con los datos de elegibilidad, con un `HostEligibilityPort` de prueba), CA-001-25 (habilitado crea), CA-001-28 (quinto grupo sí, sexto `TOO_MANY_ACTIVE_GROUPS`; miembro sin límite; concurrencia) — Depende: T011 · Cubre: CA-001-01, CA-001-02, CA-001-24, CA-001-25, CA-001-28
- [ ] T013 [US1] [BE] `HostEligibilityPort` y su adaptador en `backend/src/app-adapters/host-eligibility.adapter.ts` (registrado en `AppModule`): `check(userId)` → `{ eligible, source, current, requirement }` con `manual` si hay habilitación vigente (spec 009 `host_enablements`) y `calificacion` si la spec 007 informa ≥ 4,5 estrellas con ≥ 6 cobros considerados; mientras no existan 007 o 009 devuelve «no habilitado» por esa vía; `GET /users/me/host-eligibility` — Depende: T011, T012 · Cubre: RF-001-21, CA-001-24, CA-001-25
- [ ] T014 [US1] [BE] `services/groups.service.ts` (`create` en una transacción: 1) `HostEligibilityPort.check`; 2) contar grupos activos (< 5); 3) `CatalogService.getActivePlanForSubscription` para copiar servicio, plan, logo, color, cupos máximos y precio individual, o servicio personalizado; 4) `validateGroupInput`; 5) generar el código con hasta 5 reintentos ante colisión; 6) insertar grupo y fila de titular; 7) publicar `GroupCreated`) y `POST /groups/quote` (total en Bs y cuota por miembro calculados con las funciones puras; el frontend no calcula) y `POST /groups` en `groups.controller.ts` — Depende: T006, T007, T010, T012, spec 004 T009 · Cubre: RF-001-01, RF-001-02, RF-001-03, RF-001-04, RF-001-05, RF-001-10, RF-001-11, CA-001-01, CA-001-02, CA-001-03
- [ ] T015 [US1] [BE] `services/payment-info.service.ts` y `PUT /groups/:id/payment-info`: texto de hasta 500 caracteres y QR por `FileStorage` (clave `groups/<id>/qr/<uuid>.<ext>`), tipo real por firma binaria (JPG/PNG) y tamaño 2 MB, conserva el QR anterior si falla; la URL firmada (10 min) solo se genera al consultar un miembro — Depende: T014, spec 000 T026 · Cubre: RF-001-20, CA-001-23
- [x] T016 [P] [US1] [FE] Asistente `/grupos/nuevo` de 3 pasos con datos simulados (mock): 1) servicio (spec 004) o personalizado; 2) plan; 3) datos (nombre, precio propuesto y editable, moneda, tipo de cambio solo si USD, día de cobro, cupos con el máximo del plan, datos de pago con texto y QR con vista previa); «Total en Bs» y «Cada miembro pagaría» pedidos a `POST /groups/quote` con retraso de 300 ms; al crear muestra el código con **Copiar** y **Compartir**; si no está habilitado abre el panel que explica qué falta — Depende: spec 004 T011, spec 000 T036 · Cubre: RF-001-01, RF-001-03, RF-001-04, RF-001-05, RF-001-20, RNF-001-04
- [ ] T017 [US1] [FE] Conectar el asistente con `GET /users/me/host-eligibility`, `POST /groups/quote`, `POST /groups` y `PUT /groups/:id/payment-info`; mensajes por `code` (`NOT_HOST_ELIGIBLE`, `TOO_MANY_ACTIVE_GROUPS`, `VALIDATION_ERROR`) — Depende: T014, T015, T016 · Cubre: RF-001-01, RF-001-21

**Punto de control:** US1 funcional y probable por sí sola con un titular habilitado del seed.

## Fase 3: US3 — Ver el grupo, los miembros y la cuota (Prioridad: P0) 🎯 MVP

**Meta:** "Mis suscripciones" y el detalle del grupo con desglose y cuota de cada uno.
**Prueba independiente:** `GET /groups` devuelve solo mis grupos y `GET /groups/:id` el desglose con `Σ cuotas = total`.

- [ ] T018 [P] [US3] [BE] `backend/test/groups.list.e2e-spec.ts` (CA-001-20 solo mis grupos; 50 grupos para el rendimiento), `groups.view.e2e-spec.ts` (CA-001-21 titular con 90,00 entre 3 → 30,00 de referencia y sin cobro; RN-001-10) y `groups.permissions.e2e-spec.ts` (CA-001-10 no miembro `404`; CA-001-11 miembro edita o quita `403`) — Depende: T011 · Cubre: CA-001-10, CA-001-11, CA-001-20, CA-001-21, RN-001-10
- [ ] T019 [US3] [BE] `services/group-view.service.ts` y `GET /groups`, `GET /groups/:id`: `GroupSummary`/`GroupDetail` con `splitShares` y `entryWindow`, `inviteCode` solo para el titular, celulares solo para miembros activos del mismo grupo (`UserPublic`), `paymentInfo` con URL firmada, `frozenReason` — Depende: T014, T018 · Cubre: RF-001-12, RF-001-13, RF-001-19, RN-003-03, CA-001-20, CA-001-21, CA-001-23
- [x] T020 [P] [US3] [FE] `/grupos` («Mis suscripciones») con mock: tarjetas con logo, rol, «Tu cuota» o «Cuota de referencia», miembros `3/4`, próximo corte y estado; filtro por rol; estado vacío con **Crear** y **Entrar con un código**; y `/grupos/[id]` con pestañas **Resumen** (desglose, tipo de cambio, ventana de ingreso «abierta hasta…» / «se abre el…», datos de pago) y **Miembros** — Depende: spec 000 T036 · Cubre: RF-001-12, RF-001-13, RF-001-19, RF-001-22, RNF-001-04
- [ ] T021 [US3] [FE] Conectar `/grupos` y `/grupos/[id]` con `GET /groups` y `GET /groups/:id`; banners de grupo cerrado o con titular baneado en solo lectura con **Buscar otro grupo**; E2E `frontend/e2e/groups.spec.ts` (CA-001-20) — Depende: T019, T020 · Cubre: CA-001-20, RF-001-18

## Fase 4: US2 — Código de invitación y datos para solicitar (Prioridad: P0) 🎯 MVP

**Meta:** el titular comparte el código; la spec 010 abre la solicitud al ingresarlo y muestra la cuota que le tocaría.
**Prueba independiente:** `InviteCodeService.resolve` devuelve el grupo con un código válido y un error genérico en cualquier otro caso.

- [ ] T022 [P] [US2] [BE] `backend/test/invite-code.e2e-spec.ts`: CA-001-09 (código regenerado deja de funcionar), CA-001-18 (10 fallos en 15 minutos → `RATE_LIMITED`, con `FakeClock`), error genérico «Código inválido» idéntico para inexistente, regenerado o de grupo cerrado — Depende: T011 · Cubre: CA-001-09, CA-001-18
- [ ] T023 [US2] [BE] `services/invite-code.service.ts`: `resolve(userId, code)` (normaliza a mayúsculas sin espacios, cuenta fallos en `rate_limit_events` `invite_code_fail:user` con 10 por 15 minutos, error genérico) y `regenerate` (reemplaza el código en una sola sentencia); `POST /groups/:id/invite-code/regenerate` — Depende: T014, T022 · Cubre: RF-001-06, RF-001-07, RF-001-08, RNF-001-02, CA-001-09, CA-001-18
- [ ] T024 [US2] [BE] Prueba de integración con la spec 010: los casos CA-001-06 (código válido abre solicitud sin ser miembro), CA-001-08 (ya es miembro), CA-001-26 (ventana) y CA-001-19 (dos solicitudes, último cupo) se verifican en `join-requests.open.e2e-spec.ts` y `join-requests.concurrency.e2e-spec.ts` de la spec 010; aquí solo se deja el adaptador de prueba de `InviteCodeService` y la nota de trazabilidad — Depende: T023, spec 010 · Cubre: CA-001-06, CA-001-08, CA-001-19
- [x] T025 [P] [US2] [FE] En `/grupos/[id]` (titular), mostrar el código con **Copiar** y **Compartir**, botón **Regenerar código** con modal que explica el efecto, y el interruptor de recibir miembros — Depende: T020 · Cubre: RF-001-06, RF-001-08, RF-001-09

## Fase 5: US4 — Gestionar miembros (Prioridad: P0)

**Meta:** el titular quita miembros, regenera el código y pausa la recepción.
**Prueba independiente:** `DELETE /groups/:id/members/:userId` quita a un miembro y recalcula las cuotas de quienes quedan.

- [ ] T026 [P] [US4] [BE] `backend/test/membership.e2e-spec.ts`: CA-001-07 (grupo lleno), CA-001-14 (abandonar con cobros sin pagar, con un adaptador de prueba de `OpenChargesPort`), CA-001-15 (el titular no abandona), quitar un miembro con cobros abiertos (se conservan) y recálculo de cuotas — Depende: T011 · Cubre: CA-001-07, CA-001-14, CA-001-15
- [ ] T027 [US4] [BE] `services/membership.service.ts`: `addMemberTx(tx, groupId, userId, source, joinRequestId)` (lo usa la spec 010; el disparador impone la capacidad), `removeMember(groupId, userId, reason)` (`quitado`, `mora`, `baneo`; publica `MemberRemoved`) y `DELETE /groups/:id/members/:userId` (titular) — Depende: T014, T026 · Cubre: RF-001-15, RF-001-23, RN-001-05, RN-001-09, CA-001-07
- [ ] T028 [US4] [BE] Manejadores de eventos de este módulo: `UserBanned` (spec 009) → congela los grupos que posee (`frozen_at`, `frozen_reason = 'titular_baneado'`) y retira al usuario de los grupos donde es miembro (`reason = 'baneo'`); `UserSuspended` no toca el grupo — Depende: T027, spec 003 T012; y `UserUnbanned` (spec 009) → descongela los grupos que ese baneo congeló (`frozen_at` y `frozen_reason` a `NULL`), con prueba en `groups.events.e2e-spec.ts` (CA-009-37) · Cubre: RF-001-23, RN-001-07, CA-009-37
- [ ] T029 [P] [US4] [FE] Pestañas **Miembros** y **Ajustes** del titular: quitar con modal («Se conservarán sus cobros» y aviso de cobros abiertos), pausar recepción; conectar con `DELETE …/members/:userId` — Depende: T021, T027 · Cubre: RF-001-15, RF-001-09

## Fase 6: US5 — Abandonar un grupo (Prioridad: P0)

**Meta:** el miembro se va si no debe nada; el titular no puede abandonar.
**Prueba independiente:** `POST /groups/:id/leave` con cobros abiertos devuelve `HAS_OPEN_CHARGES`.

- [ ] T030 [US5] [BE] `MembershipService.leave` y `POST /groups/:id/leave`: `canLeave` (titular no, RN-001-08; con cobros `pendiente`, `en_revision` o `atrasado` no, vía `OpenChargesPort`), fila con `left_at` y `left_reason = 'abandono'`, publica `MemberRemoved` — Depende: T027, T026 · Cubre: RF-001-16, RN-001-08, CA-001-14, CA-001-15
- [ ] T031 [US5] [FE] Botón **Abandonar** (miembro) con modal y el mensaje de `HAS_OPEN_CHARGES` con los cobros pendientes — Depende: T029, T030 · Cubre: RF-001-16

## Fase 7: US6 — Actualizar precio o tipo de cambio (Prioridad: P0)

**Meta:** el titular edita precio, moneda, tipo de cambio, día de cobro, nombre y cupos sin tocar cobros ya emitidos.
**Prueba independiente:** `PATCH /groups/:id` con un nuevo tipo de cambio recalcula el total y no cambia cobros existentes.

- [ ] T032 [P] [US6] [BE] `backend/test/groups.update.e2e-spec.ts`: cambio de precio, moneda o tipo de cambio no altera cobros ni solicitudes (llevan su copia), bajar `total_slots` bajo los miembros → `SLOTS_BELOW_MEMBERS` con el mínimo, cambio de `billing_day` rige desde el siguiente corte posterior a hoy, `409 STALE_STATE` con `version` vieja, grupo cerrado o congelado rechaza — Depende: T014 · Cubre: RF-001-14, RN-001-03, CA-001-16
- [ ] T033 [US6] [BE] `GroupsService.update` y `PATCH /groups/:id` (bloqueo de la fila con `version`; rechaza si está `cerrado` o congelado; `SLOTS_BELOW_MEMBERS`; `billing_day` desde el siguiente corte; cupos ≤ máximo del plan) — Depende: T032 · Cubre: RF-001-14, RF-001-09, RN-001-03, RN-001-13
- [ ] T034 [US6] [FE] Pestaña **Ajustes** del titular: formulario de edición con explicación previa del cambio de día de cobro, manejo de `409 STALE_STATE` (recarga y aviso) y `SLOTS_BELOW_MEMBERS` — Depende: T029, T033 · Cubre: RF-001-14

## Fase 8: US7 — Transferir la titularidad o cerrar el grupo (Prioridad: P0)

**Meta:** el titular se retira transfiriendo o cerrando, sin romper la regla de un solo titular.
**Prueba independiente:** transferir deja exactamente un titular; cerrar deja el grupo en solo lectura.

- [ ] T035 [P] [US7] [BE] `backend/test/ownership.e2e-spec.ts` (CA-001-13 un único titular; CA-001-30 transferir a no habilitado; destinatario con 5 grupos; bloqueo por solicitudes en pago vía `OwnershipBlockersPort`) y `groups.close.e2e-spec.ts` (CA-001-16 grupo cerrado rechaza unirse y editar; RN-001-07; los miembros siguen activos en solo lectura) — Depende: T027 · Cubre: CA-001-13, CA-001-16, CA-001-30, RN-001-07, RN-001-14
- [ ] T036 [US7] [BE] `MembershipService.transferOwnership` y `close`, con `POST /groups/:id/transfer-ownership` y `POST /groups/:id/close`: preguntan a `OwnershipBlockersPort` (solicitudes en pago, spec 010) y, para transferir, a `HostEligibilityPort` y al conteo de grupos del destinatario; transferir cambia los dos `role` en una transacción y `groups.owner_id`; publican `OwnerChanged` y `GroupClosed` — Depende: T013, T035 · Cubre: RF-001-17, RF-001-18, RN-001-07, RN-001-14, CA-001-13, CA-001-30
- [ ] T037 [US7] [FE] Acciones **Transferir titularidad** y **Cerrar** en **Ajustes** con modales que explican el efecto, y los errores por `code`; E2E `frontend/e2e/groups.spec.ts` del flujo crear → transferir → cerrar — Depende: T034, T036 · Cubre: RF-001-17, RF-001-18

## Fase 9: Integración con otras specs, seguridad y cierre

- [ ] T038 [BE] Pruebas de integración cruzadas con la spec 002 (cuando exista): CA-001-12 (Σ cuotas = total al confirmar un ingreso), CA-001-21 (el titular no tiene cobro), CA-001-22 (ingreso en ventana: cobro de ingreso `pagado` y primer cobro regular en el siguiente corte) y CA-001-29 (mora a los 3 días: retiro y recálculo) en `billing.generate.e2e-spec.ts`, `join-requests.accept.e2e-spec.ts` y `billing.overdue.e2e-spec.ts`; dejar enlazadas aquí — Depende: T027, spec 002, spec 010 · Cubre: CA-001-12, CA-001-21, CA-001-22, CA-001-29, RN-001-03, RN-001-11
- [ ] T039 [BE] Revisión de seguridad: tabla de acciones por rol (titular, miembro, ajeno `404`), el código solo en la respuesta del titular, textos libres como texto plano, QR con nombre generado y sin ruta pública; regla de lint de dependencias (`eslint-plugin-boundaries` o `import/no-cycle`) en CI para evitar ciclos entre módulos — Depende: T036, spec 000 T041 · Cubre: RNF-001-01, RNF-001-02, RNF-001-03
- [ ] T040 [FE] Accesibilidad y diseño móvil primero del asistente y del detalle: desglose como lista vertical, pestañas con desplazamiento horizontal, confirmaciones destructivas con modal accesible — Depende: T037 · Cubre: RNF-001-04, RNF-001-05
- [ ] T041 [BD] Verificar que el seed de desarrollo crea un titular habilitado (habilitación manual) para que el equipo cree grupos desde el primer día, y documentar el comando — Depende: T005, spec 003 T022, spec 009 T003 (`host_enablements`, PR #43 C3) · Cubre: RF-001-21
- [ ] T042 [BD] Ejecutar `/speckit-converge`: actualizar `spec.md`, `plan.md` y `research.md` (R1 ciclo inicial, R2 vencimiento) con lo implementado y marcar las tareas hechas — Depende: T040, T041 · Cubre: —

## Dependencias y orden de ejecución

- **Fase 1** (T001–T011) primero; T006–T010 (funciones puras) son paralelas entre sí y con las migraciones T002–T004.
- **US1** habilita al resto. **US3** necesita T019 de US1; **US2** y **US4** a **US7** dependen de T011 y T014.
- La spec 010 necesita de esta spec: T011 (puertos y eventos), T023 (`InviteCodeService`), T027 (`addMemberTx`) y T009 (ventana de ingreso).
- La spec 002 necesita: T008 (calendario), T007 (cuotas) y el evento `GroupCreated` (T014).

## Ejemplos de paralelización

- Después de T002: T003 y las funciones puras T006 a T010 a la vez.
- Pruebas de las historias: T012, T018, T022, T026, T032 y T035 pueden escribirse en paralelo antes de sus implementaciones.
- Frontend con mock (T016, T020) en paralelo con el backend.

## Estrategia de implementación

1. **MVP primero:** Fase 1 → US1 → US3 → US2. Con eso un titular crea un grupo, ve su desglose y comparte el código.
2. Después la gestión (US4, US5, US6, US7), que no frena a las specs 002 y 010.
3. Resolver R1 y R2 (ciclo inicial y vencimiento) antes de T008, T009 y T014.

## Puntos de integración (hitos)

- [ ] **I1:** modelo y funciones puras disponibles para las specs 002 y 010 (T004, T011)
- [ ] **I2:** contrato de API congelado (`contracts/api.md`)
- [ ] **I3:** frontend conectado al backend real (T017, T021)
- [ ] **I4:** la spec 010 abre solicitudes con `InviteCodeService` y une miembros con `addMemberTx` (T023, T027)
- [ ] **I5:** `HostEligibilityPort` conectado con las specs 007 y 009 (T013)

## Bloqueos y decisiones durante la implementación

| Fecha | Situación | Decisión | ¿Cambió la spec o el contrato? |
|---|---|---|---|
| 2026-10-18 | Ciclo inicial y período (`research.md` R1) | Aprobado | No |
| 2026-10-18 | `due_at` (R2) | Aprobado: inicio del día corte + 4, con la excepción por emisión tardía de la spec 002 | Sí: spec 002 RF-002-03 |
