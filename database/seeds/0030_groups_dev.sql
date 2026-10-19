-- 0030_groups_dev: grupos de ejemplo para desarrollo (spec 001 T005; RF-001-01). Usa los usuarios
-- que crea `npm run seed:dev-users -w backend` (spec 003 T046), referenciados por correo: sin
-- ellos (base recién creada o producción, donde ese comando no corre) no hace nada. Después de
-- crearlos se vuelve a correr `npm run db:seed`.
--
-- DEVGRPAA: servicio en USD, titular y tres miembros (lleno salvo un cupo).
-- DEVGRPBB: servicio en Bs, titular y un miembro, con cupos libres.
-- Cada miembro entra como en la aplicación (spec 010): solicitud abierta, datos de pago,
-- aceptada en efectivo con su cobro de ingreso pagado en el ciclo inicial, y fila en
-- group_members. El ciclo inicial queda abierto y se recalcula con cada ingreso.
-- Idempotente: cada grupo se crea solo si no existe su código de invitación.

-- Ingreso de un miembro al grupo por el flujo de solicitudes. Solo vive en esta sesión.
CREATE OR REPLACE FUNCTION pg_temp.dev_join(p_group uuid, p_cycle uuid, p_applicant uuid, p_at timestamptz)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_cycle billing_cycles%ROWTYPE;
  v_owner uuid;
  v_count integer;
  v_request uuid;
  v_charge uuid;
  v_base bigint;
BEGIN
  SELECT * INTO v_cycle FROM billing_cycles WHERE id = p_cycle;
  SELECT owner_id INTO v_owner FROM groups WHERE id = p_group;
  SELECT count(*) + 1 INTO v_count
    FROM group_members WHERE group_id = p_group AND left_at IS NULL;

  INSERT INTO join_requests (group_id, applicant_id, opened_at, open_deadline_at)
  VALUES (p_group, p_applicant, p_at, p_at + interval '24 hours')
  RETURNING id INTO v_request;

  UPDATE join_requests
     SET status = 'esperando_pago',
         quote_amount_cents = v_cycle.total_bs_cents / v_count,
         quote_price_cents = v_cycle.price_cents,
         quote_currency = v_cycle.currency,
         quote_exchange_rate = v_cycle.exchange_rate,
         quote_total_bs_cents = v_cycle.total_bs_cents,
         quote_member_count = v_count,
         payment_text = 'Cuenta ficticia de desarrollo 000-000-000',
         payment_sent_at = p_at + interval '1 hour',
         pay_deadline_at = p_at + interval '1 hour 15 minutes'
   WHERE id = v_request;

  INSERT INTO charges (group_id, user_id, cycle_id, period, origin, join_request_id, status,
                       amount_cents, price_cents, currency, exchange_rate, total_bs_cents,
                       member_count, issued_at, due_at, paid_at, settled_by, settlement)
  VALUES (p_group, p_applicant, p_cycle, v_cycle.period, 'ingreso', v_request, 'pagado',
          v_cycle.total_bs_cents / v_count, v_cycle.price_cents, v_cycle.currency,
          v_cycle.exchange_rate, v_cycle.total_bs_cents, v_count, p_at + interval '1 hour',
          p_at + interval '1 hour', p_at + interval '1 hour 10 minutes', v_owner, 'ingreso')
  RETURNING id INTO v_charge;

  UPDATE join_requests
     SET status = 'aceptada', final_at = p_at + interval '1 hour 10 minutes',
         final_reason = 'efectivo', accepted_method = 'efectivo', decided_by = v_owner,
         charge_id = v_charge
   WHERE id = v_request;

  INSERT INTO group_members (group_id, user_id, role, join_source, join_request_id, joined_at)
  VALUES (p_group, p_applicant, 'miembro', 'solicitud', v_request,
          p_at + interval '1 hour 10 minutes');

  v_base := v_cycle.total_bs_cents / v_count;
  UPDATE billing_cycles
     SET member_count = v_count,
         base_share_cents = v_base,
         owner_share_cents = v_cycle.total_bs_cents - v_base * (v_count - 1),
         remainder_cents = v_cycle.total_bs_cents - v_base * v_count
   WHERE id = p_cycle;
END;
$$;

-- Grupo con su titular y su ciclo inicial abierto (una persona). Devuelve el ciclo.
CREATE OR REPLACE FUNCTION pg_temp.dev_group(
  p_owner uuid, p_code text, p_name text, p_service text, p_price bigint, p_currency text,
  p_rate numeric, p_slots smallint, p_cut date
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_group uuid;
  v_cycle uuid;
  v_total bigint;
BEGIN
  INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency, exchange_rate,
                      billing_day, total_slots, invite_code, payment_info_text, created_at)
  VALUES (p_owner, p_name, p_service, p_price, p_currency, p_rate,
          extract(day FROM p_cut)::smallint, p_slots, p_code,
          'Cuenta ficticia de desarrollo 000-000-000', p_cut - 5)
  RETURNING id, total_bs_cents INTO v_group, v_total;

  INSERT INTO group_members (group_id, user_id, role, join_source, joined_at)
  VALUES (v_group, p_owner, 'titular', 'creacion', p_cut - 5);

  INSERT INTO billing_cycles (group_id, owner_id, period, cycle_type, cut_date, due_date,
                              issued_at, price_cents, currency, exchange_rate, total_bs_cents,
                              member_count, base_share_cents, owner_share_cents, remainder_cents)
  VALUES (v_group, p_owner, to_char(p_cut, 'YYYY-MM'), 'inicial', p_cut, p_cut + 3,
          (p_cut - 5)::timestamp AT TIME ZONE 'UTC' + interval '12 hours', p_price, p_currency,
          p_rate, v_total, 1, v_total, v_total, 0)
  RETURNING id INTO v_cycle;
  RETURN v_cycle;
END;
$$;

DO $$
DECLARE
  v_owner uuid := (SELECT id FROM users WHERE email = 'titular@dev.vaquita');
  v_m1 uuid := (SELECT id FROM users WHERE email = 'miembro1@dev.vaquita');
  v_m2 uuid := (SELECT id FROM users WHERE email = 'miembro2@dev.vaquita');
  v_m3 uuid := (SELECT id FROM users WHERE email = 'miembro3@dev.vaquita');
  -- Corte del ciclo inicial: día 5 del mes anterior.
  v_cut date := (date_trunc('month', now() AT TIME ZONE 'UTC') - interval '1 month')::date + 4;
  v_group uuid;
  v_cycle uuid;
BEGIN
  IF v_owner IS NULL OR v_m1 IS NULL OR v_m2 IS NULL OR v_m3 IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM groups WHERE invite_code = 'DEVGRPAA') THEN
    v_cycle := pg_temp.dev_group(v_owner, 'DEVGRPAA', 'Netflix de la familia',
                                 'Netflix (ejemplo)', 2299, 'USD', 6.96, 5::smallint, v_cut);
    SELECT group_id INTO v_group FROM billing_cycles WHERE id = v_cycle;
    PERFORM pg_temp.dev_join(v_group, v_cycle, v_m1, v_cut - 4);
    PERFORM pg_temp.dev_join(v_group, v_cycle, v_m2, v_cut - 3);
    PERFORM pg_temp.dev_join(v_group, v_cycle, v_m3, v_cut - 2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM groups WHERE invite_code = 'DEVGRPBB') THEN
    v_cycle := pg_temp.dev_group(v_owner, 'DEVGRPBB', 'Spotify del depa',
                                 'Spotify (ejemplo)', 4500, 'BS', NULL, 6::smallint, v_cut);
    SELECT group_id INTO v_group FROM billing_cycles WHERE id = v_cycle;
    PERFORM pg_temp.dev_join(v_group, v_cycle, v_m1, v_cut - 4);
  END IF;
END;
$$;
