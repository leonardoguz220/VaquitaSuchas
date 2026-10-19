-- 0054_join_request_triggers: disparadores de join_requests (spec 010, data-model.md §1, tabla de
-- disparadores con los ajustes H1 y L1 aprobados el 2026-10-19; RF-010-02, RN-010-01,
-- RN-010-05, RN-010-10, RNF-010-05, RNF-010-09, CA-010-02, CA-010-03, CA-010-25, CA-010-26,
-- CA-010-42).
-- Imponen lo que no cabe en un CHECK: estado inicial, solo las transiciones de RN-010-05, estados
-- finales de solo lectura, cotización inmutable, límite de 5 solicitudes activas por persona,
-- solicitante que no es miembro y grupo abierto. El backend repite las validaciones (función pura
-- de transición, RNF-010-05) para dar mensajes claros; la lista de transiciones está duplicada a
-- propósito para que un error de programación no corrompa el historial.
--
-- Solo toca join_requests (0050): no depende de 0051-0053. Va después de ellas porque data-model
-- §1 agrupa aquí los disparadores de la spec (H1).
--
-- Sin disparador de capacidad (H1): los cupos reservados (RN-010-02) y la ventana de ingreso
-- (RN-010-12) dependen del reloj y de los plazos y los impone el servicio con el grupo bloqueado;
-- la capacidad final la garantiza group_members_capacity (spec 001) al insertar al miembro.
--
-- set_updated_at ya está en join_requests (join_requests_set_updated_at en 0050); no se repite.
--
-- Estados finales (RN-010-05, RNF-010-09; decisión de BD): lo cubre un disparador propio,
-- join_requests_final_readonly, igual que charges_final_readonly (0043), y no el guard. El guard
-- solo se ejecuta cuando cambia status (UPDATE OF status con WHEN), así que no vería un cambio de
-- otras columnas en una solicitud final. join_requests_final_readonly compara la fila completa y
-- solo tolera content_purged_at (la purga de retención la marca), version y updated_at.
--
-- Orden: PostgreSQL dispara los BEFORE de una misma tabla y evento en orden alfabético de nombre.
-- BEFORE INSERT: join_requests_group_open, join_requests_initial_status,
-- join_requests_max_active_per_applicant, join_requests_not_member.
-- BEFORE UPDATE: join_requests_final_readonly, join_requests_quote_immutable,
-- join_requests_set_updated_at, join_requests_transition_guard. join_requests_final_readonly va
-- primero: una solicitud final se rechaza ahí (restrict_violation) antes de llegar al guard. Como
-- excluye version y updated_at de la comparación, el orden respecto de set_updated_at y del +1 de
-- version no importa.
--
-- Códigos de error: restrict_violation (23001) para columnas inmutables y estados finales, como
-- forbid_update_delete() en 0001; check_violation (23514) para estado inicial, transiciones,
-- límite de activas, no miembro y grupo abierto. Los mensajes son cortos, en inglés y estables
-- (el backend puede reconocerlos); DETAIL nombra la solicitud.

-- ---------------------------------------------------------------------------------------------
-- join_requests_initial_status (RN-010-05, L1)
-- RN-010-05: (nueva) -> abierta. Una solicitud solo nace 'abierta'.

CREATE FUNCTION join_requests_check_initial_status() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'abierta' THEN
    RAISE EXCEPTION 'invalid initial join request status'
      USING DETAIL = format('join request %s cannot start as %s', NEW.id, NEW.status),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER join_requests_initial_status
  BEFORE INSERT ON join_requests
  FOR EACH ROW EXECUTE FUNCTION join_requests_check_initial_status();

-- ---------------------------------------------------------------------------------------------
-- join_requests_transition_guard (RN-010-05, RNF-010-05, CA-010-25)
-- Solo admite las transiciones de spec.md RN-010-05 (copiada tal cual):
--
--   | Desde              | Hacia          | Quién       | Condición                           |
--   |--------------------|----------------|-------------|-------------------------------------|
--   | (nueva)            | abierta        | Solicitante | Ingresa un código válido (o         |
--   |                    |                |             | solicita un cupo publicado, spec    |
--   |                    |                |             | 008) con la ventana de ingreso      |
--   |                    |                |             | abierta                             |
--   | abierta            | esperando_pago | Titular     | Envía los datos de pago, hay cupo   |
--   |                    |                |             | disponible y la ventana está abierta|
--   | abierta            | cancelada      | Solicitante | Cancela                             |
--   | abierta            | expirada       | Sistema     | Pasan 24 horas sin que el titular   |
--   |                    |                |             | envíe los datos de pago, o termina  |
--   |                    |                |             | la ventana de ingreso (lo que       |
--   |                    |                |             | ocurra primero)                     |
--   | esperando_pago     | pago_informado | Solicitante | Sube el comprobante dentro del      |
--   |                    |                |             | plazo de pago                       |
--   | esperando_pago     | aceptada       | Titular     | Registra un pago en efectivo        |
--   | esperando_pago     | cancelada      | Solicitante | Cancela                             |
--   | esperando_pago     | expirada       | Sistema     | Pasan 15 minutos (30 si se          |
--   |                    |                |             | prorrogó) sin comprobante           |
--   | pago_informado     | aceptada       | Titular     | Confirma                            |
--   | pago_informado     | expirada       | Sistema     | Pasan 60 minutos sin decisión       |
--   | abierta /          | rechazada      | Titular     | Rechaza con motivo                  |
--   | esperando_pago /   |                |             |                                     |
--   | pago_informado     |                |             |                                     |
--   | abierta /          | rechazada      | Sistema     | El grupo se cierra, el titular es   |
--   | esperando_pago /   |                |             | baneado o no queda cupo             |
--   | pago_informado     |                |             |                                     |
--   | abierta /          | cancelada      | Sistema     | La cuenta del solicitante es        |
--   | esperando_pago /   |                |             | suspendida o baneada                |
--   | pago_informado     |                |             |                                     |
--   | abierta            | cancelada      | Sistema     | El solicitante fue aceptado en otro |
--   |                    |                |             | grupo del mismo servicio (spec 008, |
--   |                    |                |             | RN-008-05)                          |
--
--   aceptada, rechazada, cancelada y expirada son estados finales. Cualquier otra transición es
--   inválida.
--
-- Pares desde/hacia que resultan (la base no distingue quién ni la condición, que son reglas del
-- backend):
--   abierta        -> esperando_pago, cancelada, expirada, rechazada
--   esperando_pago -> pago_informado, aceptada, cancelada, expirada, rechazada
--   pago_informado -> aceptada, expirada, rechazada, cancelada
-- La fila (nueva) la impone join_requests_initial_status. Las transiciones desde un estado final
-- ya las rechaza join_requests_final_readonly, que dispara antes; aquí se dejan fuera de la lista
-- igual, para que la regla no dependa del orden.
--
-- Si el estado no cambia el disparador no se ejecuta (cláusula WHEN), aunque status figure en el
-- SET.
--
-- version: como charges_transition_guard (0043), el disparador FIJA NEW.version := OLD.version + 1
-- en cada cambio de estado válido, sin importar el valor que traiga el UPDATE.

CREATE FUNCTION join_requests_check_transition() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT ((OLD.status = 'abierta' AND NEW.status IN ('esperando_pago', 'cancelada', 'expirada',
                                                     'rechazada'))
          OR (OLD.status = 'esperando_pago' AND NEW.status IN ('pago_informado', 'aceptada',
                                                               'cancelada', 'expirada',
                                                               'rechazada'))
          OR (OLD.status = 'pago_informado' AND NEW.status IN ('aceptada', 'expirada',
                                                               'rechazada', 'cancelada')))
  THEN
    RAISE EXCEPTION 'invalid join request status transition'
      USING DETAIL = format('join request %s from %s to %s', OLD.id, OLD.status, NEW.status),
            ERRCODE = 'check_violation';
  END IF;

  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER join_requests_transition_guard
  BEFORE UPDATE OF status ON join_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION join_requests_check_transition();

-- ---------------------------------------------------------------------------------------------
-- join_requests_final_readonly (RN-010-05, RNF-010-09)
-- aceptada, rechazada, cancelada y expirada son estados finales: la solicitud no admite ningún
-- cambio, ni de estado ni de ninguna otra columna, salvo content_purged_at (la marca la purga de
-- retención a los 2 meses, RNF-010-09). version y updated_at no cuentan. Se compara la fila
-- completa en jsonb sin esas tres columnas, así que una columna nueva de join_requests queda
-- cubierta sin editar esta función.

CREATE FUNCTION join_requests_forbid_final_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status NOT IN ('aceptada', 'rechazada', 'cancelada', 'expirada') THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['content_purged_at', 'version', 'updated_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['content_purged_at', 'version', 'updated_at']) THEN
    RAISE EXCEPTION 'final join request is read-only'
      USING DETAIL = format('join request %s has status %s', OLD.id, OLD.status),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER join_requests_final_readonly
  BEFORE UPDATE ON join_requests
  FOR EACH ROW EXECUTE FUNCTION join_requests_forbid_final_change();

-- ---------------------------------------------------------------------------------------------
-- join_requests_quote_immutable (RN-010-01, RN-010-10, CA-010-26, CA-010-42)
-- La cotización (quote_amount_cents, quote_price_cents, quote_currency, quote_exchange_rate,
-- quote_total_bs_cents, quote_member_count) se fija al enviar los datos de pago y ya no cambia,
-- aunque cambie el tipo de cambio, el precio o el número de miembros. Se toma como fijada cuando
-- quote_amount_cents ya tiene valor (join_requests_quote_check la ata a payment_sent_at), así que
-- también queda fija una quote_exchange_rate nula de un precio en Bs. payment_sent_at solo se fija
-- una vez; extended_at también (una sola prórroga, RF-010-28).

CREATE FUNCTION join_requests_forbid_quote_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.quote_amount_cents IS NOT NULL
     AND (NEW.quote_amount_cents IS DISTINCT FROM OLD.quote_amount_cents
          OR NEW.quote_price_cents IS DISTINCT FROM OLD.quote_price_cents
          OR NEW.quote_currency IS DISTINCT FROM OLD.quote_currency
          OR NEW.quote_exchange_rate IS DISTINCT FROM OLD.quote_exchange_rate
          OR NEW.quote_total_bs_cents IS DISTINCT FROM OLD.quote_total_bs_cents
          OR NEW.quote_member_count IS DISTINCT FROM OLD.quote_member_count) THEN
    RAISE EXCEPTION 'join request quote cannot change'
      USING DETAIL = format('join request %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.payment_sent_at IS NOT NULL
     AND NEW.payment_sent_at IS DISTINCT FROM OLD.payment_sent_at THEN
    RAISE EXCEPTION 'join request payment_sent_at cannot change'
      USING DETAIL = format('join request %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.extended_at IS NOT NULL
     AND NEW.extended_at IS DISTINCT FROM OLD.extended_at THEN
    RAISE EXCEPTION 'join request extended_at cannot change'
      USING DETAIL = format('join request %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER join_requests_quote_immutable
  BEFORE UPDATE ON join_requests
  FOR EACH ROW EXECUTE FUNCTION join_requests_forbid_quote_change();

-- ---------------------------------------------------------------------------------------------
-- join_requests_max_active_per_applicant (RF-010-02, CA-010-03)
-- Una persona tiene como máximo 5 solicitudes activas (abierta, esperando_pago o
-- pago_informado), sumando todos los grupos. El candado de transacción por solicitante serializa
-- las inserciones concurrentes de la misma persona: la segunda espera a que la primera termine y,
-- en READ COMMITTED, su conteo ya ve la fila confirmada. Solo se controla al insertar: las
-- transiciones permitidas no vuelven a un estado activo.

CREATE FUNCTION join_requests_check_max_active() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_active integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.applicant_id::text));

  SELECT count(*) INTO v_active
  FROM join_requests
  WHERE applicant_id = NEW.applicant_id
    AND status IN ('abierta', 'esperando_pago', 'pago_informado');

  IF v_active >= 5 THEN
    RAISE EXCEPTION 'too many active join requests'
      USING DETAIL = format('applicant %s already has %s active join requests',
                            NEW.applicant_id, v_active),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER join_requests_max_active_per_applicant
  BEFORE INSERT ON join_requests
  FOR EACH ROW EXECUTE FUNCTION join_requests_check_max_active();

-- ---------------------------------------------------------------------------------------------
-- join_requests_not_member (CA-010-02)
-- El solicitante no tiene una estadía activa (left_at IS NULL) en el grupo, ni como miembro ni
-- como titular. Una estadía cerrada (abandono, quitado, mora, baneo) no lo impide aquí; la deuda
-- en el grupo (RN-010-13) la controla el servicio.

CREATE FUNCTION join_requests_check_not_member() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM group_members
             WHERE group_id = NEW.group_id
               AND user_id = NEW.applicant_id
               AND left_at IS NULL) THEN
    RAISE EXCEPTION 'applicant is already a group member'
      USING DETAIL = format('join request %s, group %s, applicant %s', NEW.id, NEW.group_id,
                            NEW.applicant_id),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER join_requests_not_member
  BEFORE INSERT ON join_requests
  FOR EACH ROW EXECUTE FUNCTION join_requests_check_not_member();

-- ---------------------------------------------------------------------------------------------
-- join_requests_group_open (CA-010-02)
-- Solo se abre una solicitud a un grupo 'activo' y sin congelar (frozen_at IS NULL, spec 009).
-- La pausa de nuevos miembros (accepting_members) y la ventana de ingreso las controla el
-- servicio.

CREATE FUNCTION join_requests_check_group_open() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_frozen_at timestamptz;
BEGIN
  SELECT status, frozen_at INTO v_status, v_frozen_at FROM groups WHERE id = NEW.group_id;
  IF NOT FOUND THEN
    -- La FK join_requests_group_id_fkey rechaza la fila con su propio error.
    RETURN NEW;
  END IF;

  IF v_status IS DISTINCT FROM 'activo' OR v_frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'group is not open for join requests'
      USING DETAIL = format('join request %s, group %s has status %s, frozen_at %s', NEW.id,
                            NEW.group_id, v_status, v_frozen_at),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER join_requests_group_open
  BEFORE INSERT ON join_requests
  FOR EACH ROW EXECUTE FUNCTION join_requests_check_group_open();
