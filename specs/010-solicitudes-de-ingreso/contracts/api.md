# Contrato de API — Spec 010: Solicitudes de ingreso y chat

- **Responsable:** Leonardo Guzman (Backend)
- **Estado:** propuesto; se congela al aprobar el plan
- Rige la parte A de `specs/000-setup-del-proyecto/contracts/api.md`. **El frontend no calcula cuotas, plazos ni estados**: usa `quote.amountCents`, `phase` y `allowedActions`, y dibuja la cuenta regresiva con `deadlineAt` y `serverNow`.

## Reglas de acceso (RNF-010-01, RNF-010-02)

| Quién es la persona | Resultado |
|---|---|
| Solicitante de la solicitud | Acceso a su solicitud, su chat y sus reclamos |
| Titular actual del grupo | Acceso a las solicitudes de su grupo, su chat y sus reclamos |
| Otro miembro activo del grupo | `403 FORBIDDEN` |
| Cualquier otra persona | `404 NOT_FOUND` |
| Administrador | Sin acceso, salvo la evidencia de un reclamo abierto a través de los endpoints de la spec 009 (cada apertura queda en el log de auditoría) |

El celular del solicitante no se incluye en ninguna respuesta de esta spec; el titular lo ve desde el grupo (`GroupMember.phone`, spec 001) una vez aceptada la solicitud.

## Objetos

```ts
JoinRequestStatus = "abierta" | "esperando_pago" | "pago_informado" | "aceptada" | "rechazada" | "cancelada" | "expirada"

JoinRequestPhase {                // el plazo vigente; evaluado con la hora del servidor al responder (RNF-010-03)
  status: JoinRequestStatus;      // estado efectivo: ya aplica los plazos vencidos aunque la tarea no haya corrido
  deadlineAt: string | null;      // vencimiento del plazo vigente
  deadlineKind: "solicitud" | "pago" | "decision" | null;
  serverNow: string;              // para la cuenta regresiva del cliente
}

JoinRequest {
  id; group: { id; name; serviceName; planName | null; logoUrl; brandColor; billingDay };
  applicant: { userId; fullName; stars: number | null; level: string | null };
  host: { userId; fullName; stars: number | null; level: string | null };
  source: "codigo" | "publicacion";
  phase: JoinRequestPhase;
  openedAt: string;
  estimatedShareCents: number;                  // cuota estimada con los miembros actuales + 1 (RF-010-03); NO es la cotización
  quote: { amountCents; priceCents; currency; exchangeRate: string | null; totalBsCents; memberCount } | null;   // fijada al enviar los datos de pago (RN-010-01)
  paymentInfo: { text: string | null; qrAvailable: boolean } | null;        // solo el solicitante y el titular; el QR se pide con GET …/payment-qr
  extended: boolean;
  proof: { method; reference; mime; sizeBytes; uploadedAt; fileAvailable } | null;
  entryWindow: { isOpen; opensAt: string | null; closesAt: string | null };  // del grupo (spec 001)
  finalReason: string | null; rejectReason: string | null; rejectedAsFalse: boolean;
  chargeId: string | null;
  unreadCount: number;
  disputes: { id; kind; status; openedByMe: boolean; canRespond: boolean }[];    // hasta una por parte
  canOpenDispute: { kind: "pago_sin_ingreso" | "comprobante_falso"; closesAt: string } | null;   // null si no corresponde o ya la abrió
  allowedActions: ("sendPaymentData" | "extend" | "uploadProof" | "confirm" | "cashPayment" | "reject" | "cancel" | "sendMessage" | "openDispute" | "respondDispute")[];
  timeline: { type; actor: { userId; fullName } | null; fromStatus; toStatus; reason: string | null; occurredAt }[];
  version: number;
}

JoinMessage { id; seq: number; senderId; body: string | null; imageAvailable: boolean; createdAt }

Dispute {
  id; kind: "pago_sin_ingreso" | "comprobante_falso"; status: "abierto" | "resuelto";
  openedBy: { userId; fullName }; description; evidenceAvailable: boolean; openedAt;
  response: { text; evidenceAvailable: boolean; respondedAt } | null;
  resolution: { result: "estafa_confirmada" | "sin_falta"; reason; resolvedAt } | null;     // visible para ambas partes (RF-010-24)
}
```

## Endpoints: solicitud

### `POST /join-requests` (RF-010-01, RF-010-03, RF-010-04; CA-010-01 a 03, 34, 37, 45)
- **Auth:** sesión. **Request:** `{ "code": "K7M2Q9XA" }` (se normaliza a mayúsculas sin espacios; cuenta para el límite de intentos de la spec 001).
- **Response 201:** `JoinRequest` en `abierta` (aún sin `quote`, sin `paymentInfo`; el chat existe). Se crea en una transacción: solicitud, evento `abierta`, aviso al titular.
- **Errores:**
  - `422 INVALID_INVITE_CODE` — código inexistente, regenerado o de grupo cerrado (mensaje genérico "Código inválido").
  - `429 RATE_LIMITED` — 10 códigos inválidos en 15 min (spec 001).
  - `422 BUSINESS_RULE` con `details.rule`: `RF-001-22` (código `ENTRY_WINDOW_CLOSED`, `details.opensAt`), `RF-001-09` (`GROUP_NOT_ACCEPTING`), `RN-010-02` (`NO_SLOTS_AVAILABLE`), `RF-010-02` (`ACTIVE_REQUEST_EXISTS` en el mismo grupo o `TOO_MANY_ACTIVE_REQUESTS`, más de 5 en total), `RN-010-13` (`OPEN_CHARGES_IN_GROUP`: tiene un cobro `atrasado` —o cualquier cobro abierto— en ese grupo), el solicitante ya es miembro (`ALREADY_MEMBER`), `GROUP_FROZEN`.
  - `403 ACCOUNT_RESTRICTED` — cuenta suspendida o baneada (spec 009).

### `GET /join-requests` (RF-010-26; RNF-010-07)
- **Auth:** sesión. **Query:** `role` (`solicitante` | `titular`, por defecto ambos), `status` (uno o varios), `groupId`, `limit`, `cursor`.
- **Response 200:** `{ items: JoinRequest[], nextCursor }` — como solicitante, **sus** solicitudes (más recientes primero); como titular, las de **sus grupos** de la **más antigua a la más reciente** con el nombre y la calificación del solicitante. Para un grupo con ventana cerrada, cada ítem lleva `entryWindow.opensAt`.

### `GET /groups/:groupId/join-requests` (RF-010-26)
- **Auth:** titular del grupo (`403` miembro, `404` ajeno). Mismos parámetros y respuesta que lo anterior, restringida al grupo. Incluye `slots: { total, members, reserved, available }` para que el titular vea los cupos (RN-010-02).

### `GET /join-requests/:id`
- **Auth:** solicitante o titular. **Response 200:** `JoinRequest` con la línea de tiempo completa (RF-010-27, CA-010-35).

### `GET /me/join-requests/summary`
- **Auth:** sesión. **Response 200:** `{ unreadMessages: number, actionableAsHost: number, activeAsApplicant: number }` — para las insignias de la barra de navegación.

### `POST /join-requests/:id/payment-data` (RF-010-11, RF-010-12; CA-010-04 a 06, 26, 38)
- **Auth:** titular. `multipart/form-data`: `text` (≤ 500 caracteres, opcional), `qr` (JPG/PNG ≤ 2 MB, opcional) y `version` (opcional). Si no se envían ni texto ni QR se usan los datos de pago configurados en el grupo (spec 001, RF-001-20); si el grupo no tiene ninguno → `422 BUSINESS_RULE` (`PAYMENT_INFO_MISSING`).
- **Response 200:** `JoinRequest` en `esperando_pago` con `quote` y `phase.deadlineAt = ahora + 15 min`.
- **Errores:** `409 INVALID_TRANSITION` (no está `abierta`), `422 BUSINESS_RULE`: `RF-001-22` (`ENTRY_WINDOW_CLOSED`: la ventana terminó), `RN-010-02` (`NO_SLOTS_AVAILABLE`: la solicitud sigue `abierta`), `GROUP_FROZEN`; `409 STALE_STATE`.

### `POST /join-requests/:id/extend` (RF-010-28; CA-010-42)
- **Auth:** titular. **Response 200:** `JoinRequest` con `extended: true` y el plazo + 15 min. **Errores:** `422 BUSINESS_RULE` `RF-010-28` (`ALREADY_EXTENDED`), `409 INVALID_TRANSITION` (no está `esperando_pago` o ya venció).

### `POST /join-requests/:id/proof` (RF-010-13; CA-010-07, 08, 10, 40, 41)
- **Auth:** solicitante. `multipart/form-data`: `file` (JPG, PNG o PDF, ≤ 5 MB), `method` (`qr` | `transferencia`), `reference` (1–100, obligatoria), `version` (opcional).
- **Response 200:** `JoinRequest` en `pago_informado` con `phase.deadlineAt = ahora + 60 min`.
- **Errores:** `413`, `415` (tipo real), `400` (sin `reference`/`method`), `409 REFERENCE_ALREADY_USED`, `409 INVALID_TRANSITION` (no está `esperando_pago`), `422 BUSINESS_RULE` `RN-010-06` (`PAYMENT_DEADLINE_PASSED`: la solicitud pasa a `expirada` y el chat queda en lectura), `503` (falla del almacén; sin cambios).

### `POST /join-requests/:id/confirm` (RF-010-17; CA-010-11 a 13, 36)
- **Auth:** titular. **Request:** `{ version? }`. **Response 200:** `JoinRequest` en `aceptada` con `chargeId`. En una sola transacción: la persona pasa a miembro (spec 001), se asegura el ciclo vigente (spec 002), se crea el cobro de ingreso `pagado` y se cancelan las demás solicitudes abiertas de la persona a grupos del mismo servicio (CA-010-47).
- **Errores:** `409 INVALID_TRANSITION` (no está `pago_informado`, o ya expiró por falta de decisión), `422 GROUP_FROZEN`, `409 STALE_STATE`.

### `POST /join-requests/:id/cash-payment` (RF-010-18; CA-010-16)
- **Auth:** titular. **Request:** `{ version? }`. Solo desde `esperando_pago`. **Response 200:** `JoinRequest` en `aceptada` con `acceptedMethod: "efectivo"` y el mismo efecto que `confirm`.

### `POST /join-requests/:id/reject` (RF-010-16; CA-010-17)
- **Auth:** titular. **Request:** `{ reason: string /* 5–200 */, markProofAsFalse?: boolean, version? }`. `markProofAsFalse` solo se acepta si la solicitud está en `pago_informado`. **Response 200:** `JoinRequest` en `rechazada`; se libera el cupo reservado.
- **Errores:** `400` (sin motivo), `409 INVALID_TRANSITION`, `422 BUSINESS_RULE` si `markProofAsFalse` sin comprobante.

### `POST /join-requests/:id/cancel` (RF-010-15; CA-010-18)
- **Auth:** solicitante. **Response 200:** `JoinRequest` en `cancelada`. **Errores:** `409 INVALID_TRANSITION` (en `pago_informado` o final).

### `GET /join-requests/:id/proof/file` y `GET /join-requests/:id/payment-qr`
- **Auth:** solicitante o titular. **Response 200:** `{ url, expiresAt, mime }`, URL firmada ≤ 10 min. `410 FILE_DELETED` tras la retención.

## Endpoints: chat

### `GET /join-requests/:id/messages?afterSeq=<n>&limit=<1-100>` (RF-010-09; CA-010-19)
- **Auth:** solicitante o titular. **Response 200:** `{ items: JoinMessage[], serverNow }` ordenados por `seq` ascendente. El cliente consulta cada 5 s con la conversación abierta (máximo 10 s hasta ver un mensaje nuevo, RF-010-09) y con `afterSeq` recibe solo lo nuevo.

### `POST /join-requests/:id/messages` (RF-010-05, RF-010-10; CA-010-19, 21, 22, 24)
- **Auth:** solicitante o titular. `multipart/form-data`: `text` (1–1.000 caracteres, opcional) y `image` (JPG/PNG ≤ 5 MB, opcional); al menos uno. **Response 201:** `JoinMessage`.
- **Errores:** `400` (vacío o > 1.000 caracteres), `413`, `415` (por ejemplo un PDF), `422 BUSINESS_RULE` `RF-010-07` (`CHAT_READ_ONLY`: la solicitud llegó a un estado final), `429 RATE_LIMITED` (más de 20 mensajes por minuto por persona y solicitud, `details.retryAfterSeconds`).
- No existen operaciones para editar ni borrar mensajes (RF-010-06, CA-010-23): `PUT`, `PATCH` y `DELETE` sobre mensajes responden `404`.

### `GET /join-requests/:id/messages/:messageId/image`
- **Auth:** solicitante o titular. **Response 200:** `{ url, expiresAt, mime }` (≤ 10 min). El texto se entrega como texto plano y el cliente nunca lo interpreta como HTML (RF-010-08, CA-010-22).

### `POST /join-requests/:id/read`
- **Auth:** solicitante o titular. **Request:** `{ upToSeq }`. **Response 204.** Alimenta `unreadCount`.

## Endpoints: reclamos

### `POST /join-requests/:id/disputes` (RF-010-21, RF-010-25; CA-010-27, 28, 43, 46)
- **Auth:** solicitante o titular. `multipart/form-data`: `description` (10–500), `evidence` (JPG/PNG ≤ 5 MB, opcional). El tipo se deduce de quién abre y del estado: el solicitante abre `pago_sin_ingreso` si la solicitud llegó a `pago_informado` y terminó `rechazada` o `expirada` con `titular_sin_respuesta`; el titular abre `comprobante_falso` si rechazó marcando el comprobante como falso.
- **Response 201:** `Dispute`.
- **Errores:** `422 BUSINESS_RULE`: `RF-010-21` (`DISPUTE_NOT_ALLOWED`: no corresponde por el estado o por quién es), `DISPUTE_WINDOW_CLOSED` (pasaron 7 días), `DISPUTE_ALREADY_OPEN` (ya abrió uno esa parte); `413`, `415`.

### `POST /join-requests/:id/disputes/:disputeId/response` (RF-010-22)
- **Auth:** la otra parte. `multipart/form-data`: `text` (10–500), `evidence` (opcional). **Response 200:** `Dispute`. **Errores:** `422 DISPUTE_ALREADY_RESPONDED`, `422 DISPUTE_RESOLVED`.

### `GET /join-requests/:id/disputes`
- **Auth:** solicitante o titular. **Response 200:** `{ items: Dispute[] }`. La resolución (`resolution`) la ven ambas partes.

### Resolución por un administrador

La cola de reclamos, la apertura de la evidencia y la resolución (`estafa_confirmada` / `sin_falta`) son endpoints del módulo de administración (`/admin/disputes…`, contrato de la spec 009). Esta spec expone el servicio `DisputesService` que esos endpoints usan (plan §5); allí se registra cada apertura de evidencia en el log de auditoría (CA-010-29) y se invoca el baneo (CA-010-30, 43).

## Operaciones internas

| Servicio | Quién lo usa | Qué hace |
|---|---|---|
| `JoinRequestsService.onGroupClosed / onOwnerBanned / onApplicantRestricted` | Eventos de 001 y 009 | Pasan solicitudes activas a `rechazada` o `cancelada` por el sistema (CA-010-32, 34). |
| `OwnershipBlockersPort.hasPayingRequests(groupId)` | Spec 001 | RN-010-09, CA-010-33. |
| `DisputesService.getEvidence / resolve` | Spec 009 | Ver plan §5. |
| `ReservedSlotsQuery.count(groupId, now)` | Spec 008 | Cupos reservados (RN-010-02). |
| `JoinRequestsService.openFromListing(userId, listing, message)` | Spec 008 | Abre una solicitud desde una publicación con la misma lógica de `open`. |
| `JoinRequestsService.rejectOpenForListing(tx, listingId, reason)` | Spec 008 | Rechaza las solicitudes `abierta` de una publicación cerrada u ocultada. |
| `ListingQuotaPort.remainingOffered(tx, listingId)` | Definido aquí, implementado por la spec 008 | Cupos ofrecidos que quedan; aceptar no los supera. |

### Tareas programadas

| Tarea | Frecuencia | Efecto |
|---|---|---|
| `joinRequests.sweep` | cada tick (5 min) | Persiste los vencimientos: `abierta` (24 h o fin de ventana), `esperando_pago` (plazo), `pago_informado` (60 min, motivo `titular_sin_respuesta`); envía el recordatorio de 30 min (CA-010-14). |
| `joinRequests.retention` | diaria | Elimina chat, imágenes y comprobantes 2 meses después del estado final o de la resolución del reclamo; conserva la línea de tiempo y la decisión (CA-010-44). |

## Eventos internos (`TxEventBus`)

`JoinRequestOpened`, `PaymentDataSent`, `ProofSubmitted`, `DecisionReminderDue`, `JoinRequestAccepted` (con `listingId` opcional, spec 008), `JoinRequestRejected`, `JoinRequestCancelled`, `JoinRequestExpired`, `ChatMessageSent`, `DisputeOpened`, `DisputeResponded`, `DisputeResolved`. Los consume la spec 005.

## Errores propios de la spec

| `code` | HTTP | Cuándo |
|---|---|---|
| `INVALID_INVITE_CODE` | 422 | Código inválido (genérico). |
| `ENTRY_WINDOW_CLOSED` | 422 | `details.opensAt`. |
| `GROUP_NOT_ACCEPTING` | 422 | Recepción pausada (RF-001-09). |
| `NO_SLOTS_AVAILABLE` | 422 | Sin cupo (RN-010-02, RF-010-12). |
| `ACTIVE_REQUEST_EXISTS`, `TOO_MANY_ACTIVE_REQUESTS` | 422 | RF-010-02. |
| `ALREADY_MEMBER` | 422 | Ya es miembro. |
| `OPEN_CHARGES_IN_GROUP` | 422 | RN-010-13. |
| `PAYMENT_INFO_MISSING` | 422 | Sin datos de pago que enviar. |
| `ALREADY_EXTENDED` | 422 | RF-010-28. |
| `PAYMENT_DEADLINE_PASSED` | 422 | Comprobante fuera de plazo. |
| `CHAT_READ_ONLY` | 422 | RF-010-07. |
| `DISPUTE_NOT_ALLOWED`, `DISPUTE_WINDOW_CLOSED`, `DISPUTE_ALREADY_OPEN`, `DISPUTE_ALREADY_RESPONDED`, `DISPUTE_RESOLVED` | 422 | RF-010-21/22. |
| `REFERENCE_ALREADY_USED` | 409 | RN-010-14 (definido en la spec 002). |
| `ACCOUNT_RESTRICTED` | 403 | Cuenta suspendida o baneada (spec 009). |

> **Contrato congelado** al aprobarse el plan. Los cambios se hacen por PR sobre este archivo avisando a las otras dos capas.
