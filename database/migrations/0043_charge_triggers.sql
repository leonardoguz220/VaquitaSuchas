-- 0043_charge_triggers: disparadores de charges (spec 002, data-model.md §1, tabla de
-- disparadores con los ajustes H2, H3 y M1 aprobados el 2026-10-19; RN-002-01, RN-002-02,
-- RN-002-03, RN-002-10, RNF-002-03, CA-002-16, CA-002-21, constitución II).
-- Imponen lo que no cabe en un CHECK: copia inmutable, estado inicial según el origen, solo las
-- transiciones de RN-002-01, estados finales de solo lectura, titular sin cobro y coherencia con
-- el ciclo. El backend repite las validaciones (función pura transition() de
-- domain/charge-state.ts) para dar mensajes claros; la lista de transiciones está duplicada a
-- propósito para que un error de programación no corrompa el historial.
--
-- set_updated_at ya está en charges (charges_set_updated_at en 0041); no se repite.
--
-- Orden: PostgreSQL dispara los BEFORE de una misma tabla y evento en orden alfabético de nombre.
-- BEFORE INSERT: charges_cycle_consistency, charges_initial_status, charges_not_owner.
-- BEFORE UPDATE: charges_final_readonly, charges_set_updated_at, charges_snapshot_immutable,
-- charges_transition_guard. charges_final_readonly va primero: un cobro 'pagado' o 'cancelado'
-- se rechaza ahí (restrict_violation) antes de llegar al guard, así que una transición desde un
-- estado final nunca la evalúa charges_transition_guard. charges_final_readonly compara la fila
-- sin updated_at, así que el orden respecto de charges_set_updated_at no importa.
--
-- Códigos de error: restrict_violation (23001) para columnas inmutables y estados finales, como
-- forbid_update_delete() en 0001; check_violation (23514) para estado inicial, transiciones,
-- titular sin cobro y coherencia con el ciclo. Los mensajes son cortos, en inglés y estables (el
-- backend puede reconocerlos); DETAIL nombra el cobro.

-- ---------------------------------------------------------------------------------------------
-- charges_snapshot_immutable (RN-002-02, CA-002-16; M1 para first_submitted_at)
-- La copia (amount_cents, price_cents, currency, exchange_rate, total_bs_cents, member_count), la
-- identidad del cobro (group_id, user_id, cycle_id, period, origin, join_request_id) y sus fechas
-- de emisión y vencimiento (issued_at, due_at) no cambian nunca. first_submitted_at se fija con la
-- primera subida de comprobante y ya no cambia (dato de la reputación, RN-002-08).

CREATE FUNCTION charges_forbid_snapshot_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.price_cents IS DISTINCT FROM OLD.price_cents
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
     OR NEW.total_bs_cents IS DISTINCT FROM OLD.total_bs_cents
     OR NEW.member_count IS DISTINCT FROM OLD.member_count
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id
     OR NEW.period IS DISTINCT FROM OLD.period
     OR NEW.origin IS DISTINCT FROM OLD.origin
     OR NEW.join_request_id IS DISTINCT FROM OLD.join_request_id
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR NEW.due_at IS DISTINCT FROM OLD.due_at THEN
    RAISE EXCEPTION 'charge snapshot cannot change'
      USING DETAIL = format('charge %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.first_submitted_at IS NOT NULL
     AND NEW.first_submitted_at IS DISTINCT FROM OLD.first_submitted_at THEN
    RAISE EXCEPTION 'charge first_submitted_at cannot change'
      USING DETAIL = format('charge %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER charges_snapshot_immutable
  BEFORE UPDATE ON charges
  FOR EACH ROW EXECUTE FUNCTION charges_forbid_snapshot_change();

-- ---------------------------------------------------------------------------------------------
-- charges_initial_status (RN-002-01, RN-002-10; H2)
-- RN-002-01: (nuevo) -> pendiente (Sistema, fecha de corte) y (nuevo) -> pagado (Sistema, el
-- titular confirma una solicitud de ingreso, spec 010). Un cobro de origen 'ciclo' nace
-- 'pendiente'; uno de origen 'ingreso' nace 'pagado'.

CREATE FUNCTION charges_check_initial_status() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.origin = 'ciclo' AND NEW.status IS DISTINCT FROM 'pendiente')
     OR (NEW.origin = 'ingreso' AND NEW.status IS DISTINCT FROM 'pagado') THEN
    RAISE EXCEPTION 'invalid initial charge status'
      USING DETAIL = format('charge %s with origin %s cannot start as %s', NEW.id, NEW.origin,
                            NEW.status),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER charges_initial_status
  BEFORE INSERT ON charges
  FOR EACH ROW EXECUTE FUNCTION charges_check_initial_status();

-- ---------------------------------------------------------------------------------------------
-- charges_transition_guard (RN-002-01, RNF-002-03, CA-002-21)
-- Solo admite las transiciones de spec.md RN-002-01 (copiada tal cual):
--
--   | Desde                    | Hacia         | Quién   | Condición                          |
--   |--------------------------|---------------|---------|------------------------------------|
--   | (nuevo)                  | pendiente     | Sistema | Fecha de corte                     |
--   | (nuevo)                  | pagado        | Sistema | El titular confirma una solicitud  |
--   |                          |               |         | de ingreso (spec 010)              |
--   | pendiente                | en_revision   | Miembro | Sube comprobante                   |
--   | atrasado                 | en_revision   | Miembro | Sube comprobante                   |
--   | pendiente                | atrasado      | Sistema | Pasa fecha de vencimiento (el      |
--   |                          |               |         | miembro es retirado, RF-002-14)    |
--   | en_revision              | pagado        | Titular | Confirma                           |
--   | en_revision              | pendiente     | Titular | Rechaza, vigente                   |
--   | en_revision              | atrasado      | Titular | Rechaza, ya vencido                |
--   | pendiente / atrasado     | pagado        | Titular | Pago manual                        |
--   | pendiente / atrasado     | cancelado     | Titular | Cancela con motivo                 |
--
--   pagado y cancelado son estados finales. Cualquier otra transición es inválida.
--
-- Las dos filas (nuevo) las impone charges_initial_status. Las desde 'pagado' o 'cancelado' ya
-- las rechaza charges_final_readonly, que dispara antes; aquí se dejan fuera de la lista igual,
-- para que la regla no dependa del orden. Quién y la condición (fecha de vencimiento) son reglas
-- del backend; la base solo impone el par desde/hacia.
--
-- Si el estado no cambia el disparador no se ejecuta (cláusula WHEN), aunque status figure en el
-- SET.
--
-- version (decisión de BD, T005): el disparador FIJA NEW.version := OLD.version + 1 en cada cambio
-- de estado válido, sin importar el valor que traiga el UPDATE. plan.md §2 y §5 resuelven la
-- concurrencia con SELECT … FOR UPDATE del cobro y una version opcional que el servicio compara
-- antes de aplicar transition() (409 STALE_STATE); el UPDATE del repositorio no necesita un
-- WHERE version = $v. Fijarla garantiza el +1 aunque el repositorio no lo escriba, y deja el
-- mismo resultado si lo escribe (SET version = version + 1).

CREATE FUNCTION charges_check_transition() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT ((OLD.status = 'pendiente' AND NEW.status IN ('en_revision', 'atrasado', 'pagado',
                                                       'cancelado'))
          OR (OLD.status = 'atrasado' AND NEW.status IN ('en_revision', 'pagado', 'cancelado'))
          OR (OLD.status = 'en_revision' AND NEW.status IN ('pagado', 'pendiente', 'atrasado')))
  THEN
    RAISE EXCEPTION 'invalid charge status transition'
      USING DETAIL = format('charge %s from %s to %s', OLD.id, OLD.status, NEW.status),
            ERRCODE = 'check_violation';
  END IF;

  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER charges_transition_guard
  BEFORE UPDATE OF status ON charges
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION charges_check_transition();

-- ---------------------------------------------------------------------------------------------
-- charges_final_readonly (RN-002-01, RNF-002-04; M1)
-- 'pagado' y 'cancelado' son estados finales: el cobro no admite ningún cambio, ni de estado ni
-- de ninguna otra columna. Solo se tolera updated_at (un UPDATE sin cambios reales lo toca vía
-- set_updated_at). Se compara la fila completa en jsonb sin updated_at, así que una columna nueva
-- de charges queda cubierta sin editar esta función.

CREATE FUNCTION charges_forbid_final_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status NOT IN ('pagado', 'cancelado') THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION 'final charge is read-only'
      USING DETAIL = format('charge %s has status %s', OLD.id, OLD.status),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER charges_final_readonly
  BEFORE UPDATE ON charges
  FOR EACH ROW EXECUTE FUNCTION charges_forbid_final_change();

-- ---------------------------------------------------------------------------------------------
-- charges_not_owner (RN-002-03, RN-001-10)
-- El titular no tiene cobro propio: user_id no puede ser groups.owner_id del grupo al insertar.
-- user_id no cambia después (charges_snapshot_immutable). Una transferencia de titularidad
-- posterior no toca los cobros ya emitidos.

CREATE FUNCTION charges_check_not_owner() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT owner_id INTO v_owner_id FROM groups WHERE id = NEW.group_id;
  IF NOT FOUND THEN
    -- La FK charges_group_id_fkey rechaza la fila con su propio error.
    RETURN NEW;
  END IF;

  IF NEW.user_id = v_owner_id THEN
    RAISE EXCEPTION 'group owner cannot have a charge'
      USING DETAIL = format('charge %s, group %s, owner %s', NEW.id, NEW.group_id, v_owner_id),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER charges_not_owner
  BEFORE INSERT ON charges
  FOR EACH ROW EXECUTE FUNCTION charges_check_not_owner();

-- ---------------------------------------------------------------------------------------------
-- charges_cycle_consistency (constitución II, RN-002-02, RN-002-09; H3)
-- El ciclo del cobro es del mismo grupo y período. Si origin = 'ciclo', la copia (price_cents,
-- currency, exchange_rate, total_bs_cents, member_count) es la del ciclo y amount_cents es la
-- cuota base del ciclo (base_share_cents). Un cobro 'ingreso' tiene su propia copia (la cuota del
-- mes dividida entre los miembros con la persona incluida, spec 010), así que solo se exige el
-- grupo y el período.

CREATE FUNCTION charges_check_cycle_consistency() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_cycle billing_cycles%ROWTYPE;
BEGIN
  SELECT * INTO v_cycle FROM billing_cycles WHERE id = NEW.cycle_id;
  IF NOT FOUND THEN
    -- La FK charges_cycle_id_fkey rechaza la fila con su propio error.
    RETURN NEW;
  END IF;

  IF v_cycle.group_id IS DISTINCT FROM NEW.group_id
     OR v_cycle.period IS DISTINCT FROM NEW.period THEN
    RAISE EXCEPTION 'charge does not match its billing cycle'
      USING DETAIL = format('charge %s (group %s, period %s), cycle %s (group %s, period %s)',
                            NEW.id, NEW.group_id, NEW.period, v_cycle.id, v_cycle.group_id,
                            v_cycle.period),
            ERRCODE = 'check_violation';
  END IF;

  IF NEW.origin = 'ciclo'
     AND (NEW.price_cents IS DISTINCT FROM v_cycle.price_cents
          OR NEW.currency IS DISTINCT FROM v_cycle.currency
          OR NEW.exchange_rate IS DISTINCT FROM v_cycle.exchange_rate
          OR NEW.total_bs_cents IS DISTINCT FROM v_cycle.total_bs_cents
          OR NEW.member_count IS DISTINCT FROM v_cycle.member_count
          OR NEW.amount_cents IS DISTINCT FROM v_cycle.base_share_cents) THEN
    RAISE EXCEPTION 'charge snapshot does not match its billing cycle'
      USING DETAIL = format('charge %s, cycle %s', NEW.id, v_cycle.id),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER charges_cycle_consistency
  BEFORE INSERT ON charges
  FOR EACH ROW EXECUTE FUNCTION charges_check_cycle_consistency();
