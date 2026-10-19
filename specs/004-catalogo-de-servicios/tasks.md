# Tareas — Spec 004: Catálogo de servicios

- **Spec:** `spec.md` · **Plan:** `plan.md` · **Modelo:** `data-model.md` · **Contrato:** `contracts/api.md` · **Guía:** `quickstart.md`
- Capas: **BD** = Camila · **BE** = Leonardo · **FE** = Adrian. Cada tarea pertenece a **una** sola capa.
- Formato: `- [ ] Tnnn [P] [USn] [CAPA] Descripción con ruta — Depende: … · Cubre: …`. Los commits citan la tarea: `feat(004): add catalog search [T009]`.
- Historias: **US1** elegir servicio y plan al crear una suscripción (HU-004-01, HU-004-02) · **US2** buscar por nombre o categoría (HU-004-03) · **US3** mantener el catálogo sin romper los grupos existentes (HU-004-04).
- Prioridad P0. Depende de la spec 000 (T009 `immutable_unaccent`, T014 `db:seed`, T018, T019, T032 guards) y de la spec 003 (`AuthGuard`, T013). La spec 001 consume `getActivePlanForSubscription` y los campos de copia.

## Fase 1: Base común (modelo y datos del catálogo)

- [x] T001 [BD] Escribir primero `database/tests/catalog.integrity.test.ts`: `slug` en mayúsculas o con espacios falla; nombre duplicado ignorando mayúsculas y tildes (`Música`/`musica`) falla; cupos 1 y 21 fallan, 2 y 20 pasan; precio 0 y negativo fallan; moneda distinta de `USD`/`BS` falla; categoría fuera de la lista cerrada falla; `DELETE` de un servicio con planes falla (`RESTRICT`); `applyCatalog` aplicado dos veces no cambia nada (CA-004-05); `applyCatalog` con un plan inválido en el medio no aplica nada (CA-004-06) y un plan sin `verifiedOn` es rechazado por `seed.validate` — Depende: spec 000 T009 · Cubre: CA-004-05, CA-004-06, RN-004-02, RN-004-03, RN-004-04, RN-004-06, RNF-004-03
- [x] T002 [BD] Migración `database/migrations/0020_catalog.sql`: `catalog_services` (`id` uuid PK; `slug` text NOT NULL UNIQUE CHECK `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`; `name` text NOT NULL CHECK `char_length(btrim(name)) BETWEEN 2 AND 60`; `category` text NOT NULL CHECK IN ('video','musica','juegos','educacion','almacenamiento','otras'); `logo_url` text NULL; `brand_color` text NULL CHECK `brand_color ~ '^#[0-9A-Fa-f]{6}$'`; `is_active` boolean NOT NULL default true; `created_at`, `updated_at`; UNIQUE INDEX `catalog_services_name_uq ON (immutable_unaccent(lower(btrim(name))))`; INDEX `catalog_services_category_idx (category) WHERE is_active`) y `catalog_plans` (`service_id` uuid NOT NULL FK ON DELETE RESTRICT; `slug` text NOT NULL UNIQUE con el mismo formato; `name` 2 a 60 caracteres; `price_cents` bigint NOT NULL CHECK > 0; `currency` text NOT NULL CHECK IN ('USD','BS'); `max_slots` smallint NOT NULL CHECK BETWEEN 2 AND 20; `individual_price_cents` bigint NULL CHECK NULL o > 0; `is_active` boolean NOT NULL default true; `verified_on` date NULL; `verified_source` text NULL; `sort_order` smallint NOT NULL default 0; INDEX `catalog_plans_service_idx (service_id, price_cents) WHERE is_active`); disparador `set_updated_at` en ambas; sin borrado físico (solo `is_active`) — Depende: T001 · Cubre: RF-004-01, RF-004-02, RF-004-03, RF-004-06, RN-004-02, RN-004-03, RN-004-04
- [x] T003 [BD] Migración `0021_catalog_search.sql`: vista `catalog_service_search` (`id`, `name_key = immutable_unaccent(lower(name))`, `category_key = immutable_unaccent(lower(category))`) para la búsqueda sin tildes — Depende: T002 · Cubre: RF-004-04
- [x] T004 [BD] Implementar `database/src/seed-catalog.ts` con `applyCatalog(client, data)`: valida **todo** el archivo antes de escribir (slugs únicos y válidos, cupos 2 a 20, montos positivos, categoría válida, nombre duplicado, `logo_url` con `https://`, `verifiedOn` y `verifiedSource` obligatorios por plan) y escribe en **una transacción**, de forma idempotente (por `slug`) — Depende: T002, T001 · Cubre: RF-004-07, RNF-004-03, RNF-004-04, RN-004-06
- [x] T005 [BD] Cargar `database/seeds/catalog.json` con las plataformas principales (Netflix, Spotify, Disney+, YouTube Premium y similares) **verificando cada precio y cupo con la fuente oficial**, con `verifiedOn` y `verifiedSource` por plan, moneda del precio y precio individual de referencia cuando exista; integrarlo en `db:seed` — Depende: T004, spec 000 T014 · Cubre: RF-004-07, RN-004-06, CA-004-11

**Punto de control (I1):** modelo y seed disponibles para el backend.

## Fase 2: US1 — Elegir servicio y plan (Prioridad: P0) 🎯 MVP

**Meta:** el titular elige un servicio y un plan y el catálogo entrega todo lo que la spec 001 necesita copiar.
**Prueba independiente:** `GET /catalog/services` y `GET /catalog/services/:slug` con el seed devuelven los datos; el selector del frontend los muestra.

### Pruebas de la historia

- [x] T006 [P] [US1] [BE] `backend/test/catalog.e2e-spec.ts`: CA-004-01 (solo servicios activos con al menos un plan activo), CA-004-04 (detalle con planes activos ordenados por precio), CA-004-09 (sin sesión → `401`), CA-004-11 (precio individual presente o `null`), CA-004-08 (`getActivePlanForSubscription` devuelve `null` si el plan o el servicio están inactivos) y los campos de copia (nombre del servicio, plan, logo, color, cupos máximos, precio individual y su moneda) — Depende: spec 003 T013 · Cubre: CA-004-01, CA-004-04, CA-004-08, CA-004-09, CA-004-11, RN-004-05
- [x] T007 [P] [US1] [BE] `backend/test/admin-catalog.e2e-spec.ts`: CA-004-10 (rutas `/admin/catalog/*` responden `403` a un usuario normal y `501` a un administrador hasta la spec 009) — Depende: spec 003 T013, spec 000 T032 · Cubre: CA-004-10
- [x] T008 [P] [US1] [FE] `frontend/src/components/features/catalog/ServiceLogo.test.tsx`: la imagen rota cae a la inicial sobre `brandColor` — Depende: spec 000 T036 · Cubre: CA-004-12

### Implementación de la historia

- [x] T009 [US1] [BE] `backend/src/modules/catalog/`: `repositories/catalog.repository.ts` (SQL con parámetros, paginación por cursor sobre `(name, id)`), `domain/categories.ts` (`CATEGORIES` con valor y etiqueta, `categoryLabel`) y `services/catalog.service.ts` con `getService(slug)` (`404` si no existe, está inactivo o no tiene planes activos), `getActivePlanForSubscription(planSlug)` (plan con su servicio o `null` si algún nivel está inactivo; lo usa la spec 001 para validar y copiar) — Depende: T002, T006 · Cubre: RF-004-02, RF-004-05, RF-004-06, RF-004-08, CA-004-04, CA-004-08
- [x] T010 [US1] [BE] `controllers/catalog.controller.ts`: `GET /catalog/services/:slug` y `GET /catalog/categories` (con `AuthGuard`, DTO y Swagger) y `controllers/admin-catalog.controller.ts` con las rutas reservadas bajo `/admin/catalog/*` protegidas por `AdminGuard` que responden `501` — Depende: T009, T007 · Cubre: RF-004-03, RF-004-05, CA-004-09, CA-004-10
- [x] T011 [P] [US1] [FE] Selector de servicio y selector de plan (primer y segundo paso de `/grupos/nuevo`) con datos simulados (mock): tarjetas con `ServiceLogo` (`referrerPolicy="no-referrer"`, caída a la inicial sobre el color de marca), «desde Bs/USD …» con `formatBs`/`formatUsd` sin convertir monedas, planes ordenados por precio con cupos máximos y la leyenda «El precio es una sugerencia: podrás cambiarlo», tarjeta final «¿No está tu servicio? Crear uno personalizado»; estados cargando (esqueletos), vacío y error con reintentar; tarjetas de ancho completo y objetivos táctiles de 44 px — Depende: T008, spec 000 T036 · Cubre: RF-004-02, RF-004-05, RF-004-09, RNF-004-02, CA-004-12
- [ ] T012 [US1] [FE] Conectar los selectores con `GET /catalog/services/:slug` mediante `services/catalog.ts`; el resultado alimenta el formulario de creación de la spec 001 sin que el frontend convierta monedas — Depende: T010, T011 · Cubre: RF-004-05

**Punto de control (I3):** US1 funciona con el seed; la spec 001 ya puede copiar el catálogo.

## Fase 3: US2 — Buscar por nombre o categoría (Prioridad: P0)

**Meta:** listar servicios con filtro de categoría y búsqueda sin tildes ni mayúsculas, en menos de 300 ms con 200 servicios.
**Prueba independiente:** `GET /catalog/services?q=musica` encuentra «Música»; el filtro de categoría devuelve solo esa.

- [x] T013 [P] [US2] [BE] Pruebas primero: `catalog-search.spec.ts` (`normalizeSearchTerm`: `trim`, minúsculas, sin tildes por `NFD`, colapsa espacios, máximo 60 caracteres; compara con `immutable_unaccent(lower(…))` de la base para palabras con tildes y `ñ`) y casos de `catalog.e2e-spec.ts` para CA-004-02 (filtro de categoría) y CA-004-03 (búsqueda `netflix`/`Música` sin tilde) — Depende: T006 · Cubre: CA-004-02, CA-004-03
- [x] T014 [US2] [BE] `domain/catalog-search.ts` (`normalizeSearchTerm`) y `CatalogService.listServices({ category, q, cursor, limit })`: filtros, búsqueda en nombre y categoría con la clave normalizada, `LIKE` que escapa `%` y `_`, `fromPriceCents`/`fromCurrency` (plan activo más barato; con monedas distintas, el del primer plan por `sort_order`) y `plansCount`; `GET /catalog/services` con `q` limitado a 60 caracteres — Depende: T003, T013 · Cubre: RF-004-04, RNF-004-01, CA-004-01, CA-004-02, CA-004-03
- [x] T015 [US2] [BE] Prueba de rendimiento: listar y buscar con 200 servicios responde en menos de 300 ms (`catalog.perf-spec.ts` con datos sembrados) — Depende: T014 · Cubre: RNF-004-01
- [x] T016 [P] [US2] [FE] Búsqueda en el selector con retraso de 250 ms, chips de categoría y mensaje de vacío con sugerencia de servicio personalizado; conectar con `GET /catalog/services` y `GET /catalog/categories` — Depende: T014, T011 · Cubre: RF-004-04, RNF-004-02

## Fase 4: US3 — Mantener el catálogo sin romper los grupos (Prioridad: P0)

**Meta:** cambiar precios o desactivar planes no altera las suscripciones existentes (copia en la spec 001) y el seed se vuelve a correr sin riesgo.
**Prueba independiente:** desactivar un plan lo oculta del selector; la suscripción creada antes conserva sus datos.

- [x] T017 [US3] [BE] Prueba de integración del contrato con la spec 001 `subscriptions.snapshot.e2e-spec.ts` (CA-004-07: crear una suscripción con un plan, cambiar el precio del plan en el catálogo y comprobar que la suscripción no cambia; aquí se verifica que el catálogo entrega todos los campos de la copia) — Depende: T009, spec 001 (creación de grupos) · Cubre: CA-004-07, RF-004-08, RN-004-01
- [x] T018 [US3] [BD] Documentar en `database/README.md` el procedimiento para actualizar precios (editar `catalog.json`, `verifiedOn`/`verifiedSource`, `npm run db:seed`) y que el borrado físico no existe — Depende: T005 · Cubre: RF-004-06, RF-004-07, RNF-004-04, RN-004-06
- [ ] T019 [US3] [BD] Recorrer `quickstart.md` de la spec 004 con un integrante de otra capa y registrar fallos — Depende: T015 · Cubre: RNF-004-01

## Fase 5: Cierre

- [ ] T020 [BD] Verificar en staging que la extensión `unaccent` está disponible en el PostgreSQL gestionado (primera migración de staging); si no lo estuviera, aplicar el plan B del plan (normalizar en el backend) — Depende: spec 000 T051 · Cubre: riesgo `unaccent` (plan §9)
- [ ] T021 [BE] Ejecutar `/speckit-converge`: actualizar `spec.md` y `plan.md` con lo implementado y marcar las tareas hechas — Depende: T017, T019 · Cubre: —

## Dependencias y orden de ejecución

- **Fase 1** (T001–T005) primero; T005 depende del trabajo de verificación de precios (puede tardar: empezar pronto).
- **US1** y **US2** comparten `CatalogService`; US2 (T013–T016) sigue a T009. **US3** solo comprueba y documenta lo que US1 ya entrega.
- Las pantallas con mock (T011) pueden empezar con el contrato congelado.

## Ejemplos de paralelización

- Con T002 hecho: T003 (vista) y T004 (seed) a la vez.
- Pruebas: T006, T007 y T008 a la vez.
- Frontend con mock (T011) en paralelo con T009–T010 del backend.

## Estrategia de implementación

1. Primero T001–T005 y T009–T010: la spec 001 necesita el catálogo para crear grupos.
2. La búsqueda (US2) puede cerrarse después; el selector funciona sin ella con la lista completa.
3. T017 se completa en cuanto la spec 001 pueda crear grupos.

## Puntos de integración (hitos)

- [ ] **I1:** modelo y seed disponibles para el backend (T002 a T005)
- [ ] **I2:** contrato de API congelado (`contracts/api.md`)
- [ ] **I3:** frontend conectado al backend real (T012, T016)
- [ ] **I4:** la spec 001 usa `getActivePlanForSubscription` y copia los datos (T017)

## Bloqueos y decisiones durante la implementación

| Fecha | Situación | Decisión | ¿Cambió la spec o el contrato? |
|---|---|---|---|
| — | La verificación de precios con fuentes oficiales depende de Camila (RN-004-06) | Empezar T005 con las cinco plataformas principales | No |
