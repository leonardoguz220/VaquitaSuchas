# Tareas — Spec 011: Faltante de grupo

- **Spec:** `spec.md` · **Plan:** `plan.md` · **Modelo:** `data-model.md` · **Contrato:** `contracts/api.md`
- Capas: **BD** = Camila · **BE** = Leonardo · **FE** = Adrian. Cada tarea pertenece a **una** sola capa.
- Formato: `- [ ] Tnnn [P] [CAPA] Descripción con ruta — Depende: … · Cubre: …`. Los commits citan la tarea: `feat(011): add shortfall quote [T008]`.
- Prioridad P1. Depende de las specs 001, 002, 005 y 010. Los supuestos de la spec §10 se confirman al aprobarla.

## Fase 1: Base de datos

- [x] T001 [BD] Pruebas primero: `database/tests/shortfalls.integrity.test.ts` (una ronda abierta por grupo, máximo 2 por período, cotización inmutable, transiciones, titular no afectado, solo anexado) — Cubre: RF-011-05, RN-011-01, RF-011-15
- [x] T002 [BD] Migración `database/migrations/0110_shortfalls.sql`: `shortfall_rounds`, `shortfall_responses`, `shortfall_events` y sus disparadores — Depende: T001 · Cubre: RF-011-04, RF-011-08 a RF-011-15

## Fase 2: Dominio puro

- [x] T003 [P] [BE] `modules/shortfalls/domain/shortfall-quote.ts` + spec (CA-011-01, resto del titular, propiedad Σ) — Cubre: RN-011-01, RN-011-02, CA-011-01
- [x] T004 [P] [BE] `domain/deadlines.ts` + spec (48 h, 96 h, 5 días) — Cubre: RF-011-04, RF-011-12
- [x] T005 [P] [BE] `domain/state.ts` y `allowed-actions.ts` + spec (tabla completa de transiciones) — Cubre: CA-011-15, RF-011-14

## Fase 3: Backend

- [x] T006 [BE] `repositories/shortfalls.repository.ts` (SQL con `FOR UPDATE`; orden de bloqueo grupo → ronda → fila) — Depende: T002
- [x] T007 [BE] `services/shortfalls.service.ts`: cotizar, abrir, consultar, cancelar, mis faltantes — Depende: T003, T004, T006 · Cubre: CA-011-01 a 04, 13, 14
- [x] T008 [BE] `services/shortfall-actions.service.ts` y `shortfall-lifecycle.ts`: responder, pagar, confirmar o rechazar, devolución — Depende: T005, T006 · Cubre: CA-011-05 a 07, 10, 11
- [x] T009 [BE] `services/shortfall-sweeper.ts` y `jobs/shortfalls-jobs.ts` (`shortfalls.sweep`) — Depende: T008 · Cubre: CA-011-08, 09, 12
- [x] T010 [BE] `controllers/shortfalls.controller.ts`, DTO y `shortfalls.module.ts`; registro en `AppModule` — Depende: T007, T008
- [x] T011 [BE] Avisos (spec 005): 7 tipos en `catalog.ts`/`templates.ts`, `handlers/shortfalls.handlers.ts` y eventos `shared/events/shortfall-events.ts` — Depende: T008
- [x] T012 [BE] `backend/test/shortfalls.e2e-spec.ts`: un test por CA de endpoint contra PostgreSQL — Depende: T010, T011

## Fase 4: Frontend

- [x] T013 [FE] `services/shortfalls.ts` + test (una función por endpoint) — Depende: contrato
- [x] T014 [FE] `components/features/shortfalls/*` y ruta `/grupos/[id]/faltante`: cotización y aviso del titular, respuesta del miembro, pago adicional y devolución, estados de carga, vacío y error — Depende: T013
- [x] T015 [FE] Enlace «Ver faltante» en el resumen del grupo — Depende: T014
- [x] T016 [FE] Test E2E (Playwright) del flujo feliz — Depende: T014

## Cierre

- [ ] T017 [Todos] `/speckit-converge`: confirmar los supuestos de la spec §10, integrar la disputa a la cola de reclamos (spec 009) y decidir si el titular necesita el cierre «absorber» o «cerrar el grupo» — Depende: T016

## Puntos de integración

- [x] **I1:** Modelo de datos disponible (T002)
- [x] **I2:** Contrato de API (propuesto; se congela al aprobar el plan)
- [x] **I3:** Frontend conectado al backend real (T014)

## Bloqueos y decisiones durante la implementación

| Fecha | Situación | Decisión | ¿Cambió la spec o el contrato? |
|---|---|---|---|
| 2026-10-28 | El pago adicional como cobro `ajuste` obligaba a cambiar `charges`, sus disparadores y los resúmenes de la spec 002 | El pago adicional vive en `shortfall_responses` (plan D1) | Sí: el diseño inicial (cobro `ajuste`) se reemplazó; no se toca la spec 002 |
| 2026-10-28 | Archivos de comprobante para el pago adicional y la devolución | Solo método y referencia en el MVP | Sí: spec §3 |
| 2026-10-28 | La tarea no abre disputas por devolución sin registrar | La abre la persona pasados 5 días | Sí: contrato, tarea programada |
