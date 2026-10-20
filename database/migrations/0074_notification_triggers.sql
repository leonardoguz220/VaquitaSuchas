-- 0074_notification_triggers: disparadores de la spec 005 (data-model.md §1, "Disparadores";
-- RNF-005-01).
-- notifications_immutable_content ya existe: se creó en 0070_notifications porque la parte A
-- (MVP, T002) lo necesitaba antes que las partes B y C. No se repite aquí.
-- 0073 (group_invitations) queda para T025.
--
-- deliveries_no_resurrect: un envío sent, failed o skipped no vuelve a pending, para que una
-- repetición de la tarea de entrega no lo mande dos veces (RNF-005-01). Las demás transiciones
-- las decide el backend. ERRCODE restrict_violation (23001), como forbid_update_delete().

CREATE FUNCTION notification_deliveries_forbid_resurrect() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('sent', 'failed', 'skipped') AND NEW.status = 'pending' THEN
    RAISE EXCEPTION 'a finished delivery cannot return to pending'
      USING DETAIL = format('status %s cannot change to pending', OLD.status),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER deliveries_no_resurrect
  BEFORE UPDATE ON notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION notification_deliveries_forbid_resurrect();
