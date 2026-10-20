-- 0052_join_messages: chat de cada solicitud de ingreso y marca de lectura por participante
-- (spec 010, data-model.md §1 `join_messages` y `join_request_reads` con el ajuste H2;
-- RF-010-05 a RF-010-10, CA-010-21, CA-010-23, CA-010-44).
-- El chat lo ven solo el solicitante y el titular; quién puede escribir lo decide el backend.
-- La imagen vive en el almacén privado (Supabase Storage); aquí solo su clave.

CREATE TABLE join_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  -- Orden estable de los mensajes (RF-010-06); también lo usa el contador de no leídos.
  seq bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
  request_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  body text NULL,
  image_key text NULL,
  image_mime text NULL,
  image_size_bytes integer NULL,
  -- Hora del servidor. Los mensajes no se editan: updated_at queda igual a created_at.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT join_messages_pkey PRIMARY KEY (id),
  CONSTRAINT join_messages_request_id_fkey FOREIGN KEY (request_id)
    REFERENCES join_requests (id) ON DELETE RESTRICT,
  CONSTRAINT join_messages_sender_id_fkey FOREIGN KEY (sender_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  -- CA-010-21: de 1 a 1000 caracteres.
  CONSTRAINT join_messages_body_check CHECK (char_length(body) BETWEEN 1 AND 1000),
  -- Solo imagen JPEG o PNG.
  CONSTRAINT join_messages_image_mime_check CHECK (image_mime IN ('image/jpeg', 'image/png')),
  -- De 1 byte a 5 MB.
  CONSTRAINT join_messages_image_size_bytes_check
    CHECK (image_size_bytes BETWEEN 1 AND 5242880),
  -- Un mensaje lleva texto, imagen o ambos.
  CONSTRAINT join_messages_content_check CHECK (body IS NOT NULL OR image_key IS NOT NULL),
  -- La clave y el tipo de la imagen van juntos.
  CONSTRAINT join_messages_image_check CHECK ((image_key IS NULL) = (image_mime IS NULL))
);

CREATE UNIQUE INDEX join_messages_seq_uq ON join_messages (seq);

-- Mensajes de una solicitud en orden y contador de no leídos.
CREATE INDEX join_messages_request_idx ON join_messages (request_id, seq);

-- ---------------------------------------------------------------------------------------------
-- join_messages_no_update y join_messages_guard_delete (data-model.md §1; CA-010-23, CA-010-44)
-- Un mensaje no se edita nunca. Solo lo borra la limpieza por retención (2 meses, RNF-010-09),
-- que declara SET LOCAL vaquita.allow_purge = 'on' en su transacción (solo RetentionService).
-- Así ni un error de programación ni una ruta de la API pueden borrar evidencia.
-- current_setting(..., true) devuelve NULL si la variable no existe, y NULL no es 'on'.
-- restrict_violation (23001), como forbid_update_delete() en 0001.
-- Orden de los BEFORE UPDATE (alfabético): join_messages_no_update corre antes que
-- join_messages_set_updated_at y bloquea la operación.

CREATE FUNCTION join_messages_forbid_update() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'join message cannot change'
    USING DETAIL = format('join message %s', OLD.id),
          ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER join_messages_no_update
  BEFORE UPDATE ON join_messages
  FOR EACH ROW EXECUTE FUNCTION join_messages_forbid_update();

CREATE FUNCTION join_messages_forbid_delete_unless_purge() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('vaquita.allow_purge', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'join message can only be deleted by retention purge'
      USING DETAIL = format('join message %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER join_messages_guard_delete
  BEFORE DELETE ON join_messages
  FOR EACH ROW EXECUTE FUNCTION join_messages_forbid_delete_unless_purge();

-- Como UPDATE está prohibido, este disparador nunca llega a cambiar nada; se deja por la
-- convención del modelo (toda tabla mantiene updated_at con set_updated_at).
CREATE TRIGGER join_messages_set_updated_at
  BEFORE UPDATE ON join_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- join_request_reads: último mensaje leído por cada participante de la solicitud (RF-010-09).
-- No leídos: COUNT(*) FROM join_messages
--   WHERE request_id = $1 AND seq > last_read_seq AND sender_id <> $user.

CREATE TABLE join_request_reads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  user_id uuid NOT NULL,
  last_read_seq bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT join_request_reads_pkey PRIMARY KEY (id),
  CONSTRAINT join_request_reads_request_id_fkey FOREIGN KEY (request_id)
    REFERENCES join_requests (id) ON DELETE RESTRICT,
  CONSTRAINT join_request_reads_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  -- Una fila por participante y solicitud.
  CONSTRAINT join_request_reads_request_id_user_id_key UNIQUE (request_id, user_id)
);

CREATE TRIGGER join_request_reads_set_updated_at
  BEFORE UPDATE ON join_request_reads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
