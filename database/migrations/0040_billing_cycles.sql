-- 0040_billing_cycles: ciclos de cobro, uno por grupo y período (spec 002, data-model.md §1 con los
-- ajustes H4 y M2 aprobados el 2026-10-19; RF-002-01, RF-002-02, RF-002-03, RN-002-02,
-- RN-002-09, CA-002-02).
-- Guarda la copia (snapshot) de precio, tipo de cambio y cuotas vigentes al corte; el panel
-- (spec 006) y la reputación (spec 007) leen de aquí. Ciclo inicial y períodos: spec 001,
-- research.md R1 y R2.

CREATE TABLE billing_cycles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  -- Mes del corte, 'YYYY-MM'.
  period text NOT NULL,
  -- Titular al emitir el ciclo: la spec 006 le atribuye la cuota de referencia aunque luego se
  -- transfiera la titularidad.
  owner_id uuid NOT NULL,
  cycle_type text NOT NULL,
  -- Fecha de corte en calendario de La Paz (ajustada, RN-001-06). Ciclo inicial: fecha de
  -- creación del grupo.
  cut_date date NOT NULL,
  -- cut_date + 3 días (RF-002-03). Informativa en el ciclo inicial.
  due_date date NOT NULL,
  -- Momento real en que se creó el ciclo (puede ser posterior al corte si hubo caída).
  issued_at timestamptz NOT NULL,
  -- Copia de la suscripción al corte (RN-002-02).
  price_cents bigint NOT NULL,
  currency text NOT NULL,
  -- Bs por 1 USD.
  exchange_rate numeric(10, 4) NULL,
  total_bs_cents bigint NOT NULL,
  -- Miembros activos, titular incluido.
  member_count smallint NOT NULL,
  -- floor(total_bs_cents / member_count).
  base_share_cents bigint NOT NULL,
  -- base + resto: referencia del titular (RN-001-10).
  owner_share_cents bigint NOT NULL,
  remainder_cents bigint NOT NULL,
  -- Solo el ciclo inicial: mientras sea NULL se recalcula con cada ingreso o salida (research 001
  -- R1).
  finalized_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_cycles_pkey PRIMARY KEY (id),
  CONSTRAINT billing_cycles_group_id_fkey FOREIGN KEY (group_id)
    REFERENCES groups (id) ON DELETE RESTRICT,
  CONSTRAINT billing_cycles_owner_id_fkey FOREIGN KEY (owner_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  -- RN-002-09: un ciclo por grupo y período.
  CONSTRAINT billing_cycles_group_id_period_key UNIQUE (group_id, period),
  CONSTRAINT billing_cycles_period_check CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT billing_cycles_cycle_type_check CHECK (cycle_type IN ('inicial', 'regular')),
  CONSTRAINT billing_cycles_price_cents_check CHECK (price_cents > 0),
  CONSTRAINT billing_cycles_currency_check CHECK (currency IN ('USD', 'BS')),
  -- El tipo de cambio existe si y solo si el precio está en USD (RF-001-03).
  CONSTRAINT billing_cycles_exchange_rate_currency_check
    CHECK ((currency = 'USD') = (exchange_rate IS NOT NULL)),
  CONSTRAINT billing_cycles_total_bs_cents_check CHECK (total_bs_cents > 0),
  CONSTRAINT billing_cycles_member_count_check CHECK (member_count >= 1),
  CONSTRAINT billing_cycles_base_share_cents_check CHECK (base_share_cents >= 0),
  -- H4: con la suma igual al total, obliga a que la base sea floor y el resto lo asuma el titular.
  CONSTRAINT billing_cycles_remainder_cents_check
    CHECK (remainder_cents >= 0 AND remainder_cents < member_count),
  -- Un ciclo regular nace finalizado; solo el inicial puede estar abierto.
  CONSTRAINT billing_cycles_finalized_at_check
    CHECK (cycle_type = 'inicial' OR finalized_at IS NOT NULL),
  -- RN-001-02: la suma de las cuotas es igual al total.
  CONSTRAINT billing_cycles_shares_sum_check
    CHECK (base_share_cents * (member_count - 1) + owner_share_cents = total_bs_cents),
  CONSTRAINT billing_cycles_owner_share_cents_check
    CHECK (owner_share_cents - base_share_cents = remainder_cents),
  -- M2: el período es el mes del corte.
  CONSTRAINT billing_cycles_period_cut_date_check CHECK (period = to_char(cut_date, 'YYYY-MM')),
  -- M2, RF-002-03: el vencimiento es el corte más 3 días.
  CONSTRAINT billing_cycles_due_date_check CHECK (due_date = cut_date + 3)
);

-- RF-002-04: un solo ciclo inicial por grupo.
CREATE UNIQUE INDEX billing_cycles_initial_uq ON billing_cycles (group_id)
  WHERE cycle_type = 'inicial';

-- Último ciclo del grupo e historial por período.
CREATE INDEX billing_cycles_group_period_idx ON billing_cycles (group_id, period DESC);

CREATE TRIGGER billing_cycles_set_updated_at
  BEFORE UPDATE ON billing_cycles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- billing_cycles_immutable (RN-002-02, RN-002-09)
-- Un ciclo es inmutable. La única excepción es el ciclo 'inicial' todavía abierto
-- (finalized_at IS NULL): se recalcula con cada ingreso o salida, así que pueden cambiar
-- member_count, base_share_cents, owner_share_cents y remainder_cents, y se cierra fijando
-- finalized_at. updated_at queda fuera de la comparación (lo mantiene set_updated_at). Una
-- columna nueva de billing_cycles debe agregarse aquí en la migración que la cree.
-- ERRCODE restrict_violation (23001), como forbid_update_delete() en 0001.

CREATE FUNCTION billing_cycles_forbid_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.cycle_type <> 'inicial' OR OLD.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'billing cycle is immutable'
      USING DETAIL = format('billing cycle %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.period IS DISTINCT FROM OLD.period
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.cycle_type IS DISTINCT FROM OLD.cycle_type
     OR NEW.cut_date IS DISTINCT FROM OLD.cut_date
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR NEW.price_cents IS DISTINCT FROM OLD.price_cents
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
     OR NEW.total_bs_cents IS DISTINCT FROM OLD.total_bs_cents
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'open initial billing cycle only allows recalculating shares'
      USING DETAIL = format('billing cycle %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER billing_cycles_immutable
  BEFORE UPDATE ON billing_cycles
  FOR EACH ROW EXECUTE FUNCTION billing_cycles_forbid_change();
