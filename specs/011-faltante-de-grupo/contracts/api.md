# Contrato de API — Spec 011: Faltante de grupo

- **Responsable:** Leonardo Guzman (Backend) · **Estado:** propuesto; se congela al aprobar el plan
- Rige la parte A de `specs/000-setup-del-proyecto/contracts/api.md`. **El frontend no calcula montos ni estados**: usa los campos `...Cents`, `status` y `allowedActions` del backend.
- Acceso: el titular ve la ronda completa; un miembro afectado ve solo su fila; otro miembro del grupo recibe `403`; ajeno al grupo, `404`.

## Objetos

```ts
ShortfallQuote {
  groupId; cycleId; period: "2026-10";
  totalBsCents; memberCountAfter; baseShareCents; ownerShareCents; shortfallCents;
  rows: { userId; fullName; paidCents; extraDueCents }[];        // solo afectados
}

ShortfallRound {
  id; groupId; period; roundNumber: 1 | 2; status: "abierta" | "cerrada" | "cancelada";
  totalBsCents; memberCountAfter; baseShareCents; ownerShareCents; shortfallCents;
  openedAt; respondBy; payBy; closedAt: string | null; version;
  rows: ShortfallRow[];                 // titular: todas; miembro: solo la suya
  allowedActions: ("cancel")[];         // según quién consulta
}

ShortfallRow {
  id; roundId; groupId; member: { userId; fullName };
  paidCents; extraDueCents;
  choice: "pendiente" | "cubrir" | "devolucion" | "sin_respuesta";
  extra: { status: "no_aplica" | "pendiente_pago" | "informado" | "confirmado" | "vencido";
           method: "qr" | "transferencia" | null; reference: string | null; deadlineAt: string | null; rejectReason: string | null };
  refund: { status: "no_aplica" | "pendiente" | "enviada" | "confirmada" | "disputada";
            amountCents: number | null; method; reference: string | null; dueAt: string | null; disputeReason: string | null };
  version;
  allowedActions: ("cover" | "requestRefund" | "pay" | "confirmPayment" | "rejectPayment"
                  | "sendRefund" | "confirmRefund" | "disputeRefund")[];
  timeline: { type; actor: { userId; fullName } | null; reason: string | null; occurredAt }[];
}
```

## Endpoints

| Método y ruta | Quién | Cubre |
|---|---|---|
| `GET /groups/:groupId/shortfall/preview` | Titular | RF-011-01..03, CA-011-01, 02 |
| `POST /groups/:groupId/shortfall` | Titular | RF-011-04, 05, 07; CA-011-03, 04, 14 |
| `GET /groups/:groupId/shortfall` | Titular / afectado | RF-011-04; CA-011-13 |
| `POST /shortfall-rounds/:roundId/cancel` | Titular | RF-011-06 |
| `GET /me/shortfalls` | Miembro | HU-011-02 |
| `POST /shortfall-rows/:rowId/respond` `{ choice: "cubrir" \| "devolucion", version? }` | Afectado | RF-011-08, 09; CA-011-05, 06 |
| `POST /shortfall-rows/:rowId/pay` `{ method, reference, version? }` | Afectado | RF-011-10 |
| `POST /shortfall-rows/:rowId/confirm-payment` `{ version? }` | Titular | RF-011-10; CA-011-07 |
| `POST /shortfall-rows/:rowId/reject-payment` `{ reason, version? }` | Titular | RF-011-10; CA-011-07 |
| `POST /shortfall-rows/:rowId/refund` `{ method, reference, version? }` | Titular | RF-011-12; CA-011-10 |
| `POST /shortfall-rows/:rowId/refund/confirm` `{ version? }` | Afectado | RF-011-12; CA-011-11 |
| `POST /shortfall-rows/:rowId/refund/dispute` `{ reason, version? }` | Afectado | RF-011-13; CA-011-11 |

Las acciones responden con la `ShortfallRow` actualizada (la creación, con el `ShortfallRound`).

## Errores propios

`NO_SHORTFALL` (422) · `ROUND_ALREADY_OPEN` (422) · `ROUND_LIMIT_REACHED` (422) · `ROUND_HAS_RESPONSES` (422) · `DEADLINE_PASSED` (422) · `GROUP_CLOSED` / `GROUP_FROZEN` (422) · `INVALID_TRANSITION` (409) · `STALE_STATE` (409) · `FORBIDDEN` (403) · `NOT_FOUND` (404).

## Tarea programada

`shortfalls.sweep` (cada tick, idempotente): aplica los vencimientos de RF-011-11 y cierra las rondas resueltas (RF-011-14). La disputa por falta de registro (RF-011-12) la abre la persona, no la tarea.

## Eventos internos (`TxEventBus`)

`shortfalls.opened` · `shortfalls.payment-informed` · `shortfalls.payment-confirmed` · `shortfalls.payment-rejected` · `shortfalls.refund-opened` · `shortfalls.refund-sent` · `shortfalls.refund-resolved` (`confirmada` o `disputada`) · `shortfalls.closed`.
