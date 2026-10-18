# Investigación — Spec 010: Solicitudes de ingreso y chat

- **Fecha:** 2026-10-18
- Períodos, ventana de ingreso y comunicación entre módulos: `specs/001-suscripciones-compartidas/research.md` (R1 a R4). Archivos y referencias: `specs/002-cobros-y-pagos/research.md` (R3, R4).

## R1. Plazos evaluados al actuar y cupos reservados

**Problema.** Los plazos son de minutos (15, 30, 60) y el servicio gratuito puede estar dormido: una tarea no puede ser la fuente de verdad (RNF-010-03, CA-010-09).

**Decisión.**

- Cada solicitud guarda sus **fechas límite** (`open_deadline_at`, `pay_deadline_at`, `decision_deadline_at`), calculadas con la hora del servidor al ocurrir el evento que las inicia (RN-010-06).
- Una función pura `effectiveState(request, now)` devuelve el estado real: por ejemplo `esperando_pago` con `pay_deadline_at <= now` es `expirada` (`plazo_pago`). **Todas las lecturas** usan el estado efectivo (sin escribir), y **toda acción** primero persiste el vencimiento (`expireIfDue`, con la fila bloqueada) y luego decide. La tarea `joinRequests.sweep` solo limpia lo que nadie tocó.
- **Cupos reservados** = solicitudes `esperando_pago` con `pay_deadline_at > now` + `pago_informado` con `decision_deadline_at > now`. Se cuentan con el grupo bloqueado (`SELECT … FOR UPDATE` de `groups`) al enviar los datos de pago (CA-010-06). Una solicitud vencida pero no persistida no ocupa cupo (CA-010-09).
- Al abrir una solicitud nueva, primero se persisten los vencimientos del solicitante en ese grupo (para que una solicitud vencida no bloquee el índice único `join_requests_active_uq`) y se cuentan las activas efectivas para el máximo de 5.

**Alternativas descartadas.** Depender solo de la tarea (falla con el servicio dormido); `NOTIFY/LISTEN` o colas (servicios extra).

## R2. Aceptación atómica

El orden dentro de la transacción de `confirm` y `cash-payment` evita los conflictos entre specs:

1. Bloquear la solicitud (`FOR UPDATE`), `expireIfDue`, validar estado y `version`.
2. Bloquear el grupo (`FOR UPDATE`), validar que sigue activo y no congelado.
3. `BillingCyclesService.ensureCurrentCycle(tx, groupId, now)`: crea el ciclo del último corte **antes** de agregar a la persona (si no, la generación le crearía un segundo cobro; CA-002-24). Devuelve el ciclo y su período.
4. `MembershipService.addMemberTx(tx, …, 'solicitud', requestId)`; el disparador de capacidad de la base es la última defensa (RF-010-20).
5. `ChargesService.createEntryCharge(tx, …)` con la cuota cotizada, la referencia a la solicitud y el comprobante.
6. Pasar la solicitud a `aceptada`, fijar `charge_id`, evento y publicar `JoinRequestAccepted`.
7. Cancelar las demás solicitudes `abierta` de la persona a grupos **del mismo servicio del catálogo** (RN-008-05, CA-010-47). Los grupos con servicio personalizado no tienen servicio común y no cancelan nada.

Todo o nada: si cualquier paso falla, la persona no entra y el cobro no se crea.

## R3. Chat: sondeo corto, no WebSockets

El requisito es ver mensajes nuevos en ≤ 10 s (RF-010-09). Con el plan gratuito de Render (el servicio se duerme y se reinicia), una conexión persistente se pierde y complica el despliegue. **Decisión:** sondeo cada 5 s mientras la conversación está abierta y cada 30 s para el contador de no leídos en la barra (`GET /me/join-requests/summary`); `afterSeq` evita retransmitir. Cada sondeo es una consulta indexada (`join_messages_request_idx`). Se pausa cuando la pestaña no está visible.

**Alternativas descartadas.** WebSockets / Server-Sent Events (se cortan al dormirse el servicio y requieren más infraestructura para un chat de dos personas).

## R4. Retención y borrado de evidencia

- `RetentionService` (diario) busca solicitudes con `final_at < ahora − 2 meses`, `content_purged_at IS NULL` y **sin reclamo abierto**; para las que tienen reclamo resuelto usa `resolved_at < ahora − 2 meses` (RF-010-07, RNF-010-09).
- Borra archivos del almacén (imágenes del chat, comprobante, QR enviado, evidencias de reclamos) y, dentro de una transacción con `SET LOCAL vaquita.allow_purge = 'on'`, las filas de `join_messages`. Conserva `join_request_events`, la referencia de pago (para la unicidad) y la decisión del reclamo.
- Si falla el borrado de un archivo, no se marca `content_purged_at` y se reintenta al día siguiente.

## R5. Reclamos y baneo

El baneo lo decide una persona (administrador) al resolver (RN-010-08); un reclamo por sí solo no hace nada. Cadena de llamadas, sin ciclos de módulos:

`AdminDisputesController` (009) → `DisputesService.resolve` (010) → `BanPort.ban(userId, { source: 'dispute', disputeId })` (definido por 010, implementado por 009, que bloquea correo, celular, cédula y cuenta de Telegram con huellas irreversibles y publica `UserBanned`).

`DisputesService.getEvidence` arma la evidencia (línea de tiempo, chat, comprobante, cotización, descripciones, respuestas) y registra la apertura mediante `AuditPort.record` (definido por 010, implementado por 009) en la misma transacción: no se entrega evidencia sin dejar registro (CA-010-29).

## R6. Cobros abiertos del solicitante en el grupo

RN-010-13 prohíbe abrir solicitud con un cobro **atrasado** en el grupo. Pero un exmiembro con un cobro **pendiente** (por ejemplo, quitado por el titular a mitad de período) que vuelve dentro de la ventana chocaría con el cobro único del período (`charges_member_period_uq`).

**Propuesta (aclaración, ver análisis).** Ampliar la regla: no se puede abrir una solicitud al grupo si la persona tiene **cualquier cobro abierto** (`pendiente`, `en_revision` o `atrasado`) en él. Es el superconjunto natural de RN-010-13 y evita una colisión sin casos especiales. El plan implementa esta versión ampliada (`OPEN_CHARGES_IN_GROUP`).
