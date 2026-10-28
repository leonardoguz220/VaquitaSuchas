-- 0083_listings_coherence: publicación del mismo grupo y cupos libres al editar (spec 008,
-- data-model.md §1; RF-008-14, CA-008-02). Revisión QA: BUG-004, BUG-005.
--
-- BUG-004: una solicitud 'publicacion' apunta a una publicación de su mismo grupo (0082 solo
--   agregó la FK).
-- BUG-005: listings_only_when_group_active (0082) revisaba los cupos libres al publicar y al
--   volver a 'activa', pero no al subir slots_offered de una publicación ya activa. Se redefine
--   la función: también revisa cuando una publicación activa sube slots_offered. Bajarlo (cada
--   ingreso por la publicación, RF-008-14) no se revisa.

CREATE FUNCTION join_requests_check_listing_group() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  IF NEW.listing_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT group_id INTO v_group_id FROM listings WHERE id = NEW.listing_id;
  IF FOUND AND v_group_id IS DISTINCT FROM NEW.group_id THEN
    RAISE EXCEPTION 'listing belongs to another group'
      USING DETAIL = format('join request %s, group %s, listing %s of group %s', NEW.id,
                            NEW.group_id, NEW.listing_id, v_group_id),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER join_requests_listing_same_group
  BEFORE INSERT OR UPDATE OF listing_id, group_id ON join_requests
  FOR EACH ROW EXECUTE FUNCTION join_requests_check_listing_group();

CREATE OR REPLACE FUNCTION listings_check_group_active() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_group groups%ROWTYPE;
  v_members integer;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NOT (NEW.status = 'activa'
              AND (OLD.status <> 'activa' OR NEW.slots_offered > OLD.slots_offered)) THEN
    RETURN NEW;
  END IF;
  -- Un valor fuera de 0 a 19 lo rechaza listings_slots_offered_check con su propio error.
  IF NEW.slots_offered IS NULL OR NEW.slots_offered NOT BETWEEN 0 AND 19 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_group FROM groups WHERE id = NEW.group_id;
  IF NOT FOUND THEN
    -- La FK listings_group_id_fkey rechaza la fila con su propio error.
    RETURN NEW;
  END IF;

  IF v_group.status <> 'activo' OR v_group.frozen_at IS NOT NULL
     OR NOT v_group.accepting_members THEN
    RAISE EXCEPTION 'group is not open for listings'
      USING DETAIL = format('listing %s, group %s', NEW.id, NEW.group_id),
            ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_members
    FROM group_members WHERE group_id = NEW.group_id AND left_at IS NULL;
  IF NEW.slots_offered > v_group.total_slots - v_members THEN
    RAISE EXCEPTION 'listing offers more slots than free'
      USING DETAIL = format('listing %s, group %s, offered %s, free %s', NEW.id, NEW.group_id,
                            NEW.slots_offered, v_group.total_slots - v_members),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER listings_only_when_group_active ON listings;
CREATE TRIGGER listings_only_when_group_active
  BEFORE INSERT OR UPDATE OF status, slots_offered ON listings
  FOR EACH ROW EXECUTE FUNCTION listings_check_group_active();
