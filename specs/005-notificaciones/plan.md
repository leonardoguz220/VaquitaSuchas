# Plan técnico — Spec 005: Notificaciones

- **Spec relacionada:** `specs/005-notificaciones/spec.md` (debe estar **aprobada** por BD, Backend y Frontend)
- **Líder de la spec:** Leonardo Guzman (Backend)
- **Última actualización:** 2026-10-18
- **Artefactos:** [`data-model.md`](data-model.md) · [`contracts/api.md`](contracts/api.md) · [`quickstart.md`](quickstart.md)

| Capa | Responsable | Secciones | Visto bueno |
|---|---|---|---|
| Base de datos | Camila | §3 (y `data-model.md`) | aprobado |
| Backend | Leonardo | §4, §5, §7 | aprobado |
| Frontend | Adrian | §6 | aprobado |

## Constitución: verificación

| Principio | ¿Cumple? | Nota |
|---|---|---|
| I. Spec primero | Sí, con una aclaración | Las categorías de aviso de la sección 5 del plan asignan a cada aviso una de las cuatro categorías de RF-005-17; los avisos del solicitante van en «grupo». Se confirma en la revisión. |
| II. Dinero exacto | Sí | Los montos de los textos salen de los cobros en centavos con `formatBs`. |
| III. Criterios verificables | Sí | CA-005-01 a 34 mapeados en §8. |
| IV. Seguridad | Sí | Cada persona solo ve las suyas; textos sin datos sensibles; token de desactivación firmado. |
| V. Contratos primero | Sí | `data-model.md` y `contracts/api.md`. |
| VI. Simplicidad | Sí | Buzón de salida en la misma base y un envío por tick; sin colas externas. |
| VII. Capas | Sí | Plantillas y reglas de envío en `domain/` puro; canales en `repositories`. |

## 1. Resumen de la solución

Módulo `notifications` con un **catálogo de avisos** (tipo → destinatario, categoría, momento, ventana de envío), un servicio `notify` que, **dentro de la transacción del hecho que lo origina**, guarda la notificación en la app y los envíos pendientes por correo y Telegram, y dos tareas: una que **genera los avisos programados** (la diaria de las 08:00 de La Paz, que en la práctica corre en cada tick y actúa una vez por día) y otra que **entrega** lo pendiente con reintentos. Una falla de correo o de Telegram nunca afecta la operación del usuario. Se entrega en tres partes: **A (MVP)** avisos dentro de la app y sus manejadores de eventos; **B (P1)** avisos programados, correo, preferencias, invitaciones y WhatsApp; **C (P1)** Telegram y rebotes.

## 2. Decisiones técnicas

| Decisión | Opción elegida | Alternativas descartadas | Motivo |
|---|---|---|---|
| Partición | A (en la app) con el MVP; B y C después | Todo en P1 | RF-010-04, CA-002-28 y CA-010-14 exigen avisos en la app dentro del MVP. |
| Atomicidad | `notify` en la misma transacción que el hecho | Evento asíncrono | Un hecho sin aviso (o un aviso sin hecho) no puede existir. |
| Envío | Buzón de salida (`notification_deliveries`) + tarea `notifications.deliver` | Enviar al instante dentro de la petición | RNF-005-04: una caída del proveedor no frena al usuario. |
| Tarea diaria | Cada tick evalúa «¿ya corrió hoy después de las 08:00?» con claves únicas | Cron de las 08:00 | El servicio gratuito duerme (spec 000 R1); recupera lo que falte (caso borde). |
| Idempotencia | `dedupe_key` única por aviso | Comprobar antes de insertar | RNF-005-01 con concurrencia. |
| Ventana horaria | `respect_window` por envío; solo recordatorios (08:00–20:00 La Paz) | Hora fija | RNF-005-03, CA-005-24; los avisos de solicitud van sin ventana (RF-005-25, CA-005-29). |
| Agrupar mensajes de chat | Un aviso por «tanda» sin leer (`chat:<solicitud>:<destinatario>:<último leído>`) | Un aviso por mensaje | CA-005-28. |
| Desactivar desde el correo | Token HMAC + `POST` de confirmación | Enlace `GET` que cambia el estado | Los lectores de correo precargan enlaces. |
| WhatsApp | El servidor entrega texto y número; el cliente arma `wa.me` | Llamar a una API de WhatsApp | RF-005-15 y 16, CA-005-17. |
| Telegram | Mismo buzón, canal `telegram`; texto corto con enlace | Mensajes con detalle | RF-005-27: sin datos sensibles. |
| Rebotes de correo | Marcar `email_bounced_at` con el webhook del proveedor elegido en la spec 000 (R4) | Ignorarlos | Caso borde; la implementación depende del proveedor. |

## 3. Modelo de datos — _Camila (BD)_

Detalle en [`data-model.md`](data-model.md): `notifications` (0070, núcleo), `notification_preferences` (0071), `notification_deliveries` (0072), `group_invitations` (0073), disparadores (0074). Pruebas de integridad en `database/tests/notifications.integrity.test.ts`.

## 4. Contratos de API — _Leonardo (Backend)_

Detalle en [`contracts/api.md`](contracts/api.md): `GET /notifications`, `…/unread-count`, `…/read`, `…/read-all` (núcleo); `…/notification-preferences`, `…/unsubscribe`, invitaciones y enlaces de WhatsApp (P1).

> **Contrato congelado** al aprobarse este plan. Los cambios se hacen por PR sobre este archivo y avisando a las otras dos capas.

## 5. Lógica de dominio — _Leonardo (Backend)_

### Estructura

```text
backend/src/modules/notifications/
├── controllers/   notifications.controller.ts, preferences.controller.ts, invitations.controller.ts, share.controller.ts
├── services/      notification.service.ts, schedule.service.ts, delivery.service.ts, invitations.service.ts,
│                  purge.service.ts, handlers/ (billing.handlers.ts, groups.handlers.ts, join-requests.handlers.ts, admin.handlers.ts)
├── domain/        catalog.ts, templates.ts, delivery-rules.ts, retry.ts, schedule-rules.ts, unsubscribe-token.ts, share-text.ts
└── repositories/  notifications.repository.ts, preferences.repository.ts, deliveries.repository.ts, invitations.repository.ts
```

### Catálogo de avisos

Todos los textos en español (Bolivia), montos `Bs 25,50`, fechas en La Paz. «Ventana» = el correo solo se envía entre 08:00 y 20:00; «inmediato» = sin ventana.

| Tipo | Origen (evento o tarea) | Destinatario | Categoría | Ventana | Parte |
|---|---|---|---|---|---|
| `cobro_generado` | `ChargeGenerated` | miembro | recordatorios | inmediato | A |
| `pago_confirmado`, `pago_rechazado` (con motivo) | `ChargeConfirmed`, `ChargeRejected` | miembro | resoluciones | inmediato | A |
| `retiro_por_mora` (con deuda y cómo pagarla) | `MemberRemovedForNonPayment` | miembro retirado | grupo | inmediato | A |
| `retiro_por_mora_titular` (monto y cupo liberado) | ídem | titular | titular | inmediato | A |
| `comprobante_subido` | `ChargeSubmitted` | titular | titular | inmediato | A |
| `miembro_se_une`, `miembro_abandona` | `MemberAdded`, `MemberRemoved(abandono)` | titular | titular | inmediato | A |
| `miembro_quitado`, `titularidad_cambiada`, `grupo_cerrado` | `MemberRemoved(quitado/baneo)`, `OwnerChanged`, `GroupClosed` | miembros afectados | grupo | inmediato | A |
| `titular_suspendido`, `titular_baneado` (aviso a miembros) | `UserSuspended`, `GroupFrozen` | miembros del grupo | grupo | inmediato | A |
| `solicitud_nueva` | `JoinRequestOpened` | titular | titular | inmediato | A |
| `solicitud_comprobante` (plazo de 60 min), `solicitud_recordatorio_30` | `ProofSubmitted`, `DecisionReminderDue` | titular | titular | inmediato | A |
| `solicitud_datos_pago` (plazo de 15 min) | `PaymentDataSent` | solicitante | grupo | inmediato | A |
| `solicitud_aceptada`, `solicitud_rechazada` (motivo), `solicitud_expirada` | `JoinRequestAccepted/Rejected/Expired/Cancelled` | solicitante (y titular si la cancela el sistema) | grupo | inmediato | A |
| `solicitud_mensaje` (agrupado) | `ChatMessageSent` | la otra parte | titular o grupo según el rol | inmediato | A |
| `reclamo_abierto` | `DisputeOpened` | la parte acusada | titular o grupo según el rol | inmediato | A |
| `reclamo_resuelto` | `DisputeResolved` | ambas partes | titular o grupo | inmediato | A |
| `publicacion_decision`, `publicacion_oculta` | spec 008/009 | titular | titular | inmediato | P2 |
| `publicacion_transferida` (la publicación pasa al nuevo titular) | spec 008 (`ListingTransferred`) | titular nuevo | titular | inmediato | P2 |
| `aviso_previo` (monto «estimado», RN-005-05) | tarea diaria: corte − 2 días | miembros | recordatorios | ventana | B |
| `recordatorio_vencimiento` | tarea diaria: vencimiento − 1 día, si sigue `pendiente` | miembro | recordatorios | ventana | B |
| `comprobante_pendiente_48h` (una vez) | cada tick | titular | titular | ventana | B |

El titular **no** recibe avisos de cobro como miembro (RN-005-03). Los avisos de cobro no se envían si el cobro está `pagado`, `en_revision` o `cancelado` (RN-005-01); al pagarse o cancelarse se cancelan los pendientes (RN-005-02).

### Funciones puras

| Función | Reglas |
|---|---|
| `dedupeKey(type, entity, period?, n?, recipient?)` | Clave estable (RNF-005-01). |
| `deliveryPlan(notification, prefs, user, now)` | Decide por canal: `pending` o `skipped` con motivo (preferencia desactivada, usuario suspendido o inactivo, Telegram bloqueado, correo rebotado); define `respect_window` (RN-005-04, RF-005-17). |
| `inSendWindow(now)` | `true` entre 08:00 y 19:59:59 de La Paz (RNF-005-03, CA-005-24). |
| `nextRetry(attempts, now)` | 5 min, 30 min, 2 h; luego `failed` (RF-005-20). |
| `dueScheduledNotices(groups, charges, today)` | Calcula aviso previo (corte − 2 días con `adjustBillingDay`), recordatorio de vencimiento (vencimiento − 1 día) y 48 h; parámetros de RN-005-06 por configuración. |
| `render(type, data)` | → `{ title, body, link, emailSubject, emailText, telegramText }`. El correo lleva el enlace de desactivación (no transaccionales, RF-005-18); Telegram solo un texto corto y el enlace (RF-005-27). |
| `signUnsubscribe / verifyUnsubscribe` | HMAC con la clave del servidor. |
| `inviteMessage(group, code, appUrl)` / `reminderMessage(charge, member)` | Texto de WhatsApp (RF-005-15/16). |

### Servicios

- **`NotificationService.notify(tx, input)`**: obtiene (o crea) las preferencias, aplica `deliveryPlan`, inserta `notifications` con `ON CONFLICT (dedupe_key) DO NOTHING` y los envíos por canal. Si no inserta (ya existía), no hace nada más.
- **`ScheduleService.run(now)`** (`notifications.schedule`): solo actúa si son las 08:00 de La Paz o más y aún no hay un `job_runs` correcto de hoy para la parte diaria; la parte de 48 h corre en cada tick. Todo con claves únicas, así que se puede repetir (CA-005-10).
- **`DeliveryService.deliver(now)`** (`notifications.deliver`): toma lotes con `FOR UPDATE SKIP LOCKED`; vuelve a comprobar suspensión y preferencias; respeta la ventana; envía con `MailService` o `TelegramGateway`; si falla programa el reintento; si Telegram responde que el bot fue bloqueado marca `telegram_blocked_at` (CA-005-33) y el resto de los envíos de Telegram pasan a `skipped`.
- **`InvitationsService`**: límite de 10 por hora por titular (`rate_limit_events`), crea la invitación y su envío; el correo sale por el mismo buzón.
- **`PurgeService`** (`notifications.purge`, diaria): borra notificaciones de más de 90 días y direcciones de invitaciones de más de 30.
- **Manejadores de eventos** (`handlers/`): traducen cada evento del catálogo; cargan datos con los servicios de lectura de otros módulos (nunca sus repositorios) y llaman a `notify`.
- **Telegram** (parte C): la actualización `my_chat_member` (bloqueo del bot) llega al webhook de la spec 000; esta spec registra el manejador. Se pide a Telegram `allowed_updates` que incluya `message` y `my_chat_member`.

## 6. Interfaz de usuario — _Adrian (Frontend)_

| Ruta / componente | Contenido | Endpoints | Parte |
|---|---|---|---|
| Campana en la barra superior | Contador de no leídas (con número, no solo color), panel desplegable con los últimos avisos y «Marcar todas como leídas»; consulta `unread-count` cada 30 s (pausada si la pestaña no está visible) | `GET /notifications/unread-count`, `GET /notifications` | A |
| `/notificaciones` | Lista paginada, filtro «No leídas», cada aviso lleva a su `link`; marcar como leída | `GET /notifications`, `POST …/read`, `…/read-all` | A |
| `/ajustes/avisos` | Interruptores por tipo de aviso para correo y Telegram, aviso de correo con problema, estado de Telegram (bloqueado → «Reactivar»); texto fijo: las notificaciones en la app no se desactivan, los correos de seguridad tampoco | `GET/PUT /notification-preferences`, `POST …/telegram/reactivate` | B, C |
| `/avisos/desactivar?token=` | Página pública que confirma «¿Dejar de recibir correos de [tipo]?» con un botón | `POST /notifications/unsubscribe` | B |
| `/grupos/[id]` → **Invitar** (titular) | Modal con correo (envía invitación), botón **WhatsApp** (abre `wa.me` con el texto), **Copiar enlace**; muestra el aviso de límite (10 por hora) | `POST …/invitations`, `GET …/invitation-share` | B |
| `/cobros/[id]` (titular) | Botón **Recordar por WhatsApp** en cobros `pendiente` o `atrasado` de miembros activos | `GET /charges/:id/reminder-share` | B |
| `/unirse?codigo=XXXXXXXX` | Si no hay sesión, redirige a inicio de sesión o registro y regresa a esta pantalla con el código cargado (`next` en el proxy); luego sigue el flujo de la spec 010 | — | B |

### Reglas de UX
- Los avisos se presentan en texto plano; el enlace interno se abre en la misma app.
- El contador y los estados «leída/no leída» usan texto o icono además de color (RNF-005-06).
- Errores `429` con el tiempo de espera de `retryAfterSeconds`.

## 7. Seguridad y permisos — _Leonardo (Backend), con revisión de BD_

- Todo endpoint filtra por el usuario de la sesión; una notificación ajena responde `404` (CA-005-21).
- Las invitaciones solo las crea el titular del grupo; la respuesta no revela si el correo ya es miembro.
- `link` de las notificaciones es siempre una ruta interna (restricción en la base).
- El token de desactivación es un HMAC; no revela datos y solo permite desactivar correos de un tipo.
- Los correos no incluyen comprobantes ni datos de terceros salvo el nombre y los montos necesarios (RNF-005-02); Telegram, solo texto corto y enlace.
- Las direcciones de invitados se borran a los 30 días; los registros (logs) no incluyen direcciones ni textos de avisos.

## 8. Estrategia de pruebas

| Criterio | Nivel | Capa | Test |
|---|---|---|---|
| CA-005-01 (cobro generado: monto, vencimiento, datos de pago) | Integración | BE | `notifications.billing.e2e-spec.ts` |
| CA-005-02 (aviso previo el día 13 para corte el 15) | Unitario + integración | BE | `schedule-rules.spec.ts`; `notifications.schedule.e2e-spec.ts` |
| CA-005-03 (vence mañana → recordatorio) | Integración | BE | `notifications.schedule.e2e-spec.ts` |
| CA-005-04 (pagado → sin recordatorio) | Integración | BE | `notifications.schedule.e2e-spec.ts` |
| CA-005-05 (atraso y retiro: miembro y titular) | Integración | BE | `notifications.billing.e2e-spec.ts` |
| CA-005-06 (12 días sin recordatorios de atraso) | Integración | BE | `notifications.schedule.e2e-spec.ts` (con `FakeClock`) |
| CA-005-07 (comprobante subido: aviso inmediato) | Integración | BE | `notifications.billing.e2e-spec.ts` |
| CA-005-08 (48 h: un solo recordatorio) | Integración | BE | `notifications.schedule.e2e-spec.ts` |
| CA-005-09 (rechazo con motivo) | Integración | BE | `notifications.billing.e2e-spec.ts` |
| CA-005-10 (tarea diaria dos veces) | Integración + integridad | BE, BD | `notifications.schedule.e2e-spec.ts`; `notifications.integrity.test.ts` |
| CA-005-11 (correo desactivado: solo en la app) | Unitario + integración | BE | `delivery-rules.spec.ts`; `notifications.delivery.e2e-spec.ts` |
| CA-005-12 (correo de seguridad siempre se envía) | Integración | BE | `notifications.delivery.e2e-spec.ts` (spec 003 usa `MailService` directo) |
| CA-005-13 (enlace de desactivación funcional) | Unitario + integración | BE | `unsubscribe-token.spec.ts`; `notifications.preferences.e2e-spec.ts` |
| CA-005-14 (invitación por correo) | Integración | BE | `notifications.invitations.e2e-spec.ts` |
| CA-005-15 (invitado sin sesión llega con el código) | E2E | FE | `frontend/e2e/invite-link.spec.ts` |
| CA-005-16 (límite de 10 invitaciones por hora) | Integración | BE | `notifications.invitations.e2e-spec.ts` |
| CA-005-17 (WhatsApp: enlace `wa.me`, sin envío del servidor) | Unitario + E2E | BE, FE | `share-text.spec.ts`; `frontend/e2e/whatsapp.spec.ts` |
| CA-005-18 (WhatsApp al celular del miembro) | Integración | BE | `notifications.share.e2e-spec.ts` |
| CA-005-19 (proveedor de correo caído: la operación se completa) | Integración | BE | `notifications.delivery.e2e-spec.ts` |
| CA-005-20 (3 fallas → `failed`, aviso visible) | Unitario + integración | BE | `retry.spec.ts`; `notifications.delivery.e2e-spec.ts` |
| CA-005-21 (solo las propias) | Integración | BE | `notifications.list.e2e-spec.ts` |
| CA-005-22 (marcar todas) | Integración | BE | `notifications.list.e2e-spec.ts` |
| CA-005-23 (limpieza a los 90 días) | Integración | BE | `notifications.purge.e2e-spec.ts` |
| CA-005-24 (21:00 → espera la ventana) | Unitario + integración | BE | `delivery-rules.spec.ts`; `notifications.delivery.e2e-spec.ts` |
| CA-005-25 (solicitud nueva con el nombre) | Integración | BE | `notifications.join-requests.e2e-spec.ts` |
| CA-005-26 (datos de pago: monto y 15 min) | Integración | BE | `notifications.join-requests.e2e-spec.ts` |
| CA-005-27 (30 min: un solo recordatorio) | Integración | BE | `notifications.join-requests.e2e-spec.ts` |
| CA-005-28 (mensajes agrupados) | Integración | BE | `notifications.join-requests.e2e-spec.ts` |
| CA-005-29 (solicitud a las 21:00 sin esperar ventana) | Integración | BE | `notifications.delivery.e2e-spec.ts` |
| CA-005-30 (Telegram vinculado al verificar el celular) | Integración | BE | `notifications.telegram.e2e-spec.ts` (usa el bot simulado de la spec 000) |
| CA-005-31 (cambio de celular: nueva cuenta de Telegram) | Integración | BE | `notifications.telegram.e2e-spec.ts` |
| CA-005-32 (Telegram sin datos sensibles; tipo desactivado solo en la app) | Unitario + integración | BE | `templates.spec.ts`; `notifications.telegram.e2e-spec.ts` |
| CA-005-33 (bot bloqueado) | Integración | BE | `notifications.telegram.e2e-spec.ts` |
| CA-005-34 (Telegram caído: la operación se completa) | Integración | BE | `notifications.telegram.e2e-spec.ts` |

Pruebas de reglas: RN-005-01 y RN-005-02 → `notifications.schedule.e2e-spec.ts` y `notifications.billing.e2e-spec.ts`; RN-005-03 → `notifications.billing.e2e-spec.ts` (el titular no recibe avisos de cobro); RN-005-04 → `delivery-rules.spec.ts`; RN-005-05 → `notifications.schedule.e2e-spec.ts` (monto «estimado»); RN-005-06 → `schedule-rules.spec.ts` (valores de configuración).

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Proveedor de correo gratuito con límites (solo al dueño de la cuenta sin dominio verificado, tope diario) | Alta | Alto | Decisión del equipo pendiente (spec 000, R-02): Brevo o correos del equipo para la demo; la app funciona igual con avisos en la app. |
| Envíos retrasados por el servicio dormido | Media | Medio | Tick cada 5 min; los avisos urgentes ya están en la app al instante. |
| Duplicados por concurrencia | Baja | Medio | `dedupe_key` única y `SKIP LOCKED`. |
| Spam de mensajes de chat | Media | Bajo | Agrupación por tanda sin leer y límite de la spec 010. |
| Rebotes no detectados | Media | Bajo | Webhook del proveedor elegido; mientras tanto, el estado `failed` y el registro del error. |
| Bot de Telegram bloqueado por muchos usuarios | Baja | Bajo | Se desactiva solo ese canal; el usuario puede reactivarlo. |
| Dependencia de 005 desde el MVP | Alta | Medio | Parte A pequeña (solo la app) dentro del hito MVP; ver `tasks.md`. |

## 10. Trazabilidad

| Requisito | Cubierto en |
|---|---|
| RF-005-01 a RF-005-03 (centro de notificaciones) | §4, §6, `data-model.md` (`notifications`) |
| RF-005-04 a RF-005-09 (eventos del miembro) | §5 catálogo, `ScheduleService`, manejadores |
| RF-005-10 a RF-005-13 (eventos del titular) | §5 catálogo, `ScheduleService` (48 h) |
| RF-005-14 a RF-005-16 (invitaciones y WhatsApp) | §4, §5 `InvitationsService`, `share-text` |
| RF-005-17, RF-005-18 (preferencias, desactivar) | §4, §5 `deliveryPlan`, `unsubscribe-token` |
| RF-005-19, RF-005-20 (procesamiento, reintentos) | §5 `ScheduleService`, `DeliveryService`, `retry` |
| RF-005-21 (90 días) | §5 `PurgeService` |
| RF-005-22 a RF-005-25 (solicitudes y reclamos) | §5 catálogo (parte A), manejadores de 010 |
| RF-005-26 a RF-005-28 (Telegram) | §5 `DeliveryService`, manejador `my_chat_member` |
| RNF-005-01 a RNF-005-07 | §2, §5, §6, §7 |
| RN-005-01 a RN-005-06 | §8 (pruebas de reglas) |
| CA-005-01 a CA-005-34 | §8 |
