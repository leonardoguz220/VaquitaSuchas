-- 0100_reports_dev: 12 meses de historial para el panel y los reportes (spec 006 T003) de
-- titular@dev.vaquita y miembro1@dev.vaquita. Crea DEVGRPDD con el ciclo inicial de hace 12 meses
-- y once ciclos regulares cerrados, con el cobro de miembro1 pagado en cada uno. Usa
-- pg_temp.dev_group y pg_temp.dev_join de 0030_groups_dev.sql, que corre antes en la misma
-- sesión. Sin los usuarios de desarrollo no hace nada. Idempotente: solo si no existe DEVGRPDD.

DO $$
DECLARE
  v_owner uuid := (SELECT id FROM users WHERE email = 'titular@dev.vaquita');
  v_m1 uuid := (SELECT id FROM users WHERE email = 'miembro1@dev.vaquita');
  v_first date := (date_trunc('month', now() AT TIME ZONE 'UTC') - interval '12 months')::date
                  + 14;
  v_group uuid;
  v_cycle uuid;
  v_charge uuid;
  v_cut date;
  v_issued timestamptz;
  v_total bigint;
  v_base bigint;
BEGIN
  IF v_owner IS NULL OR v_m1 IS NULL
     OR EXISTS (SELECT 1 FROM groups WHERE invite_code = 'DEVGRPDD') THEN
    RETURN;
  END IF;

  v_cycle := pg_temp.dev_group(v_owner, 'DEVGRPDD', 'Disney+ en casa', 'Disney+ (ejemplo)', 3501,
                               'BS', NULL, 4::smallint, v_first);
  SELECT group_id, total_bs_cents INTO v_group, v_total FROM billing_cycles WHERE id = v_cycle;
  PERFORM pg_temp.dev_join(v_group, v_cycle, v_m1, v_first - 4);
  UPDATE billing_cycles
     SET finalized_at = (v_first + interval '1 month')::timestamp AT TIME ZONE 'UTC'
   WHERE id = v_cycle;

  v_base := v_total / 2;
  FOR i IN 1..11 LOOP
    v_cut := (v_first + make_interval(months => i))::date;
    v_issued := v_cut::timestamp AT TIME ZONE 'UTC' + interval '12 hours';
    INSERT INTO billing_cycles (group_id, owner_id, period, cycle_type, cut_date, due_date,
                                issued_at, price_cents, currency, total_bs_cents, member_count,
                                base_share_cents, owner_share_cents, remainder_cents,
                                finalized_at)
    VALUES (v_group, v_owner, to_char(v_cut, 'YYYY-MM'), 'regular', v_cut, v_cut + 3, v_issued,
            v_total, 'BS', v_total, 2, v_base, v_total - v_base, v_total - v_base * 2, v_issued)
    RETURNING id INTO v_cycle;

    INSERT INTO charges (group_id, user_id, cycle_id, period, origin, amount_cents, price_cents,
                         currency, total_bs_cents, member_count, issued_at, due_at)
    VALUES (v_group, v_m1, v_cycle, to_char(v_cut, 'YYYY-MM'), 'ciclo', v_base, v_total, 'BS',
            v_total, 2, v_issued,
            (v_cut + 4)::timestamp AT TIME ZONE 'UTC' + interval '4 hours')
    RETURNING id INTO v_charge;
    UPDATE charges
       SET status = 'pagado', paid_at = v_issued + interval '1 day', settled_by = v_owner,
           settlement = 'manual'
     WHERE id = v_charge;
  END LOOP;
END;
$$;
