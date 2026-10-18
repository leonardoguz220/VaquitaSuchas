# Contrato de API — Spec 004: Catálogo de servicios

- **Responsable:** Leonardo Guzman (Backend)
- **Estado:** propuesto; se congela al aprobar el plan
- Rige la parte A de `specs/000-setup-del-proyecto/contracts/api.md`. Todos los endpoints exigen sesión (`401` sin ella, CA-004-09). Las escrituras del administrador son de la spec 009.

## Objetos

```ts
CatalogService {
  id: string; slug: string; name: string;
  category: "video" | "musica" | "juegos" | "educacion" | "almacenamiento" | "otras";
  categoryLabel: string;             // "Música", "Video"... para mostrar
  logoUrl: string | null; brandColor: string | null;
  fromPriceCents?: number; fromCurrency?: "USD" | "BS";   // solo en el listado: el plan más barato activo
  plansCount?: number;
}
CatalogPlan {
  id: string; slug: string; name: string;
  priceCents: number; currency: "USD" | "BS";
  maxSlots: number;                  // cupos máximos, titular incluido
  individualPriceCents: number | null;   // misma moneda que el plan; null si no hay dato (CA-004-11)
  verifiedOn: string | null;
}
```

## Endpoints

### `GET /catalog/services`
- **Auth:** cualquier usuario autenticado.
- **Query:** `category` (opcional), `q` (opcional, 1 a 60 caracteres; sin distinguir mayúsculas ni tildes), `limit`, `cursor`.
- **Response 200:** `{ items: CatalogService[], nextCursor }`. Solo servicios activos con al menos un plan activo (CA-004-01, RN-004-05). Orden alfabético por nombre.
- **Búsqueda:** `q` coincide con el nombre o con la categoría (CA-004-03: "musica" encuentra la categoría Música y los servicios cuyo nombre coincida).
- **Respuesta vacía:** `items: []`; el frontend sugiere crear una suscripción personalizada.
- **Errores:** `400 VALIDATION_ERROR` (categoría desconocida), `401`.

### `GET /catalog/services/:slug`
- **Auth:** autenticado.
- **Response 200:** `{ service: CatalogService, plans: CatalogPlan[] }`, solo planes activos, ordenados por precio ascendente (CA-004-04).
- **Errores:** `404 NOT_FOUND` si el servicio no existe, está inactivo o no tiene planes activos.

### `GET /catalog/categories`
- **Auth:** autenticado. **Response 200:** `{ items: [{ value, label, servicesCount }] }` con las seis categorías (RF-004-03), para el filtro.

> **Escritura (CA-004-10).** Crear, editar, activar y desactivar pertenecen a la spec 009. Para que el permiso quede probado desde el MVP, esta spec registra el controlador `AdminCatalogController` con `AdminGuard` y las rutas `POST /admin/catalog/services`, `PATCH /admin/catalog/services/:slug`, `POST /admin/catalog/services/:slug/plans` y `PATCH /admin/catalog/plans/:slug`. Hasta que la spec 009 las implemente responden `403 FORBIDDEN` a un usuario normal y `501 NOT_IMPLEMENTED` a un administrador.

> **Contrato congelado** al aprobarse el plan. Los cambios se hacen por PR sobre este archivo avisando a las otras dos capas.
