# Tareas — Spec 010: Solicitudes de ingreso y chat

- **Spec:** `spec.md` · **Plan:** `plan.md` · **Modelo:** `data-model.md` · **Contrato:** `contracts/api.md` · **Investigación:** `research.md` · **Guía:** `quickstart.md`
- Capas: **BD** = Camila · **BE** = Leonardo · **FE** = Adrian. Cada tarea pertenece a **una** sola capa.
- Formato: `- [ ] Tnnn [P] [USn] [CAPA] Descripción con ruta — Depende: … · Cubre: …`. Los commits citan la tarea: `feat(010): add entry payment confirm [T028]`.
- Historias: **US1** abrir una solicitud con el código y conversar con el titular (HU-010-01, HU-010-10) · **US2** datos de pago, cuota exacta y plazo (HU-010-02, HU-010-03) · **US3** subir el comprobante (HU-010-04) · **US4** confirmar, pagar en efectivo, rechazar y cancelar (HU-010-05) · **US5** fotos en el chat (HU-010-06) · **US6** reclamos y sanción (HU-010-07, HU-010-08, HU-010-09) · **US7** vencimientos, recordatorios y eventos de otros módulos (RF-010-14, RF-010-19, RN-010-09).
- Prioridad P0. Depende de las specs 000, 001 (`InviteCodeService`, `MembershipService.addMemberTx`, `entryWindow`), 002 (`ensureCurrentCycle`, `PaymentReferenceService`, `createEntryCharge`) y 003. Los reclamos (US6) y los avisos usan el **núcleo mínimo** de las specs 009 (`BanPort`, `AuditPort`, cola de reclamos) y 005 (avisos en la app); ese núcleo entra en el hito MVP.
- **Aclaraciones aprobadas el 2026-10-18:** `research.md` R6 (RN-010-13 ampliada a cualquier cobro abierto del solicitante en el grupo) y los cambios que pide la spec 008 (T036).

## Fase 1: Base común (modelo y dominio puro)

- [x] T001 [BD] Escribir primero `database/tests/join-requests.integrity.test.ts` con las 13 pruebas de `data-model.md` §3: una solicitud activa por persona y grupo y máximo 5 activas (también concurrentes); miembro activo, grupo cerrado o congelado fallan; matriz estado × estado de RN-010-05; estado final inmutable; `quote_*` inmutables y `extended_at` una sola vez; comprobante de 6 MB, `mime` no permitido y referencia vacía; `aceptada` exige `charge_id` y `rejected_as_false` solo en `rechazada`; `join_request_events` rechaza `UPDATE` y `DELETE`; `join_messages` rechaza `UPDATE` y `DELETE` sin `vaquita.allow_purge`; mensaje de 0 o 1001 caracteres o sin texto ni imagen; dos reclamos de la misma parte y segunda respuesta; reclamo resuelto inmutable — Depende: spec 001 T004, spec 002 T006 · Cubre: CA-010-03, CA-010-21, CA-010-23, CA-010-25, CA-010-26, CA-010-35, CA-010-40, CA-010-42, RN-010-05, RN-010-08, RF-010-17, RF-010-22
- [x] T002 [BD] Migración `database/migrations/0050_join_requests.sql` según `data-model.md` §1: estados, plazos (`open_deadline_at`, `pay_deadline_at`, `decision_deadline_at`, `reminder_sent_at`), copia de la cotización (`quote_*`), datos de pago y QR copiados, comprobante, `charge_id`, `listing_id` (sin FK; la agrega la spec 008), `version`; índices únicos parciales para una activa por persona y grupo; y `0054_join_request_triggers.sql` con los disparadores de data-model §1: estado inicial `abierta` (L1), transición válida, inmutabilidad de `quote_*`, `extended_at` una sola vez, límite de 5 activas, no miembro y grupo abierto (sin control de capacidad en `join_requests`, H1) — Depende: T001 · Cubre: RF-010-02, RN-010-05, RN-010-10, RNF-010-05 (RF-010-20, RN-010-02 y RNF-010-04 —cupos y concurrencia de reservas— los impone el backend, H1)
- [x] T003 [BD] Migración `0051_join_request_events.sql`: línea de tiempo de solo anexado (`forbid_update_delete`) con tipo, autor (usuario o sistema), motivo y `metadata`; índices por solicitud y fecha — Depende: T002 · Cubre: RF-010-27, RNF-010-08, CA-010-35
- [x] T004 [BD] Migración `0052_join_messages.sql`: `join_messages` (`seq` identity global que ordena dentro de cada solicitud, texto 1–1000, imagen opcional con `mime` y tamaño, `CHECK` de al menos uno; sin `UPDATE`; `DELETE` solo con `vaquita.allow_purge`) y `join_request_reads` (`id` uuid, UNIQUE `(request_id, user_id)`, último `seq` leído por participante, H2); índice `(request_id, seq)` para `afterSeq` — Depende: T002 · Cubre: RF-010-05, RF-010-06, RF-010-09, CA-010-21, CA-010-23
- [x] T005 [BD] Migración `0053_join_disputes.sql`: `join_disputes` (parte que reclama, tipo `pago_sin_ingreso`/`comprobante_falso`, descripción, imagen, respuesta única, resolución `estafa_confirmada`/`sin_falta` con motivo de 10 a 300 caracteres, administrador y fecha; resuelto inmutable; una por parte y solicitud; `created_at`/`updated_at`, M1) — Depende: T002 · Cubre: RF-010-21, RF-010-22, RF-010-24, RN-010-08, CA-010-28
- [x] T006 [BD] Migración `0055_join_request_links.sql` (H1): clave foránea `charges.join_request_id → join_requests(id)` (pendiente de la spec 002) y UNIQUE parcial `charges_join_request_uq` (M2); clave foránea `group_members.join_request_id → join_requests(id)` y CHECK `((join_source = 'solicitud') = (join_request_id IS NOT NULL))` y UNIQUE parcial `group_members_join_request_uq` en `group_members` (spec 001, PR #43 H3; M2, M3) — Depende: T002, spec 002 T003 · Cubre: RN-010-03, RF-010-17
- [x] T007 [BD] Seed de desarrollo con una solicitud en cada estado activo (con chat) y una solicitud `rechazada` con un reclamo abierto (un reclamo solo existe sobre una solicitud final, M7) para probar la interfaz — Depende: T005, T006, spec 001 T005, spec 002 T047 · Cubre: —
- [x] T008 [P] [BE] `modules/join-requests/domain/request-state.ts` (`transition(status, action, ctx)` con la tabla completa de RN-010-05 y las acciones `open`, `sendPaymentData`, `uploadProof`, `cashPayment`, `confirm`, `reject`, `cancel`, `expire`, `systemReject`, `systemCancel`; el resto → `INVALID_TRANSITION`) y `request-state.spec.ts` exhaustivo estado × acción — Depende: spec 000 T004 · Cubre: RN-010-05, RNF-010-05, CA-010-25
- [x] T009 [P] [BE] `domain/entry-quote.ts` (`quoteEntryShare(totalBsCents, currentMembers)` = `floor(total / (n + 1))`) y `slots.ts` (`availableSlots`) con `entry-quote.spec.ts` (Bs 90 y 2 miembros → 3000; Bs 100 → 3333) y `slots.spec.ts` — Depende: spec 001 T007 · Cubre: RN-010-01, RN-010-02, CA-010-04, CA-010-05
- [x] T010 [P] [BE] `domain/deadlines.ts` (`computeDeadlines`: 15 min de pago, prórroga de 15 una vez, 60 min de decisión, recordatorio a los 30, 24 h de solicitud abierta limitada por el fin de la ventana; valores de configuración) y `effective-state.ts` (`effectiveState(request, now)`; `pago_informado` vencido → `expirada`/`titular_sin_respuesta`; `abierta` fuera de ventana → `expirada`) con `deadlines.spec.ts` y `effective-state.spec.ts` — Depende: spec 001 T009 · Cubre: RN-010-06, RN-010-12, RNF-010-03, CA-010-09, CA-010-15, CA-010-39
- [x] T011 [P] [BE] `domain/can-open-request.ts` (`canOpenRequest(input)` → lista de reglas incumplidas: ventana, grupo activo/no congelado/recibiendo, cupo, no miembro, sin cobros abiertos en el grupo, 1 por grupo, ≤ 5 totales, cuenta sin restricción), `chat-rules.ts` (`validateChatMessage`, `unreadCount`) y `dispute-rules.ts` (`disputeEligibility`, ventana de 7 días desde `final_at`) con sus `*.spec.ts` — Depende: spec 000 T004 · Cubre: RF-010-01, RF-010-02, RF-010-05, RF-010-10, RF-010-21, RN-010-13, CA-010-21, CA-010-28
- [x] T012 [BE] Repositorios `repositories/{requests,events,messages,disputes}.repository.ts` (SQL con parámetros; `FOR UPDATE` por solicitud; orden de bloqueo solicitud → grupo), puertos `ports/{ban,audit,reputation-query}.port.ts` (con adaptador nulo para `ReputationQueryPort`: «Sin calificación») y los eventos internos (`JoinRequestOpened`, `PaymentDataSent`, `ProofSubmitted`, `DecisionReminderDue`, `JoinRequestAccepted`, `JoinRequestRejected`, `JoinRequestCancelled`, `JoinRequestExpired`, `ChatMessageSent`, `DisputeOpened`, `DisputeResponded`, `DisputeResolved`) — Depende: T005, spec 000 T056 · Cubre: RNF-010-04, RNF-010-08

**Punto de control (I1):** modelo y funciones puras disponibles; las specs 008 y 009 ya pueden apoyarse en `join_requests` y `join_disputes`.

## Fase 2: US1 — Abrir una solicitud con el código (Prioridad: P0) 🎯 MVP

**Meta:** quien tiene un código válido abre una solicitud (no entra al grupo todavía) y el titular recibe el aviso.
**Prueba independiente:** `POST /join-requests` con un código válido crea la solicitud `abierta`; con la ventana cerrada devuelve `ENTRY_WINDOW_CLOSED` con la fecha de apertura.

- [x] T013 [P] [US1] [BE] `backend/test/join-requests.open.e2e-spec.ts`: CA-010-01 (código válido), CA-010-02 (miembro, grupo cerrado, pausado o sin cupo), CA-010-03 (una por grupo y 5 en total), CA-010-37 (ventana cerrada con `opensAt`), CA-010-45 (retirado con deuda), RN-010-11 (regenerar o pausar no afecta a las abiertas), RN-010-13 y código inválido genérico con límite de intentos — Depende: T012 · Cubre: CA-010-01, CA-010-02, CA-010-03, CA-010-37, CA-010-45, RN-010-11, RN-010-13
- [x] T014 [US1] [BE] `services/join-requests.service.ts` `open(userId, code)`: `InviteCodeService.resolve` (spec 001), persiste vencimientos pendientes del solicitante, evalúa `canOpenRequest` con `entryWindow` y cupos, inserta con `open_deadline_at`, evento `abierta`, publica `JoinRequestOpened`; `controllers/join-requests.controller.ts` con `POST /join-requests`, `GET /join-requests`, `GET /join-requests/:id` (con `allowedActions`, `serverNow` y estado efectivo), `GET /groups/:groupId/join-requests` (cola del titular, más antigua primero) y `GET /me/join-requests/summary` — Depende: T013, T008, T010, T011, spec 001 T023 · Cubre: RF-010-01, RF-010-02, RF-010-03, RF-010-04, RF-010-26, RNF-010-01, RNF-010-03, RNF-010-07
- [x] T015 [P] [US1] [BE] `backend/test/join-requests.permissions.e2e-spec.ts` y `join-requests.timeline.e2e-spec.ts`: CA-010-20 (ajeno `404`, miembro no participante `403`), tabla de acciones por rol del plan §7 y CA-010-35 (línea de tiempo con tipo, autor y fecha, sin operaciones de edición) — Depende: T012 · Cubre: CA-010-20, CA-010-35, RF-010-27, RNF-010-01, RNF-010-02
- [x] T016 [US1] [BE] Línea de tiempo en `GET /join-requests/:id` y registro de cada cambio de estado en `join_request_events` dentro de la misma transacción — Depende: T014, T015 · Cubre: RF-010-27, RNF-010-08, CA-010-35
- [x] T017 [P] [US1] [FE] `/unirse` (campo de 8 caracteres en mayúsculas, acepta `?codigo=`, explicación solicitud → chat → pago → confirmación y el texto de RF-010-25, fecha de apertura si la ventana está cerrada) y `/solicitudes` («Mis solicitudes»: tarjetas con estado, cuota, cuenta regresiva y no leídos; filtro activas/historial) con mock — Depende: spec 000 T036 · Cubre: RF-010-01, RF-010-03, RF-010-25, RF-010-26, RNF-010-06
- [x] T018 [US1] [FE] Conectar `/unirse`, `/solicitudes` y la pestaña **Solicitudes** del titular en `/grupos/[id]` (cola con calificación, estado y plazo; cupos total/miembros/reservados; ventana abierta o fecha de apertura) con `POST /join-requests`, `GET /join-requests` y `GET /groups/:id/join-requests`; avisos de la barra con `GET /me/join-requests/summary` cada 30 s; errores por `code` — Depende: T014, T017 · Cubre: RF-010-26, RF-010-04

**Punto de control:** se puede abrir y ver una solicitud de punta a punta sin pago.

## Fase 3: US2 — Datos de pago, cuota exacta y plazo (Prioridad: P0) 🎯 MVP

**Meta:** el titular envía los datos de pago con la cuota exacta; se reserva un cupo y corre el plazo de 15 minutos.
**Prueba independiente:** `payment-data` fija la cuota cotizada, reserva el cupo y con un solo cupo y dos solicitudes solo una avanza.

- [x] T019 [P] [US2] [BE] `backend/test/join-requests.payment.e2e-spec.ts` (parte de datos de pago): CA-010-04 (Bs 90 → Bs 30), CA-010-26 (la cuota no cambia con el tipo de cambio), CA-010-38 (abierta a las 23:50 del día 3 sigue su curso), RN-010-10 (cambio de miembros no altera la cuota), `PAYMENT_INFO_MISSING`, y `join-requests.concurrency.e2e-spec.ts`: CA-010-06 (último cupo, dos solicitudes simultáneas) — Depende: T012 · Cubre: CA-010-04, CA-010-06, CA-010-26, CA-010-38, RN-010-10, RF-010-11, RF-010-12
- [x] T020 [US2] [BE] `services/entry-payment.service.ts` `sendPaymentData` (bloquea solicitud y luego grupo, comprueba ventana y cupos, cotiza con `quoteEntryShare`, copia datos de pago y QR a la solicitud con `FileStorage.copy`, fija el plazo, evento y `PaymentDataSent`) y `extend` (una sola vez, +15 min); `POST /join-requests/:id/payment-data` y `/extend`; `GET /join-requests/:id/payment-qr` con URL firmada — Depende: T019, T014, spec 000 T026 · Cubre: RF-010-11, RF-010-12, RF-010-28, RN-010-01, RN-010-02, RN-010-12, CA-010-04, CA-010-06, CA-010-26, CA-010-42
- [x] T021 [P] [US2] [BE] En `join-requests.payment.e2e-spec.ts` agregar CA-010-42 (la prórroga se concede una sola vez; la segunda → `ALREADY_EXTENDED`) — Depende: T019 · Cubre: CA-010-42
- [x] T022 [P] [US2] [FE] En `/solicitudes/[id]` con mock: cabecera (servicio, titular y calificación, cuota, plazo con cuenta regresiva corregida con `serverNow`), acciones del titular **Enviar datos de pago** (texto/QR del grupo o subir otro) y **Prorrogar**, y vista del solicitante con QR/texto y botón copiar monto; barra fija inferior en móvil — Depende: T017 · Cubre: RF-010-11, RF-010-28, RNF-010-06
- [x] T023 [US2] [FE] Conectar datos de pago y prórroga con el backend; al llegar la cuenta regresiva a 0 recargar la solicitud — Depende: T020, T022 · Cubre: RF-010-11, RF-010-28

## Fase 4: US3 — Subir el comprobante (Prioridad: P0) 🎯 MVP

**Meta:** el solicitante informa su pago con comprobante y referencia dentro del plazo.
**Prueba independiente:** subir un JPG de 2 MB con referencia deja la solicitud en `pago_informado`.

- [x] T024 [P] [US3] [BE] En `join-requests.payment.e2e-spec.ts` agregar CA-010-07 (comprobante a tiempo), CA-010-08 (6 MB y `.exe`), CA-010-10 (plazo vencido → `PAYMENT_DEADLINE_PASSED`), CA-010-40 (sin referencia), CA-010-41 (referencia repetida en el grupo, liberada tras rechazo) — Depende: T019 · Cubre: CA-010-07, CA-010-08, CA-010-10, CA-010-40, CA-010-41, RN-010-14
- [x] T025 [US3] [BE] `EntryPaymentService.uploadProof` (misma subida segura de la spec 002 T021: firma binaria, 5 MB, `PaymentReferenceService.reserve`, clave generada, compensación si falla; plazo de decisión de 60 min) con `POST /join-requests/:id/proof` y `GET /join-requests/:id/proof/file` (URL firmada ≤ 10 min) — Depende: T024, T020, spec 002 T021 · Cubre: RF-010-13, RN-010-14, RNF-010-02, CA-010-07, CA-010-08, CA-010-10, CA-010-40, CA-010-41
- [x] T026 [P] [US3] [FE] Subida del comprobante en `/solicitudes/[id]` con mock (método, referencia obligatoria, archivo JPG/PNG/PDF hasta 5 MB, vista previa) y errores `REFERENCE_ALREADY_USED`, `PAYMENT_DEADLINE_PASSED` y `503` — Depende: T022 · Cubre: RF-010-13
- [x] T027 [US3] [FE] Conectar la subida con `POST /join-requests/:id/proof` y «Ver comprobante» para el titular — Depende: T025, T026 · Cubre: RF-010-13

## Fase 5: US4 — Confirmar, efectivo, rechazar y cancelar (Prioridad: P0) 🎯 MVP

**Meta:** el titular confirma solo con el dinero recibido; la aceptación es atómica (miembro, cuotas y cobro de ingreso).
**Prueba independiente:** `confirm` deja `aceptada`, la persona es miembro, las cuotas se recalculan y existe un cobro de ingreso `pagado`.

- [x] T028 [P] [US4] [BE] `backend/test/join-requests.accept.e2e-spec.ts`: CA-010-11 (miembro, cuotas y cobro de ingreso), CA-010-12 (la generación no duplica el cobro), CA-010-13 (celulares mutuos), CA-010-16 (efectivo), CA-010-47 (se cancelan las abiertas del mismo servicio) y rollback total si falla cualquier paso (R2); `join-requests.decisions.e2e-spec.ts`: CA-010-17 (rechazar con y sin motivo) y CA-010-18 (cancelar solo en `abierta` y `esperando_pago`) — Depende: T012 · Cubre: CA-010-11, CA-010-12, CA-010-13, CA-010-16, CA-010-17, CA-010-18, CA-010-47, RF-010-17, RF-010-20, RN-010-03, RN-010-04
- [x] T029 [US4] [BE] `EntryPaymentService.confirm` y `cashPayment` con la secuencia atómica de `research.md` R2 (solicitud → grupo → `ensureCurrentCycle` → `addMemberTx` → `createEntryCharge` → `aceptada` con `charge_id` → cancelar las abiertas del mismo servicio), `reject` (motivo de 5 a 200, libera cupo y referencia, `rejectedAsFalse` opcional) y `cancel`; `POST /join-requests/:id/{confirm,cash-payment,reject,cancel}`; publica `JoinRequestAccepted{listingId?}`, `JoinRequestRejected` y `JoinRequestCancelled` — Depende: T028, T025, spec 001 T027, spec 002 T013, spec 002 T039 · Cubre: RF-010-15, RF-010-16, RF-010-17, RF-010-18, RF-010-20, RN-010-03, RN-010-04, CA-010-11, CA-010-12, CA-010-13, CA-010-16, CA-010-17, CA-010-18, CA-010-47
- [x] T030 [P] [US4] [FE] Acciones **Confirmar**, **Pago en efectivo**, **Rechazar** (modal con motivo y casilla «comprobante falso») para el titular y **Cancelar** para el solicitante, por `allowedActions`, con mock; texto fijo «Vaquita no custodia el dinero…» — Depende: T022 · Cubre: RF-010-15, RF-010-16, RF-010-17, RF-010-18, RF-010-25
- [x] T031 [US4] [FE] Conectar las acciones con el backend y manejar `409 STALE_STATE` y los errores por `code` — Depende: T029, T030 · Cubre: RF-010-17

## Fase 6: US5 — Chat con texto y fotos (Prioridad: P0) 🎯 MVP

**Meta:** solicitante y titular conversan con texto e imágenes; los mensajes no se editan ni se borran.
**Prueba independiente:** un mensaje de texto y una imagen JPG de 3 MB se ven en orden en menos de 10 segundos para ambos.

- [x] T032 [P] [US5] [BE] `backend/test/chat.e2e-spec.ts`: CA-010-19 (texto e imagen en orden), CA-010-21 (1.001 caracteres y PDF rechazados), CA-010-22 (`<script>` se guarda y devuelve como texto), CA-010-23 (no existe edición ni borrado), CA-010-24 (final → solo lectura, `CHAT_READ_ONLY`), límite de 20 por minuto (`RATE_LIMITED`) y contador de no leídos — Depende: T012 · Cubre: CA-010-19, CA-010-21, CA-010-22, CA-010-23, CA-010-24, RF-010-10
- [x] T033 [US5] [BE] `services/chat.service.ts` (`list(afterSeq)`, `send` con validación de acceso y estado, imagen JPG/PNG ≤ 5 MB por firma binaria, límite con `rate_limit_events` `chat_msg`, `markRead`, `imageUrl`) y `controllers/chat.controller.ts` (`GET/POST /join-requests/:id/messages`, `GET …/messages/:messageId/image`, `POST …/read`); publica `ChatMessageSent` — Depende: T032, T014 · Cubre: RF-010-05, RF-010-06, RF-010-07, RF-010-08, RF-010-09, RF-010-10, RNF-010-02
- [x] T034 [P] [US5] [FE] Chat en `/solicitudes/[id]` con mock: burbujas, imagen con vista previa, Enter para enviar, texto con `textContent`, sondeo cada 5 s pausado con la pestaña oculta, marca de leído al abrir, solo lectura en estados finales y chat a pantalla completa en móvil — Depende: T022 · Cubre: RF-010-05, RF-010-08, RF-010-09, RNF-010-06
- [x] T035 [US5] [FE] Conectar el chat con `messages` y `read` (imágenes con URL firmada al abrirlas) y manejar `RATE_LIMITED` y `CHAT_READ_ONLY` — Depende: T033, T034 · Cubre: RF-010-09

## Fase 7: Integración con la spec 008 (cupos libres)

- [x] T036 [BE] Cambios que pide la spec 008: `ports/listing-quota.port.ts` (`ListingQuotaPort.remainingOffered(tx, listingId)`, implementado por `listings` en `app-adapters/`), `JoinRequestsService.openFromListing(userId, listing, message)` (abre la solicitud desde una publicación con la misma lógica que `open`), `rejectOpenForListing(tx, listingId, reason)` (rechaza las solicitudes `abierta` de una publicación cerrada u ocultada), evento `JoinRequestAccepted{listingId?}` y validación de que aceptar no supera `slots_offered`; pruebas en `join-requests.listing.e2e-spec.ts` — Depende: T029, spec 008 · Cubre: RF-010-20, CA-010-06 (coherencia con cupos ofrecidos)

## Fase 8: US6 — Reclamos y sanción (Prioridad: P1 con núcleo en el MVP)

**Meta:** quien pagó y no fue agregado (o el titular que recibió un comprobante falso) abre un reclamo; un administrador decide con la evidencia.
**Prueba independiente:** un reclamo por `pago_sin_ingreso` aparece con la evidencia completa y `estafa_confirmada` banea a la persona acusada.

- [x] T037 [P] [US6] [BE] `backend/test/disputes.e2e-spec.ts`: CA-010-27 (reclamo por pago sin ingreso), CA-010-28 (sin pago informado, reclamo repetido o más de 7 días), CA-010-46 (imagen mayor de 5 MB o tipo no permitido), respuesta única; y `disputes.admin.e2e-spec.ts`: CA-010-29 (evidencia con auditoría; usuario normal `403`), CA-010-30 (estafa confirmada → baneo y bloqueo), CA-010-31 (`sin_falta`), CA-010-43 (comprobante falso → baneo del solicitante) — Depende: T012, spec 009 (núcleo `BanPort` y `AuditPort`) · Cubre: CA-010-27, CA-010-28, CA-010-29, CA-010-30, CA-010-31, CA-010-43, CA-010-46
- [x] T038 [US6] [BE] `services/disputes.service.ts` (`open`, `respond`, `list` para las partes; `getEvidence(adminId, disputeId)` y `resolve(adminId, disputeId, result, reason)` para administración; `estafa_confirmada` llama a `BanPort.ban` y todo registra en `AuditPort` en la misma transacción) y `controllers/disputes.controller.ts` (`POST/GET /join-requests/:id/disputes`, `POST …/response`) — Depende: T037, T029 · Cubre: RF-010-21, RF-010-22, RF-010-23, RF-010-24, RN-010-07, RN-010-08, RNF-010-08
- [x] T039 [P] [US6] [FE] Reclamos en `/solicitudes/[id]` con mock: botón «Abrir reclamo» si `canOpenDispute`, formulario con descripción e imagen, respuesta de la otra parte y decisión visible — Depende: T022 · Cubre: RF-010-21, RF-010-22, RF-010-25
- [x] T040 [US6] [FE] Conectar los reclamos con el backend — Depende: T038, T039 · Cubre: RF-010-21, RF-010-22

## Fase 9: US7 — Vencimientos, eventos y retención (Prioridad: P0)

**Meta:** los plazos se cumplen aunque el servicio esté dormido; los cierres, baneos y transferencias se reflejan en las solicitudes.
**Prueba independiente:** con `FakeClock` a 15 minutos de `esperando_pago`, la solicitud se lee como `expirada` y el cupo vuelve a estar disponible.

- [x] T041 [P] [US7] [BE] `backend/test/join-requests.deadlines.e2e-spec.ts`: CA-010-09 (vence sin tarea), CA-010-14 (recordatorio a los 30 min, una sola vez), CA-010-15 (60 min → `expirada`/`titular_sin_respuesta`), CA-010-38, CA-010-39 (`abierta` al cerrar la ventana) y RN-010-12; `join-requests.group-events.e2e-spec.ts`: CA-010-32 (cierre del grupo o titular baneado), CA-010-33 (no transferir con solicitudes en pago), CA-010-34 (suspendido o baneado); `join-requests.retention.e2e-spec.ts`: CA-010-44 — Depende: T012 · Cubre: CA-010-09, CA-010-14, CA-010-15, CA-010-32, CA-010-33, CA-010-34, CA-010-38, CA-010-39, CA-010-44, RN-010-09, RN-010-12
- [x] T042 [US7] [BE] `services/request-sweeper.ts` (tarea `joinRequests.sweep`: persiste vencimientos con `expireIfDue` por solicitud, en su transacción y con `SKIP LOCKED`; recordatorio de 30 min con `reminder_sent_at`; publica `JoinRequestExpired` y `DecisionReminderDue`), `retention.service.ts` (tarea `joinRequests.retention` diaria: elimina chat, imágenes y comprobantes 2 meses después del estado final o del reclamo resuelto, sin tocar los que tengan reclamo abierto; conserva línea de tiempo y decisión, con `vaquita.allow_purge`) y `expireIfDue` al abrir y consultar — Depende: T041, T029 · Cubre: RF-010-14, RF-010-19, RN-010-06, RNF-010-03, RNF-010-09, CA-010-09, CA-010-14, CA-010-15, CA-010-39, CA-010-44
- [x] T043 [US7] [BE] `services/group-events.handlers.ts`: `GroupClosed` y `UserBanned` del titular → activas a `rechazada` (`grupo_cerrado`, `titular_baneado`); `UserSuspended`/`UserBanned` del solicitante → `cancelada`; `OwnershipBlockersPort.hasPayingRequests` (spec 001) y `ReservedSlotsQuery.count` (spec 008) — Depende: T041, spec 001 T036 · Cubre: RN-010-09, CA-010-32, CA-010-33, CA-010-34

## Fase 10: Integración, seguridad y cierre

- [x] T044 [BE] Conectar los avisos de la spec 005 parte A a los eventos de este módulo (apertura, datos de pago, comprobante, recordatorio, decisión, reclamo) y verificar CA-010-14 con ella — Depende: T042, spec 005 (parte A) · Cubre: RF-010-04, CA-010-14
- [x] T045 [BE] Revisión de seguridad: tabla de acciones por rol del plan §7, archivos con firma binaria y URL firmada ≤ 10 min, registros sin texto de mensajes, referencias, URLs firmadas ni nombres de archivo, cuota y plazos solo del servidor — Depende: T038, T043 · Cubre: RNF-010-01, RNF-010-02, RNF-010-08
- [x] T046 [FE] E2E `frontend/e2e/join-request.spec.ts` (chat en ≤ 10 s, `<script>` como texto: CA-010-19, CA-010-22) y flujo feliz `mvp-flow.spec.ts` del MVP (CA-010-36), coordinado con las specs 001 y 002 — Depende: T031, T035, spec 002 T043 · Cubre: CA-010-19, CA-010-22, CA-010-36
- [x] T047 [FE] Accesibilidad y móvil primero de `/unirse`, `/solicitudes` y `/solicitudes/[id]` (cuenta regresiva legible, acciones en barra fija, estados con color y texto) — Depende: T031, T035 · Cubre: RNF-010-06
- [x] T048 [BD] Revisar con Camila los índices con los planes de consulta de «Mis solicitudes» (50 solicitudes en menos de 500 ms), `afterSeq` del chat y el barrido de vencimientos con datos del seed — Depende: T007 · Cubre: RNF-010-07
- [x] T049 [BE] Ejecutar `/speckit-converge`: actualizar `spec.md`, `plan.md` y `research.md` con lo implementado (R6, cambios de 008) y marcar las tareas hechas — Depende: T046, T047, T048 · Cubre: —

## Dependencias y orden de ejecución

- **Fase 1** primero (T001–T012); T008–T011 son paralelas entre sí y con las migraciones.
- Orden de las historias: **US1 → US2 → US3 → US4** (flujo del MVP). **US5** (chat) solo necesita US1 y puede avanzar en paralelo con US2–US4. **US7** necesita T012 y T029. **US6** necesita el núcleo de la spec 009.
- Esta spec necesita de otras: spec 001 T023 (`InviteCodeService`), T027 (`addMemberTx`), T009 (`entryWindow`); spec 002 T013 (`ensureCurrentCycle`), T021 (`PaymentReferenceService`), T039 (`createEntryCharge`); spec 000 T026 (`FileStorage` con `copy`) y T056 (`TxEventBus`).
- La spec 008 necesita de esta: T014 (`open`), T029 (aceptación) y T036 (puertos).

## Ejemplos de paralelización

- Después de T002: T003 a T006 (BD) y T008 a T011 (BE) a la vez.
- Pruebas de historias: T013, T015, T019, T024, T028, T032, T037 y T041 pueden escribirse en paralelo antes de sus implementaciones.
- Frontend con mock: T017, T022, T026, T030, T034 y T039 en paralelo con el backend.

## Estrategia de implementación

1. **MVP primero:** Fase 1 → US1 → US2 → US3 → US4 → US5 → US7. Con eso el flujo «abrir, conversar, pagar, confirmar» funciona de punta a punta.
2. US6 (reclamos) entra cuando el núcleo de la spec 009 esté disponible; T036 cuando exista la spec 008.
3. R6 (cobros abiertos del solicitante) fue aprobada el 2026-10-18.

## Puntos de integración (hitos)

- [x] **I1:** modelo de datos disponible (T002 a T006)
- [x] **I2:** contrato de API congelado (`contracts/api.md`)
- [x] **I3:** frontend conectado al backend real (T018, T023, T027, T031, T035, T040)
- [x] **I4:** la aceptación usa `ensureCurrentCycle`, `addMemberTx` y `createEntryCharge` (T029)
- [x] **I5:** reclamos conectados con `BanPort` y `AuditPort` de la spec 009 (T038)
- [x] **I6:** la spec 008 abre solicitudes con `openFromListing` (T036)
- [x] **I7:** avisos de la spec 005 parte A conectados (T044)

## Bloqueos y decisiones durante la implementación

| Fecha | Situación | Decisión | ¿Cambió la spec o el contrato? |
|---|---|---|---|
| 2026-10-18 | RN-010-13 ampliada a cualquier cobro abierto (R6) | Aprobado | Sí: `spec.md` |
| 2026-10-18 | Puertos nuevos por la spec 008 (T036) | Aplicados en `contracts/api.md` y `plan.md` | Sí: contrato |
| 2026-10-26 | Converge (T049): contraste de `spec.md`, `plan.md` y `contracts/api.md` con el código | Los 47 `CA-010-xx` de la spec aparecen citados en tests (`backend/test`, `backend/src`, `database/tests` o `frontend`) y los 21 endpoints del contrato tienen ruta en un controlador; las decisiones de esta tabla ya están reflejadas en la spec y el plan | No |
