-- 0031_group_members: estadías de las personas en un grupo (spec 001, data-model.md §1; RN-001-01,
-- RN-001-05, RF-001-19). Una fila por estadía; el titular tiene una fila con role = 'titular'.
-- Volver al grupo es una fila nueva. Un cierre de grupo no cierra las filas (RF-001-18): left_at
-- solo se llena por abandono, expulsión, mora o baneo.
-- La FK de join_request_id a join_requests y su CHECK ligado a join_source los agrega la spec 010.
-- Los disparadores de capacidad, titular y estadía inmutable van en 0032_group_triggers.sql.

CREATE TABLE group_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  join_source text NOT NULL,
  join_request_id uuid NULL,
  left_at timestamptz NULL,
  left_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_members_pkey PRIMARY KEY (id),
  CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id)
    REFERENCES groups (id) ON DELETE RESTRICT,
  CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT group_members_role_check CHECK (role IN ('titular', 'miembro')),
  CONSTRAINT group_members_join_source_check CHECK (join_source IN ('creacion', 'solicitud')),
  CONSTRAINT group_members_left_reason_check
    CHECK (left_reason IN ('abandono', 'quitado', 'mora', 'baneo')),
  CONSTRAINT group_members_left_at_check CHECK ((left_at IS NULL) = (left_reason IS NULL))
);

-- Una sola estadía activa por persona y grupo (RN-001-05).
CREATE UNIQUE INDEX group_members_active_uq
  ON group_members (group_id, user_id) WHERE left_at IS NULL;

-- Un solo titular activo por grupo (RN-001-01).
CREATE UNIQUE INDEX group_members_owner_uq
  ON group_members (group_id) WHERE role = 'titular' AND left_at IS NULL;

-- "Mis grupos" como miembro (RF-001-19).
CREATE INDEX group_members_user_idx ON group_members (user_id) WHERE left_at IS NULL;

-- Miembros activos de un grupo (cuotas, ranking, cobros).
CREATE INDEX group_members_group_active_idx ON group_members (group_id) WHERE left_at IS NULL;

CREATE TRIGGER group_members_set_updated_at
  BEFORE UPDATE ON group_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
