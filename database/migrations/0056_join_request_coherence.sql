-- 0056_join_request_coherence: vínculos y cierres coherentes de las solicitudes de ingreso
-- (spec 010, data-model.md §1 y §2; RN-010-03, RN-010-05). Revisión QA: BUG-002, BUG-003,
-- BUG-007, BUG-018.
--
-- BUG-002: una estadía 'solicitud' debe venir de una solicitud del mismo grupo y de la misma
--   persona (0055 solo agregó la FK y la unicidad). join_request_id no cambia después (0033).
-- BUG-003: el cobro de ingreso debe ser de la persona y el grupo de su solicitud.
-- BUG-007: el rechazo del titular (final_reason 'rechazo_titular') lleva motivo y quién decidió;
--   los rechazos del sistema (grupo cerrado, sin cupo, titular baneado) no.
-- BUG-018: una solicitud aceptada se explica por un pago: 'confirmada' con 'comprobante' o
--   'efectivo' con 'efectivo', y charge_id es el cobro de ingreso de esta misma solicitud.
-- El backend ya escribe así (requests.repository.ts recordAcceptance y recordRejection).
-- check_violation (23514), como los demás disparadores de 0054.

CREATE FUNCTION join_request_link_matches(p_request_id uuid, p_group_id uuid, p_user_id uuid,
                                          p_what text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_group_id uuid;
  v_applicant_id uuid;
BEGIN
  SELECT group_id, applicant_id INTO v_group_id, v_applicant_id
    FROM join_requests WHERE id = p_request_id;
  -- Solicitud, grupo o persona inexistentes o nulos: las FK y los NOT NULL dan su propio error.
  IF NOT FOUND OR p_group_id IS NULL OR p_user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RETURN;
  END IF;
  IF v_group_id IS DISTINCT FROM p_group_id OR v_applicant_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION '% does not match its join request', p_what
      USING DETAIL = format('join request %s is for group %s and applicant %s, got group %s and user %s',
                            p_request_id, v_group_id, v_applicant_id, p_group_id, p_user_id),
            ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE FUNCTION group_members_check_join_request() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.join_request_id IS NOT NULL THEN
    PERFORM join_request_link_matches(NEW.join_request_id, NEW.group_id, NEW.user_id,
                                      'membership');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER group_members_join_request_matches
  BEFORE INSERT ON group_members
  FOR EACH ROW EXECUTE FUNCTION group_members_check_join_request();

-- charges_snapshot_immutable (0043) ya impide cambiar group_id, user_id y join_request_id.
CREATE FUNCTION charges_check_join_request() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.join_request_id IS NOT NULL THEN
    PERFORM join_request_link_matches(NEW.join_request_id, NEW.group_id, NEW.user_id,
                                      'entry charge');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER charges_join_request_matches
  BEFORE INSERT ON charges
  FOR EACH ROW EXECUTE FUNCTION charges_check_join_request();

CREATE FUNCTION join_requests_check_entry_charge() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Un charge_id inexistente lo rechaza la FK join_requests_charge_id_fkey con su propio error.
  IF NEW.charge_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM charges WHERE id = NEW.charge_id)
     AND NOT EXISTS (SELECT 1 FROM charges
                      WHERE id = NEW.charge_id AND origin = 'ingreso'
                        AND join_request_id = NEW.id) THEN
    RAISE EXCEPTION 'join request charge must be its own entry charge'
      USING DETAIL = format('join request %s, charge %s', NEW.id, NEW.charge_id),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER join_requests_entry_charge_matches
  BEFORE INSERT OR UPDATE OF charge_id ON join_requests
  FOR EACH ROW EXECUTE FUNCTION join_requests_check_entry_charge();

ALTER TABLE join_requests
  ADD CONSTRAINT join_requests_owner_rejection_check
    CHECK (final_reason IS DISTINCT FROM 'rechazo_titular'
           OR (reject_reason IS NOT NULL AND decided_by IS NOT NULL)),
  ADD CONSTRAINT join_requests_accepted_reason_check
    CHECK (status <> 'aceptada'
           OR (final_reason = 'confirmada' AND accepted_method = 'comprobante')
           OR (final_reason = 'efectivo' AND accepted_method = 'efectivo'));
