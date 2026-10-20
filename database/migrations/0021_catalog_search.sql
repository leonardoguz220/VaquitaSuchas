-- 0021_catalog_search: vista de lectura para buscar en el catálogo sin distinguir mayúsculas
-- ni tildes (spec 004, RF-004-04, data-model.md §1). La consulta usa LIKE '%texto%' sobre
-- name_key con el término normalizado igual (immutable_unaccent(lower(...)), 0001_init.sql);
-- con hasta 200 servicios no hace falta índice trigrama (RNF-004-01). La vista no filtra por
-- is_active: los servicios activos y con planes activos (RF-004-06, RN-004-05) los filtra la
-- consulta del backend.

CREATE VIEW catalog_service_search AS
SELECT s.id, immutable_unaccent(lower(s.name)) AS name_key,
       immutable_unaccent(lower(s.category)) AS category_key
FROM catalog_services s;
