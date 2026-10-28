-- 0096_admin_history_integrity: historial de administración coherente (spec 009, data-model.md §1;
-- RN-009-02, RN-009-07, RF-009-10, RF-009-21, RF-009-23). Revisión QA: BUG-009, BUG-011, BUG-017.
--
-- BUG-009: admin_not_banned_or_suspended (0094) impedía banear o suspender a un admin, pero no
--   promover a admin a alguien con baneo o suspensión vigente.
-- BUG-011: como bans_immutable_fields (0094), una suspensión solo cambia al reactivarse y una
--   habilitación solo al revocarse, una vez; después no cambian.
-- BUG-017: la reversión, la revocación y la reactivación no son anteriores al inicio.
-- check_violation (23514) para la promoción; restrict_violation (23001) para el historial.

CREATE FUNCTION users_check_admin_not_banned() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'admin' AND OLD.role IS DISTINCT FROM 'admin'
     AND (EXISTS (SELECT 1 FROM bans WHERE user_id = NEW.id AND revoked_at IS NULL)
          OR EXISTS (SELECT 1 FROM user_suspensions
                      WHERE user_id = NEW.id AND reactivated_at IS NULL)) THEN
    RAISE EXCEPTION 'banned or suspended users cannot become admins'
      USING DETAIL = format('user %s', NEW.id),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_admin_not_banned
  BEFORE UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION users_check_admin_not_banned();

CREATE FUNCTION user_suspensions_forbid_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.reactivated_at IS NOT NULL
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.suspended_by IS DISTINCT FROM OLD.suspended_by
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'user suspension is immutable'
      USING DETAIL = format('user suspension %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_suspensions_immutable_fields
  BEFORE UPDATE ON user_suspensions
  FOR EACH ROW EXECUTE FUNCTION user_suspensions_forbid_change();

CREATE FUNCTION host_enablements_forbid_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.enabled_by IS DISTINCT FROM OLD.enabled_by
     OR NEW.enabled_at IS DISTINCT FROM OLD.enabled_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'host enablement is immutable'
      USING DETAIL = format('host enablement %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER host_enablements_immutable_fields
  BEFORE UPDATE ON host_enablements
  FOR EACH ROW EXECUTE FUNCTION host_enablements_forbid_change();

-- Un minuto de tolerancia, como charges_paid_at_check (0041): el inicio lo fija now() de la base
-- y el cierre el reloj del backend, que puede ir unos milisegundos atrás.
ALTER TABLE bans
  ADD CONSTRAINT bans_revoked_after_banned_check
    CHECK (revoked_at IS NULL OR revoked_at >= banned_at - interval '1 minute');
ALTER TABLE host_enablements
  ADD CONSTRAINT host_enablements_revoked_after_enabled_check
    CHECK (revoked_at IS NULL OR revoked_at >= enabled_at - interval '1 minute');
ALTER TABLE user_suspensions
  ADD CONSTRAINT user_suspensions_reactivated_after_suspended_check
    CHECK (reactivated_at IS NULL OR reactivated_at >= suspended_at - interval '1 minute');
