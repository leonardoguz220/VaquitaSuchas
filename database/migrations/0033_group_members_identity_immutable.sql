-- 0033_group_members_identity_immutable: una estadía no cambia de grupo ni de persona (spec 001,
-- data-model.md §2; RN-001-05, RN-001-09, CA-001-07, CA-001-16).
-- group_members_capacity (0032) controla capacidad, grupo cerrado y congelado solo al insertar;
-- sin este disparador, un UPDATE de group_id movía una estadía a un grupo lleno o cerrado y uno de
-- user_id la pasaba a otra persona. Solo cambian role (transferencia de titularidad), left_at y
-- left_reason (cierre de la estadía, que protege group_members_left_immutable) y updated_at.
-- Orden de los BEFORE UPDATE (alfabético): group_members_identity_immutable,
-- group_members_left_immutable, group_members_set_updated_at.
-- restrict_violation (23001), como charges_forbid_snapshot_change() en 0043.

CREATE FUNCTION group_members_forbid_identity_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.join_source IS DISTINCT FROM OLD.join_source
     OR NEW.join_request_id IS DISTINCT FROM OLD.join_request_id
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'membership identity cannot change'
      USING DETAIL = format('group %s, membership %s', OLD.group_id, OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER group_members_identity_immutable
  BEFORE UPDATE ON group_members
  FOR EACH ROW EXECUTE FUNCTION group_members_forbid_identity_change();
