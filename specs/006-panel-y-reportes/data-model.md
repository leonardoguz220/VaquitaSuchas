# Modelo de datos — Spec 006: Panel y reportes

- **Responsable:** Camila Fuentes (Base de datos)
- **Migraciones:** `0100` a `0102` (rango de la spec 006)
- **Estado:** propuesto; se congela al aprobar el plan
- Esta spec **no crea tablas**: no guarda datos propios. Define **vistas de lectura** y dos índices que calculan los totales en la base de datos con enteros en centavos (RNF-006-06). Las escrituras siguen siendo de las specs 001 y 002.
- Convenciones de `specs/000-setup-del-proyecto/data-model.md`. Usa las copias guardadas en cada ciclo y cobro (RN-006-06): nunca los valores actuales del grupo, salvo el precio individual de referencia, que el grupo copia una sola vez al crearse (spec 001, `individual_price_*_snapshot`).

## 1. Cambio requerido en otra spec

| Spec | Cambio | Motivo |
|---|---|---|
| 002 (`billing_cycles`, migración `0040`) | Columna `owner_id uuid NOT NULL` con el titular al emitir el ciclo | La cuota de referencia del titular (RN-006-02) debe atribuirse a quien era titular en ese mes aunque luego se transfiera la titularidad. Ya incorporada en `specs/002-cobros-y-pagos/data-model.md`. |

Limitación conocida: el ciclo inicial conserva el titular de la creación del grupo, aunque haya una transferencia dentro de ese primer período.

## 2. Vistas

### `v_user_cost_lines` — `0100_reports_views.sql`

Una fila por persona, grupo y período con lo que esa persona **gasta** (RN-006-02). Excluye cobros `cancelado` (RN-006-07).

```
v_user_cost_lines
- user_id: uuid                    miembro (charges.user_id) o titular (billing_cycles.owner_id)
- group_id: uuid
- period: text                     'AAAA-MM' (RN-006-01)
- role: text                       'miembro' | 'titular'
- charge_id: uuid (NULL)           NULL para el titular (no tiene cobro propio, RN-001-10)
- cycle_id: uuid
- cost_cents: bigint               miembro: charges.amount_cents · titular: billing_cycles.owner_share_cents
- status: text (NULL)              estado del cobro; NULL para el titular
- paid_cents: bigint               cost_cents si status = 'pagado'; 0 en otro caso; NULL para el titular
- individual_price_bs_cents: bigint (NULL)   precio individual de referencia en Bs; NULL = «sin dato» (ver abajo)
```

Definición (resumen):

```sql
-- miembro
SELECT c.user_id, c.group_id, c.period, 'miembro', c.id, c.cycle_id,
       c.amount_cents, c.status,
       CASE WHEN c.status = 'pagado' THEN c.amount_cents ELSE 0 END,
       indiv_bs(g, bc)
FROM charges c JOIN billing_cycles bc ON bc.id = c.cycle_id JOIN groups g ON g.id = c.group_id
WHERE c.status <> 'cancelado'
UNION ALL
-- titular
SELECT bc.owner_id, bc.group_id, bc.period, 'titular', NULL, bc.id,
       bc.owner_share_cents, NULL, NULL, indiv_bs(g, bc)
FROM billing_cycles bc JOIN groups g ON g.id = bc.group_id
```

`indiv_bs(g, bc)` (expresión repetida, no una función):
`CASE WHEN g.individual_price_cents_snapshot IS NULL THEN NULL
      WHEN g.individual_price_currency_snapshot = 'BS' THEN g.individual_price_cents_snapshot
      WHEN bc.exchange_rate IS NOT NULL THEN round(g.individual_price_cents_snapshot * bc.exchange_rate)::bigint
      ELSE NULL END`

El tipo de cambio es el que quedó copiado en el ciclo (RN-006-03, RN-006-06). Si el precio individual está en USD pero el grupo cobra en Bs (el ciclo no tiene tipo de cambio), el ahorro queda «sin dato» (propuesta, a confirmar).

### `v_group_collection` — `0100_reports_views.sql`

Cobranza del titular por grupo y período (RF-006-06). Excluye `cancelado`.

```
v_group_collection
- group_id: uuid, period: text, owner_id: uuid           titular del ciclo
- expected_cents: bigint           Σ amount_cents de los cobros del período (sin el titular)
- collected_cents: bigint          Σ de los `pagado`
- in_review_cents: bigint          Σ de los `en_revision`
- pending_cents: bigint            expected − collected (incluye en_revision)
- charge_count: integer, paid_count: integer
```

### Índices — `0101_reports_indexes.sql`

| Índice | Para |
|---|---|
| `charges_user_period_idx ON charges (user_id, period) WHERE status <> 'cancelado'` | gasto, ahorro y gráficos por persona (< 1 s con 20 suscripciones y 12 meses) |
| `billing_cycles_owner_period_idx ON billing_cycles (owner_id, period)` | cuotas de referencia del titular |

Los índices `charges_user_status_idx`, `charges_group_period_idx` y `billing_cycles_group_period_idx` de la spec 002 cubren deudas, «me deben» y cobranza.

### Rol de lectura — `0102_reports_role.sql` _(opcional)_

Concede `SELECT` sobre las dos vistas al rol de la aplicación. No hay datos nuevos.

## 3. Consultas frecuentes

| Consulta | Fuente |
|---|---|
| Gasto y ahorro del mes de una persona | `v_user_cost_lines` filtrada por `user_id` y `period` |
| Gasto de 12 meses | `v_user_cost_lines` por `user_id`, `period BETWEEN` |
| Debo / en revisión | `charges` por `user_id` y `status` (índice de la spec 002) |
| Me deben | `charges` por `group_id IN (grupos del titular)` y `status` |
| Cobranza del mes | `v_group_collection` por `group_id` y `period` |
| Calendario | `billing_cycles` (cortes pasados y actuales) y `groups` (cortes futuros, calculados en el backend) |

## 4. Pruebas de integridad (`database/tests/reports.integrity.test.ts`)

| Prueba | Criterio |
|---|---|
| Un cobro `cancelado` no aparece en `v_user_cost_lines` ni suma en `v_group_collection` | CA-006-02, RN-006-07 |
| El titular tiene una fila por ciclo con `owner_share_cents`; el miembro, una por cobro | CA-006-03 |
| Cambiar el tipo de cambio del grupo no cambia las filas de meses anteriores | CA-006-10 |
| Σ de `cost_cents` por grupo y período = `total_bs_cents` del ciclo (miembros + titular), cuando no hay cobros cancelados | CA-006-22, RNF-006-06 |
| Precio individual en USD con tipo de cambio 6,96: `individual_price_bs_cents` = 6960 para 1000 | CA-006-04 |
| Precio individual ausente (o en USD con ciclo sin tipo de cambio) → `NULL` | CA-006-05 |
| Titular transferido: los ciclos anteriores siguen atribuidos al titular de entonces | caso borde |
| Una vista con 20 grupos y 12 meses por persona responde en < 100 ms (consulta, sin red) | CA-006-19 |
