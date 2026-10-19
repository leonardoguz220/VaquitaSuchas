-- 0080_listings: publicaciones de cupos libres de un grupo (spec 008, data-model.md §1; RF-008-01,
-- RF-008-02, RF-008-05, RF-008-14, RF-008-18, RN-008-07, RNF-008-02). El titular no se guarda:
-- es el titular actual del grupo. La cuota estimada y los cupos disponibles se calculan al
-- consultar. retirada y cerrada son finales; expirada no bloquea otra publicación del grupo.
-- end_reason: 'titular' | 'moderacion' | 'cupos_completos' | 'grupo_lleno' | 'grupo_cerrado' |
-- 'grupo_congelado' (sin CHECK IN: el modelo solo exige que exista en los estados finales).
-- Transiciones, grupo abierto y cupos libres los imponen los disparadores de 0082.

CREATE TABLE listings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  slots_offered smallint NOT NULL,
  description text NULL,
  conditions text NULL,
  status text NOT NULL DEFAULT 'activa',
  published_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  renewed_at timestamptz NULL,
  hidden_at timestamptz NULL,
  moderation_cleared_at timestamptz NULL,
  ended_at timestamptz NULL,
  end_reason text NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listings_pkey PRIMARY KEY (id),
  CONSTRAINT listings_group_id_fkey FOREIGN KEY (group_id)
    REFERENCES groups (id) ON DELETE RESTRICT,
  CONSTRAINT listings_slots_offered_check CHECK (slots_offered BETWEEN 0 AND 19),
  CONSTRAINT listings_slots_offered_open_check CHECK (status = 'cerrada' OR slots_offered >= 1),
  CONSTRAINT listings_description_check
    CHECK (description IS NULL OR char_length(description) <= 300),
  CONSTRAINT listings_conditions_check
    CHECK (conditions IS NULL OR char_length(conditions) <= 300),
  CONSTRAINT listings_status_check
    CHECK (status IN ('activa', 'oculta', 'expirada', 'retirada', 'cerrada')),
  CONSTRAINT listings_ended_check CHECK (
    (status IN ('retirada', 'cerrada')) = (ended_at IS NOT NULL AND end_reason IS NOT NULL)
  ),
  CONSTRAINT listings_hidden_at_check CHECK ((status = 'oculta') = (hidden_at IS NOT NULL)),
  CONSTRAINT listings_expires_at_check CHECK (expires_at > published_at)
);

-- Una sola publicación activa u oculta por grupo (RF-008-02, CA-008-03).
CREATE UNIQUE INDEX listings_group_active_uq ON listings (group_id)
  WHERE status IN ('activa', 'oculta');

-- Búsqueda y vencimiento diario (RNF-008-02).
CREATE INDEX listings_search_idx ON listings (expires_at) WHERE status = 'activa';

CREATE INDEX listings_group_idx ON listings (group_id, created_at DESC);

CREATE TRIGGER listings_set_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
