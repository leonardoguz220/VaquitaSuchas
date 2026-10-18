# Plan técnico — Spec 004: Catálogo de servicios

- **Spec relacionada:** `specs/004-catalogo-de-servicios/spec.md` (debe estar **aprobada** por BD, Backend y Frontend)
- **Líder de la spec:** Camila Fuentes (BD)
- **Última actualización:** 2026-10-18
- **Artefactos:** [`data-model.md`](data-model.md) · [`contracts/api.md`](contracts/api.md) · [`quickstart.md`](quickstart.md)

| Capa | Responsable | Secciones | Visto bueno |
|---|---|---|---|
| Base de datos | Camila | §3 (y `data-model.md`) | aprobado |
| Backend | Leonardo | §4, §5, §7 | aprobado |
| Frontend | Adrian | §6 | aprobado |

## Constitución: verificación

| Principio | ¿Cumple? | Nota |
|---|---|---|
| I. Spec primero | Sí | Sin funcionalidad fuera de la spec 004. |
| II. Dinero exacto | Sí | Montos en `bigint` de centavos con su moneda. |
| III. Criterios verificables | Sí | CA-004-01 a 12 mapeados en §8. |
| IV. Seguridad | Sí | Solo lectura para usuarios autenticados; escritura solo `admin`. |
| V. Contratos primero | Sí | `contracts/api.md`. |
| VI. Simplicidad | Sí | Sin índices de texto completo: máximo 200 servicios. |
| VII. Capas | Sí | Seed y consultas en BD/repositorios; sin reglas en el frontend. |

## 1. Resumen de la solución

Dos tablas (`catalog_services`, `catalog_plans`) con restricciones de unicidad, cupos y precios; un seed idempotente en transacción que lee `database/seeds/catalog.json` (verificado por Camila contra las fuentes oficiales); tres endpoints de lectura (`/catalog/services`, `/catalog/services/:slug`, `/catalog/categories`) con búsqueda sin tildes; y una pantalla de selección de servicio y plan que alimenta el formulario de creación de la spec 001. La copia del catálogo al crear una suscripción la hace la spec 001 (RF-004-08); aquí solo se garantiza que el catálogo entregue todo lo que esa copia necesita.

## 2. Decisiones técnicas

| Decisión | Opción elegida | Alternativas descartadas | Motivo |
|---|---|---|---|
| Búsqueda sin tildes | Extensión `unaccent` con una función `immutable_unaccent` (spec 000) y `LIKE '%…%'` | `pg_trgm`, búsqueda en el backend | Hasta 200 servicios: cualquier opción cumple 300 ms; `unaccent` es la más simple. |
| Categorías | `text` + `CHECK` con las seis categorías | Tabla de categorías | Lista cerrada de la spec; los textos para mostrar viven en el backend (`categoryLabel`). |
| Moneda del precio individual | La misma que la del plan | Moneda propia | Un solo tipo de cambio para el cálculo del ahorro (spec 006, RN-006-03). |
| Carga del catálogo | Seed JSON + `applyCatalog` transaccional | SQL a mano | Revisable en un PR y probable con datos inválidos (RNF-004-04). |
| Datos del seed | Los carga y verifica Camila con fecha y fuente | Valores copiados de memoria | RN-004-06: precios verificados contra la fuente oficial. |
| Escritura del catálogo | Rutas de administración reservadas con `AdminGuard`, implementadas en la spec 009 | Esperar a la 009 | Permite probar CA-004-10 desde el MVP. |

## 3. Modelo de datos — _Camila (BD)_

Detalle en [`data-model.md`](data-model.md): `catalog_services` y `catalog_plans` (migración 0020), vista de búsqueda (0021), seed `database/seeds/catalog.json`, `applyCatalog` y pruebas de integridad. Restricciones: `slug` único y en minúsculas, nombre único ignorando mayúsculas y tildes, cupos 2 a 20, precios positivos, monedas `USD`/`BS`, categorías cerradas, sin borrado físico.

## 4. Contratos de API — _Leonardo (Backend)_

Detalle en [`contracts/api.md`](contracts/api.md): `GET /catalog/services`, `GET /catalog/services/:slug`, `GET /catalog/categories`, y rutas de escritura reservadas bajo `/admin/catalog/*`.

> **Contrato congelado** al aprobarse este plan. Los cambios se hacen por PR sobre este archivo y avisando a las otras dos capas.

## 5. Lógica de dominio — _Leonardo (Backend)_

```text
backend/src/modules/catalog/
├── controllers/   catalog.controller.ts, admin-catalog.controller.ts (reservado)
├── services/      catalog.service.ts
├── domain/        catalog-search.ts, categories.ts
└── repositories/  catalog.repository.ts
```

- **`normalizeSearchTerm(q)`** (puro): `trim`, minúsculas, quita tildes (`NFD` y marcas combinadas), colapsa espacios, máximo 60 caracteres. Debe coincidir con `immutable_unaccent(lower(…))` de la base; una prueba compara ambos para una lista de palabras con tildes y `ñ`.
- **`CATEGORIES`**: constante con valor y etiqueta (`musica` → "Música"). El `categoryLabel` sale de aquí.
- **`CatalogService.listServices({ category, q, cursor, limit })`**: arma la consulta con los filtros; incluye `fromPriceCents/fromCurrency` (el plan activo más barato; si los planes tienen monedas distintas, se muestra el del primer plan por orden de `sort_order`) y `plansCount`. La búsqueda por texto busca en el nombre y en la categoría (usando la clave normalizada).
- **`CatalogService.getService(slug)`**: 404 si no existe, está inactivo o no tiene planes activos.
- **Repositorio**: SQL con parámetros (sin concatenar texto); paginación por cursor sobre `(name, id)`.
- **Contrato con la spec 001:** el servicio expone `getActivePlanForSubscription(planSlug)` que devuelve el plan con su servicio (nombre, logo, color, cupos máximos, precio individual) o `null` si algún nivel está inactivo (CA-004-08); la spec 001 lo usa para validar y copiar.

## 6. Interfaz de usuario — _Adrian (Frontend)_

| Pantalla | Contenido | Estados | Endpoint |
|---|---|---|---|
| Selector de servicio (primer paso de "Crear suscripción", ruta `/grupos/nuevo`) | Barra de búsqueda con resultados mientras se escribe (con retraso de 250 ms), chips de categoría, tarjetas con logo (o la inicial sobre el color de marca si la URL falla), nombre y "desde Bs/USD …". Al final, tarjeta "¿No está tu servicio? Crear uno personalizado". | cargando (esqueletos), vacío (mensaje + sugerencia de personalizado), error (reintentar) | `GET /catalog/services`, `GET /catalog/categories` |
| Selector de plan (segundo paso) | Lista de planes del servicio ordenada por precio con precio de referencia, cupos máximos y la leyenda "El precio es una sugerencia: podrás cambiarlo". | cargando, error, servicio sin planes activos (no llega aquí) | `GET /catalog/services/:slug` |

- Componente `ServiceLogo` con `onError` que cae a la inicial sobre `brandColor` (CA-004-12).
- El precio de referencia se formatea con `formatBs` o `formatUsd` (utilidad de la spec 000); el frontend no convierte monedas.
- Funciona con el pulgar en celular: tarjetas de ancho completo, objetivos táctiles de 44 px.

## 7. Seguridad y permisos — _Leonardo (Backend), con revisión de BD_

- Todos los endpoints exigen sesión (`AuthGuard`), sin diferencias por rol para lectura.
- Escritura solo con `AdminGuard` (`403` para usuarios normales, CA-004-10).
- Las URL de logo se validan al cargar el seed (`https://`); el frontend las muestra con `referrerPolicy="no-referrer"` y no las ejecuta.
- El parámetro `q` se pasa como parámetro SQL y se limita a 60 caracteres; el patrón `LIKE` escapa `%` y `_`.

## 8. Estrategia de pruebas

| Criterio de aceptación | Nivel | Capa | Test |
|---|---|---|---|
| CA-004-01 (solo activos con plan activo) | Integración | BE | `catalog.e2e-spec.ts` |
| CA-004-02 (filtro de categoría) | Integración | BE | `catalog.e2e-spec.ts` |
| CA-004-03 (búsqueda sin tilde) | Unitario + integración | BE | `catalog-search.spec.ts`; `catalog.e2e-spec.ts` |
| CA-004-04 (detalle ordenado por precio) | Integración | BE | `catalog.e2e-spec.ts` |
| CA-004-05 (seed idempotente) | Integridad | BD | `catalog.integrity.test.ts` |
| CA-004-06 (seed con error no aplica nada) | Integridad | BD | `catalog.integrity.test.ts` |
| CA-004-07 (cambiar el precio del plan no cambia la suscripción) | Integración | BE | `subscriptions.snapshot.e2e-spec.ts` (spec 001, CA-001 de copia); aquí se prueba que el catálogo entrega todos los campos |
| CA-004-08 (plan desactivado no se ofrece) | Integración | BE | `catalog.e2e-spec.ts`, `getActivePlanForSubscription` |
| CA-004-09 (sin sesión → 401) | Integración | BE | `catalog.e2e-spec.ts` |
| CA-004-10 (usuario normal no escribe) | Integración | BE | `admin-catalog.e2e-spec.ts` (403 normal, 501 admin) |
| CA-004-11 (precio individual presente o nulo) | Integración | BE | `catalog.e2e-spec.ts` |
| CA-004-12 (logo roto → inicial y color) | Componente | FE | `ServiceLogo.test.tsx` |

Pruebas de reglas: RN-004-01 (el precio es solo sugerencia) → spec 001 (el titular puede cambiarlo); RN-004-02 y RN-004-03 → `catalog.integrity.test.ts`; RN-004-04 y nombre duplicado → `catalog.integrity.test.ts`; RN-004-05 → `catalog.e2e-spec.ts`; RN-004-06 → revisión de PR del seed (fecha y fuente obligatorias, `seed.validate` rechaza un plan sin `verifiedOn`).

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Los precios del seed quedan desactualizados | Alta | Bajo | Son solo sugerencias (RN-004-01); cada plan lleva `verifiedOn`; la spec 009 permite actualizarlos. |
| Plataformas con precios regionales o sin precio en USD | Media | Bajo | Se registra el precio publicado con su moneda; el titular corrige. |
| Logos con URL que se rompen | Media | Bajo | Respaldo de inicial y color (CA-004-12). |
| `unaccent` no disponible en la base gestionada | Baja | Medio | Extensión de confianza en PostgreSQL 13+; se prueba en la primera migración de staging. Plan B: normalizar en el backend. |

## 10. Trazabilidad

| Requisito | Cubierto en |
|---|---|
| RF-004-01, RF-004-02 (servicios, planes, campos) | §3, `data-model.md` |
| RF-004-03 (categorías) | §3, §5 `CATEGORIES`, `GET /catalog/categories` |
| RF-004-04 (listar, filtrar, buscar) | §4, §5, CA-004-02/03 |
| RF-004-05 (detalle con planes por precio) | §4, CA-004-04 |
| RF-004-06 (activo/inactivo, sin borrado) | §3, §5, CA-004-08 |
| RF-004-07 (seed idempotente) | §3, `data-model.md` §2, CA-004-05 |
| RF-004-08 (copia al crear la suscripción) | §5 (contrato con la spec 001), CA-004-07 |
| RF-004-09 (suscripción personalizada) | §6 (tarjeta final del selector); lo define la spec 001 |
| RNF-004-01 a RNF-004-04 | §2 (rendimiento), §6 (usabilidad), §3 (transacción, archivo versionado) |
| RN-004-01 a RN-004-06 | §8 (pruebas de reglas) |
| CA-004-01 a CA-004-12 | §8 |
