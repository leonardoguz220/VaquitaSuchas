-- 0090_bans: baneos de usuarios (spec 009, data-model.md §1; RF-009-19, RF-009-23, RN-009-07,
-- CA-009-23, CA-009-34). Un baneo no se borra: se revierte con revoked_*, y otro administrador
-- distinto del que baneó lo revierte. Un baneo vigente por persona. Agrega también la FK
-- banned_identities.ban_ref -> bans de la spec 003: al revertir, el backend borra esas filas en la
-- misma transacción. Que el objetivo no sea administrador y que los datos del baneo no cambien lo
-- imponen los disparadores de 0094.

CREATE TABLE bans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text NOT NULL,
  source text NOT NULL,
  dispute_id uuid NULL,
  banned_by uuid NOT NULL,
  banned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  revoked_by uuid NULL,
  revoke_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bans_pkey PRIMARY KEY (id),
  CONSTRAINT bans_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT bans_dispute_id_fkey FOREIGN KEY (dispute_id)
    REFERENCES join_disputes (id) ON DELETE RESTRICT,
  CONSTRAINT bans_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT bans_revoked_by_fkey FOREIGN KEY (revoked_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT bans_reason_check CHECK (char_length(btrim(reason)) BETWEEN 10 AND 300),
  CONSTRAINT bans_source_check CHECK (source IN ('admin', 'reclamo')),
  CONSTRAINT bans_dispute_id_check CHECK ((source = 'reclamo') = (dispute_id IS NOT NULL)),
  CONSTRAINT bans_revoke_reason_check
    CHECK (char_length(btrim(revoke_reason)) BETWEEN 10 AND 300),
  CONSTRAINT bans_revoked_check CHECK (
    (revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL) = (revoke_reason IS NULL)
  ),
  CONSTRAINT bans_revoked_by_check CHECK (revoked_by IS NULL OR revoked_by <> banned_by),
  CONSTRAINT bans_banned_by_check CHECK (banned_by <> user_id)
);

CREATE UNIQUE INDEX bans_active_user_uq ON bans (user_id) WHERE revoked_at IS NULL;

CREATE INDEX bans_user_idx ON bans (user_id, banned_at DESC);

CREATE TRIGGER bans_set_updated_at
  BEFORE UPDATE ON bans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE banned_identities
  ADD CONSTRAINT banned_identities_ban_ref_fkey FOREIGN KEY (ban_ref)
    REFERENCES bans (id) ON DELETE RESTRICT;
