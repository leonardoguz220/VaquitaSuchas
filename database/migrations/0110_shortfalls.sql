-- 0110_shortfalls: faltante de grupo (spec 011, data-model.md; RF-011-04, RF-011-05, RF-011-08 a
-- RF-011-15, RN-011-01 a RN-011-06).
-- Tres tablas: la ronda de regularización que abre el titular, una fila por miembro afectado
-- (con su pago adicional y su devolución) y la línea de tiempo de solo anexado.
-- No se modifica charges: el pago adicional no es un cobro del ciclo (plan.md, D1).

CREATE TABLE shortfall_rounds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  -- Copia del período del ciclo, 'AAAA-MM'.
  period text NOT NULL,
  round_number smallint NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'abierta',
  -- Copia del ciclo: no se relee el precio ni el tipo de cambio vigentes (RN-011-01).
  total_bs_cents bigint NOT NULL,
  -- Miembros que se quedan, titular incluido.
  member_count_after smallint NOT NULL,
  -- floor(total / member_count_after).
  base_share_cents bigint NOT NULL,
  -- base + resto: referencia del titular (RN-001-10).
  owner_share_cents bigint NOT NULL,
  -- Suma de lo que deben agregar los afectados.
  shortfall_cents bigint NOT NULL,
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL,
  -- Plazo para responder y plazo máximo para pagar (RF-011-04).
  respond_by timestamptz NOT NULL,
  pay_by timestamptz NOT NULL,
  closed_at timestamptz NULL,
  -- Control optimista.
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shortfall_rounds_pkey PRIMARY KEY (id),
  CONSTRAINT shortfall_rounds_group_id_fkey FOREIGN KEY (group_id)
    REFERENCES groups (id) ON DELETE RESTRICT,
  CONSTRAINT shortfall_rounds_cycle_id_fkey FOREIGN KEY (cycle_id)
    REFERENCES billing_cycles (id) ON DELETE RESTRICT,
  CONSTRAINT shortfall_rounds_opened_by_fkey FOREIGN KEY (opened_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT shortfall_rounds_status_check CHECK (status IN ('abierta', 'cerrada', 'cancelada')),
  CONSTRAINT shortfall_rounds_round_number_check CHECK (round_number BETWEEN 1 AND 2),
  CONSTRAINT shortfall_rounds_period_check CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT shortfall_rounds_total_check CHECK (total_bs_cents > 0),
  CONSTRAINT shortfall_rounds_member_count_check CHECK (member_count_after >= 2),
  CONSTRAINT shortfall_rounds_base_share_check CHECK (base_share_cents > 0),
  CONSTRAINT shortfall_rounds_owner_share_check CHECK (owner_share_cents >= base_share_cents),
  CONSTRAINT shortfall_rounds_shortfall_check CHECK (shortfall_cents > 0),
  CONSTRAINT shortfall_rounds_deadlines_check
    CHECK (respond_by > opened_at AND pay_by >= respond_by),
  -- Una ronda no abierta tiene fecha de cierre, y solo ella.
  CONSTRAINT shortfall_rounds_closed_at_check CHECK ((status = 'abierta') = (closed_at IS NULL))
);

-- RF-011-05: a lo más una ronda por grupo, período y número; y una sola abierta por grupo.
CREATE UNIQUE INDEX shortfall_rounds_period_number_uq
  ON shortfall_rounds (group_id, period, round_number);
CREATE UNIQUE INDEX shortfall_rounds_one_open_uq ON shortfall_rounds (group_id)
  WHERE status = 'abierta';

-- Barrido de plazos (RF-011-11).
CREATE INDEX shortfall_rounds_sweep_idx ON shortfall_rounds (status, respond_by, pay_by)
  WHERE status = 'abierta';

CREATE TRIGGER shortfall_rounds_set_updated_at
  BEFORE UPDATE ON shortfall_rounds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE shortfall_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL,
  user_id uuid NOT NULL,
  -- Lo que la persona pagó en el período y lo que debe agregar (cotización, inmutable).
  paid_cents bigint NOT NULL,
  extra_due_cents bigint NOT NULL,
  choice text NOT NULL DEFAULT 'pendiente',
  responded_at timestamptz NULL,
  -- Pago adicional (RF-011-10).
  extra_status text NOT NULL DEFAULT 'no_aplica',
  extra_method text NULL,
  extra_reference text NULL,
  extra_informed_at timestamptz NULL,
  extra_confirmed_at timestamptz NULL,
  extra_confirmed_by uuid NULL,
  extra_deadline_at timestamptz NULL,
  extra_reject_reason text NULL,
  -- Devolución (RF-011-12, RF-011-13).
  refund_status text NOT NULL DEFAULT 'no_aplica',
  refund_amount_cents bigint NULL,
  refund_method text NULL,
  refund_reference text NULL,
  refund_opened_at timestamptz NULL,
  refund_due_at timestamptz NULL,
  refund_sent_at timestamptz NULL,
  refund_confirmed_at timestamptz NULL,
  refund_disputed_at timestamptz NULL,
  refund_dispute_reason text NULL,
  -- Control optimista.
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shortfall_responses_pkey PRIMARY KEY (id),
  CONSTRAINT shortfall_responses_round_id_fkey FOREIGN KEY (round_id)
    REFERENCES shortfall_rounds (id) ON DELETE RESTRICT,
  CONSTRAINT shortfall_responses_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT shortfall_responses_extra_confirmed_by_fkey FOREIGN KEY (extra_confirmed_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT shortfall_responses_round_user_uq UNIQUE (round_id, user_id),
  CONSTRAINT shortfall_responses_choice_check
    CHECK (choice IN ('pendiente', 'cubrir', 'devolucion', 'sin_respuesta')),
  CONSTRAINT shortfall_responses_extra_status_check
    CHECK (extra_status IN ('no_aplica', 'pendiente_pago', 'informado', 'confirmado', 'vencido')),
  CONSTRAINT shortfall_responses_refund_status_check
    CHECK (refund_status IN ('no_aplica', 'pendiente', 'enviada', 'confirmada', 'disputada')),
  CONSTRAINT shortfall_responses_paid_check CHECK (paid_cents > 0),
  CONSTRAINT shortfall_responses_extra_due_check CHECK (extra_due_cents > 0),
  CONSTRAINT shortfall_responses_extra_method_check
    CHECK (extra_method IS NULL OR extra_method IN ('qr', 'transferencia')),
  CONSTRAINT shortfall_responses_refund_method_check
    CHECK (refund_method IS NULL OR refund_method IN ('qr', 'transferencia', 'efectivo')),
  CONSTRAINT shortfall_responses_extra_reference_check
    CHECK (extra_reference IS NULL OR char_length(btrim(extra_reference)) BETWEEN 1 AND 100),
  CONSTRAINT shortfall_responses_refund_reference_check
    CHECK (refund_reference IS NULL OR char_length(btrim(refund_reference)) BETWEEN 1 AND 100),
  CONSTRAINT shortfall_responses_reject_reason_check
    CHECK (extra_reject_reason IS NULL OR char_length(btrim(extra_reject_reason)) BETWEEN 5 AND 200),
  CONSTRAINT shortfall_responses_dispute_reason_check
    CHECK (refund_dispute_reason IS NULL
           OR char_length(btrim(refund_dispute_reason)) BETWEEN 5 AND 300),
  -- RF-011-08: sin respuesta no hay pago adicional ni devolución todavía.
  CONSTRAINT shortfall_responses_pending_check
    CHECK (choice <> 'pendiente' OR (extra_status = 'no_aplica' AND refund_status = 'no_aplica')),
  -- Cubrir abre el pago adicional; solo vence para volverse devolución (RF-011-11).
  CONSTRAINT shortfall_responses_extra_choice_check
    CHECK (extra_status = 'no_aplica'
           OR choice = 'cubrir'
           OR (extra_status = 'vencido' AND choice = 'sin_respuesta')),
  CONSTRAINT shortfall_responses_cover_check
    CHECK (choice <> 'cubrir' OR extra_status <> 'no_aplica'),
  -- La devolución nace de elegir devolución, de callar o de no pagar a tiempo.
  CONSTRAINT shortfall_responses_refund_choice_check
    CHECK (refund_status = 'no_aplica'
           OR choice IN ('devolucion', 'sin_respuesta')
           OR extra_status = 'vencido'),
  CONSTRAINT shortfall_responses_refund_open_check
    CHECK ((refund_status = 'no_aplica')
           = (refund_amount_cents IS NULL AND refund_opened_at IS NULL AND refund_due_at IS NULL)),
  CONSTRAINT shortfall_responses_refund_amount_check
    CHECK (refund_amount_cents IS NULL OR refund_amount_cents = paid_cents),
  -- Una devolución registrada lleva método, referencia y fecha; una confirmada, su fecha.
  CONSTRAINT shortfall_responses_refund_sent_check
    CHECK ((refund_status IN ('enviada', 'confirmada'))
           = (refund_sent_at IS NOT NULL AND refund_method IS NOT NULL
              AND refund_reference IS NOT NULL)
           OR refund_status = 'disputada'),
  CONSTRAINT shortfall_responses_refund_confirmed_check
    CHECK ((refund_status = 'confirmada') = (refund_confirmed_at IS NOT NULL)),
  CONSTRAINT shortfall_responses_refund_disputed_check
    CHECK ((refund_status = 'disputada')
           = (refund_disputed_at IS NOT NULL AND refund_dispute_reason IS NOT NULL)),
  -- Un pago adicional informado o confirmado lleva método, referencia y fecha.
  CONSTRAINT shortfall_responses_extra_informed_check
    CHECK ((extra_status IN ('informado', 'confirmado'))
           = (extra_informed_at IS NOT NULL AND extra_method IS NOT NULL
              AND extra_reference IS NOT NULL)
           OR extra_status IN ('pendiente_pago', 'vencido')),
  CONSTRAINT shortfall_responses_extra_confirmed_check
    CHECK ((extra_status = 'confirmado')
           = (extra_confirmed_at IS NOT NULL AND extra_confirmed_by IS NOT NULL))
);

CREATE INDEX shortfall_responses_round_idx ON shortfall_responses (round_id);
-- "Mis faltantes" (HU-011-02).
CREATE INDEX shortfall_responses_user_idx ON shortfall_responses (user_id, created_at DESC);
-- Barrido de devoluciones sin registrar y de pagos vencidos.
CREATE INDEX shortfall_responses_refund_sweep_idx ON shortfall_responses (refund_due_at)
  WHERE refund_status = 'pendiente';
CREATE INDEX shortfall_responses_extra_sweep_idx ON shortfall_responses (extra_deadline_at)
  WHERE extra_status = 'pendiente_pago';

CREATE TRIGGER shortfall_responses_set_updated_at
  BEFORE UPDATE ON shortfall_responses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE shortfall_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL,
  response_id uuid NULL,
  type text NOT NULL,
  actor_kind text NOT NULL,
  actor_id uuid NULL,
  reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- updated_at = created_at: la tabla es de solo anexado.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shortfall_events_pkey PRIMARY KEY (id),
  CONSTRAINT shortfall_events_round_id_fkey FOREIGN KEY (round_id)
    REFERENCES shortfall_rounds (id) ON DELETE RESTRICT,
  CONSTRAINT shortfall_events_response_id_fkey FOREIGN KEY (response_id)
    REFERENCES shortfall_responses (id) ON DELETE RESTRICT,
  CONSTRAINT shortfall_events_actor_id_fkey FOREIGN KEY (actor_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT shortfall_events_type_check
    CHECK (type IN ('ronda_abierta', 'ronda_cancelada', 'ronda_cerrada', 'cubrir_elegido',
                    'devolucion_elegida', 'sin_respuesta', 'pago_informado', 'pago_confirmado',
                    'pago_rechazado', 'pago_vencido', 'devolucion_registrada',
                    'devolucion_confirmada', 'devolucion_disputada')),
  CONSTRAINT shortfall_events_actor_kind_check CHECK (actor_kind IN ('usuario', 'sistema')),
  CONSTRAINT shortfall_events_actor_id_check CHECK ((actor_kind = 'usuario') = (actor_id IS NOT NULL))
);

CREATE INDEX shortfall_events_round_idx ON shortfall_events (round_id, occurred_at);
CREATE INDEX shortfall_events_response_idx ON shortfall_events (response_id, occurred_at)
  WHERE response_id IS NOT NULL;

-- Solo anexado: forbid_update_delete corre antes que set_updated_at (orden alfabético).
CREATE TRIGGER shortfall_events_forbid_update_delete
  BEFORE UPDATE OR DELETE ON shortfall_events
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

CREATE TRIGGER shortfall_events_set_updated_at
  BEFORE UPDATE ON shortfall_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- shortfall_rounds_snapshot_immutable (RN-011-01)
-- La cotización y la identidad de la ronda no cambian una vez abierta.

CREATE FUNCTION shortfall_rounds_forbid_snapshot_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id
     OR NEW.period IS DISTINCT FROM OLD.period
     OR NEW.round_number IS DISTINCT FROM OLD.round_number
     OR NEW.total_bs_cents IS DISTINCT FROM OLD.total_bs_cents
     OR NEW.member_count_after IS DISTINCT FROM OLD.member_count_after
     OR NEW.base_share_cents IS DISTINCT FROM OLD.base_share_cents
     OR NEW.owner_share_cents IS DISTINCT FROM OLD.owner_share_cents
     OR NEW.shortfall_cents IS DISTINCT FROM OLD.shortfall_cents
     OR NEW.opened_by IS DISTINCT FROM OLD.opened_by
     OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
     OR NEW.respond_by IS DISTINCT FROM OLD.respond_by
     OR NEW.pay_by IS DISTINCT FROM OLD.pay_by THEN
    RAISE EXCEPTION 'shortfall round quote cannot change'
      USING DETAIL = format('round %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER shortfall_rounds_snapshot_immutable
  BEFORE UPDATE ON shortfall_rounds
  FOR EACH ROW EXECUTE FUNCTION shortfall_rounds_forbid_snapshot_change();

-- ---------------------------------------------------------------------------------------------
-- shortfall_rounds_transition_guard (spec 011 §7)
-- abierta -> cerrada | cancelada. Los estados finales no cambian.

CREATE FUNCTION shortfall_rounds_check_transition() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT (OLD.status = 'abierta' AND NEW.status IN ('cerrada', 'cancelada')) THEN
    RAISE EXCEPTION 'invalid shortfall round status transition'
      USING DETAIL = format('round %s from %s to %s', OLD.id, OLD.status, NEW.status),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER shortfall_rounds_transition_guard
  BEFORE UPDATE OF status ON shortfall_rounds
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION shortfall_rounds_check_transition();

-- ---------------------------------------------------------------------------------------------
-- shortfall_responses_snapshot_immutable y transiciones (spec 011 §7)
-- paid_cents, extra_due_cents, round_id y user_id no cambian. Pago adicional:
--   no_aplica -> pendiente_pago; pendiente_pago -> informado | vencido;
--   informado -> confirmado | pendiente_pago. Devolución:
--   no_aplica -> pendiente; pendiente -> enviada | disputada; enviada -> confirmada | disputada.

CREATE FUNCTION shortfall_responses_check_update() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.round_id IS DISTINCT FROM OLD.round_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.paid_cents IS DISTINCT FROM OLD.paid_cents
     OR NEW.extra_due_cents IS DISTINCT FROM OLD.extra_due_cents THEN
    RAISE EXCEPTION 'shortfall response quote cannot change'
      USING DETAIL = format('response %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.extra_status IS DISTINCT FROM OLD.extra_status
     AND NOT ((OLD.extra_status = 'no_aplica' AND NEW.extra_status = 'pendiente_pago')
              OR (OLD.extra_status = 'pendiente_pago'
                  AND NEW.extra_status IN ('informado', 'vencido'))
              OR (OLD.extra_status = 'informado'
                  AND NEW.extra_status IN ('confirmado', 'pendiente_pago'))) THEN
    RAISE EXCEPTION 'invalid shortfall extra payment transition'
      USING DETAIL = format('response %s from %s to %s', OLD.id, OLD.extra_status,
                            NEW.extra_status),
            ERRCODE = 'check_violation';
  END IF;

  IF NEW.refund_status IS DISTINCT FROM OLD.refund_status
     AND NOT ((OLD.refund_status = 'no_aplica' AND NEW.refund_status = 'pendiente')
              OR (OLD.refund_status = 'pendiente' AND NEW.refund_status IN ('enviada', 'disputada'))
              OR (OLD.refund_status = 'enviada'
                  AND NEW.refund_status IN ('confirmada', 'disputada'))) THEN
    RAISE EXCEPTION 'invalid shortfall refund transition'
      USING DETAIL = format('response %s from %s to %s', OLD.id, OLD.refund_status,
                            NEW.refund_status),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER shortfall_responses_check_update
  BEFORE UPDATE ON shortfall_responses
  FOR EACH ROW EXECUTE FUNCTION shortfall_responses_check_update();

-- ---------------------------------------------------------------------------------------------
-- shortfall_responses_not_owner (RN-001-10)
-- El titular no es afectado: su cuota es de referencia. Se evalúa al insertar contra el titular
-- del grupo de la ronda.

CREATE FUNCTION shortfall_responses_check_not_owner() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT g.owner_id INTO v_owner_id
    FROM shortfall_rounds r JOIN groups g ON g.id = r.group_id
   WHERE r.id = NEW.round_id;
  IF FOUND AND NEW.user_id = v_owner_id THEN
    RAISE EXCEPTION 'group owner cannot be a shortfall respondent'
      USING DETAIL = format('response %s, round %s', NEW.id, NEW.round_id),
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER shortfall_responses_not_owner
  BEFORE INSERT ON shortfall_responses
  FOR EACH ROW EXECUTE FUNCTION shortfall_responses_check_not_owner();
