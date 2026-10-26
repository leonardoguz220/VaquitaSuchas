# Plan técnico — Spec 001: Suscripciones compartidas

- **Spec relacionada:** `specs/001-suscripciones-compartidas/spec.md` (debe estar **aprobada** por BD, Backend y Frontend)
- **Líder de la spec:** Camila Fuentes (BD)
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
| I. Spec primero | Sí, con una aclaración aprobada | `research.md` R1 y R2 (ciclo inicial y vencimiento) aprobados por el equipo el 2026-10-18. |
| II. Dinero exacto | Sí | Centavos enteros; total en Bs con columna generada y función pura equivalente; `Σ cuotas = total`. |
| III. Criterios verificables | Sí | CA-001-01 a 30 mapeados en §8. |
| IV. Seguridad | Sí | `404` para ajenos, límite de intentos de código, QR con tipo real validado. |
| V. Contratos primero | Sí | Modelo y contrato en `data-model.md` y `contracts/api.md`. |
| VI. Simplicidad | Sí | Cuotas calculadas al consultar (sin tablas de cuotas). |
| VII. Capas | Sí | Reglas en `domain/` puras; módulos conectados por puertos y eventos (R3), sin ciclos. |

## 1. Resumen de la solución

Módulo `subscriptions` en el backend (las tablas y el código usan `group` para el grupo de una suscripción) con cuatro servicios: creación y edición del grupo, membresía (alta, baja, abandono, transferencia, cierre), código de invitación y datos de pago. Todo el cálculo (total en Bs, cuotas, corte ajustado, ventana de ingreso) vive en funciones puras sin reloj propio: reciben `now`. La base refuerza lo que no puede romperse (un titular, capacidad, máximo de 5 grupos, copia inmutable del catálogo, total generado). El resto de los módulos se entera de los cambios por un bus de eventos transaccional y consulta a este módulo por servicios. El frontend ofrece "Mis suscripciones", un asistente de creación de tres pasos y el detalle del grupo con desglose de la cuota.

## 2. Decisiones técnicas

| Decisión | Opción elegida | Alternativas descartadas | Motivo |
|---|---|---|---|
| Cuotas | Se calculan al consultar | Tabla de cuotas | RF-001-12: se recalculan solas; el historial vive en los cobros (snapshot). |
| Total en Bs | Columna generada en PostgreSQL + función pura equivalente | Solo en el backend | La base garantiza la consistencia (Constitución II). |
| Titular y membresía | `groups.owner_id` + fila `group_members.role = 'titular'` con disparador diferido | Solo un campo | Una consulta simple del dueño y consistencia garantizada. |
| Estadías | Una fila por estadía (`left_at`) con índice único parcial de activos | `UNIQUE (group_id, user_id)` | Permite volver a entrar tras abandonar, conservando el historial. |
| Capacidad y límite de 5 grupos | Disparadores con bloqueo | Solo verificación en el servicio | Evita carreras (CA-001-19, CA-001-28). |
| Período y ciclo inicial | Definición de `research.md` R1 | Dejar el hueco | 002, 006 y 010 dependen de ello. |
| Vencimiento | `due_at` = fin del día `corte + 3` (R2) | Corte + 72 h | Coincide con RN-007-06 y CA-007-03/04. |
| Acoplamiento entre módulos | Puertos y `TxEventBus` (R3) | Importaciones cruzadas | `context/arquitectura.md` prohíbe ciclos. |
| Habilitación para ser titular | `HostEligibilityPort`; en el MVP: habilitación manual (spec 009) **o** calificación (spec 007) | Esperar a que existan ambas | Permite entregar el hito 2 antes de la reputación completa; la parte de calificación se activa al terminar la reputación básica. |
| Código de invitación | 8 caracteres de un alfabeto de 31 símbolos, muestreo por rechazo con `crypto.randomBytes` | `Math.random`, UUID acortado | Aleatorio criptográfico y sin sesgo (RNF-001-02). |
| Rutas del frontend | `/grupos`, `/grupos/nuevo`, `/grupos/[id]` | Rutas en inglés | La interfaz está en español de Bolivia. |

## 3. Modelo de datos — _Camila (BD)_

Detalle en [`data-model.md`](data-model.md): `groups` y `group_members` (migraciones 0030 y 0031), disparadores de integridad (0032), con las restricciones de la spec (un titular, capacidad, total generado, rangos, copia inmutable, cerrado de solo lectura). Las cuotas no se guardan. Pruebas de integridad en `database/tests/groups.integrity.test.ts`.

Seed de desarrollo: dos grupos de ejemplo con un titular habilitado y tres miembros, solo con `NODE_ENV != production`.

### Cambios al modelo y a las tareas (aprobados el 2026-10-18, PR #43; se aplicaron todas las recomendaciones)

> Detectado por `/speckit-analyze` (3 CRITICAL y 3 HIGH). Ya están en `data-model.md` y en `tasks.md` de las specs 001, 003 y 010. M5 se resolvió sin columna nueva: el corte se deriva del último `billing_cycles.cut_date`.

**Bloquean T001–T004 (modelo):**

| ID | Problema | Propuesta |
|---|---|---|
| H2 | `group_members` no tiene `created_at` ni `updated_at`, pero la convención de la spec 000 (data-model §1) los exige en toda tabla, la prueba `schema.conventions` falla sin ellos y T004 aplica `set_updated_at` "en ambas tablas". | Agregar `created_at` y `updated_at` (`timestamptz NOT NULL DEFAULT now()`) a `group_members`, con el disparador `set_updated_at`. |
| H3 | La spec 001 delega a la 010 la FK `group_members.join_request_id`, pero la migración 0054 de la 010 solo agrega `charges.join_request_id`. | Que 010 T006 agregue también la FK de `group_members.join_request_id` y el CHECK `((join_source = solicitud) = (join_request_id IS NOT NULL))`, o que la 001 deje de exigirla. Se coordina con el plan de la 010. |
| M1 | Nada en la base impide insertar un miembro en un grupo `cerrado` o congelado (`frozen_at`). | Que `group_members_capacity` también rechace si `status <> activo OR frozen_at IS NOT NULL`. |
| M2 | "o de reactivar" en `group_members_capacity` contradice el modelo de una fila por estadía. | Hacer inmutables `left_at` y `left_reason` una vez fijados; el control de cupo solo en `INSERT`. |
| M3 | `groups_closed_readonly` impediría fijar `frozen_at` en un grupo cerrado, y el baneo (spec 009, T028) revertiría toda su transacción. | Exceptuar `frozen_at` y `frozen_reason` en `groups_closed_readonly`, o que el baneo solo congele grupos `activo`. |
| M5 | "`billing_day` rige desde el siguiente corte" (§5) no tiene columna de vigencia: con el día nuevo podrían salir dos cortes en el mismo período (UNIQUE `(group_id, period)` de la 002). | [NECESITA ACLARACIÓN] `billing_day_effective_from` o derivar el corte del último `billing_cycles.cut_date` (spec 002). |

**Bloquean T005 y T041 (seed de desarrollo):**

| ID | Problema | Propuesta |
|---|---|---|
| C1 | T005 siembra "12 meses de ciclos y cobros", pero `billing_cycles` y `charges` son de la spec 002 (0040–0049) y no figuran en *Depende*. | T005 solo siembra `groups` y `group_members` (archivo `seeds/0030_groups_dev.sql`). Los ciclos y cobros los siembra la spec 002 con su propio archivo 004x. |
| C2 | Los grupos necesitan un titular y tres miembros, pero `users` exige `password_hash` y `ci_encrypted` (cifrado con la clave del backend), y `db:seed` rechaza todo seed que mencione "password" (RF-009-02). Solo existe `seed:admin`. | Un comando de backend `seed:dev-users` (como `seed:admin`, solo fuera de producción y con la contraseña por variable de entorno) que cree usuarios de prueba. El seed de BD referencia esos usuarios por correo y no siembra contraseñas. Es una tarea nueva [BE] en la spec 003. |
| C3 | "Titular habilitado" necesita `host_enablements` (0091, spec 009), y T041 no depende de esa tarea. | T041 depende de la tarea de la spec 009 que crea 0091. Hasta entonces el titular de desarrollo se habilita con el comando de administración. |
| H1 | `db:seed` aplica los `.sql` antes de `catalog.json`: en una base recién reiniciada, un grupo con `catalog_plan_id` fallaría por la FK. | Que `db:seed` aplique primero el catálogo y después los `.sql` (cambio en `database/src/seed.ts`, en la misma transacción), o sembrar grupos con servicio personalizado. |
| M4 | Los disparadores BEFORE INSERT corren aunque haya `ON CONFLICT DO NOTHING`: re-sembrar un grupo lleno fallaría por cupo. | El seed usa `INSERT … SELECT … WHERE NOT EXISTS` y se prueba un doble `db:seed`. |

**Menores (se resuelven al implementar):** documentar en RF-001-11 que el redondeo es mitad hacia arriba (L1); en `groups_immutable_snapshots`, comparar solo las columnas `*_snapshot` y `catalog_plan_id`, sin la generada (L2); citar CA-001-08 en la prueba de RN-001-05 (L3).

**Si se aprueba:** actualizar `data-model.md` §1, §2 y §4, las tareas T001–T005 y T041 (y agregar la tarea [BE] de `seed:dev-users` en la spec 003), y avisar a la spec 010 (H3) y a la 009 (C3, M3).

**Estado tras la implementación (converge 2026-10-26):** verificados contra las migraciones y el código: H2 (`created_at`/`updated_at` en `group_members`, 0031), H3 (la FK `group_members.join_request_id` la agrega la 0055 de la spec 010), M1 y M3 (la capacidad rechaza grupos no activos o congelados y `groups_closed_readonly` exceptúa `frozen_at` y `frozen_reason`, 0032), M5 (sin columna de vigencia: se deriva del último `billing_cycles.cut_date`, `data-model.md` §1) y C2 (`seed:dev-users` en `backend/src/cli/`). Los demás hallazgos de esta tabla no se revisaron uno por uno en esta pasada.

## 4. Contratos de API — _Leonardo (Backend)_

Detalle en [`contracts/api.md`](contracts/api.md): `GET /users/me/host-eligibility`, `POST /groups/quote`, `POST /groups`, `GET /groups`, `GET /groups/:id`, `PATCH /groups/:id`, `PUT /groups/:id/payment-info`, `POST /groups/:id/invite-code/regenerate`, `DELETE /groups/:id/members/:userId`, `POST /groups/:id/leave`, `POST /groups/:id/transfer-ownership`, `POST /groups/:id/close`.

La apertura de la solicitud de ingreso con el código (RF-001-07) es `POST /join-requests` de la spec 010; esta spec entrega el servicio `InviteCodeService.resolve()`.

> **Contrato congelado** al aprobarse este plan. Los cambios se hacen por PR sobre este archivo y avisando a las otras dos capas.

## 5. Lógica de dominio — _Leonardo (Backend)_

### Estructura

```text
backend/src/
├── shared/
│   ├── domain/la-paz.ts          # conversión UTC−4, inicio de día, días del mes (R4)
│   └── events/                   # TxEventBus y tipos: GroupCreated, MemberAdded, MemberRemoved, OwnerChanged, GroupClosed, GroupFrozen
└── modules/subscriptions/
    ├── controllers/   groups.controller.ts, members.controller.ts, payment-info.controller.ts, eligibility.controller.ts
    ├── services/      groups.service.ts, membership.service.ts, invite-code.service.ts, payment-info.service.ts, group-view.service.ts
    ├── domain/        money.ts, shares.ts, billing-calendar.ts, entry-window.ts, invite-code.ts, group-rules.ts
    ├── ports/         open-charges.port.ts, host-eligibility.port.ts, ownership-blockers.port.ts
    └── repositories/  groups.repository.ts, members.repository.ts
```

### Funciones puras (todas con pruebas unitarias; reciben `now`, nunca lo leen)

| Función | Entradas → salida | Reglas |
|---|---|---|
| `computeTotalBsCents(priceCents, currency, exchangeRate)` | → entero | `BS`: igual al precio; `USD`: `floor((precio × tasa×10⁴ + 5000) / 10⁴)` (RF-001-11, CA-001-04). |
| `parseExchangeRate(text)` | → entero ×10⁴ | Positivo, hasta 4 decimales (RN-001-04). |
| `splitShares(totalBsCents, memberCount)` | → `{ baseShareCents, ownerShareCents, remainderCents }` | `base = floor(total/n)`; `resto = total − base×n`; `ownerShare = base + resto`; `base×(n−1) + ownerShare = total` (RN-001-02, CA-001-05, CA-001-12). |
| `validateGroupInput(input, plan?)` | → lista de reglas incumplidas | Total entre 100 y 500000 centavos; cupos 2 a 20; día 1 a 31; cupos ≤ máximo del plan (RN-001-09, RN-001-13); `exchangeRate` según moneda (RF-001-03). |
| `adjustBillingDay(year, month, day)` | → día | `min(day, díasDelMes)` (RN-001-06, CA-001-17). |
| `cutDateFor(year, month, billingDay)` | → fecha La Paz | Corte ajustado. |
| `periodOf(cutDate)` | → `"AAAA-MM"` | Año y mes del corte. |
| `dueAtFor(cutDate)` | → instante | Inicio del día `corte + 4` en La Paz (exclusivo; R2). |
| `nextCutAfter(now, billingDay)` | → fecha | Primer corte regular posterior a `now`. |
| `lastCutAtOrBefore(now, billingDay, createdAt)` | → instante | El mayor entre `createdAt` y el último corte regular ≤ `now`. |
| `entryWindow(group, now)` | → `{ isOpen, start, endExclusive, opensAt, closesAt }` | Ventana = `[lastCut, inicioDelDía(fecha(lastCut) + 3 días))`: termina a las 23:59:59 del día 3 (RF-001-22, CA-001-26/27). El parámetro `windowDays` (por defecto 3) viene de configuración. |
| `generateInviteCode(randomBytes)` | → 8 caracteres | Alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789`; descarta bytes ≥ 248 (sin sesgo). |
| `canLeave(role, openCharges)` | → ok o regla | Titular no (RN-001-08); con cobros abiertos no (RF-001-16). |
| `canReceiveOwnership({ isActiveMember, isHostEligible, activeOwnedGroups })` | → ok o regla | RF-001-17, RN-001-14. |

### Servicios

- **`GroupsService.create`** (transacción): 1) `HostEligibilityPort.check(userId)` → `NOT_HOST_ELIGIBLE` con los datos de elegibilidad; 2) contar grupos activos del titular (< 5, `TOO_MANY_ACTIVE_GROUPS`; el disparador lo repite); 3) si hay `catalogPlanSlug`, `CatalogService.getActivePlanForSubscription` (spec 004) para copiar nombre del servicio y plan, logo, color, cupos máximos y precio individual; si no, servicio personalizado; 4) `validateGroupInput`; 5) generar código (reintenta hasta 5 veces ante colisión); 6) insertar grupo y la fila de titular; 7) `TxEventBus.publish(GroupCreated)` (la spec 002 crea el ciclo inicial, R1).
- **`GroupsService.update`**: bloqueo de la fila del grupo con `version`; rechaza si está `cerrado` o congelado; cambios de precio, moneda o tipo de cambio no tocan cobros ni solicitudes (llevan su propia copia); bajar `total_slots` por debajo de los miembros → `SLOTS_BELOW_MEMBERS`; cambiar `billing_day` toma efecto en el siguiente corte posterior a hoy (la ventana actual no se recalcula hacia atrás).
- **`MembershipService`**: `addMemberTx(tx, groupId, userId, source, joinRequestId)` (lo usa la spec 010 al aceptar; el disparador impone la capacidad), `removeMember(groupId, userId, reason)` (quitar, mora, baneo; publica `MemberRemoved`), `leave`, `transferOwnership`, `close`. Antes de transferir o cerrar pregunta a `OwnershipBlockersPort` (solicitudes en pago, spec 010) y, para transferir, a `HostEligibilityPort` y al conteo de grupos del destinatario.
- **`InviteCodeService.resolve(userId, code)`**: normaliza (mayúsculas, sin espacios), cuenta fallos en `rate_limit_events` (`invite_code_fail:user`, 10 por 15 minutos → `RATE_LIMITED`, CA-001-18) y devuelve el grupo o un error genérico "Código inválido" igual para inexistente, regenerado o de grupo cerrado (caso borde de la spec). **`regenerate`** reemplaza el código en una sentencia; el anterior deja de existir.
- **`PaymentInfoService`**: guarda el texto y el QR mediante `FileStorage` (clave `groups/<id>/qr/<uuid>.<ext>`), valida tipo real (firma binaria) y tamaño (2 MB), y conserva el QR anterior si la validación falla. Solo genera la URL firmada (10 min) cuando un miembro consulta el grupo.
- **`GroupViewService`**: arma `GroupSummary`/`GroupDetail` con `splitShares` y `entryWindow`; el código solo se incluye para el titular; los teléfonos solo para miembros activos.
- **`HostEligibilityPort`** (implementado por un adaptador en `app-adapters/` registrado en `AppModule`): `check(userId)` → `{ eligible, source, current, requirement }`. En el MVP: `manual` si hay una habilitación vigente de la spec 009 (`host_enablements`); `calificacion` si la spec 007 informa ≥ 4,5 estrellas con ≥ 6 cobros considerados (RF-007-15). Antes de existir la reputación, la parte de calificación devuelve "no habilitado".
- **Manejadores de eventos que registra este módulo:** `UserBanned` (spec 009) → congela los grupos que el usuario posee (`frozen_at`, `frozen_reason`) — en un grupo `cerrado` solo se pueden cambiar `frozen_at`, `frozen_reason` y `updated_at` (disparador `groups_closed_readonly`): congelar o descongelar **no** incrementa `version`, o se revierte la transacción del baneo y retira al usuario de los grupos donde es miembro (`reason = 'baneo'`, evento `MemberRemoved`); `UserUnbanned` → descongela los grupos del usuario que se congelaron por ese baneo (`frozen_at` y `frozen_reason` a `NULL`, CA-009-37); `UserSuspended` → no hace nada con el grupo (RN-009-03).
- **Retiro por mora (RF-001-23):** lo ejecuta la spec 002 llamando a `MembershipService.removeMember(..., 'mora')`; esta spec garantiza que las cuotas de quienes quedan se recalculen (se calculan al consultar).

### Consultas con permisos

`GroupMemberGuard` y `GroupOwnerGuard` leen la membresía activa por (`groupId`, `userId`): sin fila → `404`; miembro en ruta de titular → `403`.

## 6. Interfaz de usuario — _Adrian (Frontend)_

| Ruta | Rol | Contenido | Endpoints |
|---|---|---|---|
| `/grupos` ("Mis suscripciones") | Usuario | Lista de tarjetas (`GroupSummary`): logo, nombre, rol (insignia), cuota ("Tu cuota" o "Cuota de referencia" para el titular), miembros `3/4`, próximo corte, estado (cerrado, "titular baneado"). Filtro por rol. Botón **Crear suscripción** (si no está habilitado, abre un panel que explica qué falta: estrellas, cobros considerados, o que un administrador lo habilite). Estado vacío: "Aún no estás en ningún grupo" con acciones **Crear** (si es elegible) y **Entrar con un código** (spec 010). | `GET /groups`, `GET /users/me/host-eligibility` |
| `/grupos/nuevo` | Titular habilitado | Asistente de 3 pasos: 1) servicio (spec 004) o personalizado; 2) plan; 3) datos: nombre, precio (propuesto por el plan, editable), moneda, tipo de cambio (solo USD), día de cobro, cupos (con el máximo del plan), datos de pago (texto y QR). Muestra en vivo "Total en Bs" y "Cada miembro pagaría" pidiéndolos a `POST /groups/quote` (con retraso de 300 ms); el frontend no calcula. Al crear muestra el código con botones **Copiar** y **Compartir**. | `POST /groups/quote`, `POST /groups`, `PUT /groups/:id/payment-info` |
| `/grupos/[id]` | Miembro o titular | Pestañas: **Resumen** (desglose del total y la cuota, tipo de cambio, ventana de ingreso "abierta hasta…" / "se abre el…", datos de pago), **Miembros** (nombres y celulares; para el titular, botón quitar con aviso de cobros abiertos), **Cobros** (spec 002), **Solicitudes** (titular, spec 010), **Ajustes** (titular: editar, pausar recepción, regenerar código, transferir titularidad, cerrar; miembro: abandonar). Los grupos cerrados o con titular baneado muestran el banner correspondiente y todo en solo lectura; el de titular baneado incluye **"Buscar otro grupo"** (spec 008). | `GET /groups/:id`, `PATCH /groups/:id`, `DELETE …/members/:userId`, `POST …/leave`, `…/transfer-ownership`, `…/close`, `…/invite-code/regenerate` |

### Reglas de UX
- Las confirmaciones destructivas (quitar, transferir, cerrar, abandonar) usan un modal con el efecto explicado ("Se conservarán sus cobros").
- Mensajes de error por `code` (`SLOTS_BELOW_MEMBERS` muestra el mínimo, `HAS_OPEN_CHARGES` los cobros pendientes, etc.).
- Errores `409 STALE_STATE` recargan el grupo y avisan que otra persona lo modificó.
- Subida del QR: vista previa, límite de 2 MB y tipos JPG/PNG validados en el cliente solo como ayuda.
- Diseño móvil primero: el desglose es una lista vertical; las pestañas se desplazan horizontalmente.

## 7. Seguridad y permisos — _Leonardo (Backend), con revisión de BD_

| Acción | Titular | Miembro | Ajeno al grupo |
|---|---|---|---|
| Ver grupo, miembros y datos de pago | Sí | Sí | `404` |
| Ver el código de invitación | Sí | No (no se incluye en la respuesta) | `404` |
| Editar, pausar, regenerar código, quitar, transferir, cerrar | Sí | `403` | `404` |
| Abandonar | No (regla) | Sí | `404` |

- El código de invitación se genera con fuente criptográfica y su consulta tiene límite de intentos (RNF-001-02).
- El QR se guarda en un espacio privado con nombre generado; nunca se sirve una ruta pública. La URL firmada se entrega solo a miembros activos.
- Los textos libres (nombre del grupo, datos de pago) se tratan como texto plano en la interfaz.
- Los celulares solo aparecen en `GroupMember.phone` para titular y miembros del mismo grupo (RN-003-03).
- Toda validación (rangos, rol, estado del grupo) se repite en el servidor; el frontend solo ayuda (regla 8 de CLAUDE.md).

## 8. Estrategia de pruebas

| Criterio de aceptación | Nivel | Capa | Test |
|---|---|---|---|
| CA-001-01 (crear → titular, miembro y código de 8) | Integración | BE | `groups.create.e2e-spec.ts` |
| CA-001-02 (USD sin tipo de cambio) | Unitario + integración + integridad | BE, BD | `group-rules.spec.ts`; `groups.create.e2e-spec.ts`; `groups.integrity.test.ts` |
| CA-001-03 (BS sin tipo de cambio) | Unitario + integridad | BE, BD | `group-rules.spec.ts`; `groups.integrity.test.ts` |
| CA-001-04 (USD 10,00 × 6,96 = Bs 69,60) | Unitario + integridad | BE, BD | `money.spec.ts` (incluye comparación con la columna generada); `groups.integrity.test.ts` |
| CA-001-05 (100,00 entre 3 → 33,34 / 33,33 / 33,33) | Unitario | BE | `shares.spec.ts` (propiedad: la suma siempre es el total, miles de casos) |
| CA-001-06 (código válido abre solicitud, aún no es miembro) | Integración | BE | `join-requests.open.e2e-spec.ts` (spec 010, CA-010-01) usando `InviteCodeService` |
| CA-001-07 (grupo lleno) | Integración + integridad | BE, BD | `membership.e2e-spec.ts`; `groups.integrity.test.ts` |
| CA-001-08 (ya es miembro) | Integración + integridad | BE, BD | `join-requests.open.e2e-spec.ts` (CA-010-02); `groups.integrity.test.ts` |
| CA-001-09 (código regenerado) | Integración | BE | `invite-code.e2e-spec.ts` |
| CA-001-10 (no miembro → 404) | Integración | BE | `groups.permissions.e2e-spec.ts` |
| CA-001-11 (miembro edita/quita → 403) | Integración | BE | `groups.permissions.e2e-spec.ts` |
| CA-001-12 (Σ cuotas = total al confirmar ingreso) | Unitario + integración | BE | `shares.spec.ts`; `join-requests.accept.e2e-spec.ts` (spec 010, CA-010-11) |
| CA-001-13 (transferir: un único titular) | Integración + integridad | BE, BD | `ownership.e2e-spec.ts`; `groups.integrity.test.ts` |
| CA-001-14 (abandonar con cobros sin pagar) | Integración | BE | `membership.e2e-spec.ts` (con un adaptador de prueba de `OpenChargesPort`; el real, en `billing.leave.e2e-spec.ts`) |
| CA-001-15 (titular no abandona) | Unitario + integración | BE | `group-rules.spec.ts`; `membership.e2e-spec.ts` |
| CA-001-16 (grupo cerrado rechaza unirse y editar) | Integración + integridad | BE, BD | `groups.close.e2e-spec.ts`; `groups.integrity.test.ts` |
| CA-001-17 (día 31 en febrero → 28/29) | Unitario | BE | `billing-calendar.spec.ts` (años 2026, 2028, 2100) |
| CA-001-18 (10 fallos de código → bloqueo) | Integración | BE | `invite-code.e2e-spec.ts` con `FakeClock` |
| CA-001-19 (dos solicitudes, último cupo) | Integración + integridad | BE, BD | `join-requests.concurrency.e2e-spec.ts` (spec 010, CA-010-06); `groups.integrity.test.ts` |
| CA-001-20 (Mis suscripciones solo las mías) | Integración + E2E | BE, FE | `groups.list.e2e-spec.ts`; `frontend/e2e/groups.spec.ts` |
| CA-001-21 (titular: cuota de referencia, sin cobro) | Integración | BE | `groups.view.e2e-spec.ts` (90,00 entre 3 → 30,00 de referencia); sin cobro, en `billing.generate.e2e-spec.ts` (spec 002, CA-002-01) |
| CA-001-22 (ingreso en ventana: pagado y primer cobro regular en el siguiente corte) | Integración | BE | `billing.generate.e2e-spec.ts` y `join-requests.accept.e2e-spec.ts` (specs 002 y 010, CA-002-24, CA-010-12) |
| CA-001-23 (texto y QR de pago visibles a miembros) | Integración | BE | `payment-info.e2e-spec.ts` |
| CA-001-24 (no habilitado no crea) | Integración | BE | `groups.create.e2e-spec.ts` (con `HostEligibilityPort` de prueba) |
| CA-001-25 (habilitado crea) | Integración | BE | `groups.create.e2e-spec.ts` |
| CA-001-26 (corte día 10: abierto el 13 a las 23:59, cerrado el 14 a las 00:00) | Unitario + integración | BE | `entry-window.spec.ts`; `join-requests.open.e2e-spec.ts` (CA-010-37) |
| CA-001-27 (grupo nuevo, ventana inicial) | Unitario | BE | `entry-window.spec.ts` (incluye creación a mitad del día y corte posterior en la misma ventana) |
| CA-001-28 (quinto grupo sí, sexto no; miembro sin límite) | Integración + integridad | BE, BD | `groups.create.e2e-spec.ts`; `groups.integrity.test.ts` (con concurrencia) |
| CA-001-29 (mora a los 3 días: retiro y recálculo) | Integración | BE | `billing.overdue.e2e-spec.ts` (spec 002, CA-002-28) |
| CA-001-30 (transferir a no habilitado) | Integración | BE | `ownership.e2e-spec.ts` |

Pruebas de reglas: RN-001-01 y RN-001-05 → `groups.integrity.test.ts`; RN-001-02 → `shares.spec.ts`; RN-001-03 → `billing.snapshot.e2e-spec.ts` (spec 002, CA-002-16); RN-001-04 → `money.spec.ts`; RN-001-06 → `billing-calendar.spec.ts`; RN-001-07 → `groups.close.e2e-spec.ts`; RN-001-08 → `membership.e2e-spec.ts`; RN-001-09 y RN-001-13 → `group-rules.spec.ts` y `groups.integrity.test.ts`; RN-001-10 → `groups.view.e2e-spec.ts`; RN-001-11 y RN-001-12 → `join-requests.accept.e2e-spec.ts` y `groups.integrity.test.ts` (copia inmutable); RN-001-14 → `groups.integrity.test.ts`.

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Hueco del ciclo inicial mal entendido entre specs | Media | Alto | `research.md` R1 aprobado el 2026-10-18; CA-001-22/27 y 002 lo prueban. |
| Dependencia circular entre módulos por cobros y reputación | Media | Medio | Puertos y eventos (R3); una regla de lint (`eslint-plugin-boundaries` o `import/no-cycle`) lo vigila en CI. |
| Habilitación de titulares bloquea el arranque (nadie tiene historial) | Alta | Alto | Habilitación manual por el administrador/CLI desde el hito 2; el seed crea un titular habilitado de desarrollo. |
| Diferencia entre el total de la columna generada y el del dominio | Baja | Alto | Prueba de equivalencia con miles de combinaciones. |
| Cambiar el día de cobro cerca del corte desorienta | Media | Bajo | El cambio rige desde el siguiente corte posterior a hoy; el frontend lo explica antes de guardar. |
| Un grupo con titular baneado queda sin salida para sus miembros | Media | Medio | Banner con "Buscar otro grupo" (spec 008); administración puede transferir (spec 009, RF-009-24). |
| El almacén de archivos (Supabase) falla al subir el QR | Media | Bajo | Se conserva el QR anterior; mensaje claro; reintento. |

## 10. Trazabilidad

| Requisito | Cubierto en |
|---|---|
| RF-001-01 a RF-001-05 (creación, datos, tipo de cambio, titular, precio sugerido) | §4 `POST /groups`, §5 `GroupsService.create`, §6 asistente |
| RF-001-06 (código de 8 sin ambiguos) | §3 `CHECK`, §5 `generateInviteCode` |
| RF-001-07 (abrir solicitud con el código) | §4 (última línea), §5 `InviteCodeService`, spec 010 |
| RF-001-08 (regenerar código) | §4, §5 |
| RF-001-09 (pausar recepción) | §4 `PATCH`, `EntryWindow.acceptingMembers` |
| RF-001-10 a RF-001-13 (división, moneda, recálculo, desglose) | §5 `splitShares`, `computeTotalBsCents`, `Breakdown` |
| RF-001-14 (editar) | §4, §5 `update`, `data-model.md` §2 |
| RF-001-15, RF-001-16 (quitar, abandonar) | §4, §5 `MembershipService` |
| RF-001-17, RF-001-18 (transferir, cerrar) | §4, §5 |
| RF-001-19 (mis grupos) | §4 `GET /groups`, §6 |
| RF-001-20 (datos de pago) | §4 `PUT payment-info`, §5 `PaymentInfoService` |
| RF-001-21 (titular habilitado) | §2, §4 `host-eligibility`, §5 `HostEligibilityPort` |
| RF-001-22 (ventana de ingreso) | §5 `entryWindow`, `research.md` R1/R2 |
| RF-001-23 (retiro por mora) | §5 (retiro por mora), spec 002 |
| RNF-001-01 a RNF-001-05 | §7 (404, intentos), §3 (centavos), §6 (3 pasos), rendimiento: índices de §3 de `data-model.md` y prueba de 50 grupos en `groups.list.e2e-spec.ts` |
| RN-001-01 a RN-001-14 | §8 (pruebas de reglas) |
| CA-001-01 a CA-001-30 | §8 |
