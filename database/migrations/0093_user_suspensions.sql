-- 0093_user_suspensions: historial de suspensiones (spec 009, data-model.md §1; RF-009-10,
-- RN-009-04). El estado vigente está en users.status. Una suspensión abierta por persona; nadie
-- se suspende a sí mismo. Que el objetivo no sea administrador lo impone 0094.

CREATE TABLE user_suspensions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text NOT NULL,
  suspended_by uuid NOT NULL,
  suspended_at timestamptz NOT NULL DEFAULT now(),
  reactivated_at timestamptz NULL,
  reactivated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_suspensions_pkey PRIMARY KEY (id),
  CONSTRAINT user_suspensions_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT user_suspensions_suspended_by_fkey FOREIGN KEY (suspended_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT user_suspensions_reactivated_by_fkey FOREIGN KEY (reactivated_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT user_suspensions_reason_check CHECK (char_length(btrim(reason)) BETWEEN 10 AND 300),
  CONSTRAINT user_suspensions_reactivated_check
    CHECK ((reactivated_at IS NULL) = (reactivated_by IS NULL)),
  CONSTRAINT user_suspensions_suspended_by_check CHECK (suspended_by <> user_id)
);

CREATE UNIQUE INDEX user_suspensions_open_uq ON user_suspensions (user_id)
  WHERE reactivated_at IS NULL;

CREATE TRIGGER user_suspensions_set_updated_at
  BEFORE UPDATE ON user_suspensions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
