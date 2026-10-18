# Plan técnico — Spec 006: Panel y reportes

- **Spec relacionada:** `specs/006-panel-y-reportes/spec.md` (debe estar **aprobada** por BD, Backend y Frontend)
- **Líder de la spec:** Adrian Vargas (Frontend)
- **Última actualización:** 2026-10-18
- **Artefactos:** [`data-model.md`](data-model.md) · [`contracts/api.md`](contracts/api.md) · [`quickstart.md`](quickstart.md)
- **Prioridad:** P1. Depende de 001, 002 y 004 (precio individual de referencia, copiado por 001).

| Capa | Responsable | Secciones | Visto bueno |
|---|---|---|---|
| Base de datos | Camila | §3 (y `data-model.md`) | pendiente |
| Backend | Leonardo | §4, §5, §7 | pendiente |
| Frontend | Adrian | §6 | pendiente |

## Constitución: verificación

| Principio | ¿Cumple? | Nota |
|---|---|---|
| I. Spec primero | Sí, con tres aclaraciones | §2 decisiones 2, 3 y 5 (ámbito de «Debo» y «Me deben», cuota del titular en «pagado», ahorro sin tipo de cambio). |
| II. Dinero exacto | Sí | Totales en la base de datos con `bigint`; porcentaje con enteros; el CSV muestra el entero dividido en 100 sin `float`. |
| III. Criterios verificables | Sí | CA-006-01 a 22 mapeados en §8. |
| IV. Seguridad | Sí | Todo bajo `/me`; `404` para lo ajeno; sin comprobantes; CSV con celdas escapadas. |
| V. Contratos primero | Sí | `data-model.md` y `contracts/api.md`. |
| VI. Simplicidad | Sí | Cálculo en vivo con vistas; sin tablas ni cachés propios. |
| VII. Capas | Sí, con una excepción a confirmar | El módulo lee **vistas** definidas por la capa de BD (§2 decisión 1) en lugar de usar los repositorios de otros módulos. |

## 1. Resumen de la solución

Módulo `reports` que **solo lee**. La base de datos expone dos vistas (`v_user_cost_lines`, `v_group_collection`) con los gastos y la cobranza en centavos a partir de las copias guardadas en cada ciclo y cobro. El backend arma el resumen, los gráficos, el calendario, el historial y los CSV con consultas de agregación y funciones puras (ahorro, porcentaje, calendario, escape de CSV). El frontend muestra el panel con Recharts y una tabla alternativa para cada gráfico. Se entrega en tres partes: **A** resumen y cobranza, **B** gráficos y calendario, **C** historial y exportación.

## 2. Decisiones técnicas

| # | Decisión | Opción elegida | Alternativas descartadas | Motivo |
|---|---|---|---|---|
| 1 | Acceso a datos | Vistas de lectura en la base + repositorio de `reports` que solo consulta `v_*` y agregados | Llamar servicios de 001 y 002 por cada dato; tablas resumen | RNF-006-06 pide totales en la base; evita N consultas (RNF-006-01). **Excepción** a «nunca los repositorios de otros módulos»: no hay escritura y la forma de los datos es propiedad de la capa de BD. A confirmar con las tres capas. |
| 2 | Alcance de «Debo» y «Me deben» | **Todos los períodos** (deuda vigente), sin importar el mes elegido | Solo el mes elegido | Una deuda atrasada de hace dos meses sigue siendo deuda (HU-006-03); el mes elegido manda en gasto, ahorro, gráficos y cobranza. |
| 3 | Cuota del titular en «pagado» | `paidCents = null` para el titular; no suma al «pagado» del total | Contarla como pagada | No existe cobro propio del titular (RN-001-10): su cuota es de referencia. |
| 4 | Cuota de referencia del titular por mes | `billing_cycles.owner_share_cents` de todos los ciclos (incluye el inicial) | Solo ciclos regulares | RN-006-02 usa «el ciclo»; el ciclo inicial también tiene cuota de referencia. |
| 5 | Ahorro con precio individual en USD y grupo en Bs | «Sin dato» | Usar un tipo de cambio actual | Sin tipo de cambio guardado en el ciclo no hay copia fiel (RN-006-06). **A confirmar.** |
| 6 | Atribución al titular tras una transferencia | `billing_cycles.owner_id` (copia) | Usar `groups.owner_id` | Evita reescribir la historia (§1 de `data-model.md`). |
| 7 | Porcentaje cobrado | Entero con mitad hacia arriba: `floor((200·cobrado + esperado) / (2·esperado))` | `Math.round` sobre decimales | Sin errores binarios (CA-006-09: 60/90 → 67). |
| 8 | Frescura | Sin caché; `Cache-Control: private, no-store` | Caché de 1 min | RNF-006-02: un cambio de estado aparece en menos de 1 minuto sin lógica de invalidación. |
| 9 | Calendario futuro | Fechas con `adjustBillingDay` (spec 001) y cuota estimada con `splitShares` | Guardar un calendario | RN-001-06; los datos cambian con cada ingreso o salida. |
| 10 | Gráficos | Recharts, cargado con `next/dynamic` (sin SSR) y un botón «Ver tabla» por gráfico | Otra librería | Decidido en la spec (sección 11); el import dinámico reduce el peso inicial. |
| 11 | CSV | Generado en el servidor, en flujo, con BOM y escape de fórmulas | Generarlo en el navegador | RNF-006-04 y que el titular nunca reciba más datos de los permitidos. |
| 12 | Límites de la exportación | 10 por hora por usuario; tope de 20.000 filas | Sin límite | Abuso y memoria; valores propuestos, a confirmar. |
| 13 | Historial propio | Endpoint propio `/me/history` con todos los cobros propios | Reutilizar `GET /me/charges` | `/me/charges` omite cobros de grupos que dejó (spec 002) y aquí se necesita el historial completo. |

## 3. Modelo de datos — _Camila (BD)_

Detalle en [`data-model.md`](data-model.md): sin tablas nuevas; vistas `v_user_cost_lines` y `v_group_collection` (0100), índices (0101) y rol de lectura (0102). Cambio pedido a la spec 002: `billing_cycles.owner_id`. Pruebas en `database/tests/reports.integrity.test.ts`.

## 4. Contratos de API — _Leonardo (Backend)_

Detalle en [`contracts/api.md`](contracts/api.md): `GET /me/dashboard`, `/me/dashboard/lists`, `/me/dashboard/charts`, `/me/calendar`, `/me/calendar/upcoming`, `GET /groups/:groupId/collection`, `GET /me/history`, `…/export.csv` (propio y del grupo).

> **Contrato congelado** al aprobarse este plan. Los cambios se hacen por PR sobre este archivo y avisando a las otras dos capas.

## 5. Lógica de dominio — _Leonardo (Backend)_

### Estructura

```text
backend/src/modules/reports/
├── controllers/   dashboard.controller.ts, calendar.controller.ts, history.controller.ts, export.controller.ts
├── services/      dashboard.service.ts, charts.service.ts, calendar.service.ts, history.service.ts, export.service.ts
├── domain/        savings.ts, collection.ts, months.ts, calendar-events.ts, csv.ts
└── repositories/  reports.repository.ts      (solo vistas v_* y agregados)
```

### Funciones puras

| Función | Reglas |
|---|---|
| `savingsForLine(individualBsCents \| null, shareCents)` | `individual − cuota`; `null` si no hay dato (RN-006-03, CA-006-04, 05). |
| `summarizeSavings(lines)` | Total, `withoutData`, nota si hay negativos (CA-006-21). |
| `percentCollected(collected, expected)` | Entero con mitad hacia arriba; `null` si `expected = 0` (CA-006-09). |
| `lastMonths(endPeriod, firstDataPeriod, n = 12)` | Meses consecutivos sin huecos, hasta 12, desde el primer mes con datos (CA-006-11). |
| `cumulative(series)` | Acumulado de ahorro (`null` cuenta como 0 en el acumulado pero se marca «sin dato»). |
| `calendarEventsFor(month, groups, cycles, charges, today)` | Cortes con `adjustBillingDay`, vencimientos de cobros abiertos, estimados con `splitShares`; grupos cerrados solo en meses pasados (CA-006-13). |
| `daysLate(dueDate, today)` | Días de atraso en calendario de La Paz. |
| `csvEscapeCell(text)` | Comillas RFC 4180; antepone `'` si empieza con `=`, `+`, `-`, `@`, tabulación o retorno (RNF-006-04, CA-006-16). |
| `formatCsvAmount(cents)` | `25.50` sin separador de miles, sin `float` (RF-006-15). |
| `buildCsv(rows, columns)` | BOM UTF-8 + encabezado + filas; fechas `AAAA-MM-DD` de La Paz (CA-006-15). |

### Servicios

- **`DashboardService.summary(userId, { month, groupId })`**: valida que `groupId` pertenezca al usuario (`404` si no) con `SubscriptionMembershipQuery`; ejecuta en paralelo las consultas de gasto/ahorro (vista), deudas, «me deben», cobranza y meses disponibles; arma `DashboardSummary` y `isEmpty`.
- **`DashboardService.list(...)`**: listas paginadas por cursor (`debts`, `in_review`, `owed`).
- **`ChartsService`**: tres series con un solo viaje a la base; rellena meses sin datos con 0.
- **`CalendarService`**: junta ciclos existentes (pasado y actual) y cálculos para el futuro, y aplica `calendarEventsFor`.
- **`HistoryService`**: historial propio y filtros; **`ExportService`**: CSV en flujo (cursor de base) con el límite de filas y `rate_limit_events` (cubo `export:user`); titular exportando el grupo (`403` miembro, `404` ajeno).
- **Seguridad de consulta:** todos los repositorios reciben el `userId` del token; nunca se leen identificadores de usuario del cuerpo o la ruta.

## 6. Interfaz de usuario — _Adrian (Frontend)_

| Ruta / componente | Rol | Contenido | Endpoints | Parte |
|---|---|---|---|---|
| `/panel` | Usuario | Selector de mes y filtro por suscripción; tarjetas **Gasto del mes** (con «pagado»), **Ahorro estimado** (rotulado «estimado»; «sin dato»; nota si es negativo), **Debo** (con sección aparte «En revisión»), **Me deben** (solo titular); lista de deudas con botón «Subir comprobante» (`/cobros/[id]`); estado vacío con «Crear un grupo» y «Unirme con un código» | `GET /me/dashboard`, `…/lists` | A |
| `/panel` → **Cobranza** (titular) | Titular | Por grupo: esperado, cobrado, pendiente, barra con porcentaje en texto, lista de atrasados con enlace a revisar | `GET /me/dashboard` (`collection`) | A |
| `/panel` → **Gráficos** | Usuario | Barras de 12 meses, barras horizontales por servicio, ahorro acumulado; cada uno con **Ver tabla** (botón con `aria-pressed`), etiquetas de valor sobre las barras y patrones además del color; cargado con `next/dynamic` | `GET /me/dashboard/charts` | B |
| `/panel/calendario` | Usuario | Cuadrícula del mes (celdas con eventos de corte y vencimiento, texto + icono), lista **Próximos 30 días**, rol y monto («estimado» cuando corresponde) | `GET /me/calendar`, `…/upcoming` | B |
| `/panel/historial` | Usuario | Tabla con filtros (mes, suscripción, estado), «Cargar más» y botón **Exportar CSV** | `GET /me/history`, `GET /me/history/export.csv` | C |
| `/grupos/[id]` → pestaña **Cobranza** | Titular | Mes, resumen, tabla por miembro, filtro por miembro y **Exportar CSV del grupo** | `GET /groups/:id/collection`, `GET /groups/:id/charges` (spec 002), `GET …/history/export.csv` | A y C |

### Reglas de UX
- Primero celular: las tarjetas se apilan; los gráficos usan el ancho disponible (`ResponsiveContainer`) y rotan las etiquetas largas.
- Los montos vienen del servidor y se formatean con `formatBs`; el cliente no suma ni calcula porcentajes (excepto mostrar el recibido).
- El porcentaje, los estados y las series se entienden sin color (texto, iconos y patrones).
- Al volver a la pestaña o tras una acción del usuario (pagar, subir comprobante) el panel se recarga; no hay sondeo.
- Errores `429` de exportación muestran el tiempo de espera.

## 7. Seguridad y permisos — _Leonardo (Backend), con revisión de BD_

- Aislamiento: nada se consulta por un usuario distinto del de la sesión (CA-006-18); el titular ve nombres, montos y estados de **sus** grupos, nunca comprobantes ni referencias (RNF-006-03).
- El CSV del grupo exige ser titular; un miembro recibe `403` (CA-006-17).
- Inyección de fórmulas: se escapa todo texto libre exportado (nombre de miembro y de grupo, servicio) (CA-006-16).
- Los registros (logs) no incluyen contenido de exportaciones; solo usuario, filtros y número de filas.
- Las vistas no exponen columnas sensibles (sin cédula, celular ni comprobantes).

## 8. Estrategia de pruebas

| Criterio | Nivel | Capa | Test |
|---|---|---|---|
| CA-006-01 (Bs 30,00 + Bs 25,50 = Bs 55,50) | Integración | BE | `dashboard.spend.e2e-spec.ts` |
| CA-006-02 (cancelado no suma) | Integración + integridad | BE, BD | `dashboard.spend.e2e-spec.ts`; `reports.integrity.test.ts` |
| CA-006-03 (cuota de referencia del titular) | Integración + integridad | BE, BD | `dashboard.spend.e2e-spec.ts`; `reports.integrity.test.ts` |
| CA-006-04 (ahorro Bs 49,60) | Unitario + integridad | BE, BD | `savings.spec.ts`; `reports.integrity.test.ts` |
| CA-006-05 (sin precio individual → «sin dato») | Unitario + integración | BE | `savings.spec.ts`; `dashboard.savings.e2e-spec.ts` |
| CA-006-06 (Debo = Bs 25,00) | Integración | BE | `dashboard.debts.e2e-spec.ts` |
| CA-006-07 (en revisión aparte) | Integración | BE | `dashboard.debts.e2e-spec.ts` |
| CA-006-08 (Me deben suma 5 cobros por grupo) | Integración | BE | `dashboard.owed.e2e-spec.ts` |
| CA-006-09 (67 % y Bs 30,00 pendientes) | Unitario + integración | BE | `collection.spec.ts`; `dashboard.owed.e2e-spec.ts` |
| CA-006-10 (cambio de tipo de cambio no altera meses pasados) | Integración + integridad | BE, BD | `dashboard.history.e2e-spec.ts`; `reports.integrity.test.ts` |
| CA-006-11 (14 meses → últimos 12) | Unitario + integración | BE | `months.spec.ts`; `dashboard.charts.e2e-spec.ts` |
| CA-006-12 (tabla = gráfico) | E2E | FE | `frontend/e2e/panel-charts.spec.ts` |
| CA-006-13 (día 31 en febrero → 28/29) | Unitario + integración | BE | `calendar-events.spec.ts`; `calendar.e2e-spec.ts` |
| CA-006-14 (estado vacío) | Integración + E2E | BE, FE | `dashboard.empty.e2e-spec.ts`; `frontend/e2e/panel-empty.spec.ts` |
| CA-006-15 (acentos y montos numéricos) | Unitario + integración | BE | `csv.spec.ts`; `export.e2e-spec.ts` |
| CA-006-16 (`=CMD()` escapado) | Unitario + integración | BE | `csv.spec.ts`; `export.e2e-spec.ts` |
| CA-006-17 (miembro exporta el grupo → 403) | Integración | BE | `export.e2e-spec.ts` |
| CA-006-18 (panel ajeno → 404) | Integración | BE | `dashboard.access.e2e-spec.ts` |
| CA-006-19 (< 1 s p95 con 20 suscripciones y 12 meses) | Rendimiento | BE | `dashboard.perf-spec.ts` (siembra 20 × 12) |
| CA-006-20 (pagado se refleja en menos de 1 min) | Integración | BE | `dashboard.freshness.e2e-spec.ts` |
| CA-006-21 (ahorro negativo: signo y nota) | Unitario + E2E | BE, FE | `savings.spec.ts`; `frontend/e2e/panel-savings-negative.spec.ts` |
| CA-006-22 (Σ desglose = total) | Integración + integridad | BE, BD | `dashboard.spend.e2e-spec.ts`; `reports.integrity.test.ts` |

Pruebas de reglas: RN-006-01 → `dashboard.spend.e2e-spec.ts` (cobro pagado en otro mes cuenta en su período); RN-006-02 a 05 → los de arriba; RN-006-06 → `dashboard.history.e2e-spec.ts`; RN-006-07 → `dashboard.history.e2e-spec.ts` (cancelado en historial pero no en totales).

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Consultas lentas con 20 suscripciones × 12 meses | Media | Medio | Índices de `0101`, consultas en paralelo y prueba de rendimiento en CI; si no alcanza, vista materializada por usuario y mes con refresco al confirmar un pago. |
| Dependencia de `owner_id` en `billing_cycles` (spec 002) | Alta | Medio | Ya está en el modelo de 002; la tarea de BD de esta spec comprueba que la migración 0040 lo incluya. |
| Interpretaciones distintas de «Debo» (mes vs. todos) | Media | Bajo | Decisión 2 en revisión; el cambio sería de una consulta. |
| CSV abierto en Excel con fórmulas | Baja | Alto | Escape de fórmulas con pruebas (CA-006-16). |
| Peso de Recharts en celulares | Media | Bajo | Carga diferida (`next/dynamic`) y tabla como alternativa. |
| Usuarios con meses en grupos cerrados | Baja | Bajo | Los cobros de grupos cerrados siguen en las vistas; el calendario futuro los omite. |

## 10. Trazabilidad

| Requisito | Cubierto en |
|---|---|
| RF-006-01 a RF-006-06 (resumen y cobranza) | §4, §5 `DashboardService`, `data-model.md` |
| RF-006-07 a RF-006-10 (gráficos) | §4 (`charts`), §6 |
| RF-006-11, RF-006-12 (calendario) | §4, §5 `CalendarService`, `calendar-events` |
| RF-006-13 a RF-006-15 (historial y CSV) | §4, §5 `HistoryService`, `ExportService`, `csv` |
| RF-006-16 (estado vacío) | §5 `isEmpty`, §6 |
| RNF-006-01 a RNF-006-06 | §2, §5, §7, §8 |
| RN-006-01 a RN-006-07 | §2, `data-model.md`, §8 |
| CA-006-01 a CA-006-22 | §8 |
