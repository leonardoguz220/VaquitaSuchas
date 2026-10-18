# Plan técnico — Spec 008: Cupos libres

- **Spec relacionada:** `specs/008-cupos-libres/spec.md` (debe estar **aprobada** por BD, Backend y Frontend)
- **Líder de la spec:** Adrian Vargas (Frontend)
- **Última actualización:** 2026-10-18
- **Artefactos:** [`data-model.md`](data-model.md) · [`contracts/api.md`](contracts/api.md) · [`quickstart.md`](quickstart.md)
- **Prioridad:** P2. Se construye al final, después de 010, 007 y 005-A, que ya están en el MVP.

| Capa | Responsable | Secciones | Visto bueno |
|---|---|---|---|
| Base de datos | Camila | §3 (y `data-model.md`) | pendiente |
| Backend | Leonardo | §4, §5, §7 | pendiente |
| Frontend | Adrian | §6 | pendiente |

## Constitución: verificación

| Principio | ¿Cumple? | Nota |
|---|---|---|
| I. Spec primero | Sí, con tres aclaraciones | §2 decisiones 3, 4 y 6 completan huecos que la spec deja abiertos (a confirmar). |
| II. Dinero exacto | Sí | La cuota estimada usa `splitShares` en centavos (spec 001); sin `float`. |
| III. Criterios verificables | Sí | CA-008-01 a 24 mapeados en §8. |
| IV. Seguridad | Sí | La publicación nunca expone miembros ni datos de pago; textos como texto plano. |
| V. Contratos primero | Sí | `data-model.md` y `contracts/api.md`. |
| VI. Simplicidad | Sí | Una tabla de publicaciones y una de reportes; la cuota y los cupos se calculan. |
| VII. Capas | Sí | Reglas en `domain/` puro; el módulo no toca repositorios de otros módulos. |

## 1. Resumen de la solución

Módulo `listings` con la publicación de cupos de un grupo, la búsqueda para usuarios con sesión y los reportes. **No** implementa el ingreso: «Solicitar» abre una solicitud de la spec 010 (`source = 'publicacion'`) y todo lo demás (chat, pago, confirmación, plazos, cupos reservados) lo hace esa spec. Este módulo agrega tres piezas de coordinación con 010: el puerto `ListingQuotaPort` (para que los cupos **ofrecidos** también limiten las reservas), el evento `JoinRequestAccepted` (para bajar los cupos ofrecidos y cerrar la publicación) y los métodos `openFromListing` y `rejectOpenForListing` de 010.

## 2. Decisiones técnicas

| # | Decisión | Opción elegida | Alternativas descartadas | Motivo |
|---|---|---|---|---|
| 1 | Cuota y cupos | Se calculan al consultar | Guardarlos y actualizarlos | Cambian con cada ingreso o salida; el cálculo es barato (RNF-008-02) y no se desincroniza. |
| 2 | Titular de la publicación | El titular actual del grupo | Guardar `owner_id` | La transferencia de titularidad no debe tocar la publicación (caso borde). |
| 3 | Cupos ofrecidos vs. libres del grupo | `slots_offered` baja con cada ingreso por la publicación y se acota a los libres | Solo contar los libres | RF-008-14 (cierra al aceptar el último cupo **ofrecido**) y RN-008-04. **Aclaración:** si se ofrecen menos cupos que los libres, las reservas de solicitudes de la publicación están limitadas por lo ofrecido (`ListingQuotaPort`), para que CA-008-12 valga siempre. |
| 4 | Solicitudes ya en pago al cerrarse por cupos | Siguen su curso, no se rechazan | Rechazarlas | RF-008-14 y CA-008-11 solo rechazan las `abierta`; con la regla 3 no puede haber más pagos reservados que cupos ofrecidos. |
| 5 | Publicación y solicitud | La solicitud nace con `source = 'publicacion'` y `listing_id` | Flujo propio de solicitudes | RF-008-10 a 15 remiten a la spec 010; evita duplicar reglas. |
| 6 | Qué se muestra en la búsqueda | Solo grupos activos, que reciben miembros, no congelados, con titular activo y con cupo disponible | Mostrar todo y deshabilitar | «Publicar» ya exige grupo activo y que reciba miembros; el resto se filtra al buscar. **Se confirma:** una publicación de un grupo con ventana cerrada **sí** se ve (con la fecha de apertura, CA-008-23). |
| 7 | Orden por puntualidad | Unión con `user_reputation` (núcleo de 007): más medias estrellas primero, «Nuevo» al final | Calcular en vivo | Rendimiento (RNF-008-02); la copia se reconcilia a diario. |
| 8 | Ocultar por reportes | Servicio cuenta reportes distintos desde la última restauración; al tercero pasa a `oculta` en la misma transacción | Contador guardado | Imposible desincronizar; `moderation_cleared_at` evita que reportes viejos oculten una publicación ya revisada. |
| 9 | Texto libre | Se guarda como texto plano (sin HTML); el cliente lo muestra como texto sin enlaces activos | Limpiar el HTML en el servidor | RN-008-07; React escapa por defecto y no se convierte nada en enlaces. |
| 10 | Límites de abuso | 10 reportes por día por usuario (`rate_limit_events`, cubo `listing_report:user`); solicitudes: límites de 010 | Sin límite | RNF-008-04. El valor 10 es una propuesta a confirmar. |
| 11 | Paginación de la búsqueda | Cursor (clave de orden + `id`) | `OFFSET` | Estable con altas y bajas; RF-008-09. |

## 3. Modelo de datos — _Camila (BD)_

Detalle en [`data-model.md`](data-model.md): `listings` (0080), `listing_reports` (0081), enlaces y disparadores (0082, incluye la FK `join_requests.listing_id`). Pruebas de integridad en `database/tests/listings.integrity.test.ts`.

## 4. Contratos de API — _Leonardo (Backend)_

Detalle en [`contracts/api.md`](contracts/api.md): publicación del titular (`/groups/:groupId/listing`), búsqueda y detalle (`/listings`), solicitud (`/listings/:id/requests`) y reportes (`/listings/:id/reports`).

> **Contrato congelado** al aprobarse este plan. Los cambios se hacen por PR sobre este archivo y avisando a las otras dos capas.

## 5. Lógica de dominio — _Leonardo (Backend)_

### Estructura

```text
backend/src/modules/listings/
├── controllers/   listings.controller.ts (búsqueda, detalle, solicitud, reporte), group-listing.controller.ts
├── services/      listings.service.ts, listings-search.service.ts, listing-reports.service.ts,
│                  listings-expire.service.ts, handlers/ (join-requests.handlers.ts, groups.handlers.ts)
├── domain/        estimated-share.ts, offered-slots.ts, listing-lifecycle.ts, report-rules.ts, plain-text.ts
├── repositories/  listings.repository.ts, listing-reports.repository.ts, listings-search.repository.ts
└── app-adapters/  listing-quota.adapter.ts   (implementa ListingQuotaPort de join-requests)
```

### Funciones puras

| Función | Reglas |
|---|---|
| `estimatedShare(totalBsCents, currentMembers, slotsOffered)` | `splitShares(total, miembros + cupos).baseShare` (spec 001): es lo que paga un miembro; el titular recibe el resto de redondeo (RN-008-02, CA-008-04). |
| `offeredNow({ slotsOffered, totalSlots, members, reserved })` | `max(0, min(ofrecidos, totalSlots − miembros − reservados))` (RN-008-04, RN-010-02). |
| `clampOffered({ slotsOffered, totalSlots, members })` | Lo que se guarda tras un ingreso o salida; `0` implica cerrar. |
| `canPublish({ group, freeSlots, requested })` | Grupo activo, sin congelar, recibe miembros, `1 ≤ pedidos ≤ libres` (RF-008-01, CA-008-02). |
| `expiresAt(from)` | `from + 30 días` (RF-008-05). |
| `nextStatus(current, action)` | Transiciones de `listings_transition_guard`: publicar, ocultar, restaurar, expirar, renovar, retirar, cerrar. |
| `shouldHide(distinctReporters)` | `>= 3` (RF-008-18). |
| `normalizePlainText(input, max)` | Recorta, normaliza saltos de línea, rechaza caracteres de control; no altera `<` ni `&` (se guardan tal cual y se muestran como texto, CA-008-19). |
| `entryWindowLabel(window)` | «abierta hasta [fecha]» o «se abre el [fecha]» a partir del `EntryWindow` de 001 (CA-008-23). |

### Servicios

- **`ListingsService`**: `publish` (bloquea el grupo `FOR UPDATE`, comprueba `canPublish` con los libres calculados por el servicio de miembros de `subscriptions`, inserta), `update`, `renew`, `withdraw`, `getForOwner`, `getSummaryForMember`, `adminRestore/adminRemove/listReported` (spec 009).
- **`ListingsSearchService`**: arma la consulta con filtros y orden, aplica exclusiones (propias, grupos donde es miembro, grupos no elegibles) y construye `ListingView` con `entryWindow` (de 001), nivel del titular (`ReputationQueryPort`) y `canRequest`/`cannotRequestReason` consultando los límites de 010.
- **`ListingRequestFacade`** (dentro de `ListingsService`): `requestSeat(userId, listingId, message)` valida mensaje y publicación y llama `JoinRequestsService.openFromListing`.
- **`ListingReportsService`**: inserta el reporte; cuenta reportes distintos desde `moderation_cleared_at`; si `shouldHide`, pasa a `oculta` y notifica `publicacion_oculta` al titular, todo en una transacción.
- **`ListingsExpireService`** (`listings.expire`): marca `expirada`, cierra por grupo lleno y repara incoherencias, con `SKIP LOCKED`.
- **Manejadores de eventos**: `JoinRequestAccepted`, `MemberAdded`, `MemberRemoved`, `GroupClosed`, `GroupFrozen`, `OwnerChanged`, `UserBanned` (ver el contrato).
- **Orden de bloqueos** (compartido con 010): **solicitud → grupo → publicación**.

## 6. Interfaz de usuario — _Adrian (Frontend)_

| Ruta / componente | Rol | Contenido | Endpoints |
|---|---|---|---|
| `/cupos` | Usuario | Lista de tarjetas (servicio, cupos, **cuota estimada** rotulada «estimada», día de cobro, titular con su nivel, estado de la ventana) con filtros (servicio, categoría, rango de cuota) y orden; paginación por «Cargar más»; estado vacío; diseño primero para celular | `GET /listings` |
| `/cupos/[id]` | Usuario | Detalle (textos como texto plano, sin enlaces activos); botón **Solicitar** con campo de mensaje (contador de 200) o deshabilitado con la causa (`cannotRequestReason`): «se abre el [fecha]», «ya tienes una solicitud» (con enlace a `/solicitudes/[id]`), etc.; botón **Reportar** (modal con motivo y comentario) | `GET /listings/:id`, `POST …/requests`, `POST …/reports` |
| `/grupos/[id]` → pestaña **Publicar cupos** | Titular | Formulario (cupos, descripción, condiciones), vista previa tal como la verán, estado (activa hasta, oculta, expirada), **Renovar**, **Editar**, **Retirar**; aviso fijo: «Aceptar a alguien cambia la cuota de todos desde el siguiente cobro» | `GET/POST/PATCH/DELETE /groups/:id/listing`, `POST …/renew` |
| `/grupos/[id]` (miembro) | Miembro | Insignia «El grupo publicó cupos» | `GET /groups/:id/listing` |
| `/solicitudes/[id]` (spec 010) | Titular | Al **confirmar** una solicitud, el modal muestra la cuota nueva de todos los miembros (RN-008-03); las solicitudes de una publicación muestran la marca «Desde publicación» | datos de 010 |

### Reglas de UX
- La cuota se llama siempre «estimada»; los montos son los del servidor (`Bs 25,50`).
- Los textos libres se muestran con `white-space: pre-wrap` y sin convertir URL en enlaces.
- Estados de carga con esqueletos; el botón «Solicitar» se desactiva al enviar (evita duplicados).

## 7. Seguridad y permisos — _Leonardo (Backend), con revisión de BD_

- Solo el titular publica, edita, renueva y retira; un miembro solo ve el resumen; un ajeno responde `404`.
- `ListingView` se arma con una lista blanca de campos: nunca nombres de miembros, celular del titular, datos de pago ni código de invitación (CA-008-05; prueba con instantánea de la forma de la respuesta).
- Aceptar sigue siendo exclusivo del titular (spec 010; CA-008-20 → `403`).
- Cuentas suspendidas o baneadas no publican ni solicitan (`403 ACCOUNT_RESTRICTED`, CA-008-22).
- El nivel del titular se muestra, no sus estrellas exactas ni su historial; el titular sí ve estrellas y nivel del solicitante (spec 010, CA-008-21).
- Las acciones de moderación quedan en `admin_audit_log` (spec 009); aceptar y rechazar solicitudes quedan en `join_request_events` (RNF-008-06).

## 8. Estrategia de pruebas

| Criterio | Nivel | Capa | Test |
|---|---|---|---|
| CA-008-01 (publicar 2 cupos; aparece con la cuota estimada) | Integración | BE | `listings.publish.e2e-spec.ts` |
| CA-008-02 (grupo lleno) | Integración + integridad | BE, BD | `listings.publish.e2e-spec.ts`; `listings.integrity.test.ts` |
| CA-008-03 (segunda publicación) | Integración + integridad | BE, BD | `listings.publish.e2e-spec.ts`; `listings.integrity.test.ts` |
| CA-008-04 (Bs 90,00 / 2 miembros + 1 cupo = Bs 30,00) | Unitario | BE | `estimated-share.spec.ts` |
| CA-008-05 (sin miembros, pago ni código) | Integración | BE | `listings.view.e2e-spec.ts` |
| CA-008-06 (filtro por «Netflix») | Integración | BE | `listings.search.e2e-spec.ts` |
| CA-008-07 (no ve las de sus grupos) | Integración | BE | `listings.search.e2e-spec.ts` |
| CA-008-08 (mensaje de 250 caracteres) | Integración | BE | `listings.requests.e2e-spec.ts` |
| CA-008-09 (la sexta solicitud) | Integración | BE | `listings.requests.e2e-spec.ts` (límite de 010) |
| CA-008-10 (confirmar: ingresa, cuotas, avisos) | Integración | BE | `listings.requests.e2e-spec.ts` (variante con publicación de CA-010-11) |
| CA-008-11 (1 cupo, 3 abiertas → 2 rechazadas y cierre) | Integración | BE | `listings.requests.e2e-spec.ts` |
| CA-008-12 (dos compiten por el último cupo ofrecido) | Integración (concurrencia) | BE | `listings.concurrency.e2e-spec.ts` |
| CA-008-13 (cancelar antes de informar el pago) | Integración | BE | `listings.requests.e2e-spec.ts` (variante de CA-010) |
| CA-008-14 (más de 30 días → expirada) | Unitario + integración | BE | `listing-lifecycle.spec.ts`; `listings.expire.e2e-spec.ts` (`FakeClock`) |
| CA-008-15 (24 h sin datos de pago → expirada y aviso) | Integración | BE | `listings.requests.e2e-spec.ts` (variante del barrido de 010) |
| CA-008-16 (grupo cerrado) | Integración | BE | `listings.events.e2e-spec.ts` |
| CA-008-17 (tercer reporte oculta) | Unitario + integración | BE | `report-rules.spec.ts`; `listings.reports.e2e-spec.ts` |
| CA-008-18 (reportar dos veces) | Integración + integridad | BE, BD | `listings.reports.e2e-spec.ts`; `listings.integrity.test.ts` |
| CA-008-19 (`<script>` como texto) | Unitario + E2E | BE, FE | `plain-text.spec.ts`; `frontend/e2e/listings-xss.spec.ts` |
| CA-008-20 (no titular acepta → 403) | Integración | BE | `listings.requests.e2e-spec.ts` (variante de CA-010) |
| CA-008-21 (titular ve nivel y estrellas) | Integración | BE | `listings.requests.e2e-spec.ts` (cola de 010) |
| CA-008-22 (usuario suspendido) | Integración | BE | `listings.publish.e2e-spec.ts`; `listings.requests.e2e-spec.ts` |
| CA-008-23 (ventana cerrada/abierta en la publicación) | Unitario + integración | BE | `entry-window-label.spec.ts`; `listings.view.e2e-spec.ts` |
| CA-008-24 (aceptado → otras abiertas al mismo servicio canceladas) | Integración | BE | `listings.requests.e2e-spec.ts` (variante de RN-010-05) |

Pruebas de reglas: RN-008-02 → `estimated-share.spec.ts`; RN-008-03 → E2E del modal de confirmación (`frontend/e2e/listing-confirm-warning.spec.ts`); RN-008-04 → `offered-slots.spec.ts`; RN-008-06 → `listings.requests.e2e-spec.ts` (solicitante «En riesgo» puede solicitar); RN-008-07 → `plain-text.spec.ts`. Rendimiento RNF-008-02: `listings.search.perf-spec.ts` con 5.000 publicaciones. Los CA que dependen de 010 se escriben como variantes con `source = 'publicacion'` y reutilizan sus ayudantes de prueba.

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Acoplamiento con 010 (puerto, evento, dos métodos nuevos) | Media | Medio | Se acuerda al aprobar ambos planes; quedan en el contrato de 010 (`analyze`). |
| Búsqueda lenta con la cuota calculada | Baja | Medio | Prueba con 5.000 publicaciones; si falla, columna `estimated_share_cents` mantenida por los manejadores. |
| Abuso de reportes para ocultar publicaciones ajenas | Media | Medio | Un reporte por usuario, tope diario, y revisión de un administrador (spec 009). |
| Estafas con publicaciones atractivas | Media | Alto | El pago ocurre fuera de la app: la spec 010 ya exige chat, referencia, reclamo y revisión del administrador; la publicación muestra el nivel del titular. |
| Publicaciones sin moderación mientras 009-P2 no exista | Media | Medio | Hasta que haya moderación, la ocultación por reportes deja la publicación fuera de la búsqueda; el titular puede retirarla. |
| Datos de pantalla con fechas de la ventana en zonas horarias | Baja | Bajo | Las fechas llegan ya calculadas desde el servidor (La Paz). |

## 10. Trazabilidad

| Requisito | Cubierto en |
|---|---|
| RF-008-01 a RF-008-06 (publicación) | §4, §5 `ListingsService`, `data-model.md` |
| RF-008-07 a RF-008-09 (búsqueda) | §4, §5 `ListingsSearchService` |
| RF-008-10 a RF-008-16 (solicitudes) | §2 decisiones 3 a 5, §5 manejadores, spec 010 |
| RF-008-17, RF-008-18 (reportes) | §5 `ListingReportsService` |
| RNF-008-01 a RNF-008-06 | §2, §5, §7, §8 |
| RN-008-01 a RN-008-07 | §5 funciones puras, §8 (pruebas de reglas) |
| CA-008-01 a CA-008-24 | §8 |
