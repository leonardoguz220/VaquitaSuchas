-- 0064_reputation_ownership: quién reporta y quién excluye un cobro (spec 007, data-model.md §2;
-- RF-007-14). Revisión QA: BUG-013, BUG-014.
--
-- BUG-013: reporter_id es el dueño del cobro, y un reporte decidido (excluido o rechazado) guarda
--   quién, cuándo y por qué; uno abierto no los tiene.
-- BUG-014: excluded_by es el titular del grupo del cobro.
-- El backend ya lo valida (reports.service.ts report y exclude); la base lo refuerza.

CREATE FUNCTION reputation_reports_check_reporter() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner uuid;
BEGIN
  -- Datos nulos o inexistentes: los NOT NULL y las FK dan su propio error.
  IF NEW.reporter_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.reporter_id) THEN
    RETURN NEW;
  END IF;
  SELECT user_id INTO v_owner FROM charges WHERE id = NEW.charge_id;
  IF FOUND AND NEW.reporter_id IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'only the charge owner can report it'
      USING DETAIL = format('charge %s belongs to %s, reporter %s', NEW.charge_id, v_owner,
                            NEW.reporter_id),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reputation_reports_reporter_is_owner
  BEFORE INSERT ON reputation_reports
  FOR EACH ROW EXECUTE FUNCTION reputation_reports_check_reporter();

-- Solo el sentido «decidido => quién, cuándo y por qué»: un estado fuera de la lista lo rechaza
-- reputation_reports_status_check y un decided_by inexistente su FK, con sus propios errores.
ALTER TABLE reputation_reports
  ADD CONSTRAINT reputation_reports_closed_decided_check
    CHECK (status NOT IN ('excluido', 'rechazado')
           OR (decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_reason IS NOT NULL));

CREATE FUNCTION charge_reputation_exclusions_check_owner() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner uuid;
BEGIN
  -- Datos nulos o inexistentes: los NOT NULL y las FK dan su propio error.
  IF NEW.excluded_by IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.excluded_by) THEN
    RETURN NEW;
  END IF;
  SELECT g.owner_id INTO v_owner
    FROM charges c JOIN groups g ON g.id = c.group_id
   WHERE c.id = NEW.charge_id;
  IF FOUND AND NEW.excluded_by IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'only the group owner can exclude a charge'
      USING DETAIL = format('charge %s, group owner %s, excluded_by %s', NEW.charge_id, v_owner,
                            NEW.excluded_by),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER charge_reputation_exclusions_by_owner
  BEFORE INSERT ON charge_reputation_exclusions
  FOR EACH ROW EXECUTE FUNCTION charge_reputation_exclusions_check_owner();
