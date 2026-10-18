-- 0004_telegram_updates: deduplicación de las actualizaciones del bot de Telegram
-- (spec 000, RF-000-22, data-model.md §3, research.md R2).
-- Telegram puede reenviar una actualización; el webhook inserta con
-- ON CONFLICT (update_id) DO NOTHING y descarta las repetidas. La PK es el update_id natural.
-- Las filas de más de 7 días se limpian desde el backend.

CREATE TABLE telegram_updates (
  update_id   bigint      PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER telegram_updates_set_updated_at
  BEFORE UPDATE ON telegram_updates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
