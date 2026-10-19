-- 0041_charges: cobros, uno por miembro y período (spec 002, data-model.md §1 con los ajustes H2 y
-- H3 aprobados el 2026-10-19; RF-002-02, RF-002-03, RF-002-04, RN-002-02, RN-002-08, RN-002-10,
-- CA-002-02, CA-002-16).
-- La copia (precio, moneda, tipo de cambio, total, miembros y monto) se fija al emitir y no cambia.
-- Los disparadores de negocio (copia inmutable, estado inicial, transiciones, estados finales de
-- solo lectura, titular sin cobro y coherencia con el ciclo) van en 0043_charge_triggers.sql.
-- La FK de join_request_id a join_requests la agrega la spec 010.

CREATE TABLE charges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  -- Quien debe pagar (nunca el titular del grupo, RN-002-03).
  user_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  -- Copia del período del ciclo (consultas e índice).
  period text NOT NULL,
  -- RN-002-10: cobro del ciclo o cobro de ingreso de un nuevo miembro (spec 010).
  origin text NOT NULL,
  join_request_id uuid NULL,
  status text NOT NULL DEFAULT 'pendiente',
  -- Copia inmutable (RF-002-02, RN-002-02). amount_cents es la cuota en Bs.
  amount_cents bigint NOT NULL,
  price_cents bigint NOT NULL,
  currency text NOT NULL,
  -- Bs por 1 USD.
  exchange_rate numeric(10, 4) NULL,
  total_bs_cents bigint NOT NULL,
  member_count smallint NOT NULL,
  -- Fecha real de emisión.
  issued_at timestamptz NOT NULL,
  -- Instante exclusivo: el mayor entre el inicio del día corte + 4 en La Paz e issued_at + 3 días
  -- (research 001 R2, RF-002-03).
  due_at timestamptz NOT NULL,
  -- Datos para la reputación (RN-002-08): primera subida de comprobante.
  first_submitted_at timestamptz NULL,
  -- Momento en que pasó a pagado (pago manual: fecha indicada por el titular).
  paid_at timestamptz NULL,
  -- Titular que confirmó o registró el pago.
  settled_by uuid NULL,
  settlement text NULL,
  manual_note text NULL,
  -- Cancelación.
  cancelled_at timestamptz NULL,
  cancelled_by uuid NULL,
  cancel_reason text NULL,
  -- Control optimista.
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT charges_pkey PRIMARY KEY (id),
  CONSTRAINT charges_group_id_fkey FOREIGN KEY (group_id)
    REFERENCES groups (id) ON DELETE RESTRICT,
  CONSTRAINT charges_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT charges_cycle_id_fkey FOREIGN KEY (cycle_id)
    REFERENCES billing_cycles (id) ON DELETE RESTRICT,
  CONSTRAINT charges_settled_by_fkey FOREIGN KEY (settled_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT charges_cancelled_by_fkey FOREIGN KEY (cancelled_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT charges_origin_check CHECK (origin IN ('ciclo', 'ingreso')),
  -- Solo el cobro de ingreso nace de una solicitud de ingreso.
  CONSTRAINT charges_join_request_id_check
    CHECK ((origin = 'ingreso') = (join_request_id IS NOT NULL)),
  CONSTRAINT charges_status_check
    CHECK (status IN ('pendiente', 'en_revision', 'pagado', 'atrasado', 'cancelado')),
  CONSTRAINT charges_amount_cents_check CHECK (amount_cents > 0),
  -- H3: los mismos CHECK de la copia que el ciclo.
  CONSTRAINT charges_price_cents_check CHECK (price_cents > 0),
  CONSTRAINT charges_currency_check CHECK (currency IN ('USD', 'BS')),
  CONSTRAINT charges_exchange_rate_currency_check
    CHECK ((currency = 'USD') = (exchange_rate IS NOT NULL)),
  CONSTRAINT charges_exchange_rate_check CHECK (exchange_rate IS NULL OR exchange_rate > 0),
  CONSTRAINT charges_total_bs_cents_check CHECK (total_bs_cents > 0),
  CONSTRAINT charges_member_count_check CHECK (member_count >= 1),
  CONSTRAINT charges_settlement_check CHECK (settlement IN ('comprobante', 'manual', 'ingreso')),
  CONSTRAINT charges_manual_note_check CHECK (char_length(manual_note) <= 200),
  CONSTRAINT charges_cancel_reason_check
    CHECK (char_length(btrim(cancel_reason)) BETWEEN 5 AND 200),
  -- RNF-002-04: un cobro pagado tiene fecha de pago, quién lo liquidó y cómo, y solo él.
  CONSTRAINT charges_status_paid_check
    CHECK ((status = 'pagado')
           = (paid_at IS NOT NULL AND settled_by IS NOT NULL AND settlement IS NOT NULL)),
  -- RNF-002-04: un cobro cancelado tiene fecha, autor y motivo, y solo él.
  CONSTRAINT charges_status_cancelled_check
    CHECK ((status = 'cancelado')
           = (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancel_reason IS NOT NULL)),
  -- RN-002-08: liquidar por comprobante exige que se haya subido uno.
  CONSTRAINT charges_first_submitted_at_check
    CHECK (settlement IS DISTINCT FROM 'comprobante' OR first_submitted_at IS NOT NULL),
  -- El pago manual no puede ser anterior a la emisión.
  CONSTRAINT charges_paid_at_check
    CHECK (paid_at IS NULL OR paid_at >= issued_at - interval '1 minute'),
  -- H2: solo el cobro de ingreso se liquida como ingreso.
  CONSTRAINT charges_settlement_origin_check
    CHECK ((origin = 'ingreso') = (settlement IS NOT DISTINCT FROM 'ingreso'))
);

-- RF-002-04: un cobro por grupo, miembro y período. Parcial para que un cobro cancelado no impida
-- un cobro de ingreso posterior en el mismo período (data-model.md, nota sobre la unicidad).
CREATE UNIQUE INDEX charges_member_period_uq ON charges (group_id, user_id, period)
  WHERE status <> 'cancelado';

-- "Mis cobros" (RF-002-15), deuda atrasada (spec 010) y reputación.
CREATE INDEX charges_user_status_idx ON charges (user_id, status, due_at);

-- Resumen del mes del grupo y del titular (RF-002-16, RF-002-18).
CREATE INDEX charges_group_period_idx ON charges (group_id, period, status);

-- Barrido de atrasos.
CREATE INDEX charges_overdue_idx ON charges (due_at) WHERE status = 'pendiente';

CREATE INDEX charges_cycle_idx ON charges (cycle_id);

CREATE TRIGGER charges_set_updated_at
  BEFORE UPDATE ON charges
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
