-- 0061_charge_reputation_exclusions: cobros que el titular excluye de la reputación tras un
-- reporte (spec 007, data-model.md §2; RF-007-14). Una exclusión por cobro. Que excluded_by sea
-- el titular del grupo del cobro lo valida el backend.

CREATE TABLE charge_reputation_exclusions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  charge_id uuid NOT NULL,
  reason text NOT NULL,
  excluded_by uuid NOT NULL,
  excluded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT charge_reputation_exclusions_pkey PRIMARY KEY (id),
  CONSTRAINT charge_reputation_exclusions_charge_id_key UNIQUE (charge_id),
  CONSTRAINT charge_reputation_exclusions_charge_id_fkey FOREIGN KEY (charge_id)
    REFERENCES charges (id) ON DELETE RESTRICT,
  CONSTRAINT charge_reputation_exclusions_excluded_by_fkey FOREIGN KEY (excluded_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT charge_reputation_exclusions_reason_check
    CHECK (char_length(btrim(reason)) BETWEEN 10 AND 300)
);

CREATE TRIGGER charge_reputation_exclusions_set_updated_at
  BEFORE UPDATE ON charge_reputation_exclusions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
