# Plan técnico — Spec 002: Cobros y pagos

- **Spec relacionada:** `specs/002-cobros-y-pagos/spec.md` (debe estar **aprobada** por BD, Backend y Frontend)
- **Líder de la spec:** Leonardo Guzman (Backend)
- **Última actualización:** 2026-10-18
- **Artefactos:** [`research.md`](research.md) · [`data-model.md`](data-model.md) · [`contracts/api.md`](contracts/api.md) · [`quickstart.md`](quickstart.md)

| Capa | Responsable | Secciones | Visto bueno |
|---|---|---|---|
| Base de datos | Camila | §3 (y `data-model.md`) | aprobado |
| Backend | Leonardo | §4, §5, §7 | aprobado |
| Frontend | Adrian | §6 | aprobado |

## Constitución: verificación

| Principio | ¿Cumple? | Nota |
|---|---|---|
| I. Spec primero | Sí, con aclaraciones aprobadas | R1 (caídas largas y emisión tardía), R5 (grupo cerrado) y `specs/001/research.md` R1 (ciclo inicial), aprobadas el 2026-10-18. |
| II. Dinero exacto | Sí | Centavos enteros; el monto del cobro se copia del ciclo; `Σ cuotas = total` con `CHECK`. |
| III. Criterios verificables | Sí | CA-002-01 a 33 mapeados en §8. |
| IV. Seguridad | Sí | Archivos privados con URL firmada, tipo real por firma binaria, `403`/`404` según la tabla de acceso, referencias únicas. |
| V. Contratos primero | Sí | `data-model.md` y `contracts/api.md`. |
| VI. Simplicidad | Sí | Sin cola externa: tareas por tick + evaluación al actuar. |
| VII. Capas | Sí | Máquina de estados y cálculo en `domain/` puro; comunicación con otros módulos por puertos y eventos. |

## 1. Resumen de la solución

Módulo `billing` con tres responsabilidades: **generar** cobros por ciclo (idempotente y recuperable), **liquidarlos** (subida de comprobante, confirmación, rechazo, pago manual, cancelación) y **marcar atrasos** retirando al miembro. La máquina de estados es una función pura (`transition(status, action, ctx)`), repetida como disparador en la base. Todo cambio de estado ocurre en una transacción con bloqueo de fila, escribe un evento en `charge_events` y publica un evento interno para avisos (005) y reputación (007). El frontend muestra "Mis cobros", el detalle de cobro con la subida en pocos toques y la pantalla del grupo con resumen e historial.

## 2. Decisiones técnicas

| Decisión | Opción elegida | Alternativas descartadas | Motivo |
|---|---|---|---|
| Disparo de la generación | Cada tick evalúa el estado esperado (`research.md` R1) | Cron diario a las 00:00 | Render gratuito se duerme; hay que recuperarse solo (CA-002-22). |
| Atrasos | Tarea por tick + `sweepGroup` al actuar (R2) | Solo tarea | Resultado correcto aunque la tarea no haya corrido. |
| Estado | `text CHECK` + función pura + disparador de transiciones | `ENUM`; solo servicio | Constitución VII y integridad (CA-002-21). |
| Concurrencia | `SELECT … FOR UPDATE` del cobro + `version` opcional | Optimista solo | CA-002-19: una acción gana, la otra recibe `409`. |
| Referencias | `payment_references` con índice parcial (R3) | Índice sobre `receipts` | Se comparte con solicitudes de ingreso (010). |
| Archivos | Subida en 4 pasos con compensación (R4) | Subir y luego validar | El estado no cambia si falla el almacén (sección 9 de la spec). |
| Cierre del grupo | Cobros existentes se pueden saldar; no hay atrasos ni retiros (R5) | Congelar todo | Evita atrapar al titular. **Aprobada 2026-10-18.** |
| Cobro de ingreso | `createEntryCharge` lo llama la spec 010 dentro de su transacción | Evento asíncrono | Debe ser atómico con la entrada del miembro (RF-010-17). |
| Lectura para otros módulos | `BillingReadService` y `ChargeFactsPort` | SQL cruzado | `context/arquitectura.md`. |
| Retiro por mora | `MembershipService.removeMember(…, 'mora')` de la spec 001 | Borrar desde `billing` | Un solo dueño del dato de membresía. |

## 3. Modelo de datos — _Camila (BD)_

Detalle en [`data-model.md`](data-model.md): `billing_cycles` (0040), `charges` (0041), `receipts` y `payment_references` (0042), disparadores de integridad (0043) y `charge_events` de solo anexado (0044). Pruebas de integridad en `database/tests/billing.integrity.test.ts`. Seed de desarrollo: un ciclo con cobros en los cuatro estados no finales para probar la interfaz.

### Ajustes al modelo aprobados el 2026-10-19 (`/speckit-analyze`)

H1 (CHECK de estados en `charge_events`), H2 (estado inicial según el origen), H3 (copia del cobro igual a la del ciclo), H4 (la base es `floor` y el resto lo asume el titular), M1 (cobros finales de solo lectura y `first_submitted_at` inmutable), M2 (`period` y `due_date` atados a `cut_date`) y M3 (el seed pasa a T047). Detalle en `data-model.md` §1 y §4.

Para el backend: `ensureCurrentCycle` calcula el siguiente corte a partir del último `cut_date` del grupo (spec 001, PR #43 M5); la generación copia en cada cobro la copia del ciclo con `amount_cents = base_share_cents`; el cobro de ingreso se inserta ya `pagado` con `settlement = 'ingreso'`; un cobro `pagado` o `cancelado` ya no se actualiza.

## 4. Contratos de API — _Leonardo (Backend)_

Detalle en [`contracts/api.md`](contracts/api.md): `GET /me/charges`, `GET /charges/:id`, `POST /charges/:id/receipts`, `GET /charges/:id/receipts/:rid/file`, `POST /charges/:id/{confirm,reject,manual-payment,cancel}`, `GET /groups/:id/charges`, `GET /groups/:id/billing/summary`.

> **Contrato congelado** al aprobarse este plan. Los cambios se hacen por PR sobre este archivo y avisando a las otras dos capas.

## 5. Lógica de dominio — _Leonardo (Backend)_

### Estructura

```text
backend/src/modules/billing/
├── controllers/   charges.controller.ts, group-billing.controller.ts
├── services/      billing-cycles.service.ts, charges.service.ts, receipts.service.ts,
│                  overdue.service.ts, payment-reference.service.ts, billing-read.service.ts,
│                  billing-jobs.ts (registro de tareas), retention.service.ts
├── domain/        charge-state.ts, cycle-calculation.ts, due-date.ts, punctuality.ts,
│                  reference.ts, file-signature.ts, access.ts
├── ports/         (usa los puertos de subscriptions) + reputation-inputs.port.ts
└── repositories/  cycles.repository.ts, charges.repository.ts, receipts.repository.ts,
                   events.repository.ts, payment-references.repository.ts
```

### Funciones puras

| Función | Entradas → salida | Reglas |
|---|---|---|
| `transition(status, action, ctx)` | → `{ to, event }` o error `INVALID_TRANSITION` | Tabla RN-002-01 completa: `generate`, `entryPaid`, `uploadReceipt`, `markOverdue`, `confirm`, `reject` (`ctx.now >= ctx.dueAt` decide `pendiente`/`atrasado`), `manualPayment`, `cancel`. Cualquier otra combinación falla (CA-002-21). |
| `buildCycle(group, memberCount, cutDate, now)` | → ciclo con cuotas | Usa `computeTotalBsCents` y `splitShares` de la spec 001; `Σ = total`. |
| `chargeFromCycle(cycle, userId, now)` | → cobro | `amount = base_share`; copia de precio, moneda, tipo de cambio, total y miembros (RF-002-02). |
| `dueAtFor(cutDate, issuedAt)` | → instante | Spec 001 `research.md` R2: el mayor entre el inicio del día corte+4 y `issuedAt + 3 días` (RF-002-03). |
| `isOverdue(charge, now)` | → boolean | `now >= dueAt`. |
| `isPunctual(firstSubmittedAt, dueAt)` | → boolean | `firstSubmittedAt < dueAt` (equivale a `<= 23:59:59`, RN-002-05, RN-007-06). |
| `punctualityDate(receipts, events)` | → instante | RF-007-12: primera subida, o la última si hubo rechazo con `invalidReceipt`. |
| `normalizeReference(text)` | → `reference_key` | Mayúsculas, recorte, colapso de espacios (R3). |
| `detectFileType(bytes)` | → `jpeg \| png \| pdf \| null` | Firma binaria (R4). |
| `resolveAccess({ user, charge, group, membership })` | → `titular \| dueno \| dueno_retirado \| miembro \| ninguno` | Tabla de acceso del contrato. |
| `allowedActions(access, status, groupState)` | → lista | Sirve a `allowedActions` (el frontend no decide). |

### Servicios

- **`BillingCyclesService.ensureCurrentCycle(tx, groupId, now)`** (nombre interno `generateForGroup`): bloquea el grupo (`FOR UPDATE`), calcula el último corte regular `≤ now` con `lastCutAtOrBefore` (spec 001), guarda `owner_id` (titular de ese momento, para la spec 006), sale si el grupo está cerrado o congelado o si ya existe un ciclo de ese período (incluido el `inicial` del mismo período, spec 001 `research.md` R1); crea el ciclo y un cobro por miembro activo que no sea el titular, publica `ChargeGenerated` por cobro. También cierra (`finalized_at`) el ciclo inicial. Lo llaman la tarea `billing.generate` y la spec 010.
- **`ChargesService`**: `confirm`, `reject`, `manualPayment`, `cancel` y `createEntryCharge`. Cada uno: bloquea el cobro, ejecuta `sweepGroup` antes, valida acceso, estado de grupo y `version`, aplica `transition`, escribe el evento, publica el evento interno. `createEntryCharge` ubica el ciclo del período con `ensureCurrentCycle` (si faltara) y, si ya existe un cobro no cancelado de la persona en ese período, no crea otro (la spec 010 lo evita antes).
- **`ReceiptsService.upload`**: pasos de `research.md` R4; reserva la referencia con `PaymentReferenceService`; si reemplaza, libera la anterior y deja la antigua `reemplazado`; fija `first_submitted_at` solo la primera vez. `fileUrl` valida acceso y emite la URL firmada.
- **`OverdueService.sweep(now)` y `sweepGroup(groupId, now)`**: por cada cobro `pendiente` con `due_at <= now` de un grupo activo y no congelado: transición a `atrasado`, evento `atrasado`; si el usuario sigue siendo miembro activo, `MembershipService.removeMember(tx, groupId, userId, 'mora')` y evento `retiro_por_mora`; publica `ChargeBecameOverdue` y `MemberRemovedForNonPayment`. Procesa cada grupo en su transacción con bloqueo de aviso (`pg_try_advisory_xact_lock`).
- **`RetentionService`**: cobros de grupos con `closed_at < now − 2 meses`: borra del almacén los archivos de comprobantes con `file_deleted_at IS NULL` y marca la fecha (CA-002-33). La retención de solicitudes (spec 010) es independiente.
- **Tareas registradas:** `billing.generate`, `billing.overdue`, `billing.retention` (ver contrato). Todas escriben en `job_runs`.

### Eventos

Publica `ChargeGenerated`, `ChargeSubmitted`, `ChargeConfirmed`, `ChargeRejected`, `ChargeCancelled`, `ChargeBecameOverdue`, `MemberRemovedForNonPayment`. Escucha `GroupCreated` (spec 001): crea el **ciclo inicial** del grupo con las cuotas de un solo miembro, y `MemberAdded`/`MemberRemoved` para recalcular el ciclo inicial mientras no esté finalizado.

## 6. Interfaz de usuario — _Adrian (Frontend)_

| Ruta | Rol | Contenido | Endpoints |
|---|---|---|---|
| `/cobros` ("Mis cobros") | Usuario | Lista de mis cobros con filtro por estado y período; cada tarjeta: servicio, monto "Bs 25,50", vencimiento, insignia de estado. Los cobros `atrasado` de grupos de los que fui retirado aparecen con el aviso "Ya no perteneces a este grupo; paga tu deuda para limpiar tu historial". | `GET /me/charges` |
| `/cobros/[id]` | Dueño o titular | Detalle: monto, **datos de pago del grupo** (texto y QR con botón copiar; aviso si no hay), vencimiento con cuenta regresiva, estado, línea de tiempo y motivo del último rechazo. Botones según `allowedActions`. **Subir comprobante en ≤ 3 toques:** (1) "Subir comprobante" abre la cámara/galería, (2) campos método y referencia (obligatoria), (3) "Enviar". Vista previa, límite 5 MB, JPG/PNG/PDF (validación del cliente solo como ayuda). Titular: **Confirmar**, **Rechazar** (modal con motivo y casilla «comprobante inválido»), **Pago en efectivo**, **Cancelar** (modal con motivo). Ver comprobante: pide la URL firmada y la abre en una pestaña nueva. | `GET /charges/:id`, `POST …/receipts`, `GET …/file`, acciones |
| `/grupos/[id]` → pestaña **Cobros** | Miembro / titular | Selector de período; **resumen del mes** (estado y monto por miembro; el titular ve además los totales esperado/cobrado/pendiente/atrasado) e **historial** paginado con línea de tiempo por cobro. El titular tiene una cola "Por revisar" con los `en_revision`. Sin comprobantes ni referencias ajenos. | `GET /groups/:id/billing/summary`, `GET /groups/:id/charges` |

### Reglas de UX
- Todos los montos con `formatBs(cents)` (`Bs 25,50`); las fechas se muestran en America/La_Paz; ningún cálculo en el cliente.
- Estados con color **y** texto (accesibilidad): pendiente (ámbar), en revisión (azul), pagado (verde), atrasado (rojo), cancelado (gris).
- Error `409 REFERENCE_ALREADY_USED`: "Esa referencia ya fue usada en este grupo". `409 STALE_STATE`: recarga el cobro y avisa. `503`: "No pudimos guardar el archivo, intenta de nuevo" (el cobro no cambió).
- Estado vacío del titular: "Aún no hay cobros: se generan solos en la fecha de corte".

## 7. Seguridad y permisos — _Leonardo (Backend), con revisión de BD_

| Acción | Titular | Dueño del cobro | Otro miembro | Ajeno |
|---|---|---|---|---|
| Ver cobro completo / comprobante | Sí | Sí | `403` | `404` |
| Ver cobro en el historial (público) | Sí | Sí | Sí | `404` |
| Subir comprobante | No aplica (no tiene cobro) | Sí | `403` | `404` |
| Confirmar / rechazar / pago manual / cancelar | Sí | `403` | `403` | `404` |

- Archivos: solo imagen o PDF por **firma binaria**, 5 MB, clave generada por el servidor, espacio privado, URL firmada ≤ 10 min, PDF con `Content-Disposition: attachment`.
- Las referencias y los motivos son texto plano en la interfaz (sin HTML).
- Toda transición se valida en el servidor y en la base. Los motivos de rechazo y cancelación no se exponen en el historial público.
- Los registros (logs) no incluyen URLs firmadas, referencias ni nombres de archivo del usuario.

## 8. Estrategia de pruebas

| Criterio | Nivel | Capa | Test |
|---|---|---|---|
| CA-002-01 (3 miembros → 2 cobros) | Integración | BE | `billing.generate.e2e-spec.ts` |
| CA-002-02 (idempotencia) | Integración + integridad | BE, BD | `billing.generate.e2e-spec.ts`; `billing.integrity.test.ts` |
| CA-002-03 (día 31 en febrero) | Unitario + integración | BE | `cycle-calculation.spec.ts`; `billing.generate.e2e-spec.ts` |
| CA-002-04 (JPG 2 MB → en_revision + línea de tiempo) | Integración | BE | `receipts.upload.e2e-spec.ts` |
| CA-002-05 (6 MB / .exe) | Unitario + integración | BE | `file-signature.spec.ts`; `receipts.upload.e2e-spec.ts` |
| CA-002-06 (confirmar) | Integración | BE | `charges.review.e2e-spec.ts` |
| CA-002-07 (rechazar → pendiente / atrasado) | Integración | BE | `charges.review.e2e-spec.ts` |
| CA-002-08 (rechazo sin motivo) | Integración | BE | `charges.review.e2e-spec.ts` |
| CA-002-09 (pendiente vencido → atrasado) | Integración | BE | `billing.overdue.e2e-spec.ts` |
| CA-002-10 (en_revision vencido no cambia) | Integración | BE | `billing.overdue.e2e-spec.ts` |
| CA-002-11 (pagado no admite cambios) | Integración + unitario | BE | `charges.review.e2e-spec.ts`; `charge-state.spec.ts` |
| CA-002-12 (miembro no confirma el suyo → 403) | Integración | BE | `charges.permissions.e2e-spec.ts` |
| CA-002-13 (comprobante ajeno → 403) | Integración | BE | `charges.permissions.e2e-spec.ts` |
| CA-002-14 (pago manual) | Integración | BE | `charges.review.e2e-spec.ts` |
| CA-002-15 (cancelar atrasado) | Integración | BE | `charges.review.e2e-spec.ts` |
| CA-002-16 (cambio de tipo de cambio no altera el cobro) | Integración + integridad | BE, BD | `billing.snapshot.e2e-spec.ts`; `billing.integrity.test.ts` |
| CA-002-17 (resumen sin comprobantes ajenos) | Integración | BE | `billing.summary.e2e-spec.ts` |
| CA-002-18 (historial con línea de tiempo) | Integración | BE | `billing.summary.e2e-spec.ts` |
| CA-002-19 (acciones simultáneas) | Integración | BE | `charges.concurrency.e2e-spec.ts` (dos `confirm`/`cancel` en paralelo) |
| CA-002-20 (totales del titular) | Integración | BE | `billing.summary.e2e-spec.ts` |
| CA-002-21 (transiciones: estado × acción) | Unitario + integridad | BE, BD | `charge-state.spec.ts`; `billing.integrity.test.ts` |
| CA-002-22 (caída en la fecha de corte) | Integración | BE | `billing.generate.e2e-spec.ts` (con `FakeClock`) |
| CA-002-23 (ajeno → 404) | Integración | BE | `charges.permissions.e2e-spec.ts` |
| CA-002-24 (ingreso confirmado, la generación no duplica) | Integración | BE | `billing.entry-charge.e2e-spec.ts` |
| CA-002-25 (cobro de ingreso en el historial) | Integración | BE | `billing.entry-charge.e2e-spec.ts` |
| CA-002-26 (sin referencia) | Integración | BE | `receipts.upload.e2e-spec.ts` |
| CA-002-27 (referencia repetida, rechazada, otro grupo) | Integración + integridad | BE, BD | `receipts.reference.e2e-spec.ts`; `billing.integrity.test.ts` |
| CA-002-28 (atraso: retiro y avisos) | Integración | BE | `billing.overdue.e2e-spec.ts` (el aviso se verifica con 005) |
| CA-002-29 (en_revision no retira) | Integración | BE | `billing.overdue.e2e-spec.ts` |
| CA-002-30 (rechazo tras vencer: atrasado sin retiro) | Integración | BE | `charges.review.e2e-spec.ts` |
| CA-002-31 (retirado paga la deuda) | Integración | BE | `billing.debt.e2e-spec.ts` |
| CA-002-32 (retirado solo ve su deuda) | Integración | BE | `billing.debt.e2e-spec.ts` |
| CA-002-33 (retención de 2 meses) | Integración | BE | `billing.retention.e2e-spec.ts` |
| E2E flujo feliz (crear → invitar → cobrar → pagar → confirmar) | E2E | FE, BE | `frontend/e2e/mvp-flow.spec.ts` (coordinado con 001 y 010) |

Pruebas de reglas: RN-002-01 → `charge-state.spec.ts`; RN-002-02 → `billing.snapshot.e2e-spec.ts`; RN-002-03 → `billing.integrity.test.ts`; RN-002-04 → `cycle-calculation.spec.ts`; RN-002-05 → `punctuality.spec.ts`; RN-002-06 → `billing.retention.e2e-spec.ts`; RN-002-07 → `billing.debt.e2e-spec.ts`; RN-002-08 → `receipts.upload.e2e-spec.ts` y `punctuality.spec.ts`; RN-002-09 → `billing.generate.e2e-spec.ts`; RN-002-10 → `billing.entry-charge.e2e-spec.ts`; RN-002-11 → `billing.debt.e2e-spec.ts`.

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Servicio dormido en el corte o en el vencimiento | Alta (plan gratuito) | Alto | Tick externo cada 5 min + generación y atrasos evaluados al actuar (R1, R2). |
| Retiro injusto por una caída del servicio | Baja | Alto | Los atrasos se evalúan con `due_at` fijo; si el cobro se emitió tarde, el equipo puede cancelarlo; se evalúa la gracia por emisión tardía en el análisis. |
| Archivo huérfano en el almacén por un error posterior a la subida | Media | Bajo | Compensación inmediata; son privados y sin fila. |
| Cuota del ciclo inicial desactualizada | Media | Medio | Se recalcula con cada ingreso/salida mientras no esté finalizado (spec 001 R1); prueba en `billing.entry-charge`. |
| Cola de revisión del titular saturada con comprobantes falsos | Media | Medio | Rechazo con «comprobante inválido» (afecta reputación, spec 007); reclamos solo en ingreso (010). |
| Supabase gratuito pausado por inactividad | Media | Alto | Ping del tick; plan B en spec 000 (R3). |
| Cobro mensual que se «pierde» por una caída de más de un mes | Muy baja | Medio | Solo se genera el último período; advertencia en `job_runs` (R1). |

## 10. Trazabilidad

| Requisito | Cubierto en |
|---|---|
| RF-002-01 a RF-002-05 (generación, snapshot, vencimiento, idempotencia, grupos cerrados/baneados) | §5 `BillingCyclesService`, `data-model.md`, `research.md` R1 y R5 |
| RF-002-06 a RF-002-09 (comprobante, referencia, reemplazo, datos de pago) | §4, §5 `ReceiptsService`, `research.md` R3 y R4 |
| RF-002-10 a RF-002-13 (confirmar, rechazar, manual, cancelar) | §4, §5 `ChargesService` |
| RF-002-14 (atraso y retiro) | §5 `OverdueService`, `research.md` R2 |
| RF-002-15 a RF-002-18 (mis cobros, resumen, historial, totales del titular) | §4, §6 |
| RF-002-19 (cobro de ingreso) | §5 `createEntryCharge`, spec 010 |
| RNF-002-01 a RNF-002-07 | §7, `data-model.md` (disparadores, solo anexado), §6 (≤ 3 toques) |
| RN-002-01 a RN-002-11 | §8 (pruebas de reglas) |
| CA-002-01 a CA-002-33 | §8 |
