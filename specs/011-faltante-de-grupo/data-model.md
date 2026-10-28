# Modelo de datos — Spec 011

Tres tablas nuevas. No se modifica `charges` ni `billing_cycles` (decisión: el pago adicional no es un cobro del ciclo; vive en su propia fila para no romper la unicidad RF-002-04 ni los resúmenes de la spec 002).

## `shortfall_rounds`
Una fila por ronda de regularización.

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| group_id | uuid FK groups | |
| cycle_id | uuid FK billing_cycles | ciclo cuyo total se regulariza |
| period | text `AAAA-MM` | copia del ciclo |
| round_number | smallint 1..2 | UNIQUE (group_id, period, round_number) |
| status | text | `abierta` / `cerrada` / `cancelada` |
| total_bs_cents | bigint > 0 | copia del ciclo |
| member_count_after | smallint ≥ 1 | miembros que se quedan (titular incluido) |
| base_share_cents | bigint > 0 | `floor(total / member_count_after)` |
| owner_share_cents | bigint > 0 | base + resto |
| shortfall_cents | bigint > 0 | Σ extras |
| opened_by | uuid FK users | titular |
| opened_at, respond_by, pay_by | timestamptz | `respond_by` ≤ `pay_by` |
| closed_at | timestamptz | solo si no está abierta |
| version | integer | control optimista |

Restricción: UNIQUE parcial (group_id) WHERE status = 'abierta'. Copia inmutable (trigger).

## `shortfall_responses`
Una fila por miembro afectado: UNIQUE (round_id, user_id).

| Columna | Nota |
|---|---|
| paid_cents | lo pagado en el período (copia) |
| extra_due_cents ≥ 0 | lo que debe agregar (cotización) |
| choice | `pendiente` / `cubrir` / `devolucion` / `sin_respuesta` |
| responded_at | |
| extra_status | `no_aplica` / `pendiente_pago` / `informado` / `confirmado` / `vencido` |
| extra_method, extra_reference, extra_informed_at, extra_confirmed_at, extra_confirmed_by, extra_deadline_at, extra_reject_reason | pago adicional |
| refund_status | `no_aplica` / `pendiente` / `enviada` / `confirmada` / `disputada` |
| refund_amount_cents | = paid_cents |
| refund_method, refund_reference, refund_sent_at, refund_confirmed_at, refund_disputed_at, refund_dispute_reason, refund_due_at | devolución |
| version | |

Coherencia por CHECK: `extra_status` ≠ `no_aplica` solo con `choice = cubrir` (o `vencido`); `refund_status` ≠ `no_aplica` solo con `choice` en (`devolucion`, `sin_respuesta`) o `extra_status = vencido`.

## `shortfall_events`
Solo anexado (`forbid_update_delete`): round_id, response_id nullable, type, actor_kind (`usuario`/`sistema`), actor_id, reason, metadata jsonb, occurred_at.
