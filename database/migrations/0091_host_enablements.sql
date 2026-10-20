-- 0091_host_enablements: habilitación manual para ser titular (spec 009, data-model.md §1;
-- RF-009-21, RF-007-17). Una habilitación vigente por persona; se revoca con revoked_*.

CREATE TABLE host_enablements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text NOT NULL,
  enabled_by uuid NOT NULL,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  revoked_by uuid NULL,
  revoke_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT host_enablements_pkey PRIMARY KEY (id),
  CONSTRAINT host_enablements_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT host_enablements_enabled_by_fkey FOREIGN KEY (enabled_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT host_enablements_revoked_by_fkey FOREIGN KEY (revoked_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT host_enablements_reason_check CHECK (char_length(btrim(reason)) BETWEEN 10 AND 300),
  CONSTRAINT host_enablements_revoked_check CHECK (
    (revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL) = (revoke_reason IS NULL)
  )
);

CREATE UNIQUE INDEX host_enablements_active_uq ON host_enablements (user_id)
  WHERE revoked_at IS NULL;

CREATE TRIGGER host_enablements_set_updated_at
  BEFORE UPDATE ON host_enablements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
