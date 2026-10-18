# Contrato de API — Spec 001: Suscripciones compartidas

- **Responsable:** Leonardo Guzman (Backend)
- **Estado:** propuesto; se congela al aprobar el plan
- Rige la parte A de `specs/000-setup-del-proyecto/contracts/api.md`. Quien no pertenece al grupo recibe siempre `404` (RNF-001-01). **El frontend no calcula cuotas**: usa los campos `...Cents` que devuelve el backend.

## Objetos

```ts
Breakdown {                       // desglose de la cuota (RF-001-13)
  priceCents: number; currency: "USD" | "BS"; exchangeRate: string | null;   // "6.9600"
  totalBsCents: number;
  memberCount: number;            // miembros activos, titular incluido
  baseShareCents: number;         // floor(total / n): lo que paga cada miembro (RN-001-02)
  ownerShareCents: number;        // referencia del titular: base + resto
  remainderCents: number;
}

EntryWindow {                     // ventana de ingreso (RF-001-22)
  isOpen: boolean;
  opensAt: string | null;         // si está cerrada: próxima apertura
  closesAt: string | null;        // si está abierta: hasta cuándo (23:59:59 de La Paz del día 3)
  acceptingMembers: boolean;      // RF-001-09
}

GroupSummary {                    // "Mis suscripciones" (RF-001-19)
  id; name; serviceName; logoUrl; brandColor;
  role: "titular" | "miembro";
  status: "activo" | "cerrado"; frozenReason: "titular_baneado" | null;
  memberCount; totalSlots;
  myShareCents: number;           // miembro: su cuota; titular: su cuota de referencia
  myShareIsReference: boolean;    // true para el titular (RN-001-10)
  billingDay: number; nextCutDate: string;       // YYYY-MM-DD de La Paz
}

GroupMember { userId; fullName; role: "titular" | "miembro"; phone: string | null; joinedAt }   // phone solo se ve entre titular y miembros

GroupDetail {
  id; name; status; frozenReason; createdAt;
  service: { name; planName | null; logoUrl; brandColor; isCustom: boolean };
  billingDay; totalSlots; priceCents; currency; exchangeRate;
  breakdown: Breakdown; myShareCents: number; myRole: "titular" | "miembro";
  entryWindow: EntryWindow;
  members: GroupMember[];
  paymentInfo: { text: string | null; qrUrl: string | null; configured: boolean };   // qrUrl firmada, vence en 10 min (RF-001-20)
  inviteCode?: string;            // solo si el que consulta es el titular
  version: number;
}
```

## Endpoints

### `GET /users/me/host-eligibility` (RF-001-21)
- **Auth:** sesión. **Response 200:**
  ```json
  { "eligible": false, "source": null,
    "activeGroups": 2, "maxActiveGroups": 5, "canCreateMore": true,
    "requirement": { "minStars": 4.5, "minConsideredCharges": 6, "windowMonths": 12 },
    "current": { "stars": 4.0, "consideredCharges": 3, "level": "Bueno" } }
  ```
  `source` es `"manual"` (habilitación del administrador), `"calificacion"` o `null`. Con `eligible: false` el frontend muestra qué falta con estos datos.

### `POST /groups/quote`
- **Auth:** sesión. Sin efectos. **Request:** `{ priceCents, currency, exchangeRate?, memberCount }`.
- **Response 200:** `{ totalBsCents, baseShareCents, ownerShareCents, remainderCents }`. Sirve a la pantalla de creación para mostrar la cuota sin duplicar la fórmula. **Errores:** `400 VALIDATION_ERROR`.

### `POST /groups` (RF-001-01 a 05)
- **Auth:** sesión; titular habilitado. **Request:**
  ```json
  { "catalogPlanSlug": "netflix-premium" | null,
    "customServiceName": "Mi servicio" | null,
    "name": "Netflix del depa",
    "priceCents": 2299, "currency": "USD", "exchangeRate": "6.9600",
    "billingDay": 15, "totalSlots": 4,
    "paymentInfoText": "Banco X, cuenta …" | null }
  ```
  Exactamente uno de `catalogPlanSlug` o `customServiceName`. `exchangeRate` obligatorio con `USD` y prohibido con `BS`. La imagen del QR se sube después con `PUT /groups/:id/payment-info`.
- **Response 201:** `GroupDetail` (con `inviteCode`). El usuario queda como titular y primer miembro; se crea el ciclo inicial (spec 002).
- **Errores:** `422 BUSINESS_RULE` con `details.rule`: `RF-001-21` (no habilitado, con los datos de elegibilidad), `RN-001-14` (ya tiene 5 grupos activos), `RN-001-13` (cupos mayores a los del plan), `RN-001-09` (precio o cupos fuera de rango); `404 NOT_FOUND` si el plan no existe o está inactivo; `400 VALIDATION_ERROR` por campos.

### `GET /groups`
- **Auth:** sesión. **Query:** `role` (`titular` | `miembro`, opcional), `status` (`activo` | `cerrado`).
- **Response 200:** `{ items: GroupSummary[], nextCursor }` solo con los grupos del usuario (CA-001-20). Incluye grupos cerrados al filtrar `status=cerrado`.

### `GET /groups/:groupId`
- **Auth:** miembro activo del grupo (`404` si no pertenece). **Response 200:** `GroupDetail`.
- Un exmiembro retirado por mora que debe pagar su deuda **no** usa este endpoint: ve sus cobros adeudados en la spec 002 (CA-002-32).

### `PATCH /groups/:groupId` (RF-001-14, RF-001-09)
- **Auth:** titular (`403` para miembro). **Request** (todos opcionales): `{ name, priceCents, currency, exchangeRate, billingDay, totalSlots, acceptingMembers, version }`.
- **Response 200:** `GroupDetail`. Cambiar precio, moneda o tipo de cambio **no** altera cobros ya generados ni cuotas cotizadas en solicitudes en curso (RN-001-03, RN-010-01).
- **Errores:** `422 BUSINESS_RULE`: `RF-001-14` (cupos por debajo de los miembros, con `details.minSlots`), `RN-001-13`, `RN-001-09`, `RN-001-07` (grupo cerrado), `RN-009-xx` (grupo congelado por titular baneado → `GROUP_FROZEN`); `409 STALE_STATE` si `version` no coincide.

### `PUT /groups/:groupId/payment-info` (RF-001-20)
- **Auth:** titular. `multipart/form-data`: `text` (hasta 500 caracteres, opcional) y `qr` (JPG o PNG, máximo 2 MB, opcional). `removeQr=true` borra la imagen.
- **Response 200:** `{ paymentInfo }`. **Errores:** `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE` (se valida el tipo real). Si falla la validación se conserva el QR anterior.

### `POST /groups/:groupId/invite-code/regenerate` (RF-001-08)
- **Auth:** titular. **Response 200:** `{ inviteCode }`. El anterior deja de servir al instante (CA-001-09).

### `DELETE /groups/:groupId/members/:userId` (RF-001-15)
- **Auth:** titular. No se puede quitar al titular (`422` `RN-001-08`).
- **Response 200:** `{ removedUserId, openCharges: number }`. `openCharges` informa cuántos cobros no pagados conserva el miembro quitado para que el titular decida cancelarlos (spec 002, RF-002-13). Las cuotas de los demás se recalculan.
- **Errores:** `404` si el usuario no es miembro activo.

### `POST /groups/:groupId/leave` (RF-001-16)
- **Auth:** miembro. **Response 204.**
- **Errores:** `422 BUSINESS_RULE`: `RN-001-08` (el titular no puede abandonar: `details.hint = "TRANSFER_OR_CLOSE"`), `RF-001-16` (tiene cobros `pendiente`, `en_revision` o `atrasado`: `details.openCharges`) — CA-001-14, CA-001-15.

### `POST /groups/:groupId/transfer-ownership` (RF-001-17)
- **Auth:** titular. **Request:** `{ toUserId }`. **Response 200:** `GroupDetail` (con el rol del que llama ya como miembro).
- **Errores:** `422 BUSINESS_RULE`: el destinatario no es miembro activo; `RF-001-21` (no es titular habilitado, CA-001-30); `RN-001-14` (el destinatario ya tiene 5 grupos activos); `RN-010-09` (hay solicitudes en pago, CA-010-33).

### `POST /groups/:groupId/close` (RF-001-18)
- **Auth:** titular. **Response 200:** `GroupDetail` con `status: "cerrado"`.
- **Errores:** `422 BUSINESS_RULE` `RN-010-09` (solicitudes en pago). Efectos: no genera más cobros; solicitudes activas pasan a `rechazada`; solo lectura.

### Eventos internos (no son endpoints)

`GroupCreated`, `MemberAdded`, `MemberRemoved(reason)`, `OwnerChanged`, `GroupClosed`, `GroupFrozen`. Los consumen las specs 002, 005, 008 y 010 (ver plan §5).

## Errores propios de la spec

| `code` | HTTP | Cuándo |
|---|---|---|
| `NOT_HOST_ELIGIBLE` | 422 | Crear o recibir la titularidad sin estar habilitado (`details.rule = "RF-001-21"`). |
| `TOO_MANY_ACTIVE_GROUPS` | 422 | RN-001-14. |
| `SLOTS_BELOW_MEMBERS` | 422 | RF-001-14 (`details.minSlots`). |
| `HAS_OPEN_CHARGES` | 422 | RF-001-16. |
| `OWNER_CANNOT_LEAVE` | 422 | RN-001-08. |
| `GROUP_CLOSED` | 422 | RN-001-07. |
| `GROUP_FROZEN` | 422 | El grupo está en solo lectura por titular baneado. |
| `INVALID_INVITE_CODE` | 422 | Código inexistente, regenerado o de grupo cerrado; mensaje genérico "Código inválido" (lo devuelve `POST /join-requests`, spec 010). |
| `ENTRY_WINDOW_CLOSED` | 422 | Se usa en la spec 010 al abrir la solicitud; `details.opensAt` (RF-001-22). |

> **Contrato congelado** al aprobarse el plan. Los cambios se hacen por PR sobre este archivo avisando a las otras dos capas.
