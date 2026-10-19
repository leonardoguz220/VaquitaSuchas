-- 0072_notification_deliveries: buzón de salida por canal de cada notificación (spec 005,
-- data-model.md §1, partes B y C; RF-005-17, RF-005-20, RNF-005-01, RNF-005-03, RNF-005-04).
-- Una fila por notificación y canal. El backend la crea en la misma transacción que la
-- notificación y una tarea la envía de forma asíncrona, sin bloquear la operación del usuario.
-- respect_window = true: solo se envía entre 08:00 y 20:00 de La Paz (RNF-005-03).
-- Reintentos a los 5 min, 30 min y 2 h (RF-005-20): attempts 1, 2 y 3 programan next_attempt_at;
-- al cuarto fallo status = 'failed'. last_error no lleva datos personales.
-- skip_reason es obligatorio si y solo si status = 'skipped'. Sus valores los fija el backend
-- ('preferencia_desactivada', 'usuario_suspendido', 'telegram_bloqueado', 'correo_rebotado',
-- 'aviso_cancelado'); el modelo no los restringe con CHECK.
-- Que sent, failed y skipped no vuelvan a pending lo impone deliveries_no_resurrect (0074).
-- La FK a notifications es RESTRICT: la limpieza (RF-005-21) borra primero los envíos y luego la
-- notificación, en la misma transacción.

CREATE TABLE notification_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  respect_window boolean NOT NULL,
  attempts smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  sent_at timestamptz NULL,
  last_error text NULL,
  skip_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT notification_deliveries_notification_id_fkey FOREIGN KEY (notification_id)
    REFERENCES notifications (id) ON DELETE RESTRICT,
  CONSTRAINT notification_deliveries_notification_id_channel_key UNIQUE (notification_id, channel),
  CONSTRAINT notification_deliveries_channel_check CHECK (channel IN ('email', 'telegram')),
  CONSTRAINT notification_deliveries_status_check
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  CONSTRAINT notification_deliveries_attempts_check CHECK (attempts BETWEEN 0 AND 4),
  CONSTRAINT notification_deliveries_last_error_check CHECK (char_length(last_error) <= 200),
  CONSTRAINT notification_deliveries_skip_reason_check
    CHECK ((status = 'skipped') = (skip_reason IS NOT NULL))
);

-- Envíos pendientes que ya tocan, consultados por la tarea de entrega cada 5 minutos (RF-005-20).
CREATE INDEX notification_deliveries_due_idx ON notification_deliveries (next_attempt_at)
  WHERE status = 'pending';

CREATE TRIGGER notification_deliveries_set_updated_at
  BEFORE UPDATE ON notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
