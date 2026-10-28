# Plan de implementación — Spec 011

## 1. Enfoque
Módulo nuevo `backend/src/modules/shortfalls` con las cuatro capas (controllers, services, domain, repositories). No toca `charges`: el pago adicional vive en `shortfall_responses`. Reutiliza `MembersRepository.markLeft` + evento `groups.member-removed` para la salida, `NotificationService` para los avisos y el ejecutor de tareas de la spec 000.

## 2. Dominio puro (`domain/`)
- `shortfall-quote.ts`: `quoteShortfall({ totalBsCents, memberCountAfter, paid[] })`.
- `deadlines.ts`: `computeRoundDeadlines(now, config)`, `computePayDeadline`.
- `state.ts`: `nextExtraStatus`, `nextRefundStatus`, `nextRoundStatus` con tabla completa; transición inválida → `INVALID_TRANSITION`.
- `allowed-actions.ts`: acciones por rol y estado.

## 3. Servicios
`ShortfallsService` (cotizar, abrir, consultar, cancelar), `ShortfallResponsesService` (responder, pagar, confirmar/rechazar, devolución), `ShortfallSweeper`. Bloqueo: grupo → ronda → fila.

## 4. Decisiones
- D1: el pago adicional no es un cobro de la spec 002 (evita cambiar RF-002-04, triggers y resúmenes).
- D2: sin archivos de comprobante; método + referencia.
- D3: la salida por devolución usa el motivo `abandono` y publica `groups.member-removed`.
- D4: la disputa queda registrada y avisada; el administrador la ve cuando se integre a la cola de la spec 009.

## 5. Riesgos
| Riesgo | Mitigación |
|---|---|
| Doble acción simultánea | `FOR UPDATE` + `version` |
| Cotización desfasada | Se fija al abrir y es inmutable (trigger) |
| Salida de miembro durante la ronda | El barrido y las acciones leen el estado real de `group_members` |
