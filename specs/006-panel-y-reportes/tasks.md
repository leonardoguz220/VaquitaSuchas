# Tareas — Spec 006: Panel y reportes

- **Spec:** `spec.md` · **Plan:** `plan.md` · **Modelo:** `data-model.md` · **Contrato:** `contracts/api.md` · **Guía:** `quickstart.md`
- Capas: **BD** = Camila · **BE** = Leonardo · **FE** = Adrian. Cada tarea pertenece a **una** sola capa.
- Formato: `- [ ] Tnnn [P] [USn] [CAPA] Descripción con ruta — Depende: … · Cubre: …`. Los commits citan la tarea: `feat(006): add dashboard summary [T012]`.
- Historias: **US1** panel: gasto del mes, ahorro estimado, lo que debo y lo que me deben (HU-006-01, HU-006-02, HU-006-03; **parte A**) · **US2** cobranza del titular (HU-006-04; parte A) · **US3** gráficos de evolución (HU-006-06; parte B) · **US4** calendario de cobros y vencimientos (HU-006-05; parte B) · **US5** historial y exportación a CSV (HU-006-07; parte C).
- Prioridad P1 (después del MVP). El módulo `reports` **solo lee**: usa dos vistas de la base (`v_user_cost_lines`, `v_group_collection`) y no tiene tablas nuevas. Depende de las specs 001 (grupos, calendario), 002 (cobros y ciclos; `billing_cycles.owner_id`) y 004 (precio individual de referencia, copiado por 001).
- **Aclaración abierta:** leer vistas de la base contradice la regla de `specs/002-cobros-y-pagos/data-model.md` §2 («nunca SQL directo desde otro módulo»); se propone una excepción solo para lectura (`plan.md` §2) y se confirma en la revisión por capa antes de T003. También se confirman las decisiones del plan: «Debo» de todos los períodos, cuota de referencia del titular, «sin dato» cuando el precio individual está en USD y el grupo en Bs, y los límites de exportación (10 por hora y 20.000 filas).

## Fase 1: Base común (vistas, índices y dominio puro)

- [ ] T001 [BD] Escribir primero `database/tests/reports.integrity.test.ts`: un cobro `cancelado` no aparece en `v_user_cost_lines` ni suma en `v_group_collection`; el titular tiene una fila por ciclo con `owner_share_cents` y el miembro una por cobro; cambiar el tipo de cambio del grupo no cambia meses anteriores; `Σ cost_cents` por grupo y período = `total_bs_cents` del ciclo cuando no hay cobros cancelados; precio individual en USD con tipo de cambio 6,96 → `individual_price_bs_cents = 6960` para 1000; precio ausente o USD sin tipo de cambio → `NULL`; titular transferido conserva los ciclos anteriores; consulta de 20 grupos × 12 meses en menos de 100 ms — Depende: spec 002 T001 · Cubre: CA-006-02, CA-006-03, CA-006-04, CA-006-05, CA-006-10, CA-006-19, CA-006-22, RNF-006-06
- [ ] T002 [BD] Migración `database/migrations/0100_reports_views.sql`: vista `v_user_cost_lines` (una fila por persona, grupo y período con `cost_cents`, rol, estado, precio individual de referencia en Bs desde las copias del ciclo y del cobro) y `v_group_collection` (esperado, cobrado, pendiente y atrasados por grupo y período), ambas sin cobros `cancelado` y con centavos enteros — Depende: T001, spec 002 T003 · Cubre: RF-006-02, RF-006-03, RF-006-06, RN-006-01, RN-006-02, RN-006-06, RN-006-07, RNF-006-06
- [ ] T003 [BD] Migración `0101_reports_indexes.sql` (`charges_user_period_idx (user_id, period) WHERE status <> 'cancelado'`, `billing_cycles_owner_period_idx (owner_id, period)`) y `0102_reports_role.sql` opcional (`SELECT` sobre las dos vistas al rol de la aplicación); seed de desarrollo con 12 meses de historial para un titular y un miembro — Depende: T002, spec 002 T002 · Cubre: RNF-006-01
- [ ] T004 [P] [BE] `modules/reports/domain/savings.ts` (`savingsForLine`: `individual − cuota`, `null` si no hay dato; `summarizeSavings`: total, `withoutData`, nota si hay negativos) y `collection.ts` (`percentCollected`: entero con mitad hacia arriba, `null` si lo esperado es 0) con `savings.spec.ts` y `collection.spec.ts` (CA-006-04, 05, 09, 21) — Depende: spec 000 T004 · Cubre: RN-006-03, RF-006-03, RF-006-06, CA-006-04, CA-006-05, CA-006-09, CA-006-21
- [ ] T005 [P] [BE] `domain/months.ts` (`lastMonths(endPeriod, firstDataPeriod, n = 12)` sin huecos y `cumulative(series)` con «sin dato») con `months.spec.ts` (CA-006-11), `calendar-events.ts` (`calendarEventsFor`: cortes con `adjustBillingDay`, vencimientos de cobros abiertos, estimados con `splitShares`, grupos cerrados solo en meses pasados; `daysLate`) con `calendar-events.spec.ts` (CA-006-13) — Depende: spec 001 T007, spec 001 T008 · Cubre: RF-006-07, RF-006-09, RF-006-11, RF-006-12, CA-006-11, CA-006-13
- [ ] T006 [P] [BE] `domain/csv.ts` (`csvEscapeCell` con comillas RFC 4180 y apóstrofo inicial ante `=`, `+`, `-`, `@`, tabulación o retorno; `formatCsvAmount(cents)` como `25.50` sin `float`; `buildCsv` con BOM UTF-8, encabezado y fechas `AAAA-MM-DD` de La Paz) con `csv.spec.ts` (CA-006-15, 16) — Depende: spec 000 T004 · Cubre: RF-006-15, RNF-006-04, CA-006-15, CA-006-16
- [ ] T007 [BE] `repositories/reports.repository.ts` (solo vistas `v_*` y agregados; todo recibe el `userId` del token, nunca del cuerpo o la ruta) y un puerto `SubscriptionMembershipQuery` consumido de la spec 001 para validar `groupId` — Depende: T003, spec 001 T011 · Cubre: RNF-006-03

**Punto de control (I1):** vistas e índices disponibles; el panel ya se puede construir sobre datos reales del seed.

## Fase 2: US1 y US2 — Panel y cobranza (parte A, Prioridad: P1) 🎯

**Meta:** el usuario ve su gasto, ahorro, deudas y lo que le deben; el titular ve la cobranza por grupo.
**Prueba independiente:** con cuotas de Bs 30,00 y Bs 25,50, `GET /me/dashboard` devuelve gasto Bs 55,50 con el desglose por suscripción que suma exactamente ese total.

- [ ] T008 [P] [US1] [BE] `backend/test/dashboard.spend.e2e-spec.ts` (CA-006-01 Bs 30,00 + Bs 25,50 = Bs 55,50, CA-006-02 cancelado no suma, CA-006-03 cuota de referencia del titular, CA-006-22 Σ desglose = total, RN-006-01 un cobro pagado en otro mes cuenta en su período), `dashboard.savings.e2e-spec.ts` (CA-006-04, CA-006-05 «sin dato»), `dashboard.debts.e2e-spec.ts` (CA-006-06 Debo = Bs 25,00, CA-006-07 en revisión aparte) y `dashboard.access.e2e-spec.ts` (CA-006-18 panel ajeno → `404`) — Depende: T007 · Cubre: CA-006-01, CA-006-02, CA-006-03, CA-006-04, CA-006-05, CA-006-06, CA-006-07, CA-006-18, CA-006-22, RN-006-01, RN-006-02, RN-006-04
- [ ] T009 [US1] [BE] `services/dashboard.service.ts` `summary(userId, { month, groupId })` (valida `groupId` con `SubscriptionMembershipQuery`; consultas de gasto y ahorro, deudas de todos los períodos, en revisión aparte y meses disponibles en paralelo; el titular tiene `paid = null`) y `list(...)` para `debts`, `in_review` y `owed` con cursor; `controllers/dashboard.controller.ts` con `GET /me/dashboard` y `GET /me/dashboard/lists` — Depende: T008, T004 · Cubre: RF-006-01, RF-006-02, RF-006-03, RF-006-04, RF-006-05, RN-006-02, RN-006-03, RN-006-04, RN-006-05, RNF-006-03, CA-006-01 a 07, 18, 22
- [ ] T010 [P] [US2] [BE] `backend/test/dashboard.owed.e2e-spec.ts` (CA-006-08 «Me deben» suma 5 cobros por grupo, CA-006-09 67 % y Bs 30,00 pendientes), `dashboard.empty.e2e-spec.ts` (CA-006-14 estado vacío), `dashboard.history.e2e-spec.ts` (CA-006-10 el cambio de tipo de cambio no altera meses pasados), `dashboard.freshness.e2e-spec.ts` (CA-006-20 pagado se refleja en menos de 1 minuto) y `dashboard.perf-spec.ts` (CA-006-19: menos de 1 s p95 con 20 suscripciones × 12 meses) — Depende: T007 · Cubre: CA-006-08, CA-006-09, CA-006-10, CA-006-14, CA-006-19, CA-006-20, RNF-006-01, RNF-006-02, RF-006-16
- [ ] T011 [US2] [BE] «Me deben» y cobranza en `DashboardService` y `controllers/collection.controller.ts` con `GET /groups/:groupId/collection?period=` (esperado, cobrado, pendiente, `percentCollected` y atrasados; solo el titular: `403` miembro, `404` ajeno) — Depende: T010, T009 · Cubre: RF-006-05, RF-006-06, RN-006-05, RNF-006-03, CA-006-08, CA-006-09
- [ ] T012 [P] [US1] [FE] `/panel` con mock: selector de mes y filtro por suscripción, tarjetas **Gasto del mes** (con «pagado»), **Ahorro estimado** (rotulado «estimado», «sin dato», nota si es negativo), **Debo** (con sección aparte «En revisión») y **Me deben** (solo titular), lista de deudas con «Subir comprobante» (`/cobros/[id]`), estado vacío «Aún no tienes suscripciones» con accesos a crear o unirse; montos con `formatBs` sin cálculos en el cliente — Depende: spec 000 T036 · Cubre: RF-006-01 a RF-006-05, RF-006-16, RNF-006-05
- [ ] T013 [US1] [FE] Conectar `/panel` con `GET /me/dashboard` y `GET /me/dashboard/lists`; recargar al volver a la pestaña o tras una acción (sin sondeo) — Depende: T009, T012 · Cubre: RF-006-01 a RF-006-05
- [ ] T014 [P] [US2] [FE] `/panel` → **Cobranza** (titular, por grupo: esperado, cobrado, pendiente, barra con el porcentaje en texto, lista de atrasados con enlace a revisar) y pestaña **Cobranza** de `/grupos/[id]` (mes, resumen, tabla por miembro, filtro por miembro) con mock — Depende: T012, spec 001 T020 · Cubre: RF-006-06, RNF-006-05
- [ ] T015 [US2] [FE] Conectar la cobranza con `GET /me/dashboard` (`collection`) y `GET /groups/:id/collection` — Depende: T011, T014 · Cubre: RF-006-06

**Punto de control (I2):** el panel muestra gasto, ahorro, deudas y cobranza con datos reales.

## Fase 3: US3 — Gráficos (parte B, Prioridad: P1)

**Meta:** el usuario ve la evolución de 12 meses, el gasto por servicio y el ahorro acumulado, con alternativa en tabla.
**Prueba independiente:** con 14 meses de datos, `GET /me/dashboard/charts` devuelve los últimos 12 y la tabla coincide con el gráfico.

- [ ] T016 [P] [US3] [BE] `backend/test/dashboard.charts.e2e-spec.ts`: CA-006-11 (14 meses → últimos 12, sin huecos), series de gasto mensual, por servicio y ahorro acumulado — Depende: T007 · Cubre: CA-006-11, RF-006-07, RF-006-08, RF-006-09
- [ ] T017 [US3] [BE] `services/charts.service.ts` (tres series en un solo viaje a la base, meses sin datos en 0, «sin dato» en el acumulado) y `GET /me/dashboard/charts?month=&groupId=` — Depende: T016, T005, T009 · Cubre: RF-006-07, RF-006-08, RF-006-09, RF-006-10, CA-006-11
- [ ] T018 [P] [US3] [FE] `/panel` → **Gráficos** con Recharts cargado con `next/dynamic` (barras de 12 meses, barras horizontales por servicio, ahorro acumulado), cada uno con **Ver tabla** (`aria-pressed`), etiquetas de valor y patrones además del color; `frontend/e2e/panel-charts.spec.ts` (CA-006-12 tabla = gráfico) y `panel-savings-negative.spec.ts` (CA-006-21), `panel-empty.spec.ts` (CA-006-14) — Depende: T012 · Cubre: RF-006-10, RNF-006-05, CA-006-12, CA-006-14, CA-006-21
- [ ] T019 [US3] [FE] Conectar los gráficos con `GET /me/dashboard/charts` — Depende: T017, T018 · Cubre: RF-006-07, RF-006-08, RF-006-09

## Fase 4: US4 — Calendario (parte B, Prioridad: P1)

**Meta:** el usuario ve sus fechas de corte y vencimiento del mes y de los próximos 30 días.
**Prueba independiente:** con un grupo de día de cobro 31, febrero muestra el corte el día 28 o 29.

- [ ] T020 [P] [US4] [BE] `backend/test/calendar.e2e-spec.ts`: CA-006-13 (día 31 en febrero), cortes y vencimientos de cobros abiertos, estimados con «estimado», rol y monto por evento, grupos cerrados solo en meses pasados, próximos 30 días — Depende: T007 · Cubre: CA-006-13, RF-006-11, RF-006-12
- [ ] T021 [US4] [BE] `services/calendar.service.ts` (junta ciclos existentes del pasado y el presente con los cálculos del futuro y aplica `calendarEventsFor`) y `controllers/calendar.controller.ts` con `GET /me/calendar?month=` y `GET /me/calendar/upcoming?days=30` — Depende: T020, T005 · Cubre: RF-006-11, RF-006-12, CA-006-13
- [ ] T022 [P] [US4] [FE] `/panel/calendario` con mock: cuadrícula del mes (celdas con eventos de corte y vencimiento en texto e icono), lista **Próximos 30 días**, rol y monto («estimado» cuando corresponde) — Depende: T012 · Cubre: RF-006-11, RF-006-12, RNF-006-05
- [ ] T023 [US4] [FE] Conectar el calendario con `GET /me/calendar` y `…/upcoming` — Depende: T021, T022 · Cubre: RF-006-11

## Fase 5: US5 — Historial y exportación a CSV (parte C, Prioridad: P1)

**Meta:** el usuario consulta su historial y lo exporta; el titular exporta el del grupo, sin romper Excel ni permitir inyección de fórmulas.
**Prueba independiente:** una exportación con acentos se abre bien en Excel y una celda `=CMD()` sale como texto.

- [ ] T024 [P] [US5] [BE] `backend/test/export.e2e-spec.ts`: CA-006-15 (acentos y montos numéricos con BOM), CA-006-16 (`=CMD()` escapado), CA-006-17 (el miembro exporta el grupo → `403`), límite de 10 exportaciones por hora (`429` con el tiempo de espera) y de 20.000 filas; historial paginado con filtros por mes, suscripción y estado — Depende: T007, T006 · Cubre: CA-006-15, CA-006-16, CA-006-17, RF-006-13, RF-006-14, RF-006-15, RNF-006-04
- [ ] T025 [US5] [BE] `services/history.service.ts` y `services/export.service.ts` (CSV en flujo con cursor de base, límite de filas y `rate_limit_events` cubo `export:user`) con `controllers/history.controller.ts` y `export.controller.ts`: `GET /me/history`, `GET /me/history/export.csv` y `GET /groups/:groupId/history/export.csv` (titular; `403` miembro, `404` ajeno; sin comprobantes) — Depende: T024 · Cubre: RF-006-13, RF-006-14, RF-006-15, RNF-006-03, RNF-006-04, CA-006-15, CA-006-16, CA-006-17
- [ ] T026 [P] [US5] [FE] `/panel/historial` (tabla con filtros de mes, suscripción y estado, «Cargar más» y **Exportar CSV**) y **Exportar CSV del grupo** en la pestaña **Cobranza** del titular, con mock y mensaje de espera para `429` — Depende: T012 · Cubre: RF-006-13, RF-006-14
- [ ] T027 [US5] [FE] Conectar historial y exportaciones con los endpoints (descarga con el nombre de archivo del servidor) — Depende: T025, T026 · Cubre: RF-006-13, RF-006-14

## Fase 6: Cierre

- [ ] T028 [BE] Revisión de seguridad: ningún identificador de usuario del cuerpo o la ruta, el titular no ve comprobantes en lo que exporta, límites de exportación, CSV con escape de fórmulas, caché sin datos de otras personas — Depende: T011, T025 · Cubre: RNF-006-03, RNF-006-04
- [ ] T029 [BD] Revisar con Camila los planes de consulta de las vistas con el seed de 20 suscripciones × 12 meses (p95 < 1 s) y decidir si hace falta el rol de lectura de T003 — Depende: T010 · Cubre: RNF-006-01
- [ ] T030 [FE] Accesibilidad y móvil primero de panel, gráficos, calendario e historial (tarjetas apiladas, tablas alternativas, patrones además del color, porcentajes en texto) — Depende: T019, T023, T027 · Cubre: RNF-006-05
- [ ] T031 [BE] Ejecutar `/speckit-converge`: actualizar `spec.md` y `plan.md` con lo implementado (excepción de lectura de vistas, decisiones del panel) y marcar las tareas hechas — Depende: T028, T029, T030 · Cubre: —

## Dependencias y orden de ejecución

- **Fase 1** primero (T001–T007); T004–T006 son paralelas entre sí y con las migraciones.
- **US1 → US2** (parte A) antes que las demás; **US3, US4 y US5** dependen solo de T007 y del frontend de T012, y pueden avanzar en paralelo.
- Esta spec necesita de otras: spec 002 T002/T003 (`billing_cycles.owner_id`, `charges`), spec 001 T007, T008, T011, T020 y spec 004 (precio individual).
- Ninguna otra spec depende de esta.

## Ejemplos de paralelización

- Después de T002: T003 (BD) y T004 a T006 (BE) a la vez.
- Pruebas de historias: T008, T010, T016, T020 y T024 pueden escribirse en paralelo antes de sus implementaciones.
- Frontend con mock: T012, T014, T018, T022 y T026 en paralelo con el backend.

## Estrategia de implementación

1. **Parte A primero:** panel y cobranza (T001–T015). Es lo que el equipo usa a diario.
2. **Parte B:** gráficos y calendario, cargando Recharts de forma diferida.
3. **Parte C:** historial y exportación, con los límites de seguridad desde el inicio.
4. Antes de empezar, confirmar la excepción de leer vistas y las decisiones del panel.

## Puntos de integración (hitos)

- [ ] **I1:** vistas e índices disponibles (T002, T003)
- [ ] **I2:** contrato de API congelado (`contracts/api.md`)
- [ ] **I3:** frontend conectado al backend real (T013, T015, T019, T023, T027)
- [ ] **I4:** rendimiento verificado con 20 suscripciones × 12 meses (T010, T029)

## Bloqueos y decisiones durante la implementación

| Fecha | Situación | Decisión | ¿Cambió la spec o el contrato? |
|---|---|---|---|
| — | `reports` lee vistas de la base (excepción a la regla de la spec 002) | Confirmar con las tres capas antes de T003 | Posible: spec 002 `data-model.md` §2 |
| — | «Debo» en todos los períodos, titular sin «pagado», «sin dato», límites de exportación | Confirmar antes de T009 | Posible: `spec.md` |
