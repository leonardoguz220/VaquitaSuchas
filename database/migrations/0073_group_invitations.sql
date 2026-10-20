-- 0073_group_invitations: invitaciones por correo a un grupo (spec 005, data-model.md §1;
-- RF-005-14). Buzón de salida: el backend inserta la fila y una tarea envía el correo con
-- reintentos. recipient_email es dato de un tercero: la limpieza borra la fila a los 30 días.
-- El límite de 10 invitaciones por hora por titular usa rate_limit_events (bucket invite:user).

CREATE TABLE group_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  recipient_email text NOT NULL,
  sent_at timestamptz NULL,
  status text NOT NULL DEFAULT 'pendiente',
  attempts smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_invitations_pkey PRIMARY KEY (id),
  CONSTRAINT group_invitations_group_id_fkey FOREIGN KEY (group_id)
    REFERENCES groups (id) ON DELETE RESTRICT,
  CONSTRAINT group_invitations_invited_by_fkey FOREIGN KEY (invited_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT group_invitations_recipient_email_check
    CHECK (recipient_email = lower(btrim(recipient_email))),
  CONSTRAINT group_invitations_status_check
    CHECK (status IN ('pendiente', 'enviada', 'fallida')),
  CONSTRAINT group_invitations_attempts_check CHECK (attempts >= 0)
);

-- Invitaciones pendientes que ya tocan, para la tarea de envío.
CREATE INDEX group_invitations_due_idx ON group_invitations (next_attempt_at)
  WHERE status = 'pendiente';

CREATE INDEX group_invitations_group_idx ON group_invitations (group_id, created_at DESC);

CREATE TRIGGER group_invitations_set_updated_at
  BEFORE UPDATE ON group_invitations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
