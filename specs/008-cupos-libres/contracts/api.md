# Contrato de API — Spec 008: Cupos libres

- **Responsable:** Leonardo Guzman (Backend)
- **Estado:** propuesto; se congela al aprobar el plan
- **Entrega:** P2. Rige la parte A de `specs/000-setup-del-proyecto/contracts/api.md` (errores, paginación, `version`).
- Solo usuarios con sesión ven publicaciones (no hay vista pública sin sesión). Una publicación que no está `activa` responde `404` a todos menos al titular del grupo (y a un miembro, que solo ve el resumen de la sección «Estado del grupo»).

## Objetos

```ts
ListingView {                       // lo que ve cualquier usuario (RF-008-03, RF-008-04, RNF-008-01)
  id;
  service: { name; planName | null; logoUrl; brandColor; category | null };   // copia del grupo
  slotsOffered: number;             // min(ofrecidos, libres − reservados) en este momento
  estimatedShareCents: number;      // RN-008-02; siempre "estimada"
  estimatedShareLabel: "estimada";
  billingDay: number;
  owner: { fullName; level: "Nuevo" | "En riesgo" | "Regular" | "Bueno" | "Excelente" };   // nivel de puntualidad (spec 007)
  description: string | null; conditions: string | null;     // texto plano
  publishedAt; expiresAt;
  entryWindow: { isOpen: boolean; opensAt: string | null; closesAt: string | null };
  myRequest: { id: string; status } | null;                    // solicitud activa propia en ese grupo
  canRequest: boolean;
  cannotRequestReason: null | "VENTANA_CERRADA" | "SOLICITUD_ACTIVA" | "DEMASIADAS_SOLICITUDES"
                            | "COBROS_ABIERTOS" | "SIN_CUPOS" | "CUENTA_RESTRINGIDA";
}
// No incluye: nombres ni datos de los miembros, comprobantes, datos de pago, código de invitación, celular del titular.

OwnerListing {                      // lo ve el titular del grupo
  id; groupId; status: "activa" | "oculta" | "expirada" | "retirada" | "cerrada";
  slotsOffered; description; conditions; publishedAt; expiresAt; renewedAt | null;
  hiddenAt | null; endReason | null;
  reportCount: number;              // solo desde la última restauración
  openRequests: number;             // solicitudes activas originadas en la publicación
  preview: ListingView | null;
  version;
}

GroupListingSummary {               // lo ve un miembro (RF: "ver que el grupo tiene una publicación activa")
  active: boolean; slotsOffered: number | null; expiresAt: string | null;
}
```

## Endpoints: publicación del titular

### `POST /groups/:groupId/listing` (RF-008-01, RF-008-02; CA-008-01 a 03)
- **Auth:** titular. **Request:** `{ slotsOffered: 1..libres, description?: ≤300, conditions?: ≤300 }`. Los textos se recortan, se normalizan los saltos de línea y se rechazan caracteres de control.
- **Response 201:** `OwnerListing` en `activa` con `expiresAt = ahora + 30 días`.
- **Errores:** `400 VALIDATION_ERROR` (0 cupos, textos largos), `403` (no es titular; miembro), `404` (grupo ajeno), `409 LISTING_ALREADY_ACTIVE` (RF-008-02), `422 BUSINESS_RULE`: `NO_FREE_SLOTS` («No hay cupos libres»; también si se ofrecen más de los libres), `GROUP_NOT_ACCEPTING` (RF-001-09), `GROUP_CLOSED`, `GROUP_FROZEN`; `403 ACCOUNT_RESTRICTED` (cuenta suspendida; CA-008-22).

### `GET /groups/:groupId/listing`
- **Auth:** miembro o titular. **Response 200:** titular → `OwnerListing | null` (la más reciente: activa, oculta o expirada); miembro → `GroupListingSummary`. **Errores:** `404` (no pertenece al grupo).

### `PATCH /groups/:groupId/listing` (RF-008-06)
- **Auth:** titular. **Request:** `{ slotsOffered?, description?, conditions?, version? }` (sobre una `activa` u `oculta`). **Response 200:** `OwnerListing`. **Errores:** como el alta, `404 LISTING_NOT_FOUND`, `409 STALE_STATE`. Subir `slotsOffered` por encima de los libres → `422 NO_FREE_SLOTS`. Si el titular edita una publicación `oculta`, sigue oculta.

### `POST /groups/:groupId/listing/renew` (RF-008-05)
- **Auth:** titular. **Response 200:** `OwnerListing` en `activa` con `expiresAt = ahora + 30 días`; sirve para `activa` y `expirada`. **Errores:** `409 LISTING_ALREADY_ACTIVE` (otra activa en el grupo), `422 NO_FREE_SLOTS`, `422 LISTING_HIDDEN` (oculta por reportes: espera la revisión).

### `DELETE /groups/:groupId/listing` (RF-008-06; HU-008-07)
- **Auth:** titular. **Response 204** (pasa a `retirada`). Las solicitudes en curso siguen su flujo (spec 010). **Errores:** `404 LISTING_NOT_FOUND`.

## Endpoints: búsqueda y solicitud

### `GET /listings` (RF-008-07 a 09; CA-008-06, 07; RNF-008-02)
- **Auth:** sesión. **Query:** `serviceId` (servicio del catálogo), `q` (texto en el nombre del servicio, sin distinguir mayúsculas ni tildes), `category`, `minShareCents`, `maxShareCents`, `sort` (`cuota` ascendente | `fecha` descendente | `puntualidad` descendente; por defecto `fecha`), `limit` (hasta 50), `cursor`.
- **Response 200:** `{ items: ListingView[], nextCursor }`. Solo publicaciones `activa`, no vencidas, de grupos activos que reciben miembros, no congelados, con titular no suspendido ni baneado y con al menos un cupo disponible ahora. **Excluye** las propias y las de grupos donde el usuario ya es miembro (RF-008-08). El orden por puntualidad desempata por fecha.

### `GET /listings/:id`
- **Auth:** sesión. **Response 200:** `ListingView`. **Errores:** `404 LISTING_NOT_FOUND` (inexistente, no activa, propia o de un grupo donde ya es miembro).

### `POST /listings/:id/requests` (RF-008-10; CA-008-08 a 10, 23)
- **Auth:** sesión. **Request:** `{ message?: ≤200 }`. Abre una **solicitud de ingreso** de la spec 010 con `source = "publicacion"` y, si hay mensaje, lo guarda como la primera línea del chat. **Response 201:** `JoinRequest` (spec 010) en `abierta`.
- **Errores:** `400 VALIDATION_ERROR` (mensaje de 250 caracteres), `404 LISTING_NOT_FOUND`, `403 ACCOUNT_RESTRICTED`, `422 BUSINESS_RULE` con los mismos códigos que `POST /join-requests` (`ENTRY_WINDOW_CLOSED` con `details.opensAt`, `ACTIVE_REQUEST_EXISTS`, `TOO_MANY_ACTIVE_REQUESTS`, `OPEN_CHARGES_IN_GROUP`, `NO_SLOTS_AVAILABLE`). El nivel «En riesgo» **no** impide solicitar (RN-008-06).

### `POST /listings/:id/reports` (RF-008-17, RF-008-18; CA-008-17, 18)
- **Auth:** sesión. **Request:** `{ reason: "spam" | "datos_falsos" | "conducta_indebida" | "otro", comment?: ≤300 }`. **Response 204.** Al tercer reporte de usuarios distintos la publicación pasa a `oculta`, sale de la búsqueda y se avisa al titular (spec 005).
- **Errores:** `404 LISTING_NOT_FOUND`, `409 ALREADY_REPORTED`, `422 BUSINESS_RULE` (`CANNOT_REPORT_OWN_LISTING`), `429 RATE_LIMITED` (10 reportes por día por usuario), `403 ACCOUNT_RESTRICTED`.

## Aclaraciones de la implementación (verificadas en `backend/src/modules/listings`)

- `slotsOffered` se valida de 1 a 19 en el DTO (más de 19 → `400 VALIDATION_ERROR`); si cabe en el DTO pero supera los cupos libres responde `422 NO_FREE_SLOTS`.
- **Prioridad de `cannotRequestReason`** (se informa solo la primera regla incumplida): `CUENTA_RESTRINGIDA`, `VENTANA_CERRADA`, `SIN_CUPOS`, `COBROS_ABIERTOS`, `SOLICITUD_ACTIVA`, `DEMASIADAS_SOLICITUDES`.
- `GET /listings/:id` responde `200` con `cannotRequestReason = SIN_CUPOS` si no queda cupo, y `404` si el titular está suspendido o baneado, el grupo está congelado o el grupo no recibe miembros.
- `POST /groups/:groupId/listing/renew` sobre una publicación `cerrada` o `retirada` responde `404`; `DELETE /groups/:groupId/listing` retira también una publicación `expirada`.
- `GET /groups/:groupId/listing` sin publicación vigente responde `200` con el JSON `null`.

## Moderación (spec 009, P2)

`GET /admin/listings/reports` y `POST /admin/listings/:id/restore | delete | delete-and-suspend` son de la spec 009; usan `ListingsService.listReported / adminRestore / adminRemove` de este módulo (ver Servicios internos). Restaurar fija `moderation_cleared_at` y deja la publicación `activa`; eliminar la pasa a `retirada` con `end_reason = 'moderacion'`.

## Tareas programadas

| Tarea | Frecuencia | Efecto |
|---|---|---|
| `listings.expire` | cada tick; actúa al menos una vez al día | Pasa a `expirada` las `activa` con `expires_at <= ahora` (CA-008-14). También cierra (`grupo_lleno`) las publicaciones cuyo grupo ya no tiene cupos libres y repara cualquier incoherencia (p. ej. tras cambiar `total_slots`, RN-008-04). Idempotente. |

## Eventos que consume (`TxEventBus`)

| Evento | Efecto |
|---|---|
| `JoinRequestAccepted { listingId? }` (spec 010) | Si viene de la publicación, `slots_offered − 1`; si llega a 0 la publicación pasa a `cerrada` (`cupos_completos`) y las solicitudes `abierta` de ella pasan a `rechazada` (spec 010, RN-010-05; CA-008-11, 16). |
| `MemberAdded`, `MemberRemoved` (spec 001) | Ajusta `slots_offered` a `min(ofrecidos, libres)` (RN-008-04); si no quedan cupos, `cerrada` (`grupo_lleno`). |
| `GroupClosed`, `GroupFrozen` (spec 001) | `cerrada` (`grupo_cerrado` / `grupo_congelado`). Las solicitudes pendientes las rechaza la spec 010 (CA-008-16). |
| `OwnerChanged` (spec 001) | La publicación sigue; avisa al nuevo titular (`publicacion_transferida`). |
| `UserSuspended` / `UserBanned` del titular (spec 009) | La búsqueda deja de mostrarla (filtro) y, si es baneo, se cierra por `grupo_congelado`. |

## Servicios internos

| Servicio | Lo usan | Qué hace |
|---|---|---|
| `ListingQuotaPort.remainingOffered(tx, listingId)` (lo define `join-requests`, lo implementa `listings` en `app-adapters/`) | Spec 010 (`sendPaymentData`) | Cupos que todavía se ofrecen; 010 los compara con las solicitudes de esa publicación ya reservadas para que dos solicitudes no compitan por el mismo cupo ofrecido (CA-008-12). |
| `ReservedSlotsQuery.count(groupId, now)` (spec 010) | `ListingsService` | Cupos reservados para calcular los disponibles. |
| `JoinRequestsService.openFromListing(userId, listing, message)` (spec 010) | `POST /listings/:id/requests` | Igual que `open` pero sin código: la publicación identifica el grupo; guarda `source` y `listing_id` y la primera línea del chat. |
| `JoinRequestsService.rejectOpenForListing(tx, listingId, reason)` (spec 010) | `listings` al cerrarse por cupos | Pasa a `rechazada` las `abierta` de esa publicación (las que ya están en pago siguen su curso). |
| `ListingsService.listReported / adminRemove / adminRestore` | Spec 009 | Moderación. |
| `NotificationService.notify` (spec 005) | Manejadores | `publicacion_oculta`, `publicacion_transferida`. |

> **Contrato congelado** al aprobarse el plan. Los cambios se hacen por PR sobre este archivo avisando a las otras dos capas.
