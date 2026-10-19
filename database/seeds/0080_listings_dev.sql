-- 0080_listings_dev: publicaciones de cupos libres de ejemplo para desarrollo (spec 008 T004)
-- sobre los grupos DEVGRPAA, DEVGRPBB y DEVGRPCC de 0030 y 0050. Sin ellos no hace nada.
--   DEVGRPBB: 'activa' (2 cupos).
--   DEVGRPCC: 'oculta' tras tres reportes de usuarios distintos (RF-008-18).
--   DEVGRPAA: 'expirada' (1 cupo).
-- Idempotente: se crean solo si el grupo no tiene ninguna publicación.

DO $$
DECLARE
  v_aa uuid := (SELECT id FROM groups WHERE invite_code = 'DEVGRPAA');
  v_bb uuid := (SELECT id FROM groups WHERE invite_code = 'DEVGRPBB');
  v_cc uuid := (SELECT id FROM groups WHERE invite_code = 'DEVGRPCC');
  v_now timestamptz := date_trunc('hour', now());
  v_listing uuid;
BEGIN
  IF v_aa IS NULL OR v_bb IS NULL OR v_cc IS NULL
     OR EXISTS (SELECT 1 FROM listings WHERE group_id IN (v_aa, v_bb, v_cc)) THEN
    RETURN;
  END IF;

  INSERT INTO listings (group_id, slots_offered, description, conditions, published_at,
                        expires_at)
  VALUES (v_bb, 2, 'Plan familiar con cupos libres para el depa.',
          'Pago puntual el día de corte.', v_now - interval '2 days',
          v_now - interval '2 days' + interval '30 days');

  INSERT INTO listings (group_id, slots_offered, description, published_at, expires_at)
  VALUES (v_cc, 2, 'Cupo en YouTube Premium.', v_now - interval '5 days',
          v_now - interval '5 days' + interval '30 days')
  RETURNING id INTO v_listing;
  INSERT INTO listing_reports (listing_id, reporter_id, reason, comment)
  SELECT v_listing, u.id, r.reason, r.comment
    FROM (VALUES ('titular@dev.vaquita', 'spam', NULL),
                 ('miembro2@dev.vaquita', 'datos_falsos', 'El precio no coincide con el plan.'),
                 ('miembro3@dev.vaquita', 'otro', NULL)) AS r (email, reason, comment)
    JOIN users u ON u.email = r.email;
  UPDATE listings SET status = 'oculta', hidden_at = v_now - interval '1 day'
   WHERE id = v_listing;

  INSERT INTO listings (group_id, slots_offered, description, published_at, expires_at)
  VALUES (v_aa, 1, 'Un cupo en Netflix familiar.', v_now - interval '40 days',
          v_now - interval '10 days')
  RETURNING id INTO v_listing;
  UPDATE listings SET status = 'expirada' WHERE id = v_listing;
END;
$$;
