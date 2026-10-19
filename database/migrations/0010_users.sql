-- 0010_users: cuentas de usuario e identidad (spec 003, data-model.md §1; RF-003-02, RF-003-05,
-- RF-003-22, RN-003-01, RN-003-02, RN-003-03, CA-003-27).
-- La CI nunca se guarda en claro: ci_encrypted es AES-256-GCM y ci_fingerprint un HMAC de la CI
-- normalizada. email_fingerprint es un HMAC del correo canónico para el bloqueo por baneo (no único).
-- El estado de verificación no es un valor de status: se deduce de verified_at.

CREATE TABLE users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  email_fingerprint text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'usuario',
  status text NOT NULL DEFAULT 'activo',
  ci_encrypted bytea NOT NULL,
  ci_fingerprint text NOT NULL,
  phone_e164 text NULL,
  telegram_user_id bigint NULL,
  verified_at timestamptz NULL,
  data_policy_accepted_at timestamptz NOT NULL,
  data_policy_version text NOT NULL,
  session_version integer NOT NULL DEFAULT 0,
  last_login_at timestamptz NULL,
  -- Secreto de sondeo del registro (cambio aprobado 2026-10-18, PR #31): SHA-256 del secreto,
  -- vence a las 24 h y se marca como canjeado sin borrar el hash.
  registration_secret_hash text NULL,
  registration_secret_expires_at timestamptz NULL,
  registration_secret_redeemed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_email_key UNIQUE (email),
  CONSTRAINT users_ci_fingerprint_key UNIQUE (ci_fingerprint),
  CONSTRAINT users_phone_e164_key UNIQUE (phone_e164),
  CONSTRAINT users_telegram_user_id_key UNIQUE (telegram_user_id),
  CONSTRAINT users_registration_secret_hash_key UNIQUE (registration_secret_hash),
  CONSTRAINT users_full_name_check CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 80),
  CONSTRAINT users_email_check CHECK (email = lower(btrim(email))),
  CONSTRAINT users_role_check CHECK (role IN ('usuario', 'admin')),
  CONSTRAINT users_status_check CHECK (status IN ('activo', 'suspendido', 'baneado')),
  CONSTRAINT users_phone_e164_check CHECK (phone_e164 ~ '^\+591[67][0-9]{7}$'),
  CONSTRAINT users_session_version_check CHECK (session_version >= 0),
  CONSTRAINT users_registration_secret_pair CHECK (
    (registration_secret_hash IS NULL) = (registration_secret_expires_at IS NULL)
  ),
  -- Un usuario común verificado tiene celular y Telegram; el admin creado por comando puede no
  -- tenerlos (RN-003-03).
  CONSTRAINT users_verified_requires_identity CHECK (
    verified_at IS NULL OR role = 'admin' OR (phone_e164 IS NOT NULL AND telegram_user_id IS NOT NULL)
  )
);

-- Limpieza de cuentas sin verificar a las 24 h (tarea auth.purge_unverified).
CREATE INDEX users_unverified_idx ON users (created_at) WHERE verified_at IS NULL;

-- Revisión del bloqueo por correo al registrar (huella no única: varios alias de Gmail).
CREATE INDEX users_email_fingerprint_idx ON users (email_fingerprint);

-- Búsqueda de usuarios por nombre sin tildes ni mayúsculas desde administración (spec 009).
CREATE INDEX users_name_search_idx ON users (immutable_unaccent(lower(full_name)));

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
