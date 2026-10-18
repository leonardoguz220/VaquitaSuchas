# Modelo de datos — Spec 008: Cupos libres

- **Responsable:** Camila Fuentes (Base de datos)
- **Migraciones:** `0080` a `0082` (rango de la spec 008)
- **Estado:** propuesto; se congela al aprobar el plan
- **Entrega:** P2. Depende de `groups` y `group_members` (spec 001), `join_requests` (spec 010), `user_reputation` (spec 007) y las tablas del catálogo (spec 004).
- Convenciones de `specs/000-setup-del-proyecto/data-model.md`. La cuota estimada y los cupos disponibles **no se guardan**: se calculan al consultar (cambian con cada ingreso o salida).

## 1. Tablas

### `listings` — `0080_listings.sql`

Una publicación de cupos libres de un grupo. El titular **no** se guarda aquí: es el titular actual del grupo (una transferencia de titularidad deja la publicación a nombre del nuevo titular, sin tocar esta tabla).

```
listings
- id: uuid (PK)
- group_id: uuid (NOT NULL, FK groups ON DELETE RESTRICT)
- slots_offered: smallint (NOT NULL)                   CHECK BETWEEN 0 AND 19. Cupos que todavía se ofrecen; baja con cada ingreso por la publicación (RF-008-14). 0 solo en 'cerrada'.
- description: text (NULL)                             CHECK (description IS NULL OR char_length(description) <= 300)    RF-008-01 (texto plano, RN-008-07)
- conditions: text (NULL)                              CHECK (conditions IS NULL OR char_length(conditions) <= 300)
- status: text (NOT NULL, default 'activa')            CHECK IN ('activa','oculta','expirada','retirada','cerrada')
- published_at: timestamptz (NOT NULL)                 primera publicación
- expires_at: timestamptz (NOT NULL)                   published_at + 30 días; la renovación lo mueve a ahora + 30 días (RF-008-05)
- renewed_at: timestamptz (NULL)
- hidden_at: timestamptz (NULL)                        se oculta por reportes (RF-008-18)
- moderation_cleared_at: timestamptz (NULL)            el administrador la restauró: los reportes anteriores ya no cuentan
- ended_at: timestamptz (NULL)
- end_reason: text (NULL)                              'titular' | 'moderacion' | 'cupos_completos' | 'grupo_lleno' | 'grupo_cerrado' | 'grupo_congelado'
- version: integer (NOT NULL, default 1)               control optimista
- created_at, updated_at
CHECK ((status IN ('retirada','cerrada')) = (ended_at IS NOT NULL AND end_reason IS NOT NULL))
CHECK ((status = 'oculta') = (hidden_at IS NOT NULL))   -- al salir de 'oculta' se limpia hidden_at
CHECK (status = 'cerrada' OR slots_offered >= 1)                 fuera de 'cerrada' siempre se ofrece al menos un cupo
CHECK (expires_at > published_at)
UNIQUE INDEX listings_group_active_uq (group_id) WHERE status IN ('activa','oculta')      RF-008-02, CA-008-03
INDEX listings_search_idx (expires_at) WHERE status = 'activa'                             búsqueda y vencimiento diario (RNF-008-02)
INDEX listings_group_idx (group_id, created_at DESC)
```

Notas:
- `expirada` **no** bloquea una publicación nueva: el titular puede renovarla (vuelve a `activa`) o publicar otra; si ya hay una activa, renovar la vieja falla por el índice único.
- `retirada` y `cerrada` son finales. `cerrada` cubre: se aceptó el último cupo ofrecido, el grupo se llenó, se cerró o se congeló (`end_reason`). `retirada` cubre: el titular la retiró o un administrador la eliminó (`moderacion`).

### `listing_reports` — `0081_listing_reports.sql`

Reportes de usuarios sobre una publicación (RF-008-17). Solo se insertan.

```
listing_reports
- id: uuid (PK)
- listing_id: uuid (NOT NULL, FK listings ON DELETE RESTRICT)
- reporter_id: uuid (NOT NULL, FK users ON DELETE RESTRICT)
- reason: text (NOT NULL)                              CHECK IN ('spam','datos_falsos','conducta_indebida','otro')
- comment: text (NULL)                                 CHECK (comment IS NULL OR char_length(comment) <= 300)
- created_at: timestamptz (NOT NULL, default now())
UNIQUE (listing_id, reporter_id)                       un reporte por usuario y publicación (RF-008-17, CA-008-18)
INDEX listing_reports_listing_idx (listing_id, created_at)
```

### Cambios a tablas de otras specs (`0082_listings_links.sql`)

| Cambio | Detalle |
|---|---|
| `join_requests.listing_id` → FK a `listings(id) ON DELETE RESTRICT` | La columna y su `CHECK ((source = 'publicacion') = (listing_id IS NOT NULL))` ya existen (spec 010, `0050`). |
| `INDEX join_requests_listing_idx (listing_id) WHERE listing_id IS NOT NULL` | Cupos reservados y aceptados por publicación; rechazo de solicitudes abiertas al cerrar. |

### Disparadores (`0082_listings_links.sql`)

| Disparador | Qué impone | Criterio |
|---|---|---|
| `listings_transition_guard` (antes de `UPDATE OF status`) | Transiciones válidas: `activa → oculta \| expirada \| retirada \| cerrada`; `oculta → activa \| retirada \| cerrada`; `expirada → activa \| retirada`. `retirada` y `cerrada` no cambian. `version` aumenta en 1. | RF-008-05, RF-008-18 |
| `listings_only_when_group_active` (antes de `INSERT` y de `UPDATE` a `activa`) | El grupo existe, está `activo`, sin `frozen_at`, con `accepting_members = true`, y `slots_offered <= total_slots − miembros activos`. | RF-008-01, CA-008-02 |
| `listing_reports_append_only` (antes de `UPDATE` o `DELETE`) | Los reportes no se editan ni se borran (usa `forbid_update_delete()`). | RNF-008-06 |
| `listing_reports_not_owner` (antes de `INSERT`) | `reporter_id` no es el titular del grupo de la publicación. | caso borde «reporte del propio titular» |

## 2. Consultas frecuentes e índices

| Consulta | Estrategia |
|---|---|
| Búsqueda (< 500 ms con 5.000 publicaciones) | `listings_search_idx` + unión con `groups`, cuenta de `group_members` activos, `user_reputation` y el catálogo. Se calcula `cuota_estimada = floor(total_bs_cents / (miembros + cupos))` en la consulta. |
| Publicación del grupo | `listings_group_active_uq` |
| Vencer publicaciones (diaria) | `listings_search_idx` por `expires_at` |
| Reportes de una publicación | `listing_reports_listing_idx` |
| Solicitudes de una publicación | `join_requests_listing_idx` |

## 3. Pruebas de integridad (`database/tests/listings.integrity.test.ts`)

| Prueba | Criterio |
|---|---|
| Dos publicaciones `activa`/`oculta` del mismo grupo fallan; una `expirada` y una `activa` conviven | CA-008-03 |
| Publicar en grupo lleno, cerrado, congelado o sin recibir miembros falla; ofrecer más cupos que los libres falla | CA-008-02 |
| `slots_offered = 0` fuera de `cerrada` falla; `description` de 301 caracteres falla | CA-008-11, RN-008-07 |
| Transiciones no permitidas (`cerrada → activa`, `retirada → oculta`) fallan | integridad |
| Un segundo reporte del mismo usuario falla; el titular no puede reportar su publicación; `UPDATE` y `DELETE` de reportes fallan | CA-008-18 |
| `join_requests.listing_id` apunta a una publicación existente | integridad |
