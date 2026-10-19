-- 0050_join_requests_dev: solicitudes de ingreso de ejemplo para desarrollo (spec 010 T007) sobre
-- los usuarios de seed:dev-users y el grupo DEVGRPBB de 0030_groups_dev.sql. Sin ellos no hace
-- nada. Crea además DEVGRPCC (titular miembro1) para tener solicitantes que no son miembros.
--   DEVGRPBB: miembro2 'abierta' y miembro3 'esperando_pago', con chat.
--   DEVGRPCC: miembro2 'pago_informado' con chat, y miembro3 'rechazada' tras informar el pago,
--             con un reclamo 'pago_sin_ingreso' abierto (un reclamo solo existe sobre una
--             solicitud final, M7).
-- Idempotente: todo se crea solo si no existe DEVGRPCC.

-- Solicitud llevada por el camino válido de RN-010-05 hasta p_status. Solo vive en esta sesión.
CREATE OR REPLACE FUNCTION pg_temp.dev_request(
  p_group uuid, p_applicant uuid, p_status text, p_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_group groups%ROWTYPE;
  v_count integer;
  v_request uuid;
BEGIN
  SELECT * INTO v_group FROM groups WHERE id = p_group;
  SELECT count(*) + 1 INTO v_count
    FROM group_members WHERE group_id = p_group AND left_at IS NULL;

  INSERT INTO join_requests (group_id, applicant_id, opened_at, open_deadline_at)
  VALUES (p_group, p_applicant, p_at, p_at + interval '24 hours')
  RETURNING id INTO v_request;

  IF p_status = 'abierta' THEN
    RETURN v_request;
  END IF;

  UPDATE join_requests
     SET status = 'esperando_pago',
         quote_amount_cents = v_group.total_bs_cents / v_count,
         quote_price_cents = v_group.price_cents,
         quote_currency = v_group.currency,
         quote_exchange_rate = v_group.exchange_rate,
         quote_total_bs_cents = v_group.total_bs_cents,
         quote_member_count = v_count,
         payment_text = 'Cuenta ficticia de desarrollo 000-000-000',
         payment_sent_at = p_at + interval '10 minutes',
         pay_deadline_at = p_at + interval '25 minutes'
   WHERE id = v_request;

  IF p_status = 'esperando_pago' THEN
    RETURN v_request;
  END IF;

  UPDATE join_requests
     SET status = 'pago_informado',
         proof_key = format('join-requests/%s/dev.jpg', v_request),
         proof_mime = 'image/jpeg',
         proof_size_bytes = 1024,
         proof_method = 'qr',
         proof_reference = format('DEV-%s', left(v_request::text, 8)),
         proof_uploaded_at = p_at + interval '20 minutes',
         decision_deadline_at = p_at + interval '80 minutes'
   WHERE id = v_request;

  IF p_status = 'rechazada' THEN
    UPDATE join_requests
       SET status = 'rechazada', final_at = p_at + interval '1 hour',
           final_reason = 'rechazo_titular', reject_reason = 'No veo el pago en mi cuenta',
           decided_by = v_group.owner_id
     WHERE id = v_request;
  END IF;
  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.dev_chat(p_request uuid, p_at timestamptz) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_applicant uuid;
  v_owner uuid;
BEGIN
  SELECT r.applicant_id, g.owner_id INTO v_applicant, v_owner
    FROM join_requests r JOIN groups g ON g.id = r.group_id WHERE r.id = p_request;
  INSERT INTO join_messages (request_id, sender_id, body, created_at, updated_at)
  VALUES (p_request, v_applicant, 'Hola, me interesa el cupo. ¿Sigue disponible?',
          p_at + interval '1 minute', p_at + interval '1 minute'),
         (p_request, v_owner, 'Hola, sí. Te paso los datos de pago en un momento.',
          p_at + interval '5 minutes', p_at + interval '5 minutes');
END;
$$;

DO $$
DECLARE
  v_bb uuid := (SELECT id FROM groups WHERE invite_code = 'DEVGRPBB');
  v_m1 uuid := (SELECT id FROM users WHERE email = 'miembro1@dev.vaquita');
  v_m2 uuid := (SELECT id FROM users WHERE email = 'miembro2@dev.vaquita');
  v_m3 uuid := (SELECT id FROM users WHERE email = 'miembro3@dev.vaquita');
  v_at timestamptz := date_trunc('hour', now()) - interval '3 hours';
  v_cut date := date_trunc('month', now() AT TIME ZONE 'UTC')::date + 9;
  v_cc uuid;
  v_request uuid;
BEGIN
  IF v_bb IS NULL OR v_m1 IS NULL OR v_m2 IS NULL OR v_m3 IS NULL
     OR EXISTS (SELECT 1 FROM groups WHERE invite_code = 'DEVGRPCC') THEN
    RETURN;
  END IF;

  INSERT INTO groups (owner_id, name, service_name_snapshot, price_cents, currency, billing_day,
                      total_slots, invite_code, payment_info_text)
  VALUES (v_m1, 'YouTube Premium compartido', 'YouTube Premium (ejemplo)', 5000, 'BS', 10, 5,
          'DEVGRPCC', 'Cuenta ficticia de desarrollo 000-000-000')
  RETURNING id INTO v_cc;
  INSERT INTO group_members (group_id, user_id, role, join_source)
  VALUES (v_cc, v_m1, 'titular', 'creacion');
  INSERT INTO billing_cycles (group_id, owner_id, period, cycle_type, cut_date, due_date,
                              issued_at, price_cents, currency, total_bs_cents, member_count,
                              base_share_cents, owner_share_cents, remainder_cents)
  VALUES (v_cc, v_m1, to_char(v_cut, 'YYYY-MM'), 'inicial', v_cut, v_cut + 3, now(), 5000, 'BS',
          5000, 1, 5000, 5000, 0);

  PERFORM pg_temp.dev_chat(pg_temp.dev_request(v_bb, v_m2, 'abierta', v_at), v_at);
  PERFORM pg_temp.dev_chat(pg_temp.dev_request(v_bb, v_m3, 'esperando_pago', v_at), v_at);
  PERFORM pg_temp.dev_chat(pg_temp.dev_request(v_cc, v_m2, 'pago_informado', v_at), v_at);

  v_request := pg_temp.dev_request(v_cc, v_m3, 'rechazada', v_at - interval '1 day');
  PERFORM pg_temp.dev_chat(v_request, v_at - interval '1 day');
  INSERT INTO join_disputes (request_id, kind, opened_by, accused_id, description, opened_at)
  VALUES (v_request, 'pago_sin_ingreso', v_m3, v_m1,
          'Pagué por QR y el titular rechazó mi solicitud sin devolverme el dinero.',
          v_at - interval '20 hours');
END;
$$;
