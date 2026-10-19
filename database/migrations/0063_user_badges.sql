-- 0063_user_badges: insignias obtenidas (spec 007, data-model.md §2; RF-007-06, RF-007-07,
-- RF-007-08). Una insignia obtenida se conserva aunque la racha vuelva a 0: una fila por usuario
-- y código. El avance hacia las que faltan se calcula al consultar.

CREATE TABLE user_badges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_code text NOT NULL,
  earned_at timestamptz NOT NULL,
  source_charge_id uuid NULL,
  rules_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_badges_pkey PRIMARY KEY (id),
  CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT user_badges_source_charge_id_fkey FOREIGN KEY (source_charge_id)
    REFERENCES charges (id) ON DELETE RESTRICT,
  CONSTRAINT user_badges_user_id_badge_code_key UNIQUE (user_id, badge_code),
  CONSTRAINT user_badges_badge_code_check CHECK (badge_code IN ('primer_pago', 'racha_3',
    'racha_6', 'racha_12', 'sin_atrasos_6m', 'grupo_completo'))
);

CREATE TRIGGER user_badges_set_updated_at
  BEFORE UPDATE ON user_badges
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
