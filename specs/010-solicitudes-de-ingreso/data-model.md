# Modelo de datos — Spec 010: Solicitudes de ingreso y chat

- **Responsable:** Camila Fuentes (Base de datos)
- **Migraciones:** `0050` a `0055` (rango de la spec 010)
- **Estado:** congelado (plan aprobado); ajustes H1, H2, M1–M3, M6 y L1 de `/speckit-analyze` aprobados por BD el 2026-10-19
- Convenciones de `specs/000-setup-del-proyecto/data-model.md`. Depende de `groups` y `group_members` (001), `charges` y `payment_references` (002) y `users` (003).

## 1. Tablas

### `join_requests` — `0050_join_requests.sql`

Una fila por solicitud. Guarda la cotización, los plazos y el comprobante; la línea de tiempo vive en `join_request_events`.

```
join_requests
- id: uuid (PK)
- group_id: uuid (NOT NULL, FK groups ON DELETE RESTRICT)
- applicant_id: uuid (NOT NULL, FK users ON DELETE RESTRICT)
- source: text (NOT NULL, default 'codigo')                   CHECK IN ('codigo','publicacion')   -- 'publicacion': spec 008
- listing_id: uuid (NULL)                                      la FK a listings la agrega la spec 008; CHECK ((source = 'publicacion') = (listing_id IS NOT NULL))
- status: text (NOT NULL, default 'abierta')                   CHECK IN ('abierta','esperando_pago','pago_informado','aceptada','rechazada','cancelada','expirada')
- opened_at: timestamptz (NOT NULL)
- open_deadline_at: timestamptz (NOT NULL)                    min(opened_at + 24 h, fin de la ventana de ingreso al abrir) (RN-010-05)

-- Cotización y datos de pago (se fijan al enviar los datos de pago)
- quote_amount_cents: bigint (NULL)                            CHECK > 0: cuota de ingreso (RN-010-01)
- quote_price_cents: bigint (NULL), quote_currency: text (NULL), quote_exchange_rate: numeric(10,4) (NULL)
- quote_total_bs_cents: bigint (NULL), quote_member_count: smallint (NULL)      miembros actuales + 1
- payment_text: text (NULL)                                    CHECK char_length <= 500
- payment_qr_key: text (NULL), payment_qr_mime: text (NULL)    copia propia de la solicitud (no depende de cambios posteriores del grupo)
- payment_sent_at: timestamptz (NULL)
- pay_deadline_at: timestamptz (NULL)                          payment_sent_at + 15 min (+15 si hay prórroga)
- extended_at: timestamptz (NULL)                              una sola prórroga (RF-010-28)

-- Comprobante del solicitante (RF-010-13)
- proof_key: text (NULL), proof_mime: text (NULL)              CHECK proof_mime IN ('image/jpeg','image/png','application/pdf')
- proof_size_bytes: integer (NULL)                             CHECK BETWEEN 1 AND 5242880
- proof_method: text (NULL)                                    CHECK IN ('qr','transferencia')
- proof_reference: text (NULL)                                 CHECK char_length(btrim(proof_reference)) BETWEEN 1 AND 100
- proof_uploaded_at: timestamptz (NULL)
- decision_deadline_at: timestamptz (NULL)                     proof_uploaded_at + 60 min (RF-010-17)
- reminder_sent_at: timestamptz (NULL)                         recordatorio a los 30 min (CA-010-14)

-- Cierre
- final_at: timestamptz (NULL)
- final_reason: text (NULL)                                    CHECK IN ('confirmada','efectivo','rechazo_titular','cancelada_solicitante','plazo_solicitud','ventana_cerrada','plazo_pago','titular_sin_respuesta','grupo_cerrado','titular_baneado','sin_cupo','solicitante_suspendido','aceptado_en_otro_grupo')
- decided_by: uuid (NULL, FK users)                            titular que confirmó, rechazó o registró efectivo
- reject_reason: text (NULL)                                   CHECK char_length(btrim(reject_reason)) BETWEEN 5 AND 200
- rejected_as_false: boolean (NOT NULL, default false)          el titular marcó el comprobante como falso (RF-010-16)
- accepted_method: text (NULL)                                 CHECK IN ('comprobante','efectivo')
- charge_id: uuid (NULL, FK charges ON DELETE RESTRICT)        cobro de ingreso creado (RN-010-03)
- content_purged_at: timestamptz (NULL)                        retención de 2 meses (RNF-010-09)
- version: integer (NOT NULL, default 1)
- created_at, updated_at

CHECKS de coherencia:
  (status IN ('aceptada','rechazada','cancelada','expirada')) = (final_at IS NOT NULL AND final_reason IS NOT NULL)
  status = 'aceptada' => charge_id IS NOT NULL AND accepted_method IS NOT NULL AND decided_by IS NOT NULL
  status IN ('esperando_pago','pago_informado') => payment_sent_at IS NOT NULL AND quote_amount_cents IS NOT NULL AND pay_deadline_at IS NOT NULL
  status = 'pago_informado' => proof_reference IS NOT NULL AND proof_uploaded_at IS NOT NULL AND decision_deadline_at IS NOT NULL
  (quote_amount_cents IS NULL) = (payment_sent_at IS NULL)                       la cotización existe si y solo si se enviaron los datos de pago
  proof_reference IS NOT NULL => proof_uploaded_at IS NOT NULL                    (al purgar el contenido se borra el archivo, no la referencia)
  rejected_as_false => status = 'rechazada' AND proof_uploaded_at IS NOT NULL
  extended_at IS NULL OR payment_sent_at IS NOT NULL
UNIQUE INDEX join_requests_active_uq (group_id, applicant_id) WHERE status IN ('abierta','esperando_pago','pago_informado')    RF-010-02
INDEX join_requests_applicant_idx (applicant_id, status, opened_at DESC)         "mis solicitudes"
INDEX join_requests_group_idx (group_id, status, opened_at)                       cola del titular, de la más antigua a la más reciente
INDEX join_requests_reserved_idx (group_id) WHERE status IN ('esperando_pago','pago_informado')    cupos reservados (RN-010-02)
INDEX join_requests_sweep_idx (status, open_deadline_at, pay_deadline_at, decision_deadline_at) WHERE status IN ('abierta','esperando_pago','pago_informado')
INDEX join_requests_retention_idx (final_at) WHERE content_purged_at IS NULL AND final_at IS NOT NULL
```

**Disparadores (`0054_join_request_triggers.sql`):**

| Disparador | Qué impone | Criterio |
|---|---|---|
| `join_requests_initial_status` (antes de `INSERT`) | Una solicitud nace `abierta` (L1). | RN-010-05 |
| `join_requests_transition_guard` (antes de `UPDATE OF status`) | Solo las transiciones de RN-010-05; los cuatro estados finales no cambian; `version` aumenta en 1 con cada cambio de estado. | RNF-010-05, CA-010-25 |
| `join_requests_quote_immutable` (antes de `UPDATE`) | Una vez fijadas, las columnas `quote_*` no cambian; `payment_sent_at` solo se fija una vez; `extended_at` solo una vez. | RN-010-01, RN-010-10, CA-010-26, CA-010-42 |
| `join_requests_max_active_per_applicant` (antes de `INSERT`) | Con `pg_advisory_xact_lock(hashtext(applicant_id::text))`: máximo 5 solicitudes en estados activos por persona. | RF-010-02, CA-010-03 |
| `join_requests_not_member` (antes de `INSERT`) | El solicitante no es miembro activo del grupo. | CA-010-02 |
| `join_requests_group_open` (antes de `INSERT`) | El grupo está `activo` y sin `frozen_at`. | CA-010-02 |

Los disparadores van en `0054_join_request_triggers.sql`, después de las tablas 0050–0053 (H1). `join_requests` **no** tiene disparador de capacidad: el control de **cupos reservados** y el de **ventana de ingreso** no se imponen en la base (dependen del reloj y de los plazos, que se evalúan al actuar); los impone el servicio dentro de la transacción con el grupo bloqueado, y la capacidad final la garantiza `group_members_capacity` (spec 001) al insertar al miembro.

### `join_request_events` — `0051_join_request_events.sql`

Línea de tiempo (RF-010-27, RNF-010-08). **Solo anexado.**

```
join_request_events
- id: uuid (PK)
- request_id: uuid (NOT NULL, FK join_requests ON DELETE RESTRICT)
- type: text (NOT NULL)        CHECK IN ('abierta','datos_pago_enviados','plazo_prorrogado','comprobante_subido','confirmada','efectivo_registrado','rechazada','cancelada','expirada','recordatorio_enviado','reclamo_abierto','reclamo_respondido','reclamo_resuelto')
- actor_kind: text (NOT NULL)  CHECK IN ('usuario','sistema')
- actor_id: uuid (NULL, FK users)     CHECK ((actor_kind = 'usuario') = (actor_id IS NOT NULL))
- from_status: text (NULL), to_status: text (NULL)
- reason: text (NULL)
- metadata: jsonb (NOT NULL, default '{}')
- occurred_at: timestamptz (NOT NULL, default now())
- created_at, updated_at
INDEX join_request_events_request_idx (request_id, occurred_at)
```

### `join_messages` y `join_request_reads` — `0052_join_messages.sql`

Chat de la solicitud (RF-010-05 a RF-010-10).

```
join_messages
- id: uuid (PK)
- seq: bigint (NOT NULL, GENERATED ALWAYS AS IDENTITY)      orden estable (RF-010-06)
- request_id: uuid (NOT NULL, FK join_requests ON DELETE RESTRICT)
- sender_id: uuid (NOT NULL, FK users)
- body: text (NULL)                                           CHECK char_length(body) BETWEEN 1 AND 1000
- image_key: text (NULL), image_mime: text (NULL)             CHECK IN ('image/jpeg','image/png')
- image_size_bytes: integer (NULL)                            CHECK BETWEEN 1 AND 5242880
CHECK (body IS NOT NULL OR image_key IS NOT NULL)
CHECK ((image_key IS NULL) = (image_mime IS NULL))
- created_at: timestamptz (NOT NULL, default now())           hora del servidor; no hay updated_at propio (la columna estándar existe y es igual a created_at)
- updated_at
UNIQUE INDEX join_messages_seq_uq (seq)
INDEX join_messages_request_idx (request_id, seq)

join_request_reads
- id: uuid (PK)                                                         convención de la spec 000 (H2)
- request_id: uuid (NOT NULL, FK join_requests ON DELETE RESTRICT), user_id: uuid (NOT NULL, FK users ON DELETE RESTRICT)
UNIQUE (request_id, user_id)                                           una fila por participante
- last_read_seq: bigint (NOT NULL, default 0)
- created_at, updated_at
```

Los mensajes **no se editan**: el disparador `join_messages_no_update` rechaza todo `UPDATE`. El `DELETE` solo lo permite la limpieza por retención: el disparador `join_messages_guard_delete` exige que la transacción haya declarado `SET LOCAL vaquita.allow_purge = 'on'` (lo hace únicamente `RetentionService`). Así ni un error de programación ni una ruta de la API pueden borrar evidencia (CA-010-23).

Contador de no leídos: `COUNT(*) FROM join_messages WHERE request_id = $1 AND seq > last_read_seq AND sender_id <> $user`.

### `join_disputes` — `0053_join_disputes.sql`

Reclamos (RF-010-21 a RF-010-24).

```
join_disputes
- id: uuid (PK)
- request_id: uuid (NOT NULL, FK join_requests ON DELETE RESTRICT)
- kind: text (NOT NULL)                CHECK IN ('pago_sin_ingreso','comprobante_falso')
- opened_by: uuid (NOT NULL, FK users)
- accused_id: uuid (NOT NULL, FK users)           titular en 'pago_sin_ingreso'; solicitante en 'comprobante_falso'
- description: text (NOT NULL)         CHECK char_length(btrim(description)) BETWEEN 10 AND 500
- evidence_key: text (NULL), evidence_mime: text (NULL)       CHECK IN ('image/jpeg','image/png')
- opened_at: timestamptz (NOT NULL, default now())
- response_text: text (NULL)           CHECK char_length(btrim(response_text)) BETWEEN 10 AND 500
- response_evidence_key: text (NULL), response_evidence_mime: text (NULL)
- responded_at: timestamptz (NULL)
- status: text (NOT NULL, default 'abierto')      CHECK IN ('abierto','resuelto')
- resolution: text (NULL)              CHECK IN ('estafa_confirmada','sin_falta')
- resolution_reason: text (NULL)       CHECK char_length(btrim(resolution_reason)) BETWEEN 10 AND 300
- resolved_by: uuid (NULL, FK users), resolved_at: timestamptz (NULL)
- evidence_purged_at: timestamptz (NULL)
- created_at, updated_at                                                convención de la spec 000 (M1)
CHECK ((status = 'resuelto') = (resolution IS NOT NULL AND resolution_reason IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
CHECK ((response_text IS NULL) = (responded_at IS NULL))
CHECK (opened_by <> accused_id)                      quién es el acusado según el tipo (titular o solicitante) lo valida el servicio
UNIQUE (request_id, opened_by)                       una por parte y solicitud (CA-010-28)
INDEX join_disputes_open_idx (opened_at) WHERE status = 'abierto'       cola del administrador
INDEX join_disputes_request_idx (request_id)
```

Una respuesta por reclamo: `response_text` se fija una vez (disparador `join_disputes_single_response`). La resolución es definitiva (`join_disputes_resolved_immutable`). La resolución la ejecuta el módulo de administración (spec 009) a través de `DisputesService.resolve`.

## 2. Qué dejan estas tablas a otras specs

| Spec | Usa |
|---|---|
| 002 | `payment_references (source_type = 'join_request')` para la referencia del comprobante; `charges.join_request_id` (FK a esta tabla en `0055`) |
| 001 | `group_members.join_request_id` (FK a esta tabla en `0055`) |
| 005 | Eventos internos (apertura, datos de pago, comprobante, recordatorio, decisión, reclamo) |
| 008 | `join_requests.listing_id` (FK que agrega la migración de la spec 008) |
| 009 | `join_disputes` (cola, evidencia, resolución), `join_request_events` (evidencia) |

La migración `0055_join_request_links.sql` agrega las claves foráneas pendientes (M2, M3):

- `charges.join_request_id → join_requests(id) ON DELETE RESTRICT` (spec 002) y `UNIQUE INDEX charges_join_request_uq (join_request_id) WHERE join_request_id IS NOT NULL`: un solo cobro de ingreso por solicitud.
- `group_members.join_request_id → join_requests(id) ON DELETE RESTRICT` (spec 001, PR #43 H3), `CHECK ((join_source = 'solicitud') = (join_request_id IS NOT NULL))` y `UNIQUE INDEX group_members_join_request_uq (join_request_id) WHERE join_request_id IS NOT NULL`: una sola estadía por solicitud.

## 3. Pruebas de integridad (`database/tests/join-requests.integrity.test.ts`)

| Prueba | Criterio |
|---|---|
| Dos solicitudes activas de la misma persona al mismo grupo fallan; tras un estado final se permite otra | RF-010-02, CA-010-03 |
| La sexta solicitud activa de una persona falla (también con inserciones concurrentes) | CA-010-03 |
| Un miembro activo del grupo no puede abrir solicitud; un grupo cerrado o congelado tampoco | CA-010-02 |
| Cada transición inválida de RN-010-05 (toda combinación estado × estado) falla; las válidas pasan | CA-010-25 |
| Un estado final no admite cambios | RN-010-05 |
| Modificar `quote_*` después de fijarlas falla; fijar `extended_at` por segunda vez falla | CA-010-26, CA-010-42 |
| Comprobante de 6 MB o `mime` no permitido falla; referencia vacía falla | CA-010-08, CA-010-40 |
| Aceptar sin `charge_id` falla; `rejected_as_false` fuera de `rechazada` falla | RF-010-17 |
| `UPDATE` o `DELETE` en `join_request_events` fallan | CA-010-35 |
| `UPDATE` en `join_messages` falla; `DELETE` sin `vaquita.allow_purge` falla; con él funciona | CA-010-23, CA-010-44 |
| Mensaje con 0 o 1001 caracteres, o sin texto ni imagen, falla | CA-010-21 |
| Dos reclamos de la misma parte para la misma solicitud fallan; un segundo `response_text` falla | CA-010-28, RF-010-22 |
| Un reclamo resuelto no se puede cambiar | RN-010-08 |
| Una solicitud que no nace `abierta` falla | RN-010-05 (L1) |
| Dos lecturas del mismo participante y solicitud fallan; `join_request_reads` y `join_disputes` tienen `id` y marcas de tiempo | convención spec 000 (H2, M1) |
| Dos cobros de ingreso o dos estadías de la misma solicitud fallan; una estadía `solicitud` sin `join_request_id` (o `creacion` con él) falla | RN-010-03, spec 001 (M2, M3) |
