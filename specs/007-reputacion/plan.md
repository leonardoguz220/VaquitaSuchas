# Plan técnico — Spec 007: Reputación

- **Spec relacionada:** `specs/007-reputacion/spec.md` (debe estar **aprobada** por BD, Backend y Frontend)
- **Líder de la spec:** Camila Fuentes (BD)
- **Última actualización:** 2026-10-18
- **Artefactos:** [`data-model.md`](data-model.md) · [`contracts/api.md`](contracts/api.md) · [`quickstart.md`](quickstart.md)

| Capa | Responsable | Secciones | Visto bueno |
|---|---|---|---|
| Base de datos | Camila | §3 (y `data-model.md`) | pendiente |
| Backend | Leonardo | §4, §5, §7 | pendiente |
| Frontend | Adrian | §6 | pendiente |

## Constitución: verificación

| Principio | ¿Cumple? | Nota |
|---|---|---|
| I. Spec primero | Sí | Sin huecos nuevos; un caso a confirmar sobre cobros atrasados que se pagaron (§2, decisión 4). |
| II. Dinero exacto | No aplica | No se usan montos. Las estrellas se calculan con enteros (sin `float`). |
| III. Criterios verificables | Sí | CA-007-01 a 25 mapeados en §8. |
| IV. Seguridad | Sí | Fechas siempre del servidor; la calificación solo la ven las personas autorizadas. |
| V. Contratos primero | Sí | `data-model.md` y `contracts/api.md`. |
| VI. Simplicidad | Sí | Copia de lectura de dos contadores; todo lo demás se calcula. |
| VII. Capas | Sí | Cálculo en `domain/` puro; datos de cobros por el puerto `ChargeFactsPort`. |

## 1. Resumen de la solución

Módulo `reputation` con una **función pura** `computeReputation(facts, now)` que, a partir de los hechos de los cobros de una persona, devuelve considerados, puntuales, tardíos, estrellas, nivel y racha. Un servicio la aplica en la misma transacción cuando cambia un cobro (copia de lectura en `user_reputation`) y una tarea diaria reconcilia. La **habilitación para ser titular** se evalúa en el momento con la misma función. La entrega se parte en dos: **núcleo (MVP)** — calificación, detalle, habilitación, reconciliación — porque la spec 001 depende de ella; y **P2** — insignias, ranking, reportes y exclusión.

## 2. Decisiones técnicas

| Decisión | Opción elegida | Alternativas descartadas | Motivo |
|---|---|---|---|
| Fuente de verdad | Cobros (spec 002); `user_reputation` es copia | Contadores incrementales como fuente | RNF-007-02: siempre reproducible. |
| Redondeo de estrellas | Enteros: `mediasEstrellas = floor((20p + c) / (2c))` | `float` con `Math.round` | Mitad hacia arriba exacta, sin errores binarios (CA-007-19). |
| Habilitación | Cálculo en el momento, no con la copia | Leer `user_reputation` | La ventana de 12 meses envejece; CA-007-21. |
| Ventana de 12 meses | Cobros con `due_at >= ahora − 12 meses` | Por fecha de pago | Un cobro pertenece a su período (RN-006-01) y no se mueve por pagar tarde. |
| Cobros atrasados pagados | `atrasado` cuenta como no puntual mientras siga así; `pagado` se mide con la fecha de la primera subida (o de la última si hubo «inválido») | Siempre tardío | RF-007-12 y CA-007-05; el retiro por mora no tiene subida previa, así que queda tardío (CA-007-24). |
| Grupos congelados por baneo | Cobros no `pagado` de un grupo congelado se excluyen por regla | Marcarlos uno por uno | RF-009-22; sin escrituras masivas. |
| Cobros de ingreso | No son hechos considerados (`origin = 'ingreso'`) | Contarlos | RN-007-09. |
| Reglas versionadas | Constante `RULES_VERSION` en código, guardada en cada fila | Tabla de configuración | RN-007-07; el cambio de versión dispara un recálculo total. |
| Actualización | Manejadores del `TxEventBus` en la misma transacción | Solo tarea diaria | CA-007-15. |
| Entrega | Núcleo en el MVP, resto en P2 | Todo en P2 | La spec 001 la necesita (RF-001-21). |

## 3. Modelo de datos — _Camila (BD)_

Detalle en [`data-model.md`](data-model.md): `user_reputation` (0060, núcleo), `charge_reputation_exclusions` (0061), `reputation_reports` (0062), `user_badges` (0063) (P2). Pruebas de integridad en `database/tests/reputation.integrity.test.ts`.

## 4. Contratos de API — _Leonardo (Backend)_

Detalle en [`contracts/api.md`](contracts/api.md): `GET /users/me/reputation` (núcleo), `GET /groups/:id/ranking`, `GET /users/me/badges`, reporte y exclusión de cobros (P2).

> **Contrato congelado** al aprobarse este plan. Los cambios se hacen por PR sobre este archivo y avisando a las otras dos capas.

## 5. Lógica de dominio — _Leonardo (Backend)_

### Estructura

```text
backend/src/modules/reputation/
├── controllers/   reputation.controller.ts, ranking.controller.ts (P2), badges.controller.ts (P2), reports.controller.ts (P2)
├── services/      reputation.service.ts, reputation-query.service.ts, reconcile.job.ts, badges.service.ts (P2), ranking.service.ts (P2)
├── domain/        facts.ts, punctuality.ts, score.ts, level.ts, streak.ts, host-threshold.ts, badges-rules.ts (P2), ranking-order.ts (P2), rules-version.ts
├── ports/         charge-facts.port.ts
└── repositories/  reputation.repository.ts, exclusions.repository.ts (P2), badges.repository.ts (P2)
```

### Funciones puras (núcleo)

| Función | Entradas → salida | Reglas |
|---|---|---|
| `isConsidered(fact, now)` | → boolean | Origen `ciclo`; estado `pagado` o `atrasado`; `dueAt >= now − 12 meses`; no excluido por RF-007-14; no (grupo congelado por baneo y estado ≠ `pagado`) (RN-007-01, RN-007-09, RF-007-13). |
| `punctualityInstant(fact)` | → instante o `null` | Pago manual: `paidAt`. Con rechazo «comprobante inválido»: `lastUploadAt`. Si no: `firstSubmittedAt`. |
| `isPunctual(fact)` | → boolean | `status = 'atrasado'` → no; `status = 'pagado'` → `punctualityInstant < dueAt` (equivale a ≤ 23:59:59 de La Paz, RN-007-06). |
| `computeReputation(facts, now)` | → `{ considered, punctual, late, halfStars \| null, level, streak }` | `considered < 3` → `Nuevo`; `halfStars = floor((20·p + c) / (2·c))`; sin división por cero (CA-007-16, CA-007-19). |
| `levelFor(halfStars)` | → nivel | 10 → Excelente; 8–9 → Bueno; 6–7 → Regular; ≤ 5 → En riesgo (RF-007-03). |
| `currentStreak(facts)` | → entero | Puntuales consecutivos más recientes por `dueAt`; un no puntual lo reinicia (RN-007-05). |
| `meetsHostThreshold(reputation)` | → `{ ok, missing[] }` | `halfStars ≥ 9` y `considered ≥ 6` (RF-007-15). |
| `exactStarsText(p, c)` | → `"4.3750"` | Para explicar el cálculo en pantalla. |

P2: `badgesEarned(facts, existing)`, `rankingOrder(members)` (exacta desc, racha, antigüedad; "Nuevo" aparte).

### Servicios

- **`ReputationService.recomputeUser(tx, userId, now)`**: pide los hechos a `ChargeFactsPort`, aplica `computeReputation`, hace `INSERT … ON CONFLICT (user_id) DO UPDATE` en `user_reputation` con `rules_version`. Lo llaman los manejadores de `ChargeConfirmed`, `ChargeBecameOverdue`, `ChargeCancelled`, `GroupFrozen` (recalcula a los miembros) y las exclusiones.
- **`ReputationQueryService`**: `getRatings(userIds)` (de `user_reputation`; sin fila → "Nuevo"), `getDetail(userId)` (calcula en el momento, incluye `recent` y `host`), `checkHostRating(userId, now)` (calcula en el momento; lo usa el adaptador `HostEligibilityPort`).
- **`reconcile.job` (`reputation.reconcile`)**: por lotes recalcula a quienes tuvieron cobros en 13 meses; si la fila guardada difiere, la corrige y suma al contador `drift` del `job_runs`. Si cambió `RULES_VERSION`, recalcula a todos.
- **`ChargeFactsPort`** (implementado por `billing`): una consulta con unión `charges` + `receipts` (máxima y primera subida) + `charge_events` (`metadata.invalidReceipt`) + `groups.frozen_reason`.
- **P2:** `BadgesService` (otorga y conserva; avance calculado), `RankingService` (consulta `user_reputation` de los miembros activos + racha), `ReportsService` (reporte del dueño; exclusión del titular).

### Visibilidad (RNF-007-04)

`getRatings` se expone solo a través de otros módulos autorizados: ranking del grupo (miembros), lista de solicitudes (titular), propia persona. No existe `GET /users/:id/reputation` abierto.

## 6. Interfaz de usuario — _Adrian (Frontend)_

| Ruta | Rol | Contenido | Endpoints | Entrega |
|---|---|---|---|---|
| `/perfil/reputacion` | Usuario | Estrellas con número ("4,5 de 5") y nivel en texto e icono; si es "Nuevo", cuántos cobros faltan para tener calificación; detalle: considerados, puntuales, tardíos, racha; lista de los últimos cobros con resultado y vencimiento; explicación de la fórmula con el ejemplo; estado de **habilitación para crear suscripciones** ("Te faltan 2 cobros considerados" / "Necesitas 4,5 estrellas") | `GET /users/me/reputation` | MVP |
| Componente `RatingBadge` | Todos | Estrellas + valor numérico + nivel; se usa en solicitudes (010), cupos (008) y ranking | — | MVP |
| `/grupos/[id]` → pestaña **Ranking** | Miembro | Lista con posición, nombre, nivel, estrellas y racha; los "Nuevo" al final sin posición; sin montos | `GET /groups/:id/ranking` | P2 |
| `/perfil/insignias` | Usuario | Obtenidas con fecha y pendientes con barra de avance | `GET /users/me/badges` | P2 |
| En `/cobros/[id]` | Dueño / titular | Botón "Reportar calificación" y, para el titular, "Excluir de reputación" con motivo | endpoints de reporte | P2 |

Accesibilidad: niveles e insignias se distinguen por texto e icono; el contador de estrellas siempre acompañado del valor numérico (RNF-007-06).

## 7. Seguridad y permisos — _Leonardo (Backend), con revisión de BD_

- Las fechas de puntualidad salen del servidor; el cliente no puede enviar fechas de pago (RNF-007-05, CA-007-17).
- La calificación de una persona nunca depende de datos de otra (RN-007-08).
- Exclusiones y reportes: solo el titular del grupo del cobro excluye; solo el dueño reporta; todo con motivo y registro.
- Ranking: `404` a quien no pertenece al grupo (CA-007-12); sin montos ni comprobantes (CA-007-11).
- Los usuarios suspendidos conservan su calificación pero no aparecen en búsquedas nuevas (caso borde de la spec).

## 8. Estrategia de pruebas

| Criterio | Nivel | Capa | Test |
|---|---|---|---|
| CA-007-01 (10 considerados, 9 puntuales → 4,5 «Bueno») | Unitario | BE | `score.spec.ts` |
| CA-007-02 (2 cobros → «Nuevo») | Unitario + integración | BE | `score.spec.ts`; `reputation.me.e2e-spec.ts` |
| CA-007-03 (vence el 18, sube 23:30 → puntual) | Unitario | BE | `punctuality.spec.ts` (con fechas de La Paz) |
| CA-007-04 (sube el 19 00:05 → no puntual) | Unitario | BE | `punctuality.spec.ts` |
| CA-007-05 (rechazado y vuelve tarde → puntual) | Unitario + integración | BE | `punctuality.spec.ts`; `reputation.facts.e2e-spec.ts` |
| CA-007-06 (cancelado no cuenta) | Unitario | BE | `score.spec.ts` |
| CA-007-07 (atrasado cuenta como tardío) | Unitario | BE | `score.spec.ts` |
| CA-007-08 (Racha 3) | Unitario + integración | BE | `badges-rules.spec.ts`; `badges.e2e-spec.ts` (P2) |
| CA-007-09 (insignia se conserva, racha vuelve a 0) | Unitario + integración | BE | `badges-rules.spec.ts`; `badges.e2e-spec.ts` (P2) |
| CA-007-10 (desempate del ranking) | Unitario | BE | `ranking-order.spec.ts` (P2) |
| CA-007-11 (ranking sin montos ni comprobantes) | Integración | BE | `ranking.e2e-spec.ts` (P2) |
| CA-007-12 (ajeno al grupo → 404) | Integración | BE | `ranking.e2e-spec.ts` (P2) |
| CA-007-13 (exclusión con motivo) | Integración | BE | `reports.e2e-spec.ts` (P2) |
| CA-007-14 (recálculo = guardado) | Integración | BE | `reputation.reconcile.e2e-spec.ts` |
| CA-007-15 (actualiza al pagar sin esperar la tarea) | Integración | BE | `reputation.events.e2e-spec.ts` |
| CA-007-16 (cero cobros) | Unitario | BE | `score.spec.ts` |
| CA-007-17 (fecha del cliente ignorada) | Integración | BE | `reputation.facts.e2e-spec.ts` |
| CA-007-18 (19/20, 15/20, 11/20 → 5, 4, 3) | Unitario | BE | `score.spec.ts` |
| CA-007-19 (7/8 → 4,375 mostrado 4,5) | Unitario | BE | `score.spec.ts` |
| CA-007-20 (6 cobros y 4,5 → habilitado; con 5, no) | Unitario + integración | BE | `host-threshold.spec.ts`; `reputation.host.e2e-spec.ts` |
| CA-007-21 (baja del umbral → no crea; grupos existentes igual) | Integración | BE | `reputation.host.e2e-spec.ts`; `groups.create.e2e-spec.ts` (spec 001) |
| CA-007-22 (cobro de ingreso no cuenta) | Unitario + integración | BE | `score.spec.ts`; `reputation.facts.e2e-spec.ts` |
| CA-007-23 (habilitación manual con calificación baja) | Integración | BE | `reputation.host.e2e-spec.ts` |
| CA-007-24 (retirado por mora: tardío aunque pague) | Unitario + integración | BE | `punctuality.spec.ts`; `reputation.facts.e2e-spec.ts` |
| CA-007-25 (comprobante inválido → última subida) | Unitario + integración | BE | `punctuality.spec.ts`; `reputation.facts.e2e-spec.ts` |

Pruebas de reglas: RN-007-01 → `score.spec.ts`; RN-007-02 y RN-007-06 → `punctuality.spec.ts`; RN-007-03 → `score.spec.ts`; RN-007-04 → `score.spec.ts`; RN-007-05 → `streak.spec.ts`; RN-007-07 → `reputation.reconcile.e2e-spec.ts` (cambio de versión); RN-007-08 → `reputation.facts.e2e-spec.ts`; RN-007-09 → `score.spec.ts`. RF-009-22 (cobros de un grupo congelado) → `reputation.facts.e2e-spec.ts`.

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Nadie puede crear el primer grupo (nadie tiene cobros) | Alta | Alto | Habilitación manual desde el hito 2 (spec 009 núcleo, CLI `host:enable`). |
| Diferencia entre la copia y el cálculo | Media | Medio | La habilitación y el detalle calculan en el momento; la reconciliación diaria mide la deriva (CA-007-14). |
| Manipulación subiendo comprobantes falsos | Media | Medio | «Comprobante inválido» mide con la última subida (RF-007-12); cobros de ingreso fuera. |
| Reglas de insignias cambian | Baja | Bajo | `RULES_VERSION` y recálculo total. |
| Una consulta de hechos lenta con muchos cobros | Baja | Bajo | Máximo ~100 cobros por usuario en 12 meses; índices de la spec 002. |

## 10. Trazabilidad

| Requisito | Cubierto en |
|---|---|
| RF-007-01 a RF-007-05 (calificación, "Nuevo", niveles, detalle, actualización) | §5 `computeReputation`, `levelFor`, `ReputationService`, `reconcile.job` |
| RF-007-06 a RF-007-08 (insignias) | §5 `BadgesService` (P2) |
| RF-007-09 a RF-007-11 (ranking) | §4, §5 `RankingService` (P2) |
| RF-007-12, RF-007-13 (correcciones) | §5 `punctualityInstant`, `isConsidered` |
| RF-007-14 (reportar/excluir) | §4, §5 `ReportsService` (P2) |
| RF-007-15 a RF-007-17 (habilitación) | §5 `meetsHostThreshold`, `checkHostRating`; adaptador de la spec 009 |
| RNF-007-01 a RNF-007-06 | §5, §6, §7 |
| RN-007-01 a RN-007-09 | §8 (pruebas de reglas) |
| CA-007-01 a CA-007-25 | §8 |
