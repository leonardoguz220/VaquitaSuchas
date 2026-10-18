# Seeds

- Solo catálogo (spec 004) y datos de prueba inventados; nunca contraseñas, tokens ni datos reales. `db:seed` rechaza cualquier archivo que mencione `password` fuera de comentarios (RF-009-02); el administrador de desarrollo se crea con `npm run seed:admin -w backend`.
- Nombre `NNNN_nombre.sql`, con el número dentro del rango de la spec que siembra (por ejemplo `0020_catalog.sql` para el catálogo). Se ejecutan en orden numérico y todos en una sola transacción.
- Cada archivo es idempotente (`INSERT ... ON CONFLICT DO NOTHING` o `DO UPDATE`): correr `npm run db:seed` dos veces no duplica filas.
