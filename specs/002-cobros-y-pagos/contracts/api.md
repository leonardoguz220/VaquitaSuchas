# Contrato de API — Spec 002: Cobros y pagos

- **Responsable:** Leonardo Guzman (Backend)
- **Estado:** propuesto; se congela al aprobar el plan
- Rige la parte A de `specs/000-setup-del-proyecto/contracts/api.md`. **El frontend no calcula montos ni estados**: usa los campos `...Cents` y `status` del backend, y muestra las acciones que indica `allowedActions`.

## Reglas de acceso (RNF-002-01, RNF-002-07, CA-002-12, CA-002-13, CA-002-23, CA-002-32)

Para un cobro `C` y la persona que consulta `U`:

| Quién es `U` | Resultado |
|---|---|
| Titular del grupo de `C` | Acceso completo (incluye cobros y comprobantes de miembros ya quitados o retirados) |
| Dueño de `C` (`C.userId = U`) y miembro activo del grupo | Acceso completo a su cobro |
| Dueño de `C` **ya no miembro** y `C.status` ∈ {`atrasado`, `en_revision`} | Acceso a su cobro para pagar la deuda (RN-002-11); no ve nada más del grupo |
| Otro miembro activo del grupo | `403 FORBIDDEN` en detalle y comprobante; en el historial ve la versión pública (`ChargePublic`) |
| Cualquier otra persona | `404 NOT_FOUND` |

Grupo `cerrado`: se pueden seguir saldando los cobros ya existentes (subir, confirmar, rechazar, pago manual, cancelar), pero no se generan cobros nuevos ni se marcan atrasos (ver plan §2). Grupo congelado por titular baneado: toda acción de escritura responde `422 GROUP_FROZEN`.

## Objetos

```ts
ChargeStatus = "pendiente" | "en_revision" | "pagado" | "atrasado" | "cancelado"

ChargePublic {                       // lo que ve cualquier miembro del grupo (RF-002-16/17)
  id; groupId; period: "2026-10"; origin: "ciclo" | "ingreso";
  member: { userId; fullName; isFormerMember: boolean };
  amountCents: number; status: ChargeStatus;
  dueAt: string; paidAt: string | null;
  timeline: { type; actor: { userId; fullName } | null /* null = sistema */; occurredAt }[];   // sin motivos ni notas
}

Charge extends ChargePublic {        // dueño y titular
  cycleId; issuedAt; firstSubmittedAt: string | null;
  priceCents; currency; exchangeRate: string | null; totalBsCents; memberCount;       // copia (RF-002-02)
  settlement: "comprobante" | "manual" | "ingreso" | null; settledBy: { userId; fullName } | null; manualNote: string | null;
  cancelReason: string | null;
  lastRejection: { reason: string; invalidReceipt: boolean; at: string } | null;      // para que el miembro vea el motivo (CA-002-07)
  currentReceipt: Receipt | null; receipts: Receipt[];                                 // historial del cobro (RF-002-08)
  timeline: ChargeEvent[];                                                            // con motivos y metadatos
  paymentInfo: { text: string | null; qrUrl: string | null; configured: boolean } | null;   // solo mientras el cobro admite pago (RF-002-09)
  allowedActions: ("uploadReceipt" | "confirm" | "reject" | "manualPayment" | "cancel")[];   // según quién consulta y el estado
  version: number;
}

Receipt { id; uploadedAt; uploadedBy: { userId; fullName }; method: "qr" | "transferencia"; reference: string;
          mime; sizeBytes; status: "vigente" | "reemplazado" | "rechazado" | "confirmado"; fileAvailable: boolean }

ChargeEvent { id; type; actor: { userId; fullName } | null; fromStatus; toStatus; reason: string | null; occurredAt }

PeriodSummary {                       // RF-002-16 y RF-002-18
  period: "2026-10"; cycleType: "inicial" | "regular";
  cutDate: "2026-10-15"; dueAt: string;
  totalBsCents; memberCount; baseShareCents; ownerShareCents;
  rows: { charge: ChargePublic; isFormerMember: boolean }[];                   // un cobro por miembro; sin comprobantes ni referencias
  ownerTotals?: { expectedCents; collectedCents; pendingCents; overdueCents };  // solo si consulta el titular (RF-002-18)
}
```

`ownerTotals`: `expectedCents` = Σ cobros del período distintos de `cancelado`; `collectedCents` = Σ `pagado`; `pendingCents` = Σ (`pendiente` + `en_revision`); `overdueCents` = Σ `atrasado`. Siempre `expected = collected + pending + overdue` (CA-002-20).

## Endpoints

### `GET /me/charges` (RF-002-15, HU-002-01)
- **Auth:** sesión. **Query:** `status` (uno o varios), `period` (`YYYY-MM`), `groupId`, `limit`, `cursor`.
- **Response 200:** `{ items: Charge[], nextCursor }` con los cobros **de la persona** (sin `receipts` completos: solo `currentReceipt`). Ordenados por `dueAt` descendente. Incluye cobros de grupos de los que ya no es miembro **solo** si están `atrasado` o `en_revision` (CA-002-32). Cada ítem lleva `group: { id, name, serviceName, logoUrl }`.

### `GET /charges/:chargeId`
- **Auth:** según la tabla de acceso. **Response 200:** `Charge`. **Errores:** `403`, `404`.

### `POST /charges/:chargeId/receipts` (RF-002-06, 07, 08; CA-002-04, 05, 26, 27)
- **Auth:** dueño del cobro (miembro activo o retirado con deuda). `multipart/form-data`: `file` (JPG, PNG o PDF, máximo 5 MB), `method` (`qr` | `transferencia`), `reference` (1–100 caracteres, obligatoria), `version` (opcional).
- **Response 201:** `Charge` ya en `en_revision`. Si el cobro estaba `en_revision`, reemplaza al comprobante vigente (RF-002-08).
- **Errores:** `400 VALIDATION_ERROR` (sin `reference` o `method`), `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE` (se valida el tipo real), `409 INVALID_TRANSITION` (`details.from = "pagado" | "cancelado"`, mensaje "Este cobro ya no admite cambios."), `409 REFERENCE_ALREADY_USED` (otro comprobante del grupo usa esa referencia), `409 STALE_STATE`, `422 GROUP_FROZEN`, `503 SERVICE_UNAVAILABLE` (falla del almacén: el cobro no cambia de estado y se puede reintentar).

### `GET /charges/:chargeId/receipts/:receiptId/file` (RNF-002-01)
- **Auth:** titular o dueño del cobro (tabla de acceso). **Response 200:** `{ url, expiresAt, mime }` con URL firmada de 10 minutos como máximo. `410 GONE` (`FILE_DELETED`) si ya se aplicó la retención de 2 meses. Cada emisión se registra en el log de la aplicación (sin la URL).

### `POST /charges/:chargeId/confirm` (RF-002-10; CA-002-06)
- **Auth:** titular. **Request:** `{ version? }`. **Response 200:** `Charge` en `pagado` (`settledBy`, `paidAt`). El comprobante vigente pasa a `confirmado`.
- **Errores:** `403` si quien llama es el dueño del cobro y no es titular (CA-002-12); `409 INVALID_TRANSITION` si no está `en_revision`; `409 STALE_STATE`.

### `POST /charges/:chargeId/reject` (RF-002-11; CA-002-07, 08)
- **Auth:** titular. **Request:** `{ reason: string /* 5–200 */, invalidReceipt: boolean, version? }`. **Response 200:** `Charge` en `pendiente` si `now < dueAt`, o en `atrasado` si ya venció (sin retiro del miembro, CA-002-30). El comprobante vigente pasa a `rechazado` y su referencia queda libre.
- **Errores:** `400 VALIDATION_ERROR` (motivo ausente o fuera de rango), `409 INVALID_TRANSITION`.

### `POST /charges/:chargeId/manual-payment` (RF-002-12, RN-002-08; CA-002-14)
- **Auth:** titular. **Request:** `{ note?: string /* ≤200 */, paidAt?: string /* ISO; por defecto ahora; entre issuedAt y ahora */, version? }`. **Response 200:** `Charge` en `pagado` con `settlement: "manual"`.
- **Errores:** `409 INVALID_TRANSITION` si no está `pendiente` o `atrasado`; `400` por fecha fuera de rango.

### `POST /charges/:chargeId/cancel` (RF-002-13, RN-002-07; CA-002-15)
- **Auth:** titular. **Request:** `{ reason: string /* 5–200 */, version? }`. **Response 200:** `Charge` en `cancelado`.
- **Errores:** `409 INVALID_TRANSITION` si no está `pendiente` o `atrasado`.

### `GET /groups/:groupId/charges` (RF-002-17; CA-002-18)
- **Auth:** miembro activo del grupo (`404` si no pertenece). **Query:** `period`, `status`, `userId`, `limit`, `cursor`.
- **Response 200:** `{ items: ChargePublic[], nextCursor }` — historial del grupo, ordenado por período y fecha de emisión descendentes. Nunca incluye comprobantes ni referencias (RNF-002-07). El titular obtiene `Charge` completo en cada ítem.

### `GET /groups/:groupId/billing/summary?period=YYYY-MM` (RF-002-16, RF-002-18; CA-002-17, 20)
- **Auth:** miembro activo. `period` por defecto: el período del último ciclo. **Response 200:** `PeriodSummary` más `availablePeriods: string[]` para el selector. Si el grupo todavía no tiene ciclo para ese período: `404 NOT_FOUND`.

### Operaciones internas (no son endpoints)

Servicios que otros módulos usan (puertos definidos en `shared/ports` o por el módulo consumidor, ver plan §5):

| Servicio | Quién lo usa | Qué hace |
|---|---|---|
| `BillingCyclesService.ensureCurrentCycle(tx, groupId, now)` | Tarea `billing.generate`; spec 010 al aceptar un ingreso | Crea, si falta, el ciclo del último corte y los cobros de los miembros activos (idempotente) y devuelve el ciclo vigente con su período. |
| `ChargesService.createEntryCharge(tx, { groupId, userId, joinRequestId, amountCents, snapshot, proof })` | Spec 010 | Crea el cobro `pagado` de origen `ingreso` (RF-002-19). |
| `PaymentReferenceService.reserve / release` | Specs 002 y 010 | Reserva única por grupo (RN-010-14). |
| `OpenChargesPort` (`subscriptions` lo define, `billing` lo implementa) | Spec 001 | Cobros `pendiente`/`en_revision`/`atrasado` de una persona en un grupo. |
| `BillingReadService` | Specs 006, 007 | Lectura de ciclos y cobros para el panel y la reputación. |

### Tareas programadas (se registran en el ejecutor de la spec 000)

| Tarea | Frecuencia | Efecto |
|---|---|---|
| `billing.generate` | cada tick (5 min) | Para cada grupo activo y no congelado cuyo último corte no tenga ciclo: lo crea con sus cobros. |
| `billing.overdue` | cada tick | Cobros `pendiente` con `dueAt <= ahora`: `atrasado` + retiro del miembro (RF-002-14). |
| `billing.retention` | diaria | Elimina los archivos de comprobantes de grupos cerrados hace más de 2 meses (CA-002-33). |

## Eventos internos (`TxEventBus`)

`ChargeGenerated`, `ChargeSubmitted`, `ChargeConfirmed`, `ChargeRejected`, `ChargeCancelled`, `ChargeBecameOverdue`, `MemberRemovedForNonPayment`. Los consume la spec 005 (avisos) dentro de la misma transacción.

## Errores propios de la spec

| `code` | HTTP | Cuándo |
|---|---|---|
| `REFERENCE_ALREADY_USED` | 409 | RN-010-14 / CA-002-27 (`details.rule = "RN-010-14"`). |
| `FILE_DELETED` | 410 | El archivo ya fue eliminado por retención (RN-002-06). |
| `GROUP_FROZEN` | 422 | Titular baneado (RF-002-05). |
| `INVALID_TRANSITION` | 409 | Transición fuera de RN-002-01; `details: { from, action }`. |

> **Contrato congelado** al aprobarse el plan. Los cambios se hacen por PR sobre este archivo avisando a las otras dos capas.
