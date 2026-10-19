-- 0070_notifications: notificaciones dentro de la app, una fila por persona y aviso (spec 005,
-- data-model.md §1, parte A del MVP; RF-005-01, RF-005-02, RF-005-21, RNF-005-01, RNF-005-02).
-- type es el código del aviso (catálogo en plan.md §5). dedupe_key combina tipo, entidad, período
-- y n.º de recordatorio (y el destinatario si una entidad avisa a varias personas): repetir una
-- tarea no duplica avisos. entity_type/entity_id permiten cancelar los avisos pendientes de un
-- cobro o grupo (RN-005-02). La limpieza a los 90 días la hace una tarea del backend con DELETE.

CREATE TABLE notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  link text NULL,
  entity_type text NULL,
  entity_id uuid NULL,
  dedupe_key text NOT NULL,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT notifications_dedupe_key_key UNIQUE (dedupe_key),
  CONSTRAINT notifications_category_check
    CHECK (category IN ('recordatorios', 'resoluciones', 'titular', 'grupo')),
  CONSTRAINT notifications_title_check CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT notifications_body_check CHECK (char_length(body) <= 500),
  -- Solo rutas internas de la app (/cobros/<id>): nada de enlaces externos ni //host (RNF-005-02).
  CONSTRAINT notifications_link_check CHECK (link ~ '^/[^/]')
);

-- Lista paginada de notificaciones de un usuario, de la más reciente a la más antigua (RF-005-01).
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

-- Contador de no leídas de la campana (RF-005-02).
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- Cancelar los avisos pendientes de un cobro pagado o cancelado, o de un grupo (RN-005-02).
CREATE INDEX notifications_entity_idx ON notifications (entity_type, entity_id);

-- Limpieza de las notificaciones de más de 90 días (RF-005-21).
CREATE INDEX notifications_purge_idx ON notifications (created_at);

-- El contenido de una notificación no cambia: solo se marca o desmarca read_at (y updated_at lo
-- mantiene set_updated_at). data-model.md §1 lo lista en 0074_notification_triggers, pero va aquí
-- porque la parte A (MVP, T002) lo necesita sin esperar a las partes B y C.
-- ERRCODE restrict_violation (23001), como forbid_update_delete().
CREATE FUNCTION notifications_forbid_content_update() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.link IS DISTINCT FROM OLD.link
     OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'notification content is immutable'
      USING DETAIL = 'only read_at can change',
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Los disparadores BEFORE corren en orden alfabético: ..._immutable_content antes que
-- ..._set_updated_at.
CREATE TRIGGER notifications_immutable_content
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION notifications_forbid_content_update();

CREATE TRIGGER notifications_set_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
