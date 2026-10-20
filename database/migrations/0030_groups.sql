-- 0030_groups: grupos de suscripción compartida (spec 001, data-model.md §1; RF-001-01, RF-001-02,
-- RF-001-03, RF-001-06, RF-001-09, RF-001-10, RF-001-11, RF-001-20, RN-001-04, RN-001-09,
-- RN-001-12, RN-001-13).
-- Las cuotas no se guardan: se calculan al consultar a partir de total_bs_cents (RF-001-12).
-- created_at cuenta como el corte inicial del grupo (inicio de la ventana de ingreso inicial).
-- Los disparadores de negocio (capacidad, titular, límite de 5, copias inmutables, cerrado de
-- solo lectura) van en 0032_group_triggers.sql.

CREATE TABLE groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  -- Exactamente un titular (RN-001-01).
  owner_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'activo',
  closed_at timestamptz NULL,
  -- Grupo en solo lectura por titular baneado (spec 009, RF-009-22).
  frozen_at timestamptz NULL,
  frozen_reason text NULL,
  -- Copia del catálogo al crear (RN-001-12, spec 004 RF-004-08); NULL = servicio personalizado.
  catalog_plan_id uuid NULL,
  service_name_snapshot text NOT NULL,
  plan_name_snapshot text NULL,
  logo_url_snapshot text NULL,
  brand_color_snapshot text NULL,
  -- Cupos máximos del plan al crear.
  plan_max_slots_snapshot smallint NULL,
  -- Precio individual de referencia (spec 006).
  individual_price_cents_snapshot bigint NULL,
  individual_price_currency_snapshot text NULL,
  -- Precio real definido por el titular, en centavos de la moneda del precio.
  price_cents bigint NOT NULL,
  currency text NOT NULL,
  -- Bs por 1 USD (RN-001-04).
  exchange_rate numeric(10, 4) NULL,
  -- RF-001-11: total en Bs redondeado al centavo, mitad hacia arriba.
  total_bs_cents bigint GENERATED ALWAYS AS (
    CASE WHEN currency = 'BS' THEN price_cents
         ELSE round(price_cents * exchange_rate)::bigint END
  ) STORED,
  billing_day smallint NOT NULL,
  -- Cupos totales, titular incluido.
  total_slots smallint NOT NULL,
  invite_code text NOT NULL,
  accepting_members boolean NOT NULL DEFAULT true,
  payment_info_text text NULL,
  -- Clave del archivo QR en el almacén privado.
  payment_qr_key text NULL,
  payment_qr_mime text NULL,
  -- Control optimista.
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT groups_pkey PRIMARY KEY (id),
  CONSTRAINT groups_owner_id_fkey FOREIGN KEY (owner_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT groups_catalog_plan_id_fkey FOREIGN KEY (catalog_plan_id)
    REFERENCES catalog_plans (id) ON DELETE RESTRICT,
  CONSTRAINT groups_invite_code_key UNIQUE (invite_code),
  CONSTRAINT groups_name_check CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
  CONSTRAINT groups_status_check CHECK (status IN ('activo', 'cerrado')),
  CONSTRAINT groups_closed_at_check CHECK ((status = 'cerrado') = (closed_at IS NOT NULL)),
  CONSTRAINT groups_frozen_reason_check
    CHECK (frozen_reason IS NULL OR frozen_reason = 'titular_baneado'),
  CONSTRAINT groups_frozen_at_check CHECK ((frozen_at IS NULL) = (frozen_reason IS NULL)),
  CONSTRAINT groups_individual_price_currency_snapshot_check
    CHECK (individual_price_currency_snapshot IN ('USD', 'BS')),
  CONSTRAINT groups_plan_name_snapshot_check
    CHECK ((catalog_plan_id IS NULL) = (plan_name_snapshot IS NULL)),
  CONSTRAINT groups_price_cents_check CHECK (price_cents > 0),
  CONSTRAINT groups_currency_check CHECK (currency IN ('USD', 'BS')),
  -- RF-001-03: el tipo de cambio existe si y solo si el precio está en USD.
  CONSTRAINT groups_exchange_rate_currency_check
    CHECK ((currency = 'USD') = (exchange_rate IS NOT NULL)),
  CONSTRAINT groups_exchange_rate_check CHECK (exchange_rate IS NULL OR exchange_rate > 0),
  -- Bs 1,00 a Bs 5.000,00 (RN-001-09).
  CONSTRAINT groups_total_bs_cents_check CHECK (total_bs_cents BETWEEN 100 AND 500000),
  CONSTRAINT groups_billing_day_check CHECK (billing_day BETWEEN 1 AND 31),
  CONSTRAINT groups_total_slots_check CHECK (total_slots BETWEEN 2 AND 20),
  -- RN-001-13: no más cupos que el plan del catálogo.
  CONSTRAINT groups_total_slots_plan_check
    CHECK (plan_max_slots_snapshot IS NULL OR total_slots <= plan_max_slots_snapshot),
  -- Sin 0, O, 1, I ni L (RF-001-06).
  CONSTRAINT groups_invite_code_check
    CHECK (invite_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  CONSTRAINT groups_payment_info_text_check CHECK (char_length(payment_info_text) <= 500),
  CONSTRAINT groups_payment_qr_mime_check CHECK (payment_qr_mime IN ('image/jpeg', 'image/png'))
);

-- Mis grupos como titular y conteo de grupos activos de un titular (RN-001-14).
CREATE INDEX groups_owner_active_idx ON groups (owner_id) WHERE status = 'activo';

CREATE TRIGGER groups_set_updated_at
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
