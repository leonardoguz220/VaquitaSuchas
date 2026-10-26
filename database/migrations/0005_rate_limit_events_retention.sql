-- 0005_rate_limit_events_retention: permite a maintenance.cleanup borrar los eventos viejos de
-- rate_limit_events (spec 000, T033, RF-000-07 y RF-000-14). Con 0003 todo DELETE fallaba con
-- restrict_violation (23001) y la tarea terminaba en error.
-- La tabla sigue siendo de solo anexado en la práctica: UPDATE sigue prohibido y DELETE solo se
-- permite para filas de más de 24 horas (la retención que fija el backend), así que un evento
-- reciente nunca se puede borrar ni siquiera con el rol de la aplicación.

DROP TRIGGER rate_limit_events_forbid_update_delete ON rate_limit_events;

-- Se conserva el nombre alfabético anterior a ..._set_updated_at para que bloquee primero.
CREATE TRIGGER rate_limit_events_forbid_update
  BEFORE UPDATE ON rate_limit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

CREATE FUNCTION rate_limit_events_guard_delete() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.occurred_at >= now() - interval '24 hours' THEN
    RAISE EXCEPTION 'append-only table'
      USING DETAIL = format('%s only allows DELETE of rows older than 24 hours', TG_TABLE_NAME),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER rate_limit_events_guard_delete
  BEFORE DELETE ON rate_limit_events
  FOR EACH ROW EXECUTE FUNCTION rate_limit_events_guard_delete();
