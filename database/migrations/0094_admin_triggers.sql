-- 0094_admin_triggers: disparadores de la spec 009 (data-model.md §1; RN-009-01, RN-009-02,
-- RN-009-07, CA-009-12, CA-009-13, CA-009-29). admin_audit_log_append_only ya está en 0092.
-- Códigos de error: check_violation (23514) para el último administrador y para banear o
-- suspender a un administrador; restrict_violation (23001) para cambiar un baneo, como
-- forbid_update_delete() en 0001.

-- ---------------------------------------------------------------------------------------------
-- last_admin_guard (RN-009-01, CA-009-12)
-- Un cambio de role o status que deje cero administradores activos falla. El candado de
-- transacción serializa dos cambios simultáneos sobre administradores distintos.

CREATE FUNCTION users_check_last_admin() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_others integer;
BEGIN
  IF NOT (OLD.role = 'admin' AND OLD.status = 'activo')
     OR (NEW.role = 'admin' AND NEW.status = 'activo') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('last_admin_guard'));
  SELECT count(*) INTO v_others
    FROM users WHERE role = 'admin' AND status = 'activo' AND id <> OLD.id;
  IF v_others = 0 THEN
    RAISE EXCEPTION 'cannot remove the last active admin'
      USING DETAIL = format('user %s', OLD.id),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER last_admin_guard
  BEFORE UPDATE OF role, status ON users
  FOR EACH ROW EXECUTE FUNCTION users_check_last_admin();

-- ---------------------------------------------------------------------------------------------
-- admin_not_banned_or_suspended (RN-009-02, RN-009-07, CA-009-13, CA-009-29)
-- El usuario objetivo de un baneo o una suspensión no es administrador.

CREATE FUNCTION check_target_not_admin() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND role = 'admin') THEN
    RAISE EXCEPTION 'admins cannot be banned or suspended'
      USING DETAIL = format('%s %s, user %s', TG_TABLE_NAME, NEW.id, NEW.user_id),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER admin_not_banned_or_suspended
  BEFORE INSERT ON bans
  FOR EACH ROW EXECUTE FUNCTION check_target_not_admin();

CREATE TRIGGER admin_not_banned_or_suspended
  BEFORE INSERT ON user_suspensions
  FOR EACH ROW EXECUTE FUNCTION check_target_not_admin();

-- ---------------------------------------------------------------------------------------------
-- bans_immutable_fields (integridad)
-- Solo se fijan las columnas revoked_* y una sola vez; el resto del baneo no cambia.

CREATE FUNCTION bans_forbid_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.dispute_id IS DISTINCT FROM OLD.dispute_id
     OR NEW.banned_by IS DISTINCT FROM OLD.banned_by
     OR NEW.banned_at IS DISTINCT FROM OLD.banned_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'ban is immutable'
      USING DETAIL = format('ban %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bans_immutable_fields
  BEFORE UPDATE ON bans
  FOR EACH ROW EXECUTE FUNCTION bans_forbid_change();
