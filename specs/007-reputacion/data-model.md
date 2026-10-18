# Modelo de datos — Spec 007: Reputación

- **Responsable:** Camila Fuentes (Base de datos)
- **Migraciones:** `0060` a `0063` (rango de la spec 007)
- **Estado:** propuesto; se congela al aprobar el plan
- **Entrega:** `user_reputation` (0060) forma parte del **núcleo del MVP** (calificación básica, habilitación de titulares). `charge_reputation_exclusions`, `reputation_reports` (0061, 0062) e `user_badges` (0063) son P2.
- Convenciones de `specs/000-setup-del-proyecto/data-model.md`.

## 1. Principio

La fuente de verdad son los cobros (spec 002): la calificación se puede **recalcular siempre desde cero** y dar el mismo resultado (RNF-007-02, CA-007-14). `user_reputation` es una **copia de lectura** que se actualiza en la misma transacción que cambia un cobro y se verifica cada día. La habilitación para crear una suscripción **no** lee la copia: calcula en el momento (la ventana de 12 meses se mueve con el tiempo).

## 2. Tablas

### `user_reputation` — `0060_user_reputation.sql`

```
user_reputation
- user_id: uuid (PK, FK users ON DELETE RESTRICT)
- considered_count: integer (NOT NULL)            cobros considerados (RN-007-01)           CHECK >= 0
- punctual_count: integer (NOT NULL)              CHECK BETWEEN 0 AND considered_count
- late_count: integer (NOT NULL)                  CHECK (punctual_count + late_count = considered_count)
- displayed_half_stars: smallint (NULL)           estrellas mostradas en medias estrellas (0–10); NULL = "Nuevo"   CHECK BETWEEN 0 AND 10
- level: text (NOT NULL)                          CHECK IN ('Nuevo','En riesgo','Regular','Bueno','Excelente')
- current_streak: integer (NOT NULL)              CHECK >= 0
- rules_version: integer (NOT NULL)               versión de las reglas con que se calculó (RN-007-07)
- computed_at: timestamptz (NOT NULL)
- created_at, updated_at
CHECK ((level = 'Nuevo') = (considered_count < 3))                         menos de 3 cobros considerados = Nuevo (RF-007-02)
CHECK ((level = 'Nuevo') = (displayed_half_stars IS NULL))                 "Nuevo" no tiene estrellas
```

La calificación exacta (`5 × puntuales / considerados`) no se guarda: se obtiene de los dos contadores. Las estrellas mostradas se guardan en medias estrellas enteras (9 = 4,5) para no usar decimales.

### `charge_reputation_exclusions` — `0061_charge_reputation_exclusions.sql` (P2)

Cobros excluidos por el titular tras un reporte (RF-007-14).

```
charge_reputation_exclusions
- id: uuid (PK)
- charge_id: uuid (NOT NULL, UNIQUE, FK charges ON DELETE RESTRICT)
- reason: text (NOT NULL)                         CHECK char_length(btrim(reason)) BETWEEN 10 AND 300
- excluded_by: uuid (NOT NULL, FK users)          titular del grupo del cobro
- excluded_at: timestamptz (NOT NULL, default now())
- created_at, updated_at
```

### `reputation_reports` — `0062_reputation_reports.sql` (P2)

```
reputation_reports
- id: uuid (PK)
- charge_id: uuid (NOT NULL, FK charges), reporter_id: uuid (NOT NULL, FK users)       reporter_id = dueño del cobro
- comment: text (NOT NULL)                        CHECK char_length(btrim(comment)) BETWEEN 10 AND 300
- status: text (NOT NULL, default 'abierto')      CHECK IN ('abierto','excluido','rechazado')
- decided_by: uuid (NULL, FK users), decided_at: timestamptz (NULL), decision_reason: text (NULL)
- created_at, updated_at
UNIQUE (charge_id, reporter_id)
```

### `user_badges` — `0063_user_badges.sql` (P2)

```
user_badges
- id: uuid (PK)
- user_id: uuid (NOT NULL, FK users ON DELETE RESTRICT)
- badge_code: text (NOT NULL)                     CHECK IN ('primer_pago','racha_3','racha_6','racha_12','sin_atrasos_6m','grupo_completo')
- earned_at: timestamptz (NOT NULL)
- source_charge_id: uuid (NULL, FK charges)
- rules_version: integer (NOT NULL)
- created_at, updated_at
UNIQUE (user_id, badge_code)                     una insignia obtenida se conserva (RF-007-08)
```

El avance hacia las insignias que faltan se calcula al consultar (no se guarda).

## 3. Consultas frecuentes e índices

| Consulta | Índice / fuente |
|---|---|
| Hechos de cobros de un usuario (12 meses) | `charges_user_status_idx` (spec 002) |
| Calificación de varios usuarios (ranking, lista de solicitudes) | `user_reputation` por clave primaria |
| Hechos de cobros de los miembros de un grupo | `charges_group_period_idx` (spec 002) |
| Cobros excluidos | `charge_reputation_exclusions_charge_id_key` |

## 4. Pruebas de integridad (`database/tests/reputation.integrity.test.ts`)

| Prueba | Criterio |
|---|---|
| Contadores incoherentes (puntuales + tardíos ≠ considerados) fallan | RNF-007-02 |
| Nivel `Nuevo` con 3 o más cobros, o con estrellas, falla; estrellas fuera de 0–10 fallan | RF-007-02 |
| Dos exclusiones del mismo cobro fallan; dos reportes de la misma persona al mismo cobro fallan | RF-007-14, CA-007 (caso borde «reporte de un cobro ya excluido») |
| Una insignia repetida del mismo usuario falla | RF-007-08 |
