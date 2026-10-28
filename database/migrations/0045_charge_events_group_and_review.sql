-- 0045_charge_events_group_and_review: copia del grupo en los eventos y comprobante en revisión
-- (spec 002, data-model.md §1; RF-002-17, RN-002-01, RN-002-08). Revisión QA: BUG-008, BUG-015.
--
-- BUG-008: charge_events.group_id es una copia del grupo del cobro para el historial del grupo
-- (charge_events_group_idx); nada impedía guardar otro grupo y mostrar un cobro ajeno.
-- BUG-015: en_revision ocurre al subir un comprobante (RN-002-01), y first_submitted_at es la
-- fecha que usa la reputación (RN-002-08). El backend la fija en el mismo UPDATE
-- (first_submitted_at = COALESCE(first_submitted_at, ...)).

CREATE FUNCTION charge_events_check_group() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  SELECT group_id INTO v_group_id FROM charges WHERE id = NEW.charge_id;
  IF NOT FOUND THEN
    -- La FK charge_events_charge_id_fkey rechaza la fila con su propio error.
    RETURN NEW;
  END IF;
  IF NEW.group_id IS DISTINCT FROM v_group_id THEN
    RAISE EXCEPTION 'charge event group does not match its charge'
      USING DETAIL = format('charge %s belongs to group %s, event says %s', NEW.charge_id,
                            v_group_id, NEW.group_id),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- charge_events es de solo anexado (forbid_update_delete), así que basta con el INSERT.
CREATE TRIGGER charge_events_group_matches_charge
  BEFORE INSERT ON charge_events
  FOR EACH ROW EXECUTE FUNCTION charge_events_check_group();

ALTER TABLE charges
  ADD CONSTRAINT charges_in_review_submitted_check
    CHECK (status <> 'en_revision' OR first_submitted_at IS NOT NULL);
