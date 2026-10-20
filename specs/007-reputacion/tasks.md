# Tareas — Spec 007: Reputación

- **Spec:** `spec.md` · **Plan:** `plan.md` · **Modelo:** `data-model.md` · **Contrato:** `contracts/api.md` · **Guía:** `quickstart.md`
- Capas: **BD** = Camila · **BE** = Leonardo · **FE** = Adrian. Cada tarea pertenece a **una** sola capa.
- Formato: `- [ ] Tnnn [P] [USn] [CAPA] Descripción con ruta — Depende: … · Cubre: …`. Los commits citan la tarea: `feat(007): add reputation score [T008]`.
- Historias: **US1** ver mi calificación y saber si puedo ser titular (HU-007-01, HU-007-04; **núcleo MVP**) · **US2** insignias (HU-007-02; P2) · **US3** ranking del grupo (HU-007-03; P2) · **US4** corregir un cobro mal calificado (HU-007-05; P2).
- Entrega en dos tiempos: el **núcleo** (US1: `user_reputation`, `computeReputation`, `ReputationQueryPort`, recálculo por eventos y conciliación) entra en el hito MVP porque la spec 001 lo necesita (RF-001-21) y las specs 008, 009 y 010 muestran la calificación; **US2 a US4** son P2 y se construyen al final.
- Depende de las specs 000, 001 (`HostEligibilityPort`, evento `GroupFrozen`) y 002 (`ChargeFactsPort`, eventos de cobro). Entrega a las specs 001, 008, 009 y 010 el puerto `ReputationQueryPort`.

## Fase 1: Base común — núcleo (modelo y dominio puro)

- [x] T001 [BD] Escribir primero `database/tests/reputation.integrity.test.ts` (núcleo): contadores incoherentes (`puntuales + tardíos ≠ considerados`) fallan; nivel `Nuevo` con 3 o más cobros o con estrellas falla; estrellas fuera de 0–10 fallan; en la parte P2 (T031) dos exclusiones del mismo cobro, dos reportes de la misma persona al mismo cobro y una insignia repetida fallan — Depende: spec 000 T003 · Cubre: RNF-007-02, RF-007-02
- [x] T002 [BD] Migración `database/migrations/0060_user_reputation.sql`: `user_reputation` (`user_id` PK FK RESTRICT, `considered_count`, `punctual_count`, `late_count`, `displayed_half_stars` smallint NULL, `level`, `current_streak`, `rules_version`, `computed_at`, `created_at`, `updated_at`) con los `CHECK` de `data-model.md` §2 y `set_updated_at()` — Depende: T001 · Cubre: RF-007-01, RF-007-02, RF-007-03, RF-007-05, RN-007-07
- [x] T003 [P] [BE] `modules/reputation/domain/facts.ts` (tipo `ChargeFact`: estado, origen, `dueAt`, `firstSubmittedAt`, `lastUploadAt`, `paidAt`, `settlement`, `invalidReceipt`, `groupFrozenByBan`, `excluded`) y `rules-version.ts` (`RULES_VERSION`) — Depende: spec 000 T004 · Cubre: RN-007-07
- [x] T004 [P] [BE] `domain/punctuality.ts` (`punctualityInstant`, `isPunctual`: `atrasado` → no; `pagado` → `instante < dueAt`; pago manual con `paidAt`; rechazo «comprobante inválido» con `lastUploadAt`) y `punctuality.spec.ts` con fechas de La Paz (CA-007-03 a 05, 24, 25) — Depende: T003 · Cubre: RN-007-02, RN-007-04, RN-007-06, RF-007-12, CA-007-03, CA-007-04, CA-007-05, CA-007-24, CA-007-25
- [x] T005 [P] [BE] `domain/score.ts` (`isConsidered(fact, now)`: origen `ciclo`, estado `pagado`/`atrasado`, `dueAt >= now − 12 meses`, no excluido, no grupo congelado por baneo salvo `pagado`; `computeReputation(facts, now)` con `halfStars = floor((20p + c) / (2c))` en enteros, `considered < 3` → `Nuevo`, sin división por cero; `exactStarsText`) y `level.ts` (`levelFor`: 10 Excelente, 8–9 Bueno, 6–7 Regular, ≤ 5 En riesgo) con `score.spec.ts` (CA-007-01, 02, 06, 07, 16, 18, 19, 22) — Depende: T003 · Cubre: RN-007-01, RN-007-03, RN-007-09, RF-007-01, RF-007-02, RF-007-03, RF-007-13, CA-007-01, CA-007-02, CA-007-06, CA-007-07, CA-007-16, CA-007-18, CA-007-19, CA-007-22
- [x] T006 [P] [BE] `domain/streak.ts` (`currentStreak`: puntuales consecutivos más recientes por `dueAt`; un no puntual reinicia) y `host-threshold.ts` (`meetsHostThreshold`: `halfStars ≥ 9` y `considered ≥ 6`, con `missing[]`) con `streak.spec.ts` y `host-threshold.spec.ts` — Depende: T005 · Cubre: RN-007-05, RF-007-15, CA-007-20
- [x] T007 [BE] `ports/charge-facts.port.ts` (definido aquí; lo implementa `billing`, spec 002 T017) y `repositories/reputation.repository.ts` (`INSERT … ON CONFLICT (user_id) DO UPDATE`, lectura por lote de `user_reputation`) — Depende: T002, T006 · Cubre: RNF-007-02

**Punto de control (I1):** modelo y funciones puras disponibles; la spec 001 puede enchufar `checkHostRating`.

## Fase 2: US1 — Calificación y habilitación como titular (núcleo MVP) 🎯 MVP

**Meta:** cada persona ve su calificación, su detalle y si puede ser titular; las demás specs consultan la calificación sin duplicar la regla.
**Prueba independiente:** con 10 cobros considerados y 9 puntuales, `GET /users/me/reputation` devuelve 4,5 estrellas, «Bueno» y `host.ok = true`.

- [ ] T008 [P] [US1] [BE] `backend/test/reputation.facts.e2e-spec.ts`: CA-007-05 (rechazado y vuelve tarde → puntual), CA-007-17 (la fecha enviada por el cliente se ignora), CA-007-22 (cobro de ingreso no cuenta), CA-007-24 (retirado por mora: tardío aunque pague), CA-007-25 (inválido → última subida); `reputation.events.e2e-spec.ts`: CA-007-15 (se actualiza al pagar, sin esperar la tarea) y `reputation.reconcile.e2e-spec.ts`: CA-007-14 (recálculo = guardado; cambio de `RULES_VERSION` recalcula a todos) — Depende: T007, spec 002 T017 · Cubre: CA-007-05, CA-007-14, CA-007-15, CA-007-17, CA-007-22, CA-007-24, CA-007-25, RNF-007-02, RNF-007-05
- [x] T009 [US1] [BE] `services/reputation.service.ts` `recomputeUser(tx, userId, now)` (hechos por `ChargeFactsPort`, `computeReputation`, guarda con `rules_version`) y manejadores de `ChargeConfirmed`, `ChargeBecameOverdue`, `ChargeCancelled`, `GroupFrozen` y `UserBanned` que la llaman en la misma transacción — Depende: T008, spec 002 T011, spec 001 T028 · Cubre: RF-007-05, RF-007-13, RN-007-08, CA-007-15
- [x] T010 [US1] [BE] `services/reputation-query.service.ts` (`getRatings(userIds)` sin fila → «Nuevo»; `getDetail(userId)` calculado en el momento con `recent` de hasta 20 cobros y `host`; `checkHostRating(userId, now)` calculado en el momento) y `ReputationQueryPort` para las specs 001, 008, 009 y 010 — Depende: T009 · Cubre: RF-007-04, RF-007-15, RNF-007-04, CA-007-20
- [x] T011 [US1] [BE] `controllers/reputation.controller.ts` `GET /users/me/reputation` (`ReputationDetail`: estrellas, nivel, considerados, puntuales, tardíos, racha, últimos cobros con resultado, `host`) sin endpoint abierto por usuario (RNF-007-04) — Depende: T010 · Cubre: RF-007-01, RF-007-02, RF-007-03, RF-007-04, RF-007-15, RNF-007-04, CA-007-01, CA-007-02
- [x] T012 [P] [US1] [BE] `backend/test/reputation.me.e2e-spec.ts` (CA-007-02 con 2 cobros → «Nuevo») y `reputation.host.e2e-spec.ts`: CA-007-20 (6 cobros y 4,5 → habilitado; con 5, no), CA-007-21 (baja del umbral → no crea más; los grupos existentes siguen), CA-007-23 (habilitación manual con calificación baja, RF-007-17) — Depende: T010 · Cubre: CA-007-02, CA-007-20, CA-007-21, CA-007-23, RF-007-16, RF-007-17
- [ ] T013 [US1] [BE] `services/reconcile.job.ts` tarea `reputation.reconcile` diaria: por lotes recalcula a quienes tuvieron cobros en los últimos 13 meses, corrige diferencias (también las del paso del tiempo), suma `drift` en `job_runs`; si cambió `RULES_VERSION` recalcula a todos — Depende: T009, spec 000 T028 · Cubre: RF-007-05, RN-007-07, CA-007-14
- [ ] T014 [US1] [BE] Conectar el adaptador `HostEligibilityPort` de la spec 001 (T013) con `checkHostRating` y la habilitación manual de la spec 009; prueba cruzada `groups.create.e2e-spec.ts` (CA-007-21) — Depende: T010, spec 001 T013 · Cubre: RF-007-15, RF-007-16, RF-007-17, CA-007-21
- [x] T015 [P] [US1] [FE] Componente `ui`/`features` `RatingBadge` (estrellas + valor numérico + nivel en texto e icono) y `/perfil/reputacion` con mock: «4,5 de 5», cuántos cobros faltan si es «Nuevo», detalle (considerados, puntuales, tardíos, racha), últimos cobros con resultado y vencimiento, explicación de la fórmula con el ejemplo, estado de habilitación como titular — Depende: spec 000 T036 · Cubre: RF-007-01, RF-007-02, RF-007-03, RF-007-04, RNF-007-01, RNF-007-06
- [ ] T016 [US1] [FE] Conectar `/perfil/reputacion` con `GET /users/me/reputation` y usar `RatingBadge` en las solicitudes (spec 010), publicaciones (spec 008) y creación de grupos (spec 001) — Depende: T011, T015 · Cubre: RF-007-04, RF-007-15

**Punto de control (I2):** la calificación se actualiza con cada cobro y la spec 001 decide quién puede ser titular con datos reales.

## Fase 3: US2 — Insignias (Prioridad: P2)

**Meta:** el usuario gana insignias por pagar a tiempo y las conserva.
**Prueba independiente:** con 3 cobros puntuales seguidos aparece «Racha 3»; si luego paga tarde, la insignia se conserva y la racha vuelve a 0.

- [x] T017 [BD] Migración `0063_user_badges.sql` (P2): `user_badges` (usuario, código, `earned_at`, `rules_version`; única por usuario y código) — Depende: T002 · Cubre: RF-007-06, RF-007-07, RF-007-08
- [ ] T018 [P] [US2] [BE] `domain/badges-rules.ts` (`badgesEarned(facts, existing)`: Primer pago, Racha 3 y demás reglas versionadas; avance `current/target` calculado) y `badges-rules.spec.ts` (CA-007-08, 09) — Depende: T006 · Cubre: RF-007-06, RF-007-07, RF-007-08, RN-007-07, CA-007-08, CA-007-09
- [ ] T019 [P] [US2] [BE] `backend/test/badges.e2e-spec.ts`: CA-007-08 (Racha 3), CA-007-09 (se conserva la insignia, racha a 0) y `GET /users/me/badges` — Depende: T017 · Cubre: CA-007-08, CA-007-09
- [ ] T020 [US2] [BE] `services/badges.service.ts` (otorga y conserva en cada recálculo; avance calculado), tarea `reputation.badges` y `controllers/badges.controller.ts` `GET /users/me/badges` — Depende: T018, T019, T009 · Cubre: RF-007-06, RF-007-07, RF-007-08
- [x] T021 [P] [US2] [FE] `/perfil/insignias` con mock: obtenidas con fecha y pendientes con barra de avance, distinguidas por texto e icono — Depende: T015 · Cubre: RF-007-07, RNF-007-06
- [ ] T022 [US2] [FE] Conectar `/perfil/insignias` con `GET /users/me/badges` — Depende: T020, T021 · Cubre: RF-007-07

## Fase 4: US3 — Ranking del grupo (Prioridad: P2)

**Meta:** los miembros ven el ranking de puntualidad del grupo, sin montos ni comprobantes.
**Prueba independiente:** `GET /groups/:id/ranking` ordena por calificación exacta, luego racha, luego antigüedad, y deja a los «Nuevo» aparte.

- [ ] T023 [P] [US3] [BE] `domain/ranking-order.ts` (`rankingOrder(members)`: exacta desc, racha, antigüedad; «Nuevo» aparte) y `ranking-order.spec.ts` (CA-007-10) — Depende: T006 · Cubre: RF-007-09, CA-007-10
- [ ] T024 [P] [US3] [BE] `backend/test/ranking.e2e-spec.ts`: CA-007-10, CA-007-11 (sin montos ni comprobantes), CA-007-12 (ajeno → `404`), el titular aparece solo si tiene cobros como miembro en otros grupos, y rendimiento de menos de 300 ms con 20 miembros — Depende: T010 · Cubre: CA-007-10, CA-007-11, CA-007-12, RF-007-10, RF-007-11, RNF-007-03
- [ ] T025 [US3] [BE] `services/ranking.service.ts` y `controllers/ranking.controller.ts` `GET /groups/:groupId/ranking` (`items` y `unranked`) — Depende: T023, T024 · Cubre: RF-007-09, RF-007-10, RF-007-11, RNF-007-03, RNF-007-04
- [x] T026 [P] [US3] [FE] Pestaña **Ranking** de `/grupos/[id]` con mock: posición, nombre, nivel, estrellas y racha; los «Nuevo» al final sin posición; sin montos — Depende: T015, spec 001 T020 · Cubre: RF-007-10, RNF-007-06
- [ ] T027 [US3] [FE] Conectar la pestaña **Ranking** con `GET /groups/:id/ranking` — Depende: T025, T026 · Cubre: RF-007-09

## Fase 5: US4 — Corregir un cobro mal calificado (Prioridad: P2)

**Meta:** el titular puede excluir un cobro mal calificado por un error y el dueño puede reportarlo.
**Prueba independiente:** el titular excluye un cobro con motivo y la calificación del dueño se recalcula en la misma operación.

- [x] T028 [BD] Migraciones `0061_charge_reputation_exclusions.sql` (cobro único, titular, motivo de 10 a 300, fecha) y `0062_reputation_reports.sql` (cobro, dueño, comentario de 10 a 300; un reporte por persona y cobro) — Depende: T002 · Cubre: RF-007-14
- [ ] T029 [P] [US4] [BE] `backend/test/reports.e2e-spec.ts`: CA-007-13 (exclusión con motivo, registrada y recalculada), `CHARGE_ALREADY_EXCLUDED`, `REPORT_ALREADY_SENT`, solo el titular del grupo excluye y solo el dueño reporta — Depende: T028 · Cubre: CA-007-13, RF-007-14
- [ ] T030 [US4] [BE] `services/reports.service.ts`, `repositories/exclusions.repository.ts` y `controllers/reports.controller.ts` (`POST /charges/:id/reputation-report`, `POST /charges/:id/reputation-exclusion`, que recalcula con `recomputeUser` en la misma transacción) — Depende: T029, T009 · Cubre: RF-007-14, CA-007-13
- [x] T031 [BD] Completar `reputation.integrity.test.ts` con las pruebas de exclusiones, reportes e insignias (únicos) — Depende: T017, T028 · Cubre: RF-007-08, RF-007-14
- [x] T032 [P] [US4] [FE] En `/cobros/[id]` (spec 002): botón «Reportar calificación» para el dueño y «Excluir de reputación» con motivo para el titular, con mock — Depende: spec 002 T018 · Cubre: RF-007-14
- [ ] T033 [US4] [FE] Conectar el reporte y la exclusión con el backend — Depende: T030, T032 · Cubre: RF-007-14

## Fase 6: Cierre

- [ ] T034 [BE] Revisión de seguridad: fechas solo del servidor, la calificación de una persona nunca depende de datos de otra, sin `GET /users/:id/reputation` abierto, ranking sin montos y suspendidos conservan su calificación sin aparecer en búsquedas nuevas — Depende: T025, T030 · Cubre: RNF-007-04, RNF-007-05, RN-007-08
- [ ] T035 [BD] Revisar con Camila los planes de consulta de `getRatings` por lote, `ChargeFactsPort` (12 meses) y la conciliación diaria con datos del seed — Depende: T013 · Cubre: RNF-007-03
- [ ] T036 [FE] Accesibilidad de estrellas, niveles e insignias (texto, icono y valor numérico) — Depende: T022, T027 · Cubre: RNF-007-06
- [ ] T037 [BE] Ejecutar `/speckit-converge`: actualizar `spec.md` y `plan.md` con lo implementado y marcar las tareas hechas — Depende: T033, T034, T035, T036 · Cubre: —

## Dependencias y orden de ejecución

- **Fase 1 y US1 (núcleo)** entran en el hito MVP, justo después de la spec 002 (necesitan `ChargeFactsPort` y los eventos de cobro). T003–T006 son paralelas.
- **US2, US3 y US4** son P2 y dependen solo de T006, T009 y T010; pueden avanzar en paralelo entre sí.
- Esta spec necesita de otras: spec 002 T011 (eventos) y T017 (`ChargeFactsPort`); spec 001 T013 (`HostEligibilityPort`) y T028 (`GroupFrozen`); spec 009 (`UserBanned`, habilitación manual).
- Las specs 001, 008, 009 y 010 necesitan de esta: T010 (`ReputationQueryPort`).

## Ejemplos de paralelización

- Después de T002: T003 a T006 (BE) a la vez.
- Pruebas de historias: T008, T012, T019, T024 y T029 pueden escribirse en paralelo antes de sus implementaciones.
- Frontend con mock: T015, T021, T026 y T032 en paralelo con el backend.

## Estrategia de implementación

1. **Núcleo MVP:** Fase 1 → US1 (T001–T016). Con eso la spec 001 habilita titulares con datos reales y las demás specs muestran estrellas.
2. **P2 al final:** US2 → US3 → US4, en cualquier orden.

## Puntos de integración (hitos)

- [ ] **I1:** modelo y funciones puras disponibles (T002, T006)
- [ ] **I2:** `ReputationQueryPort` disponible para las specs 001, 008, 009 y 010 (T010, T014)
- [ ] **I3:** frontend conectado al backend real (T016, T022, T027, T033)

## Bloqueos y decisiones durante la implementación

| Fecha | Situación | Decisión | ¿Cambió la spec o el contrato? |
|---|---|---|---|
| 2026-10-20 | `ChargeFactsPort` ya existe en `billing` (spec 002 T017) con su implementación; `reputation` lo consume de ahí en vez de redefinirlo. `ReputationQueryPort` público de `reputation` (`getRatings`, `checkHostRating`) convive con el puerto `getMany` de `join-requests`; el cambio del adaptador nulo va en T014 | Aplicado | No |
| — | `ChargeFactsPort` depende de que 002 guarde `first_submitted_at` y el rechazo «inválido» en `charge_events.metadata` | Verificar con Leonardo al terminar spec 002 T017 | No |
