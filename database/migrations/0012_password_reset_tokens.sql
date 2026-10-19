-- 0012_password_reset_tokens: tokens de recuperación de contraseña (spec 003, data-model.md §1;
-- RF-003-10, RF-003-11, RF-003-13).
-- Solo se guarda el SHA-256 del token; el token real solo viaja por correo (RF-003-11).
-- expires_at es la creación más 30 min (lo fija el backend). used_at se marca al usar el token y
-- también al pedir uno nuevo, de modo que un usuario tiene a lo sumo un token abierto (RF-003-13).

CREATE TABLE password_reset_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash),
  -- ON DELETE CASCADE: datos técnicos descartables sin valor histórico; misma excepción
  -- justificada que los tokens de verificación del celular.
  CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
);

-- Búsqueda de los tokens abiertos de un usuario para invalidarlos al pedir uno nuevo.
CREATE INDEX password_reset_open_idx ON password_reset_tokens (user_id) WHERE used_at IS NULL;

CREATE TRIGGER password_reset_tokens_set_updated_at
  BEFORE UPDATE ON password_reset_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
