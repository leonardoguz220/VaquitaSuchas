-- 0082_listings_links: FK de join_requests.listing_id y disparadores de listings y
-- listing_reports (spec 008, data-model.md §1; RF-008-01, RF-008-05, RF-008-06, RF-008-18,
-- RNF-008-06, CA-008-02, CA-008-18). Códigos de error: check_violation (23514) para transiciones,
-- grupo no disponible y reporte del titular; restrict_violation (23001) para editar una
-- publicación final, como forbid_update_delete() en 0001.

ALTER TABLE join_requests
  ADD CONSTRAINT join_requests_listing_id_fkey FOREIGN KEY (listing_id)
    REFERENCES listings (id) ON DELETE RESTRICT;

-- Cupos reservados y aceptados por publicación; rechazo de solicitudes abiertas al cerrarla.
CREATE INDEX join_requests_listing_idx ON join_requests (listing_id) WHERE listing_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- listings_transition_guard (RF-008-05, RF-008-18)
-- activa -> oculta | expirada | retirada | cerrada; oculta -> activa | retirada | cerrada;
-- expirada -> activa | retirada. retirada y cerrada no cambian. Cada cambio de estado sube
-- version en 1.

CREATE FUNCTION listings_check_transition() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'activa' AND NEW.status IN ('oculta', 'expirada', 'retirada', 'cerrada'))
      OR (OLD.status = 'oculta' AND NEW.status IN ('activa', 'retirada', 'cerrada'))
      OR (OLD.status = 'expirada' AND NEW.status IN ('activa', 'retirada'))
    ) THEN
      RAISE EXCEPTION 'invalid listing transition'
        USING DETAIL = format('listing %s: %s -> %s', OLD.id, OLD.status, NEW.status),
              ERRCODE = 'check_violation';
    END IF;
    NEW.version := OLD.version + 1;
  ELSIF OLD.status IN ('retirada', 'cerrada') THEN
    RAISE EXCEPTION 'listing is final'
      USING DETAIL = format('listing %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER listings_transition_guard
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION listings_check_transition();

-- ---------------------------------------------------------------------------------------------
-- listings_only_when_group_active (RF-008-01, CA-008-02)
-- Al publicar y al volver a 'activa': el grupo está activo, sin congelar, recibe miembros y
-- slots_offered no supera los cupos libres (total_slots - estadías activas).

CREATE FUNCTION listings_check_group_active() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_group groups%ROWTYPE;
  v_members integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.status <> 'activa' OR OLD.status = 'activa') THEN
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

CREATE TRIGGER listings_only_when_group_active
  BEFORE INSERT OR UPDATE OF status ON listings
  FOR EACH ROW EXECUTE FUNCTION listings_check_group_active();

-- ---------------------------------------------------------------------------------------------
-- listing_reports_append_only (RNF-008-06): los reportes no se editan ni se borran.
-- Corre antes que listing_reports_set_updated_at (orden alfabético).

CREATE TRIGGER listing_reports_append_only
  BEFORE UPDATE OR DELETE ON listing_reports
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- ---------------------------------------------------------------------------------------------
-- listing_reports_not_owner (CA-008-18): el titular no reporta la publicación de su grupo.

CREATE FUNCTION listing_reports_check_not_owner() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT g.owner_id INTO v_owner_id
    FROM listings l JOIN groups g ON g.id = l.group_id
   WHERE l.id = NEW.listing_id;
  IF NEW.reporter_id = v_owner_id THEN
    RAISE EXCEPTION 'group owner cannot report own listing'
      USING DETAIL = format('listing %s, owner %s', NEW.listing_id, v_owner_id),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_reports_not_owner
  BEFORE INSERT ON listing_reports
  FOR EACH ROW EXECUTE FUNCTION listing_reports_check_not_owner();
