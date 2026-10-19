# Seeds

- Solo catálogo (spec 004) y datos de prueba inventados; nunca contraseñas, tokens ni datos reales. `db:seed` rechaza cualquier archivo que mencione `password` fuera de comentarios (RF-009-02), incluido `catalog.json`; el administrador de desarrollo se crea con `npm run seed:admin -w backend`.
- Datos de prueba en SQL: nombre `NNNN_nombre.sql`, con el número dentro del rango de la spec que siembra. Se ejecutan en orden numérico y todos en una sola transacción.
- Cada archivo SQL es idempotente (`INSERT ... ON CONFLICT DO NOTHING` o `DO UPDATE`): correr `npm run db:seed` dos veces no duplica filas.
- El catálogo de servicios y planes **no** va en `.sql`: vive en `catalog.json` (spec 004, data-model.md §2; RNF-004-04), con la forma `{ "services": [ { "slug", "name", "category", "logoUrl", "brandColor", "plans": [ { "slug", "name", "priceCents", "currency", "maxSlots", "individualPriceCents", "verifiedOn", "verifiedSource", "sortOrder" } ] } ] }`.
  - `db:seed` lo valida entero con `validateCatalog` (`src/seed-catalog.ts`) antes de conectarse y lo escribe después de los `.sql`, en la **misma** transacción: si algo falla, no se aplica nada (RNF-004-03, CA-004-06).
  - La escritura es por `slug` e idempotente: una fila igual no se reescribe (CA-004-05). Un plan que sale del archivo no se borra, `is_active` no se toca (lo decide el administrador, spec 009) y un plan no cambia de servicio.
  - Cada plan lleva `verifiedOn` (AAAA-MM-DD) y `verifiedSource` (fuente oficial): los precios y cupos se verifican con la página oficial de cada plataforma, no se inventan (RN-004-06).
