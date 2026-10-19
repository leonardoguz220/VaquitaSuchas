-- 0071_notification_preferences: preferencias de aviso por usuario, una fila por persona (spec 005,
-- data-model.md §1, parte B; RF-005-17, RF-005-27, RF-005-28). La spec 003 reservó este número.
-- La PK es user_id (clave natural definida por el modelo). Un interruptor por canal (correo y
-- Telegram) y categoría; todos nacen encendidos. La fila la crea el backend con los valores por
-- defecto al verificar el celular o en el primer acceso. Los correos de seguridad (spec 003) no
-- pasan por estas preferencias.
-- telegram_blocked_at: el usuario bloqueó el bot; desactiva Telegram hasta que lo reactive.
-- email_bounced_at: rebote permanente del correo; se deja de enviar.

CREATE TABLE notification_preferences (
  user_id uuid NOT NULL,
  email_recordatorios boolean NOT NULL DEFAULT true,
  email_resoluciones boolean NOT NULL DEFAULT true,
  email_titular boolean NOT NULL DEFAULT true,
  email_grupo boolean NOT NULL DEFAULT true,
  telegram_recordatorios boolean NOT NULL DEFAULT true,
  telegram_resoluciones boolean NOT NULL DEFAULT true,
  telegram_titular boolean NOT NULL DEFAULT true,
  telegram_grupo boolean NOT NULL DEFAULT true,
  telegram_blocked_at timestamptz NULL,
  email_bounced_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id),
  CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT
);

CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
