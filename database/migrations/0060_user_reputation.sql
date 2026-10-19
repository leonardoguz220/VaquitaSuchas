-- 0060_user_reputation: calificación de puntualidad de cada usuario
-- (spec 007, data-model.md §1 y §2; RF-007-01, RF-007-02, RF-007-03, RF-007-05, RN-007-07).
-- Es una copia de lectura recalculable desde los cobros (spec 002), que son la fuente de verdad
-- (RNF-007-02): el backend la actualiza en la misma transacción que cambia un cobro y la verifica
-- con una reconciliación diaria. La habilitación de titulares no la lee: calcula en el momento.
-- La calificación exacta (5 × puntuales / considerados) no se guarda; las estrellas mostradas van
-- en medias estrellas enteras (9 = 4,5) y NULL significa "Nuevo". La PK es el user_id.

CREATE TABLE user_reputation (
  user_id uuid NOT NULL,
  considered_count integer NOT NULL,
  punctual_count integer NOT NULL,
  late_count integer NOT NULL,
  displayed_half_stars smallint NULL,
  level text NOT NULL,
  current_streak integer NOT NULL,
  rules_version integer NOT NULL,
  computed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_reputation_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_reputation_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT user_reputation_considered_count_check CHECK (considered_count >= 0),
  CONSTRAINT user_reputation_punctual_count_check CHECK (
    punctual_count BETWEEN 0 AND considered_count
  ),
  CONSTRAINT user_reputation_counts_check CHECK (
    punctual_count + late_count = considered_count
  ),
  CONSTRAINT user_reputation_displayed_half_stars_check CHECK (
    displayed_half_stars BETWEEN 0 AND 10
  ),
  CONSTRAINT user_reputation_level_check CHECK (
    level IN ('Nuevo', 'En riesgo', 'Regular', 'Bueno', 'Excelente')
  ),
  CONSTRAINT user_reputation_current_streak_check CHECK (current_streak >= 0),
  -- Menos de 3 cobros considerados = "Nuevo" (RF-007-02).
  CONSTRAINT user_reputation_new_level_check CHECK ((level = 'Nuevo') = (considered_count < 3)),
  -- "Nuevo" no tiene estrellas, y todo otro nivel sí.
  CONSTRAINT user_reputation_new_no_stars_check CHECK (
    (level = 'Nuevo') = (displayed_half_stars IS NULL)
  )
);

CREATE TRIGGER user_reputation_set_updated_at
  BEFORE UPDATE ON user_reputation
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
