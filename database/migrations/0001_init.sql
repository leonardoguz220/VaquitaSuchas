-- 0001_init: extensiones y funciones comunes del esquema (spec 000, RF-000-07, data-model.md §2).
-- gen_random_uuid() es nativa desde PostgreSQL 13, así que no se instala pgcrypto.

-- Búsqueda del catálogo sin tildes (spec 004).
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Mantiene updated_at. Uso: BEFORE UPDATE ... FOR EACH ROW EXECUTE FUNCTION set_updated_at().
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Tablas de solo anexado (eventos, auditoría).
-- Uso: BEFORE UPDATE OR DELETE ... FOR EACH ROW EXECUTE FUNCTION forbid_update_delete().
-- ERRCODE restrict_violation (23001): la operación viola una restricción de integridad.
CREATE FUNCTION forbid_update_delete() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'append-only table'
    USING DETAIL = format('%s does not allow %s', TG_TABLE_NAME, TG_OP),
          ERRCODE = 'restrict_violation';
END;
$$;

-- unaccent() es STABLE porque depende del diccionario; fijándolo, esta envoltura es IMMUTABLE
-- y se puede usar en índices de expresión.
CREATE FUNCTION immutable_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, $1)
$$;
