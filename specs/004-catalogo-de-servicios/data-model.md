# Modelo de datos — Spec 004: Catálogo de servicios

- **Responsable:** Camila Fuentes (Base de datos)
- **Migraciones:** `0020` y `0021`
- **Estado:** propuesto; se congela al aprobar el plan

## 1. Tablas

### `catalog_services` — `0020_catalog.sql`

```
catalog_services
- id: uuid (PK)
- slug: text (NOT NULL, UNIQUE)                 CHECK slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'   (RN-004-04)
- name: text (NOT NULL)                          CHECK char_length(btrim(name)) BETWEEN 2 AND 60
- category: text (NOT NULL)                      CHECK IN ('video','musica','juegos','educacion','almacenamiento','otras')
- logo_url: text (NULL)                          URL pública https (RF-004-01); sin subida de archivos
- brand_color: text (NULL)                       CHECK brand_color ~ '^#[0-9A-Fa-f]{6}$'
- is_active: boolean (NOT NULL, default true)
- created_at, updated_at
UNIQUE INDEX catalog_services_name_uq ON (immutable_unaccent(lower(btrim(name))))     -- nombre duplicado ignorando mayúsculas y tildes
INDEX catalog_services_category_idx (category) WHERE is_active
```

### `catalog_plans` — `0020_catalog.sql`

```
catalog_plans
- id: uuid (PK)
- service_id: uuid (NOT NULL, FK catalog_services ON DELETE RESTRICT)
- slug: text (NOT NULL, UNIQUE)                 mismo formato que el del servicio, ej. 'netflix-premium'
- name: text (NOT NULL)                          2 a 60 caracteres
- price_cents: bigint (NOT NULL)                 CHECK > 0; en la moneda del plan, en centavos
- currency: text (NOT NULL)                      CHECK IN ('USD','BS')
- max_slots: smallint (NOT NULL)                 CHECK BETWEEN 2 AND 20 (RN-004-03), titular incluido
- individual_price_cents: bigint (NULL)          CHECK NULL o > 0; precio para una sola persona, misma moneda que el plan
- is_active: boolean (NOT NULL, default true)
- verified_on: date (NULL)                       fecha en que Camila verificó el precio (RN-004-06)
- verified_source: text (NULL)                   URL o referencia de la fuente oficial
- sort_order: smallint (NOT NULL, default 0)
- created_at, updated_at
INDEX catalog_plans_service_idx (service_id, price_cents) WHERE is_active
```

Notas:
- No hay borrado físico del catálogo: solo `is_active` (RF-004-06). Las claves foráneas desde `groups` (spec 001) son `RESTRICT`.
- El orden del detalle de un servicio es por precio; como el precio puede estar en monedas distintas, el backend ordena por el equivalente referencial `price_cents` sin convertir cuando todos los planes del servicio tienen la misma moneda, y por moneda y luego precio si no (caso poco frecuente; se documenta).
- Un servicio **sin planes activos** no se ofrece (RN-004-05): lo resuelve la consulta, no la base.

### `catalog_search_text` — vista `0021_catalog_search.sql`

Vista auxiliar de lectura para la búsqueda:

```sql
CREATE VIEW catalog_service_search AS
SELECT s.id, immutable_unaccent(lower(s.name)) AS name_key,
       immutable_unaccent(lower(s.category)) AS category_key
FROM catalog_services s;
```

Con hasta 200 servicios no hace falta un índice trigrama (RNF-004-01); la consulta usa `LIKE '%texto%'` sobre la vista.

## 2. Seed — `database/seeds/catalog.json`

Archivo versionado (RNF-004-04) con la forma:

```json
{ "services": [ { "slug": "netflix", "name": "Netflix", "category": "video",
    "logoUrl": "https://…", "brandColor": "#E50914",
    "plans": [ { "slug": "netflix-premium", "name": "Premium", "priceCents": 2299, "currency": "USD",
                 "maxSlots": 4, "individualPriceCents": 2299,
                 "verifiedOn": "2026-10-18", "verifiedSource": "https://…" } ] } ] }
```

- Servicios iniciales (decisión de la spec): Netflix, Spotify, Disney+, YouTube Premium, Max y Prime Video. **Los precios y cupos no se inventan:** Camila los toma de la página oficial de cada plataforma (en USD, la moneda en que se publican) el día de la carga y anota `verifiedOn` y `verifiedSource` (RN-004-06). Los valores del ejemplo de arriba son de forma, no de contenido.
- `database/src/seed-catalog.ts` exporta `applyCatalog(client, data)`: valida **todo** el archivo (slugs, cupos 2 a 20, montos positivos, categoría válida, nombre duplicado) antes de escribir; luego hace `INSERT … ON CONFLICT (slug) DO UPDATE` de servicios y planes **dentro de una transacción** (RNF-004-03). Si algo falla, no se aplica ningún cambio (CA-004-06). Es idempotente (CA-004-05).
- Un plan que ya no figura en el archivo **no se borra**: se deja como está (la desactivación es decisión del administrador, spec 009).

## 3. Pruebas de integridad (`database/tests/catalog.integrity.test.ts`)

| Prueba | Criterio |
|---|---|
| Slug repetido de servicio o de plan falla | RN-004-04, CA-009-03 |
| Slug con mayúsculas, espacios o guiones al borde falla | RN-004-04 |
| `max_slots` 1 o 21 falla; 2 y 20 pasan | RN-004-03 |
| `price_cents` 0 o negativo falla; `currency` fuera de USD/BS falla | RN-004-02 |
| Dos servicios con el mismo nombre ("Música+" y "MUSICA+" ignorando tildes) fallan | caso borde "nombre duplicado" |
| Borrar un servicio con planes falla (`RESTRICT`) | RF-004-06 |
| `applyCatalog` dos veces deja el mismo conteo de filas | CA-004-05 |
| `applyCatalog` con un plan inválido en medio no deja ninguna fila nueva | CA-004-06 |
