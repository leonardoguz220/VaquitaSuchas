# Guía de validación — Spec 004: Catálogo de servicios

Prerrequisito: spec 000 en local y una cuenta registrada (spec 003).

## 1. Cargar el catálogo (CA-004-05, 06)

```bash
npm run db:migrate && npm run db:seed        # carga database/seeds/catalog.json
npm run db:seed                              # segunda vez: mismas filas
psql "$DATABASE_URL" -c "SELECT count(*) FROM catalog_services; SELECT count(*) FROM catalog_plans;"
```
**Esperado:** los conteos no cambian en la segunda ejecución. Con un plan inválido en el JSON (por ejemplo `maxSlots: 1`) el seed falla y los conteos no cambian.

## 2. Consultas (CA-004-01 a 04, 09, 11)

Con la cookie de sesión (o el token en `Authorization`):
```bash
curl -s -H "Authorization: Bearer $TOKEN" "localhost:3001/catalog/services?q=musica"
curl -s -H "Authorization: Bearer $TOKEN" "localhost:3001/catalog/services/netflix"
curl -s "localhost:3001/catalog/services"          # sin sesión → 401
```
**Esperado:** "musica" (sin tilde) devuelve servicios de la categoría Música; el detalle de un servicio lista sus planes activos ordenados por precio con moneda y cupos máximos; sin sesión, `401`.

## 3. Pantalla (CA-004-12)

En `http://localhost:3000/grupos/nuevo`: escribir en la búsqueda, filtrar por categoría y abrir un servicio. Cambiar a mano el `logoUrl` de un servicio por una URL inválida: se ve la inicial sobre el color de marca.

## 4. Permisos de escritura (CA-004-10)

Con un usuario normal: `curl -X POST -H "Authorization: Bearer $TOKEN" localhost:3001/admin/catalog/services` → `403`.
