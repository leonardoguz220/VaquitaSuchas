# Modelo de datos — Spec 001: Suscripciones compartidas

- **Responsable:** Camila Fuentes (Base de datos)
- **Migraciones:** `0030` a `0033`
- **Estado:** congelado (plan aprobado); cambios aprobados el 2026-10-18 en el PR #43 (H2, H3, M1–M3, M5, C1–C3)
- En el código, el grupo de una suscripción compartida se llama `group` (tabla `groups`). Las cuotas **no se guardan**: se calculan al consultar a partir del total y del número de miembros (RF-001-12); solo los cobros y ciclos (spec 002) guardan una copia.

## 1. Tablas

### `groups` — `0030_groups.sql`

```
groups
- id: uuid (PK)
- owner_id: uuid (NOT NULL, FK users ON DELETE RESTRICT)           exactamente un titular (RN-001-01)
- name: text (NOT NULL)                                              CHECK char_length(btrim(name)) BETWEEN 2 AND 60
- status: text (NOT NULL, default 'activo')                          CHECK IN ('activo','cerrado')
- closed_at: timestamptz (NULL)                                      CHECK ((status = 'cerrado') = (closed_at IS NOT NULL))
- frozen_at: timestamptz (NULL)                                      grupo en solo lectura por titular baneado (spec 009, RF-009-22)
- frozen_reason: text (NULL)                                         CHECK (frozen_reason IS NULL OR frozen_reason = 'titular_baneado'); CHECK ((frozen_at IS NULL) = (frozen_reason IS NULL))

-- Copia del catálogo (RN-001-12, spec 004 RF-004-08). Se llenan solo al crear; no cambian si el catálogo cambia.
- catalog_plan_id: uuid (NULL, FK catalog_plans ON DELETE RESTRICT)   NULL = servicio personalizado
- service_name_snapshot: text (NOT NULL)
- plan_name_snapshot: text (NULL)
- logo_url_snapshot: text (NULL)
- brand_color_snapshot: text (NULL)
- plan_max_slots_snapshot: smallint (NULL)                           cupos máximos del plan al crear
- individual_price_cents_snapshot: bigint (NULL)                     precio individual de referencia (spec 006)
- individual_price_currency_snapshot: text (NULL)                    CHECK IN ('USD','BS')
CHECK ((catalog_plan_id IS NULL) = (plan_name_snapshot IS NULL))

-- Precio real definido por el titular
- price_cents: bigint (NOT NULL)                                     CHECK > 0, en la moneda del precio
- currency: text (NOT NULL)                                          CHECK IN ('USD','BS')
- exchange_rate: numeric(10,4) (NULL)                                Bs por 1 USD (RN-001-04)
CHECK ((currency = 'USD') = (exchange_rate IS NOT NULL))            RF-001-03
CHECK (exchange_rate IS NULL OR exchange_rate > 0)
- total_bs_cents: bigint GENERATED ALWAYS AS (
      CASE WHEN currency = 'BS' THEN price_cents
           ELSE round(price_cents * exchange_rate)::bigint END) STORED   RF-001-11: redondeo al centavo, mitad hacia arriba
CHECK (total_bs_cents BETWEEN 100 AND 500000)                       Bs 1,00 a Bs 5.000,00 (RN-001-09)

- billing_day: smallint (NOT NULL)                                   CHECK BETWEEN 1 AND 31 (RF-001-02)
- total_slots: smallint (NOT NULL)                                   CHECK BETWEEN 2 AND 20, titular incluido
CHECK (plan_max_slots_snapshot IS NULL OR total_slots <= plan_max_slots_snapshot)   RN-001-13
- invite_code: text (NOT NULL, UNIQUE)                               CHECK invite_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$' (sin 0, O, 1, I, L: RF-001-06)
- accepting_members: boolean (NOT NULL, default true)                RF-001-09
- payment_info_text: text (NULL)                                     CHECK char_length(payment_info_text) <= 500 (RF-001-20)
- payment_qr_key: text (NULL)                                        clave del archivo en el almacén privado
- payment_qr_mime: text (NULL)                                       CHECK IN ('image/jpeg','image/png')
- version: integer (NOT NULL, default 1)                             control optimista
- created_at, updated_at                                             created_at = inicio de la ventana de ingreso inicial
INDEX groups_owner_active_idx (owner_id) WHERE status = 'activo'
```

`created_at` cuenta como el **corte inicial** del grupo (spec 001, sección 11).

**Vigencia de `billing_day`** (PR #43, M5): no hay columna de vigencia. El corte vigente se deriva del último `billing_cycles.cut_date` del grupo (spec 002): un cambio de `billing_day` rige desde el siguiente corte posterior al último ciclo generado, así nunca salen dos cortes en el mismo período.

### `group_members` — `0031_group_members.sql`

Una fila por **estadía** de una persona en el grupo; el titular tiene una fila con `role = 'titular'`.

```
group_members
- id: uuid (PK)
- group_id: uuid (NOT NULL, FK groups ON DELETE RESTRICT)
- user_id: uuid (NOT NULL, FK users ON DELETE RESTRICT)
- role: text (NOT NULL)                                              CHECK IN ('titular','miembro')
- joined_at: timestamptz (NOT NULL, default now())
- join_source: text (NOT NULL)                                       CHECK IN ('creacion','solicitud')
- join_request_id: uuid (NULL)                                       la FK a join_requests y el CHECK ((join_source = 'solicitud') = (join_request_id IS NOT NULL)) los agrega la spec 010 (0054, T006)
- left_at: timestamptz (NULL)
- left_reason: text (NULL)                                           CHECK IN ('abandono','quitado','mora','baneo')
CHECK ((left_at IS NULL) = (left_reason IS NULL))
- created_at, updated_at                                             (PR #43, H2: convención de la spec 000)
UNIQUE INDEX group_members_active_uq (group_id, user_id) WHERE left_at IS NULL     RN-001-05
UNIQUE INDEX group_members_owner_uq (group_id) WHERE role = 'titular' AND left_at IS NULL   un solo titular activo (RN-001-01)
INDEX group_members_user_idx (user_id) WHERE left_at IS NULL                 "mis grupos" (RF-001-19)
INDEX group_members_group_active_idx (group_id) WHERE left_at IS NULL
```

Una **transferencia de titularidad** no cierra filas: se cambia el `role` de las dos filas activas dentro de una transacción (primero el titular actual pasa a `miembro`, después el nuevo pasa a `titular`) y se actualiza `groups.owner_id`; el disparador diferido comprueba el resultado al confirmar.

> **Un cierre de grupo no cierra las filas de los miembros**: siguen activos en modo solo lectura (RF-001-18). `left_at` solo se llena por abandono, expulsión, mora o baneo.

## 2. Restricciones que no caben en un `CHECK` (disparadores)

| Disparador (`0032_group_triggers.sql`) | Qué impone | Criterio |
|---|---|---|
| `groups_owner_member_consistency` (constraint trigger diferido, en `groups` y `group_members`) | Al confirmar la transacción: el `owner_id` del grupo tiene exactamente una fila activa con `role = 'titular'`, y toda otra fila activa tiene `role = 'miembro'`. | RN-001-01 |
| `group_members_capacity` (antes de `INSERT` en `group_members`) | Toma `FOR UPDATE` de la fila del grupo y rechaza si el grupo no está `activo`, si está congelado (`frozen_at IS NOT NULL`) o si las filas activas ya igualan `total_slots`. | RN-001-09, CA-001-07, CA-001-19, CA-001-16 |
| `group_members_left_immutable` (antes de `UPDATE` en `group_members`) | Una vez fijados, `left_at` y `left_reason` no cambian: una estadía cerrada no se reabre (volver al grupo es una fila nueva). | RN-001-05 |
| `groups_slots_not_below_members` (antes de `UPDATE OF total_slots`) | `total_slots >= miembros activos`. | RF-001-14 |
| `groups_max_active_owned` (antes de `INSERT` o de `UPDATE OF status, owner_id`) | Con `pg_advisory_xact_lock(hashtext(owner_id::text))`: un titular no pasa de 5 grupos con `status = 'activo'`. | RN-001-14, CA-001-28 |
| `groups_immutable_snapshots` (antes de `UPDATE`) | Las columnas `*_snapshot` y `catalog_plan_id` no cambian después de crear (se comparan solo esas columnas, no la generada `total_bs_cents`). | RN-001-12 |
| `groups_closed_readonly` (antes de `UPDATE`) | Un grupo `cerrado` no admite cambios salvo `updated_at`, `frozen_at` y `frozen_reason` (el baneo del titular puede congelar un grupo cerrado, spec 009). | RN-001-07, CA-001-16 |

El backend repite las validaciones para dar mensajes claros; la base garantiza que una carrera entre dos peticiones no rompa la regla.

## 3. Consultas frecuentes e índices

| Consulta | Índice |
|---|---|
| Mis grupos (como titular y como miembro) | `group_members_user_idx`, `groups_owner_active_idx` |
| Buscar grupo por código al abrir una solicitud | `groups.invite_code` (único) |
| Miembros activos de un grupo (cuotas, ranking, cobros) | `group_members_group_active_idx` |
| Contar grupos activos de un titular | `groups_owner_active_idx` |
| Grupos con corte hoy (generación de cobros, spec 002) | consulta por `billing_day` sobre `groups WHERE status = 'activo' AND frozen_at IS NULL` (cientos de filas: sin índice propio) |

## 4. Pruebas de integridad (`database/tests/groups.integrity.test.ts`)

| Prueba | Criterio |
|---|---|
| Precio en USD sin tipo de cambio falla; en BS con tipo de cambio falla | CA-001-02, CA-001-03 |
| `total_bs_cents` generado: USD 10,00 × 6,96 = 6960; USD 3,33 × 6,9633 redondea al centavo | CA-001-04, RF-001-11 |
| Total fuera de Bs 1,00–5.000,00, cupos 1 o 21, día de cobro 0 o 32 fallan | RN-001-09 |
| Código con caracteres ambiguos o de largo distinto falla; código repetido falla | RF-001-06 |
| Dos filas activas del mismo usuario en un grupo fallan; tras `left_at` puede volver a existir una nueva | RN-001-05 |
| Dos titulares activos en un grupo fallan; un grupo cuyo `owner_id` no tiene fila de titular falla al confirmar | RN-001-01, CA-001-13 |
| Insertar un miembro con el grupo lleno falla; dos inserciones concurrentes por el último cupo: solo una pasa | CA-001-07, CA-001-19 |
| Reducir `total_slots` por debajo de los miembros falla | RF-001-14 |
| Un sexto grupo activo del mismo titular falla (también con dos inserciones concurrentes); cerrar uno permite crear otro | CA-001-28 |
| Editar una columna `*_snapshot` falla | RN-001-12 |
| Editar un grupo `cerrado` falla | CA-001-16 |
| `total_slots` mayor al `plan_max_slots_snapshot` falla | RN-001-13 |
| Insertar un miembro en un grupo `cerrado` o congelado falla; congelar un grupo cerrado pasa | CA-001-16, RF-009-22 |
| Reabrir una estadía (`left_at` a NULL) o cambiar su `left_reason` falla | RN-001-05 |
| `group_members` tiene `created_at`/`updated_at` con `set_updated_at` | convención spec 000 |
