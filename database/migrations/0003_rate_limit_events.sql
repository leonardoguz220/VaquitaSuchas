-- 0003_rate_limit_events: eventos para límites por ventana de tiempo (spec 000, RF-000-07,
-- data-model.md §3). Los usan login, recuperación de contraseña, tokens de Telegram, códigos de
-- invitación, chat y registro por IP. El backend cuenta eventos con occurred_at > now() - ventana.
-- Es de solo anexado: la limpieza de eventos de más de 24 horas la hace maintenance.cleanup con un
-- rol que tiene permiso (spec 000, T033 de backend).

CREATE TABLE rate_limit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Tipo de límite, p. ej. 'login_fail:email', 'login_fail:ip', 'reset:email', 'tg_token:ip'.
  bucket text NOT NULL,
  -- HMAC-SHA256(clave del servidor, valor) en hex: nunca se guarda el correo ni la IP.
  key_hash text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Refuerzo del modelo: un bucket vacío no identifica ningún límite.
  CONSTRAINT rate_limit_events_bucket_check CHECK (bucket <> ''),
  -- Refuerzo del modelo: solo se acepta un HMAC-SHA256 en hex minúsculas (digest('hex') de Node,
  -- mismo formato que las huellas de la spec 003), de modo que un valor en claro no se puede guardar.
  CONSTRAINT rate_limit_events_key_hash_check CHECK (key_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX rate_limit_events_lookup_idx
  ON rate_limit_events (bucket, key_hash, occurred_at DESC);

-- Solo anexado. Los BEFORE triggers se disparan en orden alfabético de nombre, así que
-- ..._forbid_update_delete corre antes que ..._set_updated_at y bloquea la operación.
CREATE TRIGGER rate_limit_events_forbid_update_delete
  BEFORE UPDATE OR DELETE ON rate_limit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- Como UPDATE está prohibido, este disparador nunca llega a cambiar nada; se deja por la
-- convención del modelo (toda tabla mantiene updated_at con set_updated_at).
CREATE TRIGGER rate_limit_events_set_updated_at
  BEFORE UPDATE ON rate_limit_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
