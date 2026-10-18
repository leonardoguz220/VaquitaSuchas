# Plan técnico — Spec 010: Solicitudes de ingreso y chat

- **Spec relacionada:** `specs/010-solicitudes-de-ingreso/spec.md` (debe estar **aprobada** por BD, Backend y Frontend)
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
| I. Spec primero | Sí, con una aclaración | `research.md` R6 amplía RN-010-13 a cualquier cobro abierto (aprobado el 2026-10-18). |
| II. Dinero exacto | Sí | Cuota de ingreso en centavos con `floor`; el cobro copia la cotización. |
| III. Criterios verificables | Sí | CA-010-01 a 47 mapeados en §8. |
| IV. Seguridad | Sí | Chat y comprobantes solo para las dos partes; `403`/`404`; archivos privados con URL firmada; evidencia al admin solo con registro. |
| V. Contratos primero | Sí | `data-model.md` y `contracts/api.md`. |
| VI. Simplicidad | Sí | Sondeo corto en vez de WebSockets; plazos evaluados al actuar. |
| VII. Capas | Sí | Máquina de estados y cotización en `domain/` puro; puertos y eventos para hablar con otros módulos. |

## 1. Resumen de la solución

Módulo `join-requests` (nuevo; se agrega a la lista de `context/arquitectura.md`, ver análisis) con cuatro partes: **solicitud y su máquina de estados**, **chat** de dos personas, **pago de ingreso** (cotización, comprobante, confirmación atómica) y **reclamos**. Los plazos se guardan como fechas límite y se evalúan al leer o actuar (el servicio puede estar dormido). Aceptar una solicitud es una sola transacción que une a la persona al grupo (spec 001), asegura el ciclo vigente y crea el cobro de ingreso `pagado` (spec 002). El frontend ofrece "Unirme con un código", "Mis solicitudes" con cuenta regresiva y chat, y la cola del titular dentro del grupo.

## 2. Decisiones técnicas

| Decisión | Opción elegida | Alternativas descartadas | Motivo |
|---|---|---|---|
| Plazos | Fechas límite guardadas + estado efectivo calculado (`research.md` R1) | Solo tarea programada | Servicio dormido; CA-010-09. |
| Cupos | Conteo con el grupo bloqueado + capacidad en la base | Contador en `groups` | Evita desincronización; CA-010-06. |
| Aceptación | Una transacción en el orden de R2 | Pasos separados con eventos asíncronos | Atomicidad (RF-010-17). |
| Chat | Sondeo cada 5 s con `afterSeq` (R3) | WebSockets/SSE | Plan gratuito que duerme; solo dos personas. |
| Mensajes | Solo anexado: sin `UPDATE`, `DELETE` solo para la retención | Borrado lógico | Evidencia (RF-010-06, CA-010-23). |
| Archivos | `FileStorage` (spec 000), copia propia del QR de pago por solicitud | Referenciar el QR del grupo | El QR del grupo puede cambiar después. Requiere `FileStorage.copy` (se agrega a la spec 000). |
| Referencias | `PaymentReferenceService` de la spec 002 | Tabla propia | Unicidad única por grupo (RN-010-14). |
| Reclamos | `DisputesService` aquí; controladores de cola y resolución en 009 vía `BanPort` y `AuditPort` | Todo en 009 | Mantiene la regla del reclamo junto a la solicitud sin ciclos de módulos (R5). |
| Cobros abiertos del solicitante | Ampliar RN-010-13 a cualquier cobro abierto (R6) | Solo `atrasado` | Evita colisión con el cobro único del período. **Aprobada 2026-10-18.** |
| Estado de la cuenta | `AuthGuard` bloquea baneados; suspendidos → `ACCOUNT_RESTRICTED` en acciones nuevas | Verificar en cada servicio | Una sola regla (spec 009). |

## 3. Modelo de datos — _Camila (BD)_

Detalle en [`data-model.md`](data-model.md): `join_requests` (0050), `join_request_events` (0051), `join_messages` y `join_request_reads` (0052), `join_disputes` (0053), disparadores y la clave foránea `charges.join_request_id` (0054). Pruebas de integridad en `database/tests/join-requests.integrity.test.ts`. Seed de desarrollo: una solicitud en cada estado activo para probar la interfaz.

## 4. Contratos de API — _Leonardo (Backend)_

Detalle en [`contracts/api.md`](contracts/api.md): `POST/GET /join-requests`, `GET /groups/:id/join-requests`, `GET /join-requests/:id`, `…/payment-data`, `…/extend`, `…/proof`, `…/confirm`, `…/cash-payment`, `…/reject`, `…/cancel`, URLs firmadas, chat (`messages`, `read`) y reclamos (`disputes`).

> **Contrato congelado** al aprobarse este plan. Los cambios se hacen por PR sobre este archivo y avisando a las otras dos capas.

## 5. Lógica de dominio — _Leonardo (Backend)_

### Estructura

```text
backend/src/modules/join-requests/
├── controllers/   join-requests.controller.ts, host-requests.controller.ts, chat.controller.ts, disputes.controller.ts
├── services/      join-requests.service.ts, entry-payment.service.ts, chat.service.ts, disputes.service.ts,
│                  request-sweeper.ts (tareas), retention.service.ts, group-events.handlers.ts
├── domain/        request-state.ts, effective-state.ts, entry-quote.ts, deadlines.ts, slots.ts, dispute-rules.ts, chat-rules.ts
├── ports/         ban.port.ts, audit.port.ts, reputation-query.port.ts
└── repositories/  requests.repository.ts, events.repository.ts, messages.repository.ts, disputes.repository.ts
```

### Funciones puras

| Función | Entradas → salida | Reglas |
|---|---|---|
| `transition(status, action, ctx)` | → `{ to, event }` o `INVALID_TRANSITION` | Tabla RN-010-05 completa (acciones: `open`, `sendPaymentData`, `uploadProof`, `cashPayment`, `confirm`, `reject`, `cancel`, `expire`, `systemReject`, `systemCancel`). Todo lo demás falla (CA-010-25). |
| `effectiveState(request, now)` | → estado efectivo y motivo | Aplica los plazos vencidos (R1). `pago_informado` vencido → `expirada` / `titular_sin_respuesta`. |
| `quoteEntryShare(totalBsCents, currentMembers)` | → centavos | `floor(total / (n + 1))`. Bs 90,00 y 2 miembros → 3000; Bs 100,00 y 2 → 3333 (RN-010-01, CA-010-04/05). |
| `computeDeadlines(kind, now, opts)` | → fechas límite | 15 min de pago (+15 prórroga una vez), 60 de decisión, recordatorio a los 30, 24 h de solicitud abierta limitada por el fin de la ventana; valores de configuración (RN-010-06). |
| `availableSlots({ totalSlots, activeMembers, reserved })` | → entero | RN-010-02; `reserved` cuenta solo reservas vigentes. |
| `canOpenRequest(input)` | → lista de reglas incumplidas | Ventana abierta, grupo activo/no congelado/recibiendo, cupo, no miembro, sin cobros abiertos en el grupo, 1 por grupo, ≤ 5 totales, cuenta sin restricción. |
| `disputeEligibility({ role, request, now })` | → `{ kind, closesAt }` o motivo | Solicitante: comprobante informado y estado `rechazada` o `expirada`/`titular_sin_respuesta`. Titular: `rejectedAsFalse`. Ventana de 7 días desde `final_at`. |
| `validateChatMessage(text, image)` | → ok o reglas | 1–1.000 caracteres, imagen JPG/PNG ≤ 5 MB por firma binaria, al menos uno; el texto no se interpreta. |
| `unreadCount(messages, lastReadSeq, userId)` | → entero | Mensajes ajenos con `seq > lastReadSeq`. |

### Servicios

- **`JoinRequestsService.open(userId, code)`**: normaliza el código, `InviteCodeService.resolve` (spec 001, con límite de intentos), persiste vencimientos pendientes del solicitante (R1), evalúa `canOpenRequest` con `EntryWindow` y cupos, inserta la solicitud con `open_deadline_at`, evento `abierta`, publica `JoinRequestOpened`. Los errores usan los códigos del contrato.
- **`EntryPaymentService`**: `sendPaymentData` (bloquea grupo y solicitud, comprueba ventana y cupos, cotiza con `quoteEntryShare`, copia los datos de pago y el QR a la solicitud, fija el plazo), `extend`, `uploadProof` (mismo flujo de subida segura de la spec 002 R4; reserva la referencia con `PaymentReferenceService`), `confirm` y `cashPayment` (secuencia atómica de R2), `reject` (libera cupo, libera la referencia, `rejected_as_false` opcional), `cancel`.
- **`ChatService`**: `list(afterSeq)`, `send` (valida acceso y estado, límite de 20 por minuto con `rate_limit_events` `chat_msg`, sube imagen, inserta, publica `ChatMessageSent`), `markRead`, `imageUrl`.
- **`DisputesService`**: `open`, `respond`, `list` para las partes; `getEvidence(adminId, disputeId)` y `resolve(adminId, disputeId, result, reason)` para administración. `resolve` con `estafa_confirmada` llama `BanPort.ban(accusedId)`; ambos registran en `AuditPort` en la misma transacción.
- **`RequestSweeper`** (`joinRequests.sweep`): persiste vencimientos con `expireIfDue` por solicitud (cada una en su transacción, con `SKIP LOCKED`) y emite el recordatorio de 30 min una sola vez (`reminder_sent_at`). **`RetentionService`** (`joinRequests.retention`): R4.
- **Manejadores de eventos:** `GroupClosed` → activas a `rechazada` (`grupo_cerrado`); `UserBanned` del titular → `rechazada` (`titular_baneado`); `UserSuspended`/`UserBanned` del solicitante → `cancelada` (`solicitante_suspendido`); cuota de los miembros que cambia mientras hay solicitudes no afecta la cotización (RN-010-10).
- **Puertos que implementa:** `OwnershipBlockersPort` (spec 001) y `ReservedSlotsQuery` (spec 008). **Operaciones que expone a la spec 008:** `openFromListing(userId, listing, message)` y `rejectOpenForListing(tx, listingId, reason)`. **Puertos que define y consume:** `ListingQuotaPort.remainingOffered(tx, listingId)` (lo implementa `listings` en `app-adapters/`; aceptar nunca supera los cupos ofrecidos). **Puertos que consume:** `BanPort`, `AuditPort` (spec 009), `ReputationQueryPort` (spec 007: estrellas y nivel del titular y del solicitante; mientras no exista, devuelve `null` y la interfaz muestra "Sin calificación").

### Concurrencia

Toda acción bloquea `join_requests` por `id` con `FOR UPDATE`; las que tocan cupos bloquean además la fila de `groups` en el orden **solicitud → grupo** en toda la base de código para evitar bloqueos mutuos. `version` opcional en el cuerpo produce `409 STALE_STATE`.

## 6. Interfaz de usuario — _Adrian (Frontend)_

| Ruta | Rol | Contenido | Endpoints |
|---|---|---|---|
| `/unirse` ("Unirme con un código", acepta `?codigo=XXXXXXXX` del enlace de invitación, spec 005 RF-005-14) | Usuario | Campo del código (8 caracteres, mayúsculas automáticas), explicación breve de cómo funciona (solicitud → chat → pago → confirmación) y del límite de Vaquita (RF-010-25: "Vaquita no devuelve dinero ni obliga al titular a hacerlo"). Si la ventana está cerrada muestra la fecha de apertura. | `POST /join-requests` |
| `/solicitudes` ("Mis solicitudes") | Usuario | Tarjetas con estado, cuota estimada o cotizada, cuenta regresiva del plazo vigente y contador de mensajes no leídos; filtro activas/historial. Si el grupo tiene ventana cerrada, la fecha en que se abre. | `GET /join-requests`, `GET /me/join-requests/summary` |
| `/solicitudes/[id]` | Solicitante o titular | **Cabecera** con el servicio, el titular y su calificación, la cuota y el plazo con cuenta regresiva (se corrige con `serverNow`). **Acciones por `allowedActions`:** solicitante: pagar (ver QR/texto, copiar monto), subir comprobante (método, referencia obligatoria, archivo), cancelar; titular: enviar datos de pago (elegir texto/QR del grupo o subir otro), prorrogar, confirmar, efectivo, rechazar (modal con motivo y casilla «comprobante falso»). **Chat** debajo: burbujas, imagen con vista previa, enviar con Enter, sondeo cada 5 s (pausado si la pestaña no está visible), marca de leído al abrir. **Línea de tiempo** colapsable. **Reclamos**: botón "Abrir reclamo" (si `canOpenDispute`), formulario con descripción e imagen, respuesta de la otra parte y decisión visible. Texto fijo: "Vaquita no custodia el dinero…". | `GET /join-requests/:id`, acciones, `messages`, `disputes` |
| `/grupos/[id]` → pestaña **Solicitudes** | Titular | Cola de solicitudes del grupo (más antigua primero) con nombre, calificación en estrellas, estado y plazo; cupos `total / miembros / reservados`; ventana de ingreso ("abierta hasta…" o "se abre el…"). | `GET /groups/:id/join-requests` |

### Reglas de UX
- Cuenta regresiva en mm:ss para plazos de minutos y "faltan N h" para 24 h; al llegar a 0 el cliente recarga la solicitud (el servidor decide el estado).
- El texto de los mensajes se renderiza como texto (`textContent`), nunca como HTML; las imágenes se piden con URL firmada al abrirlas.
- Errores por `code` con mensajes claros (`NO_SLOTS_AVAILABLE`, `ENTRY_WINDOW_CLOSED` con fecha, `REFERENCE_ALREADY_USED`, `PAYMENT_DEADLINE_PASSED`, `CHAT_READ_ONLY`, `RATE_LIMITED` con segundos).
- Móvil primero: el chat ocupa la pantalla y las acciones quedan en una barra fija inferior.
- Avisos de la barra de navegación (no leídos y acciones pendientes del titular) con `GET /me/join-requests/summary` cada 30 s.

## 7. Seguridad y permisos — _Leonardo (Backend), con revisión de BD_

| Acción | Solicitante | Titular | Otro miembro | Ajeno | Admin |
|---|---|---|---|---|---|
| Ver solicitud, chat, comprobante | Sí | Sí | `403` | `404` | Solo evidencia de reclamo abierto, con auditoría |
| Abrir solicitud / cancelar / subir comprobante | Sí | `403` | `403` | — | — |
| Enviar datos de pago / confirmar / rechazar / efectivo / prorrogar | `403` | Sí | `403` | `404` | — |
| Abrir reclamo | Solo `pago_sin_ingreso` | Solo `comprobante_falso` | `403` | `404` | — |

- Archivos: firma binaria, 5 MB (QR 2 MB), claves generadas por el servidor, URL firmada ≤ 10 min, nunca rutas públicas. PDF solo como comprobante (no en el chat).
- Texto plano siempre; límite de 20 mensajes/min; el código de invitación se prueba con el límite de intentos de la spec 001.
- La cuota y los plazos salen únicamente del servidor. El cliente no envía montos.
- Los registros no incluyen texto de mensajes, referencias, URLs firmadas ni nombres de archivo.
- Todo cambio de estado y toda apertura de evidencia dejan registro (RNF-010-08).

## 8. Estrategia de pruebas

| Criterio | Nivel | Capa | Test |
|---|---|---|---|
| CA-010-01 (abrir con código válido) | Integración | BE | `join-requests.open.e2e-spec.ts` |
| CA-010-02 (miembro, cerrado, pausado, sin cupo) | Integración + integridad | BE, BD | `join-requests.open.e2e-spec.ts`; `join-requests.integrity.test.ts` |
| CA-010-03 (1 por grupo, 5 en total) | Integración + integridad | BE, BD | `join-requests.open.e2e-spec.ts`; `join-requests.integrity.test.ts` |
| CA-010-04 (Bs 90 con 2 miembros → Bs 30) | Unitario + integración | BE | `entry-quote.spec.ts`; `join-requests.payment.e2e-spec.ts` |
| CA-010-05 (Bs 100 con 2 miembros → Bs 33,33) | Unitario | BE | `entry-quote.spec.ts` |
| CA-010-06 (último cupo, dos solicitudes) | Integración | BE | `join-requests.concurrency.e2e-spec.ts` |
| CA-010-07 (comprobante a tiempo) | Integración | BE | `join-requests.payment.e2e-spec.ts` |
| CA-010-08 (6 MB / .exe) | Integración | BE | `join-requests.payment.e2e-spec.ts` |
| CA-010-09 (vence sin tarea) | Unitario + integración | BE | `effective-state.spec.ts`; `join-requests.deadlines.e2e-spec.ts` |
| CA-010-10 (comprobante tarde) | Integración | BE | `join-requests.deadlines.e2e-spec.ts` |
| CA-010-11 (confirmar: miembro, cuotas, cobro de ingreso) | Integración | BE | `join-requests.accept.e2e-spec.ts` |
| CA-010-12 (la generación no duplica; siguiente corte) | Integración | BE | `join-requests.accept.e2e-spec.ts`; `billing.entry-charge.e2e-spec.ts` |
| CA-010-13 (celulares mutuos tras aceptar) | Integración | BE | `join-requests.accept.e2e-spec.ts` (usa `GroupMember.phone`) |
| CA-010-14 (recordatorio a los 30 min) | Integración | BE | `join-requests.deadlines.e2e-spec.ts` (el aviso se verifica con 005) |
| CA-010-15 (60 min → expirada) | Integración | BE | `join-requests.deadlines.e2e-spec.ts` |
| CA-010-16 (efectivo) | Integración | BE | `join-requests.accept.e2e-spec.ts` |
| CA-010-17 (rechazar con y sin motivo) | Integración | BE | `join-requests.decisions.e2e-spec.ts` |
| CA-010-18 (cancelar) | Integración | BE | `join-requests.decisions.e2e-spec.ts` |
| CA-010-19 (chat en ≤ 10 s) | Integración + E2E | BE, FE | `chat.e2e-spec.ts`; `frontend/e2e/join-request.spec.ts` |
| CA-010-20 (404 / 403) | Integración | BE | `join-requests.permissions.e2e-spec.ts` |
| CA-010-21 (1.001 caracteres / PDF) | Unitario + integración | BE | `chat-rules.spec.ts`; `chat.e2e-spec.ts` |
| CA-010-22 (`<script>` como texto) | Integración + E2E | BE, FE | `chat.e2e-spec.ts`; `frontend/e2e/join-request.spec.ts` |
| CA-010-23 (sin editar ni borrar) | Integración + integridad | BE, BD | `chat.e2e-spec.ts`; `join-requests.integrity.test.ts` |
| CA-010-24 (final → solo lectura) | Integración | BE | `chat.e2e-spec.ts` |
| CA-010-25 (todas las transiciones) | Unitario + integridad | BE, BD | `request-state.spec.ts`; `join-requests.integrity.test.ts` |
| CA-010-26 (cuota no cambia con el tipo de cambio) | Integración + integridad | BE, BD | `join-requests.payment.e2e-spec.ts`; `join-requests.integrity.test.ts` |
| CA-010-27 (reclamo por pago sin ingreso) | Integración | BE | `disputes.e2e-spec.ts` |
| CA-010-28 (reclamo no procedente) | Unitario + integración | BE | `dispute-rules.spec.ts`; `disputes.e2e-spec.ts` |
| CA-010-29 (evidencia con auditoría; usuario normal 403) | Integración | BE | `disputes.admin.e2e-spec.ts` (requiere 009) |
| CA-010-30 (estafa confirmada → baneo y bloqueo) | Integración | BE | `disputes.admin.e2e-spec.ts` (requiere 009 y 003) |
| CA-010-31 (sin falta) | Integración | BE | `disputes.admin.e2e-spec.ts` |
| CA-010-32 (cierre del grupo o titular baneado) | Integración | BE | `join-requests.group-events.e2e-spec.ts` |
| CA-010-33 (transferir con solicitudes en pago) | Integración | BE | `join-requests.group-events.e2e-spec.ts` |
| CA-010-34 (suspendido/baneado) | Integración | BE | `join-requests.group-events.e2e-spec.ts` |
| CA-010-35 (línea de tiempo inmutable) | Integración + integridad | BE, BD | `join-requests.timeline.e2e-spec.ts`; `join-requests.integrity.test.ts` |
| CA-010-36 (flujo feliz punta a punta) | E2E | FE, BE | `frontend/e2e/mvp-flow.spec.ts` |
| CA-010-37 (ventana cerrada) | Unitario + integración | BE | `entry-window.spec.ts` (spec 001); `join-requests.open.e2e-spec.ts` |
| CA-010-38 (ventana se cierra con solicitud en pago) | Integración | BE | `join-requests.deadlines.e2e-spec.ts` |
| CA-010-39 (`abierta` al cerrar la ventana → expirada) | Integración | BE | `join-requests.deadlines.e2e-spec.ts` |
| CA-010-40 (sin referencia) | Integración + integridad | BE, BD | `join-requests.payment.e2e-spec.ts`; `join-requests.integrity.test.ts` |
| CA-010-41 (referencia repetida) | Integración | BE | `join-requests.payment.e2e-spec.ts` (usa `PaymentReferenceService`) |
| CA-010-42 (prórroga una sola vez) | Integración + integridad | BE, BD | `join-requests.payment.e2e-spec.ts`; `join-requests.integrity.test.ts` |
| CA-010-43 (comprobante falso → baneo del solicitante) | Integración | BE | `disputes.admin.e2e-spec.ts` |
| CA-010-44 (retención) | Integración | BE | `join-requests.retention.e2e-spec.ts` |
| CA-010-45 (retirado con deuda no vuelve) | Integración | BE | `join-requests.open.e2e-spec.ts` |
| CA-010-46 (evidencia inválida) | Integración | BE | `disputes.e2e-spec.ts` |
| CA-010-47 (aceptado en otro grupo del mismo servicio) | Integración | BE | `join-requests.accept.e2e-spec.ts` |

Pruebas de reglas: RN-010-01 → `entry-quote.spec.ts`; RN-010-02 → `slots.spec.ts` y `join-requests.concurrency.e2e-spec.ts`; RN-010-03/04 → `join-requests.accept.e2e-spec.ts`; RN-010-05 → `request-state.spec.ts`; RN-010-06 → `deadlines.spec.ts`; RN-010-07/08 → `disputes.admin.e2e-spec.ts`; RN-010-09 → `join-requests.group-events.e2e-spec.ts`; RN-010-10 → `join-requests.payment.e2e-spec.ts`; RN-010-11 → `join-requests.open.e2e-spec.ts`; RN-010-12 → `join-requests.deadlines.e2e-spec.ts`; RN-010-13 → `join-requests.open.e2e-spec.ts`; RN-010-14 → `join-requests.payment.e2e-spec.ts`.

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Plazos de minutos con servicio dormido | Alta | Alto | Estado efectivo al leer/actuar (R1); tick cada 5 min solo limpia. |
| Un cupo reservado bloquea a otros más de lo debido | Media | Medio | Conteo solo de reservas vigentes; vencimientos se persisten al abrir otra. |
| Interbloqueo por orden de bloqueos | Baja | Alto | Orden fijo solicitud → grupo; pruebas de concurrencia. |
| Dependencia de 009 y 005 para CA-010-14, 29, 30, 31, 43 | Alta | Medio | Núcleo mínimo de 009 (auditoría y baneo) y 005 (avisos en la app) en el hito MVP; ver `tasks.md` y el análisis. |
| Acoso o spam por chat | Media | Medio | 20 mensajes/min; el titular puede rechazar; solo hay chat con solicitudes activas; baneo por reclamo. |
| Evidencia perdida por el borrado de 2 meses antes de un reclamo | Baja | Medio | El reclamo se abre dentro de 7 días; con reclamo abierto no se borra. |
| Polling carga la base | Baja | Bajo | `afterSeq` indexado; conversación pausada si la pestaña no está visible. |
| Fraude por comprobantes falsos | Media | Alto | El titular verifica en su banco; referencia única; reclamo con baneo (RN-010-14, RF-010-24). |

## 10. Trazabilidad

| Requisito | Cubierto en |
|---|---|
| RF-010-01 a RF-010-04 (apertura) | §4 `POST /join-requests`, §5 `JoinRequestsService.open`, §6 `/unirse` |
| RF-010-05 a RF-010-10 (chat) | §4 chat, §5 `ChatService`, `chat-rules`, §6 |
| RF-010-11 a RF-010-16, RF-010-28 (pago de ingreso) | §5 `EntryPaymentService`, `quoteEntryShare`, `computeDeadlines` |
| RF-010-17 a RF-010-20 (confirmación) | §5 `confirm`/`cashPayment`, `research.md` R2 |
| RF-010-21 a RF-010-25 (reclamos) | §4, §5 `DisputesService`, `research.md` R5, §6 |
| RF-010-26, RF-010-27 (consulta, línea de tiempo) | §4, §6, `data-model.md` (`join_request_events`) |
| RNF-010-01 a RNF-010-09 | §7, §5 (concurrencia), `research.md` R1 y R4 |
| RN-010-01 a RN-010-14 | §8 (pruebas de reglas) |
| CA-010-01 a CA-010-47 | §8 |
