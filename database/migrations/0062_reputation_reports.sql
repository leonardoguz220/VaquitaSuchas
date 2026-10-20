-- 0062_reputation_reports: reportes del dueño de un cobro sobre su efecto en la reputación
-- (spec 007, data-model.md §2; RF-007-14). Un reporte por persona y cobro. Que reporter_id sea el
-- dueño del cobro lo valida el backend.

CREATE TABLE reputation_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  charge_id uuid NOT NULL,
  reporter_id uuid NOT NULL,
  comment text NOT NULL,
  status text NOT NULL DEFAULT 'abierto',
  decided_by uuid NULL,
  decided_at timestamptz NULL,
  decision_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reputation_reports_pkey PRIMARY KEY (id),
  CONSTRAINT reputation_reports_charge_id_fkey FOREIGN KEY (charge_id)
    REFERENCES charges (id) ON DELETE RESTRICT,
  CONSTRAINT reputation_reports_reporter_id_fkey FOREIGN KEY (reporter_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT reputation_reports_decided_by_fkey FOREIGN KEY (decided_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT reputation_reports_charge_id_reporter_id_key UNIQUE (charge_id, reporter_id),
  CONSTRAINT reputation_reports_comment_check
    CHECK (char_length(btrim(comment)) BETWEEN 10 AND 300),
  CONSTRAINT reputation_reports_status_check
    CHECK (status IN ('abierto', 'excluido', 'rechazado'))
);

CREATE TRIGGER reputation_reports_set_updated_at
  BEFORE UPDATE ON reputation_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
