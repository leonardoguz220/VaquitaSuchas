# Tareas — Spec 005: Notificaciones

- **Spec:** `spec.md` · **Plan:** `plan.md` · **Modelo:** `data-model.md` · **Contrato:** `contracts/api.md` · **Guía:** `quickstart.md`
- Capas: **BD** = Camila · **BE** = Leonardo · **FE** = Adrian. Cada tarea pertenece a **una** sola capa.
- Formato: `- [ ] Tnnn [P] [USn] [CAPA] Descripción con ruta — Depende: … · Cubre: …`. Los commits citan la tarea: `feat(005): add notify service [T006]`.
- Historias: **US1** ver mis avisos en la app y marcarlos como leídos, con los avisos de cobros, grupos y solicitudes (HU-005-02, HU-005-03, HU-005-06; **parte A, MVP**) · **US2** avisos programados: aviso previo, recordatorio de vencimiento y recordatorio de 48 h (HU-005-01; parte B, P1) · **US3** decidir qué avisos llegan por correo y desactivar desde el correo (HU-005-07; parte B) · **US4** invitar por correo y por WhatsApp, y recordar un cobro por WhatsApp (HU-005-04, HU-005-05; parte B) · **US5** avisos por Telegram y rebotes de correo (RF-005-26 a RF-005-28; parte C, P1).
- Entrega en tres partes (`plan.md` §1): **A** (en la app) entra en el hito MVP porque las specs 002 y 010 la necesitan (RF-010-04, CA-002-28, CA-010-14); **B** y **C** son P1. En la parte A `notify` solo crea la notificación en la app; los envíos por canal (`notification_deliveries`) se agregan en B sin cambiar los manejadores.
- Depende de las specs 000 (`TxEventBus`, `MailService`, `TelegramGateway`, `job_runs`, `rate_limit_events`), 002, 001 y 010 (eventos). Entrega a esas specs el servicio `NotificationService.notify`.

## Fase 1: Base común — parte A (modelo y dominio puro)

- [x] T001 [BD] Escribir primero `database/tests/notifications.integrity.test.ts` (parte A): dos notificaciones con la misma `dedupe_key` fallan; editar el contenido de una notificación falla pero marcar `read_at` pasa; un `link` que no empiece con `/` falla; en las partes B y C (T017, T029) un envío por canal y notificación, `skipped` sin motivo, `sent` no vuelve a `pending`, 5 intentos y una fila de preferencias por usuario — Depende: spec 000 T003 · Cubre: RNF-005-01, RNF-005-02, CA-005-10
- [x] T002 [BD] Migración `database/migrations/0070_notifications.sql`: `notifications` (`user_id` FK RESTRICT, `type`, `category` CHECK IN ('recordatorios','resoluciones','titular','grupo'), `title` 1–120, `body` ≤ 500, `link` con CHECK `^/[^/]`, `entity_type`/`entity_id`, `dedupe_key` UNIQUE, `read_at`, `created_at`, `updated_at`); índices `notifications_user_idx (user_id, created_at DESC)`, `notifications_unread_idx (user_id) WHERE read_at IS NULL`, `notifications_entity_idx`, `notifications_purge_idx (created_at)`; disparador que solo permite cambiar `read_at` — Depende: T001 · Cubre: RF-005-01, RF-005-02, RF-005-21, RNF-005-01, RNF-005-02
- [ ] T003 [P] [BE] `modules/notifications/domain/catalog.ts` (tipo → destinatario, categoría, momento y ventana, parte A/B/C) y `domain/templates.ts` (`render(type, data)` → `{ title, body, link, emailSubject, emailText, telegramText }`; textos en español de Bolivia, `Bs 25,50` con `formatBs`, fechas en La Paz; Telegram solo texto corto y enlace) con `templates.spec.ts` — Depende: spec 000 T004 · Cubre: RF-005-27, RNF-005-02, RNF-005-07, CA-005-32
- [ ] T004 [P] [BE] `domain/dedupe.ts` (`dedupeKey(type, entity, period?, n?, recipient?)`, estable; incluye el destinatario cuando una entidad avisa a varias personas) con `dedupe.spec.ts` — Depende: spec 000 T004 · Cubre: RNF-005-01
- [ ] T005 [BE] `repositories/notifications.repository.ts` (`INSERT … ON CONFLICT (dedupe_key) DO NOTHING`, lista paginada, contador de no leídas, marcar leída y todas, `cancelForEntity`) — Depende: T002 · Cubre: RF-005-01, RF-005-02, RN-005-02

## Fase 2: US1 — Avisos en la app (parte A, Prioridad: P0) 🎯 MVP

**Meta:** cada hecho relevante crea un aviso en la misma transacción; el usuario ve el contador, la lista y puede marcarlos como leídos.
**Prueba independiente:** al subir un comprobante el titular recibe «comprobante_subido» en `GET /notifications` y el contador sube en uno.

- [ ] T006 [P] [US1] [BE] `backend/test/notifications.list.e2e-spec.ts`: CA-005-21 (solo las propias), CA-005-22 (marcar una y todas como leídas), contador de no leídas, paginación y rendimiento de menos de 300 ms con 1.000 registros; `notifications.billing.e2e-spec.ts`: CA-005-01 (cobro generado con monto, vencimiento y datos de pago), CA-005-05 (atraso y retiro: miembro y titular), CA-005-07 (comprobante subido inmediato), CA-005-09 (rechazo con motivo), RN-005-01, RN-005-02, RN-005-03 (el titular no recibe avisos de cobro como miembro) — Depende: T005 · Cubre: CA-005-01, CA-005-05, CA-005-07, CA-005-09, CA-005-21, CA-005-22, RN-005-01, RN-005-02, RN-005-03, RNF-005-05
- [ ] T007 [US1] [BE] `services/notification.service.ts` `notify(tx, input)` (crea la notificación con su `dedupe_key`, sin hacer nada más si ya existía) y `cancelForEntity(tx, entityType, entityId, types)`; `controllers/notifications.controller.ts` con `GET /notifications` (filtro `unread`, cursor), `GET /notifications/unread-count`, `POST /notifications/:id/read` y `POST /notifications/read-all` — Depende: T006, T003, T004 · Cubre: RF-005-01, RF-005-02, RF-005-03, RN-005-02, CA-005-21, CA-005-22
- [ ] T008 [US1] [BE] `services/handlers/billing.handlers.ts`: `ChargeGenerated` → `cobro_generado`; `ChargeConfirmed`/`ChargeRejected` → `pago_confirmado`/`pago_rechazado` (con motivo); `ChargeSubmitted` → `comprobante_subido` al titular; `MemberRemovedForNonPayment` → `retiro_por_mora` (miembro) y `retiro_por_mora_titular` (titular, un aviso por cobro); `ChargeCancelled` y pagos cancelan los recordatorios pendientes — Depende: T007, spec 002 T011 · Cubre: RF-005-05, RF-005-07, RF-005-08, RF-005-10, RF-005-13, RN-005-01, RN-005-02, RN-005-03, CA-005-01, CA-005-05, CA-005-07, CA-005-09
- [ ] T009 [US1] [BE] `services/handlers/groups.handlers.ts`: `MemberAdded` y `MemberRemoved(abandono)` → `miembro_se_une`/`miembro_abandona`; `MemberRemoved(quitado/baneo)`, `OwnerChanged`, `GroupClosed` → `miembro_quitado`, `titularidad_cambiada`, `grupo_cerrado`; `UserSuspended` y `GroupFrozen` → `titular_suspendido`/`titular_baneado` a los miembros — Depende: T007, spec 001 T028 · Cubre: RF-005-09, RF-005-12
- [ ] T010 [P] [US1] [BE] `backend/test/notifications.join-requests.e2e-spec.ts`: CA-005-25 (solicitud nueva con el nombre), CA-005-26 (datos de pago: monto y 15 min), CA-005-27 (30 min: un solo recordatorio), CA-005-28 (mensajes de chat agrupados por tanda sin leer), avisos de aceptada, rechazada, expirada y reclamos — Depende: T005 · Cubre: CA-005-25, CA-005-26, CA-005-27, CA-005-28, RF-005-22, RF-005-23, RF-005-24, RF-005-25
- [ ] T011 [US1] [BE] `services/handlers/join-requests.handlers.ts`: `JoinRequestOpened` → `solicitud_nueva`; `ProofSubmitted`/`DecisionReminderDue` → `solicitud_comprobante`/`solicitud_recordatorio_30`; `PaymentDataSent` → `solicitud_datos_pago`; `JoinRequestAccepted/Rejected/Expired/Cancelled` → avisos al solicitante (y al titular si cancela el sistema); `ChatMessageSent` → `solicitud_mensaje` con clave `chat:<solicitud>:<destinatario>:<último leído>`; `DisputeOpened`/`DisputeResolved` → `reclamo_abierto`/`reclamo_resuelto` — Depende: T010, T007, spec 010 T012 · Cubre: RF-005-22, RF-005-23, RF-005-24, RF-005-25, CA-005-25, CA-005-26, CA-005-27, CA-005-28
- [ ] T012 [P] [US1] [FE] Campana de la barra superior (contador con número, panel con los últimos avisos y «Marcar todas como leídas»; consulta `unread-count` cada 30 s, pausada con la pestaña oculta) y `/notificaciones` (lista paginada, filtro «No leídas», cada aviso lleva a su `link`) con mock; estados leída/no leída con texto o icono además del color — Depende: spec 000 T036 · Cubre: RF-005-02, RF-005-03, RNF-005-06
- [ ] T013 [US1] [FE] Conectar la campana y `/notificaciones` con `GET /notifications`, `unread-count`, `read` y `read-all` — Depende: T007, T012 · Cubre: RF-005-01, RF-005-02

**Punto de control (parte A, I1):** los hechos de las specs 001, 002 y 010 generan avisos en la app; el MVP queda notificado.

## Fase 3: US2 — Avisos programados (parte B, Prioridad: P1)

**Meta:** aviso previo, recordatorio de vencimiento y recordatorio de 48 h, una sola vez, aunque el servicio estuviera dormido.
**Prueba independiente:** con `FakeClock` el día 13 para un corte el 15, el miembro recibe el aviso previo y una segunda ejecución no lo duplica.

- [ ] T014 [P] [US2] [BE] `domain/schedule-rules.ts` (`dueScheduledNotices(groups, charges, today)`: aviso previo = corte − 2 días con `adjustBillingDay`, recordatorio de vencimiento = vencimiento − 1 día si sigue `pendiente`, 48 h; parámetros de configuración) con `schedule-rules.spec.ts` — Depende: spec 001 T008 · Cubre: RF-005-04, RF-005-06, RF-005-11, RN-005-05, RN-005-06, CA-005-02
- [ ] T015 [P] [US2] [BE] `backend/test/notifications.schedule.e2e-spec.ts`: CA-005-02 (aviso previo el día 13 para corte el 15, con monto «estimado»), CA-005-03 (vence mañana → recordatorio), CA-005-04 (pagado → sin recordatorio), CA-005-06 (12 días sin recordatorios de atraso, con `FakeClock`), CA-005-08 (48 h: un solo recordatorio), CA-005-10 (tarea diaria dos veces) y recuperación tras una caída — Depende: T007 · Cubre: CA-005-02, CA-005-03, CA-005-04, CA-005-06, CA-005-08, CA-005-10, RF-005-19
- [ ] T016 [US2] [BE] `services/schedule.service.ts` y tarea `notifications.schedule` (cada tick; la parte diaria solo actúa a partir de las 08:00 de La Paz y si no hay un `job_runs` correcto de hoy; la de 48 h en cada tick; todo con `dedupe_key`, repetible) — Depende: T014, T015, spec 000 T028 · Cubre: RF-005-04, RF-005-06, RF-005-11, RF-005-19, RN-005-01, RN-005-02, RN-005-05, CA-005-02 a 04, 06, 08, 10

## Fase 4: US3 — Preferencias de correo y desactivación (parte B, Prioridad: P1)

**Meta:** el usuario decide qué avisos llegan por correo; los envíos se hacen con reintentos y ventana horaria sin frenar nunca la operación.
**Prueba independiente:** con el tipo «recordatorios» desactivado, el aviso aparece solo en la app y no hay envío de correo.

- [ ] T017 [BD] Migraciones `0071_notification_preferences.sql` (una fila por usuario, interruptores de correo y Telegram por categoría, `email_bounced_at`, estado de Telegram), `0072_notification_deliveries.sql` (buzón de salida: canal `email`/`telegram`, estado `pending`/`sent`/`failed`/`skipped` con motivo, `attempts` ≤ 4, `next_attempt_at`, `respect_window`, `sent_at`; único por notificación y canal) y `0074_notification_triggers.sql` (un `sent` no vuelve a `pending`, `skipped` exige motivo); completar la prueba de integridad (T001) — Depende: T002 · Cubre: RF-005-17, RF-005-20, RNF-005-01
- [ ] T018 [P] [US3] [BE] `domain/delivery-rules.ts` (`deliveryPlan(notification, prefs, user, now)`: por canal `pending` o `skipped` con motivo —preferencia desactivada, usuario suspendido o inactivo, Telegram bloqueado, correo rebotado—; `respect_window`; `inSendWindow(now)` de 08:00 a 19:59:59 de La Paz), `retry.ts` (`nextRetry`: 5 min, 30 min, 2 h; luego `failed`) y `unsubscribe-token.ts` (HMAC) con `delivery-rules.spec.ts`, `retry.spec.ts` y `unsubscribe-token.spec.ts` — Depende: T003 · Cubre: RF-005-17, RF-005-18, RF-005-20, RN-005-04, RNF-005-03, CA-005-11, CA-005-13, CA-005-20, CA-005-24
- [ ] T019 [P] [US3] [BE] `backend/test/notifications.delivery.e2e-spec.ts` y `notifications.preferences.e2e-spec.ts`: CA-005-11 (correo desactivado: solo en la app), CA-005-12 (el correo de seguridad siempre sale por `MailService`), CA-005-13 (desactivación desde el enlace), CA-005-19 (proveedor de correo caído: la operación se completa), CA-005-20 (3 fallas → `failed`, aviso visible), CA-005-24 (21:00 espera la ventana), CA-005-29 (solicitud a las 21:00 sin ventana) — Depende: T017 · Cubre: CA-005-11, CA-005-12, CA-005-13, CA-005-19, CA-005-20, CA-005-24, CA-005-29
- [ ] T020 [US3] [BE] Extender `notify` con las preferencias y los envíos por canal en la misma transacción (`deliveryPlan` + `notification_deliveries`), `services/delivery.service.ts` y tarea `notifications.deliver` (lotes con `FOR UPDATE SKIP LOCKED`, vuelve a comprobar suspensión y preferencias, respeta la ventana, envía por `MailService`, reintenta, nunca afecta la operación del usuario) — Depende: T018, T019, T007, spec 000 T025 · Cubre: RF-005-17, RF-005-18, RF-005-20, RN-005-04, RNF-005-03, RNF-005-04, CA-005-11, CA-005-19, CA-005-20, CA-005-24, CA-005-29
- [ ] T021 [US3] [BE] `controllers/preferences.controller.ts`: `GET/PUT /notification-preferences`, `POST /notifications/unsubscribe` (token HMAC con confirmación por `POST`; el enlace de desactivación va en todo correo no transaccional) — Depende: T020 · Cubre: RF-005-17, RF-005-18, CA-005-13
- [ ] T022 [BE] `services/purge.service.ts` y tarea `notifications.purge` diaria (notificaciones de más de 90 días y direcciones de invitaciones de más de 30 días) con `notifications.purge.e2e-spec.ts` (CA-005-23) — Depende: T020 · Cubre: RF-005-21, CA-005-23
- [ ] T023 [P] [US3] [FE] `/ajustes/avisos` (interruptores por tipo para correo y Telegram, aviso de correo con problema, estado de Telegram con «Reactivar»; texto fijo de que la app y los correos de seguridad no se desactivan) y `/avisos/desactivar?token=` (página pública con botón de confirmación) con mock — Depende: T012 · Cubre: RF-005-17, RF-005-18, RNF-005-06
- [ ] T024 [US3] [FE] Conectar `/ajustes/avisos` y `/avisos/desactivar` con `GET/PUT /notification-preferences` y `POST /notifications/unsubscribe` — Depende: T021, T023 · Cubre: RF-005-17, RF-005-18

## Fase 5: US4 — Invitaciones y WhatsApp (parte B, Prioridad: P1)

**Meta:** el titular invita por correo o WhatsApp con su código y recuerda un cobro por WhatsApp con un mensaje listo.
**Prueba independiente:** `invitation-share` devuelve el texto con el enlace; el servidor no envía nada por WhatsApp.

- [ ] T025 [BD] Migración `0073_group_invitations.sql`: `group_invitations` (grupo, titular, correo, `sent_at`; la dirección se borra a los 30 días) con índice por titular y fecha para el límite — Depende: T017 · Cubre: RF-005-14
- [ ] T026 [P] [US4] [BE] `domain/share-text.ts` (`inviteMessage`, `reminderMessage`) con `share-text.spec.ts`; `backend/test/notifications.invitations.e2e-spec.ts` (CA-005-14 invitación por correo, CA-005-16 límite de 10 por hora) y `notifications.share.e2e-spec.ts` (CA-005-17 enlace `wa.me` sin envío del servidor, CA-005-18 recordatorio al celular del miembro, solo cobros `pendiente` o `atrasado` de miembros activos) — Depende: T025 · Cubre: CA-005-14, CA-005-16, CA-005-17, CA-005-18
- [ ] T027 [US4] [BE] `services/invitations.service.ts` (límite de 10 por hora por titular con `rate_limit_events`, crea la invitación y su envío), `controllers/invitations.controller.ts` `POST /groups/:id/invitations` y `controllers/share.controller.ts` `GET /groups/:id/invitation-share` y `GET /charges/:id/reminder-share` (`{ phone, text }`) — Depende: T026, T020 · Cubre: RF-005-14, RF-005-15, RF-005-16, CA-005-14, CA-005-16, CA-005-17, CA-005-18
- [ ] T028 [P] [US4] [FE] **Invitar** en `/grupos/[id]` (modal con correo, botón **WhatsApp** con `wa.me`, **Copiar enlace**, aviso del límite), **Recordar por WhatsApp** en `/cobros/[id]` y `/unirse?codigo=` que, sin sesión, redirige a iniciar sesión o registrarse y vuelve con el código; con mock, conectado al terminar T027 — Depende: T012, T027, spec 010 T017 · Cubre: RF-005-14, RF-005-15, RF-005-16, CA-005-15, CA-005-17

## Fase 6: US5 — Telegram y rebotes (parte C, Prioridad: P1)

**Meta:** los mismos avisos por Telegram, sin datos sensibles, con bloqueo del bot y rebotes de correo tratados sin romper nada.
**Prueba independiente:** con el bot simulado, un aviso desactivado por correo sigue llegando a la app y a Telegram según la preferencia.

- [ ] T029 [P] [US5] [BE] `backend/test/notifications.telegram.e2e-spec.ts`: CA-005-30 (Telegram vinculado al verificar el celular), CA-005-31 (cambio de celular: nueva cuenta), CA-005-32 (sin datos sensibles; tipo desactivado solo en la app), CA-005-33 (bot bloqueado → `Reactivar`), CA-005-34 (Telegram caído: la operación se completa) con el bot simulado de la spec 000 — Depende: T020, spec 003 (verificación por Telegram) · Cubre: CA-005-30, CA-005-31, CA-005-32, CA-005-33, CA-005-34
- [ ] T030 [US5] [BE] Canal `telegram` en `DeliveryService` con `TelegramGateway` (texto corto y enlace, reintentos como el correo), manejador de `my_chat_member` (bloqueo del bot → estado `blocked`), `POST /notification-preferences/telegram/reactivate` y marca de `email_bounced_at` con el webhook del proveedor elegido en la spec 000 (R4) — Depende: T029, spec 000 T030 · Cubre: RF-005-26, RF-005-27, RF-005-28, CA-005-30 a 34

## Fase 7: Cierre

- [ ] T031 [BE] Revisión de seguridad y privacidad: correos y Telegram sin comprobantes ni datos de otras personas distintos del nombre y lo necesario, enlaces internos que empiezan con `/`, token de desactivación sin datos, usuarios suspendidos sin correos, registros sin texto de avisos — Depende: T027, T030 · Cubre: RNF-005-02, RN-005-04
- [ ] T032 [BD] Revisar con Camila los planes de consulta de la lista de avisos, el contador de no leídas y la entrega por lotes con datos del seed — Depende: T017 · Cubre: RNF-005-05
- [ ] T033 [FE] Accesibilidad de la campana, el contador y los estados leído/no leído (número, texto o icono, no solo color) y móvil primero de `/notificaciones` — Depende: T024, T028 · Cubre: RNF-005-06
- [ ] T034 [BE] Ejecutar `/speckit-converge`: actualizar `spec.md` y `plan.md` con lo implementado (catálogo de avisos con `publicacion_transferida`) y marcar las tareas hechas — Depende: T031, T032, T033 · Cubre: —

## Dependencias y orden de ejecución

- **Parte A** (T001–T013) entra en el hito MVP, después de las specs 001, 002 y 010 (necesita sus eventos), y es independiente de B y C.
- **B** (T014–T028) y **C** (T029–T030) son P1: US2 y US3 solo dependen de la parte A; US4 depende de US3 (el correo sale por el buzón); US5 depende de T020.
- Esta spec necesita de otras: spec 002 T011 (eventos de cobro), spec 001 T028 (eventos de grupo), spec 010 T012 (eventos de solicitud), spec 000 T028, T025, T030 (`job_runs`, `MailService`, `TelegramGateway`).
- Las specs 002 (T041) y 010 (T044) conectan sus eventos con los manejadores de esta spec.

## Ejemplos de paralelización

- Después de T002: T003 y T004 (BE) a la vez con T005.
- Pruebas de historias: T006, T010, T015, T019, T026 y T029 pueden escribirse en paralelo antes de sus implementaciones.
- Frontend con mock: T012, T023 y T028 en paralelo con el backend.

## Estrategia de implementación

1. **Parte A primero** (MVP): modelo, `notify`, manejadores y centro de avisos.
2. **Parte B** (P1): programados, preferencias y correo, invitaciones y WhatsApp.
3. **Parte C** (P1): Telegram y rebotes cuando el bot esté disponible (spec 003).

## Puntos de integración (hitos)

- [ ] **I1:** parte A disponible para las specs 002, 001 y 010 (T007)
- [ ] **I2:** contrato de API congelado (`contracts/api.md`)
- [ ] **I3:** frontend conectado al backend real (T013, T024, T028)
- [ ] **I4:** envíos por correo con reintentos y ventana (T020)
- [ ] **I5:** Telegram conectado con la verificación de celular de la spec 003 (T030)

## Bloqueos y decisiones durante la implementación

| Fecha | Situación | Decisión | ¿Cambió la spec o el contrato? |
|---|---|---|---|
| 2026-10-18 | Proveedor de correo y dominio de envío (spec 000 R4) | Resend con dominio gratis; si no, Brevo con remitente único | No |
| — | Cómo recibe el backend los mensajes del bot con el servicio gratuito de Render (spec 000) | Confirmar antes de T030 | No |
