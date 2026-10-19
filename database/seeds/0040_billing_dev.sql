-- 0040_billing_dev: ciclo regular y cobros de ejemplo para desarrollo (spec 002 T047; RF-002-01)
-- sobre el grupo DEVGRPAA de 0030_groups_dev.sql. Sin ese grupo no hace nada.
-- Cierra el ciclo inicial y emite el ciclo regular del mes en curso (corte el día 5) con un
-- cobro por miembro en cada estado no final: miembro1 'pendiente', miembro2 'en_revision' con
-- su comprobante vigente y miembro3 'atrasado', retirado del grupo por 'mora'.
-- Idempotente: el ciclo regular se crea solo si no existe.

DO $$
DECLARE
  v_group groups%ROWTYPE;
  v_m1 uuid := (SELECT id FROM users WHERE email = 'miembro1@dev.vaquita');
  v_m2 uuid := (SELECT id FROM users WHERE email = 'miembro2@dev.vaquita');
  v_m3 uuid := (SELECT id FROM users WHERE email = 'miembro3@dev.vaquita');
  v_cut date := date_trunc('month', now() AT TIME ZONE 'UTC')::date + 4;
  v_issued timestamptz := v_cut::timestamp AT TIME ZONE 'UTC' + interval '12 hours';
  v_due timestamptz := (v_cut + 4)::timestamp AT TIME ZONE 'UTC' + interval '4 hours';
  v_count integer;
  v_base bigint;
  v_cycle uuid;
  v_charge uuid;
  v_member uuid;
BEGIN
  SELECT * INTO v_group FROM groups WHERE invite_code = 'DEVGRPAA';
  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM billing_cycles WHERE group_id = v_group.id AND cycle_type = 'regular'
  ) THEN
    RETURN;
  END IF;

  UPDATE billing_cycles SET finalized_at = v_issued
   WHERE group_id = v_group.id AND cycle_type = 'inicial' AND finalized_at IS NULL;

  SELECT count(*) INTO v_count
    FROM group_members WHERE group_id = v_group.id AND left_at IS NULL;
  v_base := v_group.total_bs_cents / v_count;

  INSERT INTO billing_cycles (group_id, owner_id, period, cycle_type, cut_date, due_date,
                              issued_at, price_cents, currency, exchange_rate, total_bs_cents,
                              member_count, base_share_cents, owner_share_cents, remainder_cents,
                              finalized_at)
  VALUES (v_group.id, v_group.owner_id, to_char(v_cut, 'YYYY-MM'), 'regular', v_cut, v_cut + 3,
          v_issued, v_group.price_cents, v_group.currency, v_group.exchange_rate,
          v_group.total_bs_cents, v_count, v_base,
          v_group.total_bs_cents - v_base * (v_count - 1),
          v_group.total_bs_cents - v_base * v_count, v_issued)
  RETURNING id INTO v_cycle;

  FOREACH v_member IN ARRAY ARRAY[v_m1, v_m2, v_m3] LOOP
    INSERT INTO charges (group_id, user_id, cycle_id, period, origin, amount_cents, price_cents,
                         currency, exchange_rate, total_bs_cents, member_count, issued_at, due_at)
    VALUES (v_group.id, v_member, v_cycle, to_char(v_cut, 'YYYY-MM'), 'ciclo', v_base,
            v_group.price_cents, v_group.currency, v_group.exchange_rate,
            v_group.total_bs_cents, v_count, v_issued, v_due)
    RETURNING id INTO v_charge;

    IF v_member = v_m2 THEN
      UPDATE charges SET status = 'en_revision', first_submitted_at = v_issued + interval '1 day'
       WHERE id = v_charge;
      INSERT INTO receipts (charge_id, uploaded_by, uploaded_at, file_key, mime, size_bytes,
                            method, reference)
      VALUES (v_charge, v_member, v_issued + interval '1 day',
              format('receipts/%s/%s/dev.jpg', v_group.id, v_charge), 'image/jpeg', 1024, 'qr',
              'DEV-0001');
    ELSIF v_member = v_m3 THEN
      UPDATE charges SET status = 'atrasado' WHERE id = v_charge;
      UPDATE group_members SET left_at = v_due + interval '1 day', left_reason = 'mora'
       WHERE group_id = v_group.id AND user_id = v_member AND left_at IS NULL;
    END IF;
  END LOOP;
END;
$$;
