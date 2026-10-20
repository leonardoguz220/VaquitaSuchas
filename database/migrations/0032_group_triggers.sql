-- 0032_group_triggers: disparadores de groups y group_members (spec 001, data-model.md §2,
-- versión aprobada en el PR #43). Imponen lo que no cabe en un CHECK: un titular coherente con
-- owner_id, capacidad, estadías cerradas inmutables, cupos no menores que los miembros, máximo
-- de 5 grupos activos por titular, copia del catálogo inmutable y grupo cerrado de solo lectura.
-- El backend repite las validaciones para dar mensajes claros; aquí se garantiza que una carrera
-- entre dos peticiones no rompa la regla.
--
-- set_updated_at ya está en ambas tablas (groups_set_updated_at en 0030 y
-- group_members_set_updated_at en 0031); no se repite.
--
-- Orden: PostgreSQL dispara los BEFORE de una misma tabla y evento en orden alfabético de nombre.
-- En groups (BEFORE UPDATE): groups_closed_readonly, groups_immutable_snapshots,
-- groups_max_active_owned, groups_set_updated_at, groups_slots_not_below_members. Las
-- comprobaciones baratas que rechazan cualquier cambio van primero; el bloqueo consultivo del
-- límite de grupos se toma solo si ellas pasan. updated_at, frozen_at y frozen_reason quedan
-- fuera de las comparaciones, así que el orden respecto de set_updated_at no importa.
-- En group_members: group_members_capacity (BEFORE INSERT) y group_members_left_immutable antes
-- de group_members_set_updated_at (BEFORE UPDATE).
--
-- Códigos de error: check_violation (23514) para capacidad, límites y coherencia del titular;
-- restrict_violation (23001) para columnas inmutables, como forbid_update_delete() en 0001.
-- Los mensajes son cortos, en inglés y estables (el backend puede reconocerlos); DETAIL nombra
-- el grupo.

-- ---------------------------------------------------------------------------------------------
-- groups_owner_member_consistency (RN-001-01, CA-001-13)
-- Al confirmar la transacción, el owner_id del grupo tiene exactamente una fila activa
-- (left_at IS NULL) con role = 'titular', y ninguna otra fila activa es titular (las demás son
-- 'miembro'). Vale para grupos de cualquier status. Es diferido para admitir el orden del
-- backend: INSERT groups, INSERT fila del titular, COMMIT; y la transferencia (titular a
-- miembro, miembro a titular, UPDATE groups.owner_id) dentro de una transacción.

CREATE FUNCTION groups_check_owner_member(p_group_id uuid) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_id uuid;
  v_owner_titular integer;
  v_other_titular integer;
BEGIN
  SELECT owner_id INTO v_owner_id FROM groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    -- El grupo ya no existe (borrado en la misma transacción): no hay nada que comprobar.
    RETURN;
  END IF;

  SELECT count(*) FILTER (WHERE user_id = v_owner_id),
         count(*) FILTER (WHERE user_id <> v_owner_id)
    INTO v_owner_titular, v_other_titular
    FROM group_members
   WHERE group_id = p_group_id AND left_at IS NULL AND role = 'titular';

  IF v_owner_titular <> 1 OR v_other_titular <> 0 THEN
    RAISE EXCEPTION 'group owner must be its only active titular member'
      USING DETAIL = format('group %s, owner %s', p_group_id, v_owner_id),
            ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE FUNCTION groups_owner_member_consistency() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'groups' THEN
    PERFORM groups_check_owner_member(NEW.id);
  ELSE
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      PERFORM groups_check_owner_member(NEW.group_id);
    END IF;
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.group_id IS DISTINCT FROM NEW.group_id) THEN
      PERFORM groups_check_owner_member(OLD.group_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER groups_owner_member_consistency
  AFTER INSERT OR UPDATE ON groups
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION groups_owner_member_consistency();

CREATE CONSTRAINT TRIGGER groups_owner_member_consistency
  AFTER INSERT OR UPDATE OR DELETE ON group_members
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION groups_owner_member_consistency();

-- ---------------------------------------------------------------------------------------------
-- group_members_capacity (RN-001-09, CA-001-07, CA-001-16, CA-001-19)
-- Antes de insertar una estadía toma FOR UPDATE de la fila del grupo (serializa las altas del
-- mismo grupo) y rechaza si el grupo no está 'activo', si está congelado o si las filas activas
-- ya igualan total_slots. Solo en INSERT (PR #43, M1 y M2). La fila del titular al crear el
-- grupo también pasa por aquí: el grupo recién insertado está activo y sin miembros.
-- El conteo va en una consulta posterior al bloqueo: en READ COMMITTED una función VOLATILE toma
-- una instantánea nueva por consulta, así que ve la fila que confirmó la transacción que tenía
-- el bloqueo.

CREATE FUNCTION group_members_check_capacity() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_frozen_at timestamptz;
  v_total_slots smallint;
  v_active integer;
BEGIN
  SELECT status, frozen_at, total_slots
    INTO v_status, v_frozen_at, v_total_slots
    FROM groups
   WHERE id = NEW.group_id
     FOR UPDATE;
  IF NOT FOUND THEN
    -- La FK group_members_group_id_fkey rechaza la fila con su propio error.
    RETURN NEW;
  END IF;

  IF v_status <> 'activo' THEN
    RAISE EXCEPTION 'group is not active'
      USING DETAIL = format('group %s has status %s', NEW.group_id, v_status),
            ERRCODE = 'check_violation';
  END IF;

  IF v_frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'group is frozen'
      USING DETAIL = format('group %s', NEW.group_id),
            ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_active
    FROM group_members
   WHERE group_id = NEW.group_id AND left_at IS NULL;

  IF v_active >= v_total_slots THEN
    RAISE EXCEPTION 'group is full'
      USING DETAIL = format('group %s has %s of %s slots taken', NEW.group_id, v_active,
                            v_total_slots),
            ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER group_members_capacity
  BEFORE INSERT ON group_members
  FOR EACH ROW EXECUTE FUNCTION group_members_check_capacity();

-- ---------------------------------------------------------------------------------------------
-- group_members_left_immutable (RN-001-05)
-- Una estadía cerrada no se reabre ni cambia su motivo: si OLD.left_at está fijado, left_at y
-- left_reason no cambian. Volver al grupo es una fila nueva.

CREATE FUNCTION group_members_forbid_left_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.left_at IS NOT NULL
     AND (NEW.left_at IS DISTINCT FROM OLD.left_at
          OR NEW.left_reason IS DISTINCT FROM OLD.left_reason) THEN
    RAISE EXCEPTION 'a closed membership cannot change'
      USING DETAIL = format('group %s, membership %s', OLD.group_id, OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER group_members_left_immutable
  BEFORE UPDATE ON group_members
  FOR EACH ROW EXECUTE FUNCTION group_members_forbid_left_change();

-- ---------------------------------------------------------------------------------------------
-- groups_slots_not_below_members (RF-001-14, RN-001-09)
-- total_slots no puede quedar por debajo de las filas activas. El UPDATE ya tiene bloqueada la
-- fila del grupo, así que no compite con group_members_capacity.

CREATE FUNCTION groups_check_slots_not_below_members() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_active integer;
BEGIN
  IF NEW.total_slots IS NOT DISTINCT FROM OLD.total_slots THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_active
    FROM group_members
   WHERE group_id = NEW.id AND left_at IS NULL;

  IF NEW.total_slots < v_active THEN
    RAISE EXCEPTION 'total slots below active members'
      USING DETAIL = format('group %s has %s active members, total_slots %s', NEW.id, v_active,
                            NEW.total_slots),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER groups_slots_not_below_members
  BEFORE UPDATE OF total_slots ON groups
  FOR EACH ROW EXECUTE FUNCTION groups_check_slots_not_below_members();

-- ---------------------------------------------------------------------------------------------
-- groups_max_active_owned (RN-001-14, CA-001-28)
-- Un titular no pasa de 5 grupos con status = 'activo'. Se comprueba cuando la fila nueva queda
-- activa y suma un grupo al titular: al insertar, al reactivar o al cambiar owner_id
-- (transferencia). pg_advisory_xact_lock serializa por titular, así que dos inserciones
-- concurrentes no ven ambas 4 grupos; el conteo, posterior al bloqueo, ve lo ya confirmado.

CREATE FUNCTION groups_check_max_active_owned() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_others integer;
BEGIN
  IF NEW.status <> 'activo' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'activo' AND OLD.owner_id = NEW.owner_id THEN
    -- El grupo ya contaba para este titular: no suma.
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.owner_id::text));

  SELECT count(*) INTO v_others
    FROM groups
   WHERE owner_id = NEW.owner_id AND status = 'activo' AND id <> NEW.id;

  IF v_others >= 5 THEN
    RAISE EXCEPTION 'owner has too many active groups'
      USING DETAIL = format('group %s, owner %s already has %s active groups', NEW.id,
                            NEW.owner_id, v_others),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER groups_max_active_owned
  BEFORE INSERT OR UPDATE OF status, owner_id ON groups
  FOR EACH ROW EXECUTE FUNCTION groups_check_max_active_owned();

-- ---------------------------------------------------------------------------------------------
-- groups_immutable_snapshots (RN-001-12)
-- La copia del catálogo se fija al crear: catalog_plan_id y las columnas *_snapshot no cambian.
-- Se comparan solo esas columnas (no la fila entera: total_bs_cents es generada).

CREATE FUNCTION groups_forbid_snapshot_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.catalog_plan_id IS DISTINCT FROM OLD.catalog_plan_id
     OR NEW.service_name_snapshot IS DISTINCT FROM OLD.service_name_snapshot
     OR NEW.plan_name_snapshot IS DISTINCT FROM OLD.plan_name_snapshot
     OR NEW.logo_url_snapshot IS DISTINCT FROM OLD.logo_url_snapshot
     OR NEW.brand_color_snapshot IS DISTINCT FROM OLD.brand_color_snapshot
     OR NEW.plan_max_slots_snapshot IS DISTINCT FROM OLD.plan_max_slots_snapshot
     OR NEW.individual_price_cents_snapshot IS DISTINCT FROM OLD.individual_price_cents_snapshot
     OR NEW.individual_price_currency_snapshot
        IS DISTINCT FROM OLD.individual_price_currency_snapshot THEN
    RAISE EXCEPTION 'catalog snapshot cannot change'
      USING DETAIL = format('group %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER groups_immutable_snapshots
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION groups_forbid_snapshot_change();

-- ---------------------------------------------------------------------------------------------
-- groups_closed_readonly (RN-001-07, CA-001-16)
-- Un grupo 'cerrado' no admite cambios salvo updated_at, frozen_at y frozen_reason (el baneo del
-- titular puede congelar un grupo cerrado, spec 009 RF-009-22; PR #43, M3). Se compara columna
-- por columna; total_bs_cents queda fuera porque es generada (deriva de price_cents, currency y
-- exchange_rate, que sí se comparan). Una columna nueva de groups debe agregarse aquí en la
-- migración que la cree.

CREATE FUNCTION groups_forbid_closed_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'cerrado' THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
     OR NEW.catalog_plan_id IS DISTINCT FROM OLD.catalog_plan_id
     OR NEW.service_name_snapshot IS DISTINCT FROM OLD.service_name_snapshot
     OR NEW.plan_name_snapshot IS DISTINCT FROM OLD.plan_name_snapshot
     OR NEW.logo_url_snapshot IS DISTINCT FROM OLD.logo_url_snapshot
     OR NEW.brand_color_snapshot IS DISTINCT FROM OLD.brand_color_snapshot
     OR NEW.plan_max_slots_snapshot IS DISTINCT FROM OLD.plan_max_slots_snapshot
     OR NEW.individual_price_cents_snapshot IS DISTINCT FROM OLD.individual_price_cents_snapshot
     OR NEW.individual_price_currency_snapshot
        IS DISTINCT FROM OLD.individual_price_currency_snapshot
     OR NEW.price_cents IS DISTINCT FROM OLD.price_cents
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
     OR NEW.billing_day IS DISTINCT FROM OLD.billing_day
     OR NEW.total_slots IS DISTINCT FROM OLD.total_slots
     OR NEW.invite_code IS DISTINCT FROM OLD.invite_code
     OR NEW.accepting_members IS DISTINCT FROM OLD.accepting_members
     OR NEW.payment_info_text IS DISTINCT FROM OLD.payment_info_text
     OR NEW.payment_qr_key IS DISTINCT FROM OLD.payment_qr_key
     OR NEW.payment_qr_mime IS DISTINCT FROM OLD.payment_qr_mime
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'closed group is read-only'
      USING DETAIL = format('group %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER groups_closed_readonly
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION groups_forbid_closed_change();
