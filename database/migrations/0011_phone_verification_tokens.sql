-- 0011_phone_verification_tokens: un token de un solo uso por intento de verificación del celular
-- con el bot de Telegram (spec 003, data-model.md §1; RF-003-21).
-- token_hash es el SHA-256 del token que va en el enlace al bot (el token real no se guarda) y
-- requested_ip_hash un HMAC de la IP (la IP no se guarda). expires_at = creación + 10 min.
-- La FK a users borra en cascada: excepción justificada a la regla de RESTRICT porque son datos
-- técnicos descartables de una cuenta que no se completó (data-model.md §1).

CREATE TABLE phone_verification_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  purpose text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  started_at timestamptz NULL,
  started_by_telegram_id bigint NULL,
  used_at timestamptz NULL,
  outcome text NULL,
  requested_ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT phone_verification_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT phone_verification_tokens_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT phone_verification_tokens_token_hash_key UNIQUE (token_hash),
  CONSTRAINT phone_verification_tokens_purpose_check CHECK (purpose IN ('registro', 'cambio_celular')),
  CONSTRAINT phone_verification_tokens_outcome_check CHECK (
    outcome IS NULL OR outcome IN (
      'verificado',
      'rechazado_no_boliviano',
      'rechazado_contacto_ajeno',
      'rechazado_duplicado',
      'rechazado_bloqueado'
    )
  )
);

-- Último token de un usuario (reenvío y estado de la verificación).
CREATE INDEX phone_tokens_user_idx ON phone_verification_tokens (user_id, created_at DESC);

-- Buscar el token abierto de la cuenta de Telegram que pulsó Iniciar al compartir el contacto.
CREATE INDEX phone_tokens_started_idx ON phone_verification_tokens (started_by_telegram_id)
  WHERE used_at IS NULL AND started_at IS NOT NULL;

CREATE TRIGGER phone_verification_tokens_set_updated_at
  BEFORE UPDATE ON phone_verification_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
