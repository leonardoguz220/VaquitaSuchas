-- 0013_banned_identities: huellas irreversibles de los datos de cuentas baneadas
-- (spec 003, RF-003-19, CA-003-24, data-model.md §1).
-- fingerprint = HMAC-SHA256(clave del servidor, 'kind:valor normalizado'), calculada en el backend.
-- Ninguna columna guarda el correo, el celular, la CI ni el Telegram en claro (CA-003-24).
-- No es de solo anexado: revertir un baneo (spec 009, RF-009-23) borra las filas con ese ban_ref.
-- La consulta "¿está bloqueado este dato?" usa el índice de banned_identities_kind_fingerprint_key.

CREATE TABLE banned_identities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  fingerprint text NOT NULL,
  -- Id del baneo. La FK a bans (id) la agrega la spec 009 en la migración 0090.
  ban_ref uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT banned_identities_pkey PRIMARY KEY (id),
  CONSTRAINT banned_identities_kind_check CHECK (kind IN ('email', 'phone', 'ci', 'telegram')),
  CONSTRAINT banned_identities_kind_fingerprint_key UNIQUE (kind, fingerprint)
);

CREATE TRIGGER banned_identities_set_updated_at
  BEFORE UPDATE ON banned_identities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
