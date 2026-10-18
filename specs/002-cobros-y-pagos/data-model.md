# Modelo de datos — Spec 002: Cobros y pagos

- **Responsable:** Camila Fuentes (Base de datos)
- **Migraciones:** `0040` a `0044` (rango de la spec 002)
- **Estado:** propuesto; se congela al aprobar el plan
- Convenciones de `specs/000-setup-del-proyecto/data-model.md`. Períodos y ciclo inicial: `specs/001-suscripciones-compartidas/research.md` R1 y R2.

## 1. Tablas

### `billing_cycles` — `0040_billing_cycles.sql`

Un ciclo por grupo y período (RN-002-09). Guarda la copia de precio, tipo de cambio y cuotas vigentes al corte; el panel (006) y la reputación (007) leen de aquí.

```
billing_cycles
- id: uuid (PK)
- group_id: uuid (NOT NULL, FK groups ON DELETE RESTRICT)
- period: text (NOT NULL)                       CHECK period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
- owner_id: uuid (NOT NULL, FK users ON DELETE RESTRICT)   titular al emitir el ciclo; el panel (spec 006) atribuye la cuota de referencia a esta persona aunque luego se transfiera la titularidad
- cycle_type: text (NOT NULL)                   CHECK IN ('inicial','regular')
- cut_date: date (NOT NULL)                     fecha de corte en calendario de La Paz (ajustada, RN-001-06). Ciclo inicial: fecha de creación del grupo
- due_date: date (NOT NULL)                     cut_date + 3 días (RF-002-03). Informativa en el ciclo inicial
- issued_at: timestamptz (NOT NULL)             momento real en que se creó el ciclo (puede ser posterior al corte si hubo caída)
-- Copia (snapshot) de la suscripción al corte
- price_cents: bigint (NOT NULL)                CHECK > 0
- currency: text (NOT NULL)                     CHECK IN ('USD','BS')
- exchange_rate: numeric(10,4) (NULL)           CHECK ((currency = 'USD') = (exchange_rate IS NOT NULL))
- total_bs_cents: bigint (NOT NULL)             CHECK > 0
- member_count: smallint (NOT NULL)             miembros activos incluido el titular; CHECK >= 1
- base_share_cents: bigint (NOT NULL)           floor(total / member_count)
- owner_share_cents: bigint (NOT NULL)          base + resto (referencia del titular, RN-001-10)
- remainder_cents: bigint (NOT NULL)            CHECK >= 0
- finalized_at: timestamptz (NULL)              solo el ciclo inicial: mientras sea NULL se recalcula con cada ingreso o salida (research 001 R1)
CHECK (cycle_type = 'inicial' OR finalized_at IS NOT NULL)
CHECK (base_share_cents * (member_count - 1) + owner_share_cents = total_bs_cents)       Σ cuotas = total
CHECK (owner_share_cents - base_share_cents = remainder_cents)
- created_at, updated_at
UNIQUE (group_id, period)
UNIQUE INDEX billing_cycles_initial_uq (group_id) WHERE cycle_type = 'inicial'
INDEX billing_cycles_group_period_idx (group_id, period DESC)
```

Un ciclo `regular` es inmutable: el disparador `billing_cycles_immutable` rechaza cualquier `UPDATE` salvo en el ciclo `inicial` con `finalized_at IS NULL` (solo cambian `member_count` y las cuotas) y el cierre del inicial (`finalized_at`).

### `charges` — `0041_charges.sql`

Un cobro por miembro y período.

```
charges
- id: uuid (PK)
- group_id: uuid (NOT NULL, FK groups ON DELETE RESTRICT)
- user_id: uuid (NOT NULL, FK users ON DELETE RESTRICT)      quien debe pagar (nunca el titular del grupo)
- cycle_id: uuid (NOT NULL, FK billing_cycles ON DELETE RESTRICT)
- period: text (NOT NULL)                                       copia del período del ciclo (consultas e índice)
- origin: text (NOT NULL)                                       CHECK IN ('ciclo','ingreso') (RN-002-10)
- join_request_id: uuid (NULL)                                  la FK a join_requests la agrega la spec 010; CHECK ((origin = 'ingreso') = (join_request_id IS NOT NULL))
- status: text (NOT NULL, default 'pendiente')                  CHECK IN ('pendiente','en_revision','pagado','atrasado','cancelado')
-- Copia inmutable (RF-002-02, RN-002-02)
- amount_cents: bigint (NOT NULL)                               CHECK > 0: cuota en Bs
- price_cents: bigint (NOT NULL), currency: text (NOT NULL), exchange_rate: numeric(10,4) (NULL)
- total_bs_cents: bigint (NOT NULL), member_count: smallint (NOT NULL)
- issued_at: timestamptz (NOT NULL)                             fecha real de emisión
- due_at: timestamptz (NOT NULL)                                instante exclusivo: el mayor entre el inicio del día corte+4 en La Paz y `issued_at + 3 días` (research 001 R2, RF-002-03)
-- Datos para reputación (RN-002-08)
- first_submitted_at: timestamptz (NULL)                        primera vez que el miembro subió un comprobante
- paid_at: timestamptz (NULL)                                   momento en que pasó a pagado (pago manual: fecha indicada por el titular)
- settled_by: uuid (NULL, FK users)                             titular que confirmó o registró el pago
- settlement: text (NULL)                                       CHECK IN ('comprobante','manual','ingreso')
- manual_note: text (NULL)                                      CHECK char_length(manual_note) <= 200
-- Cancelación
- cancelled_at: timestamptz (NULL), cancelled_by: uuid (NULL, FK users), cancel_reason: text (NULL)    CHECK char_length(btrim(cancel_reason)) BETWEEN 5 AND 200
-- Control
- version: integer (NOT NULL, default 1)
- created_at, updated_at
CHECKS de coherencia:
  (status = 'pagado') = (paid_at IS NOT NULL AND settled_by IS NOT NULL AND settlement IS NOT NULL)
  (status = 'cancelado') = (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancel_reason IS NOT NULL)
  (settlement = 'comprobante') => first_submitted_at IS NOT NULL
  paid_at IS NULL OR paid_at >= issued_at - interval '1 minute'           (el pago manual no puede ser anterior a la emisión)
UNIQUE INDEX charges_member_period_uq (group_id, user_id, period) WHERE status <> 'cancelado'      RF-002-04 (ver nota)
INDEX charges_user_status_idx (user_id, status, due_at)                    "mis cobros" (RF-002-15) y reputación
INDEX charges_group_period_idx (group_id, period, status)                  resumen del mes y del titular
INDEX charges_overdue_idx (due_at) WHERE status = 'pendiente'             barrido de atrasos
INDEX charges_cycle_idx (cycle_id)
```

**Nota sobre la unicidad.** El índice es parcial para que un cobro `cancelado` no impida un cobro de ingreso posterior de la misma persona en el mismo período (caso de quien salió, se canceló su cobro y vuelve dentro de la ventana). La **idempotencia de la generación** no depende solo de este índice: se garantiza porque el ciclo (`UNIQUE (group_id, period)`) y todos sus cobros se crean en **una sola transacción**.

**Disparadores (`0043_charge_triggers.sql`):**

| Disparador | Qué impone | Criterio |
|---|---|---|
| `charges_snapshot_immutable` (antes de `UPDATE`) | Las columnas de copia, `group_id`, `user_id`, `cycle_id`, `period`, `origin`, `issued_at` y `due_at` no cambian. | RN-002-02, CA-002-16 |
| `charges_transition_guard` (antes de `UPDATE OF status`) | Solo las transiciones de RN-002-01 (`pagado` y `cancelado` son finales); `version` aumenta en 1 en cada cambio de estado. | RNF-002-03, CA-002-21 |
| `charges_not_owner` (antes de `INSERT`) | `user_id` no es `groups.owner_id` del grupo. | RN-002-03, RN-001-10 |
| `charges_cycle_consistency` (antes de `INSERT`) | `cycle_id` pertenece al mismo `group_id` y `period`. | integridad |

La lista de transiciones válidas está **duplicada a propósito** (función pura del backend y disparador): el backend da el mensaje claro; la base impide que un error de programación corrompa el historial.

### `receipts` — `0042_receipts.sql`

Cada comprobante subido para un cobro. El archivo vive en el almacén privado; aquí solo su clave.

```
receipts
- id: uuid (PK)
- charge_id: uuid (NOT NULL, FK charges ON DELETE RESTRICT)
- uploaded_by: uuid (NOT NULL, FK users)
- uploaded_at: timestamptz (NOT NULL, default now())            la "última subida" de la reputación (spec 007, RF-007-12)
- file_key: text (NOT NULL)                                      clave en el almacén, p. ej. receipts/<groupId>/<chargeId>/<uuid>.jpg
- mime: text (NOT NULL)                                          CHECK IN ('image/jpeg','image/png','application/pdf')
- size_bytes: integer (NOT NULL)                                 CHECK BETWEEN 1 AND 5242880 (5 MB)
- method: text (NOT NULL)                                        CHECK IN ('qr','transferencia')
- reference: text (NOT NULL)                                     CHECK char_length(btrim(reference)) BETWEEN 1 AND 100 (texto como lo escribió la persona)
- status: text (NOT NULL, default 'vigente')                     CHECK IN ('vigente','reemplazado','rechazado','confirmado')
- file_deleted_at: timestamptz (NULL)                            retención de 2 meses (RN-002-06)
- created_at, updated_at
UNIQUE INDEX receipts_one_active_uq (charge_id) WHERE status = 'vigente'     un solo comprobante vigente por cobro
INDEX receipts_charge_idx (charge_id, uploaded_at DESC)
INDEX receipts_retention_idx (charge_id) WHERE file_deleted_at IS NULL
```

El comprobante pasa a `confirmado` o `rechazado` cuando el titular decide, y a `reemplazado` cuando el miembro sube otro mientras el cobro está `en_revision` (RF-002-08). Sus columnas de archivo no cambian nunca (`receipts_file_immutable`); solo cambian `status` y `file_deleted_at`.

### `payment_references` — `0042_receipts.sql` (misma migración)

Reserva de referencias de pago **por grupo**, compartida con los comprobantes de las solicitudes de ingreso (spec 010, RN-010-14). Vive en la spec 002 porque es la dependencia más baja.

```
payment_references
- id: uuid (PK)
- group_id: uuid (NOT NULL, FK groups ON DELETE RESTRICT)
- reference_key: text (NOT NULL)                 normalizada: upper(btrim(reference)), espacios internos colapsados, solo [A-Z0-9 ./_-]; ver plan §5
- source_type: text (NOT NULL)                   CHECK IN ('receipt','join_request')
- source_id: uuid (NOT NULL)                     id del comprobante o de la solicitud
- reserved_at: timestamptz (NOT NULL, default now())
- released_at: timestamptz (NULL)                se llena cuando el comprobante se rechaza o se reemplaza
- created_at, updated_at
UNIQUE INDEX payment_references_active_uq (group_id, reference_key) WHERE released_at IS NULL     CA-002-27, CA-010-41
INDEX payment_references_source_idx (source_type, source_id)
```

### `charge_events` — `0044_charge_events.sql`

Línea de tiempo de cada cobro (RF-002-17, RNF-002-04). **Solo anexado** (`forbid_update_delete`).

```
charge_events
- id: uuid (PK)
- charge_id: uuid (NOT NULL, FK charges ON DELETE RESTRICT)
- group_id: uuid (NOT NULL, FK groups)           copia para consultar el historial del grupo sin unir
- type: text (NOT NULL)                          CHECK IN ('generado','ingreso_registrado','comprobante_subido','comprobante_reemplazado','rechazado','confirmado','pago_manual','atrasado','cancelado','retiro_por_mora')
- actor_kind: text (NOT NULL)                    CHECK IN ('usuario','sistema')
- actor_id: uuid (NULL, FK users)                CHECK ((actor_kind = 'usuario') = (actor_id IS NOT NULL))
- from_status: text (NULL), to_status: text (NULL)
- reason: text (NULL)                            motivo de rechazo o cancelación, nota del pago manual
- metadata: jsonb (NOT NULL, default '{}')       { "receiptId": "…", "invalidReceipt": true, "paidAt": "…" }
- occurred_at: timestamptz (NOT NULL, default now())
- created_at, updated_at                         updated_at = created_at (tabla de solo anexado)
INDEX charge_events_charge_idx (charge_id, occurred_at)
INDEX charge_events_group_idx (group_id, occurred_at DESC)
```

## 2. Qué lee cada spec de este modelo

| Spec | Lee | Cómo |
|---|---|---|
| 006 (panel) | `billing_cycles`, `charges` | Servicios de lectura de `billing` (`BillingReadService`) para el resto de los módulos. **Excepción aprobada el 2026-10-18:** la spec 006 lee solo con vistas de la base (`v_user_cost_lines`, `v_group_collection`, migraciones 0100+) que se apoyan en los índices de arriba; es solo lectura y la definen Camila y Leonardo. |
| 007 (reputación) | `charges.first_submitted_at`, `due_at`, `paid_at`, `status`, `origin`; `receipts.uploaded_at`; `charge_events.metadata.invalidReceipt` | `ChargeFactsPort` implementado por `billing`: devuelve por cobro la fecha de puntualidad según RF-007-12 (primera subida, o la última si el rechazo fue «comprobante inválido»). |
| 010 (solicitudes) | `payment_references`, `charges (origin='ingreso')` | `PaymentReferenceService.reserve/release` y `ChargesService.createEntryCharge`. |

## 3. Consultas frecuentes e índices

| Consulta | Índice |
|---|---|
| Mis cobros por estado y período (RF-002-15) | `charges_user_status_idx`; período se filtra en memoria sobre pocos cientos de filas |
| Resumen del mes del grupo (RF-002-16/18) | `charges_group_period_idx` |
| Barrido de atrasos | `charges_overdue_idx` (parcial, solo `pendiente`) |
| Historial del grupo paginado | `charges_group_period_idx` + `charge_events_group_idx` |
| ¿Ya existe el ciclo del período? | `UNIQUE (group_id, period)` |
| Deuda `atrasado` de un usuario en un grupo (spec 010, RN-010-13) | `charges_user_status_idx` |
| Limpieza de comprobantes (CA-002-33) | `receipts_retention_idx` con unión a `groups.closed_at` |

## 4. Pruebas de integridad (`database/tests/billing.integrity.test.ts`)

| Prueba | Criterio |
|---|---|
| Dos ciclos del mismo grupo y período fallan; dos ciclos `inicial` del mismo grupo fallan | RF-002-04 |
| `Σ cuotas = total` en el ciclo: valores que no suman fallan | RN-001-02 |
| Un ciclo `regular` no se puede modificar; el `inicial` sin finalizar admite recalcular | RN-002-09 |
| Un cobro duplicado (mismo grupo, miembro y período no cancelado) falla; si el anterior está `cancelado`, el nuevo se acepta | RF-002-04 |
| Un cobro para el titular del grupo falla | RN-002-03 |
| Cambiar el monto, el tipo de cambio o el período de un cobro falla | RN-002-02, CA-002-16 |
| Cada transición inválida de RN-002-01 (toda combinación estado × estado) falla; las válidas pasan | CA-002-21 |
| `pagado` sin `paid_at`/`settled_by`, o `cancelado` sin motivo, fallan | RNF-002-04 |
| Dos comprobantes `vigente` del mismo cobro fallan | RF-002-08 |
| Referencia repetida activa en el mismo grupo falla; liberada o en otro grupo se acepta | CA-002-27, CA-010-41 |
| Comprobante de 6 MB o con `mime` distinto a los permitidos falla | CA-002-05 |
| `UPDATE` y `DELETE` en `charge_events` fallan | RNF-002-04 |
