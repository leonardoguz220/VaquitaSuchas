-- 0090_admin_dev: datos de administración de ejemplo para desarrollo (spec 009 T006 y spec 001
-- T041). El administrador lo crea `npm run seed:admin -w backend` (spec 003 T022): aquí se toma
-- el administrador activo más antiguo. Sin administrador ni usuarios de desarrollo no hace nada.
--   - titular@dev.vaquita y miembro1@dev.vaquita quedan habilitados como titulares (habilitación
--     manual, RF-009-21), para crear grupos desde el primer día (spec 001, RF-001-21); miembro1
--     además recibe la titularidad en el E2E de transferencia (spec 001 T037).
--   - Dos usuarios con reclamos abiertos sobre la solicitud rechazada de 0050: miembro3 (ya
--     abierto en 0050) y miembro1, el titular, que responde con su propio reclamo.
--   - Un baneo revertido de miembro2. Lo revierte otro administrador (RF-009-23), así que solo
--     se siembra si hay dos administradores activos.
-- Cada acción queda en admin_audit_log. Idempotente: cada parte se crea solo si no existe.

DO $$
DECLARE
  v_admin uuid := (SELECT id FROM users WHERE role = 'admin' AND status = 'activo'
                   ORDER BY created_at, id LIMIT 1);
  v_admin2 uuid := (SELECT id FROM users WHERE role = 'admin' AND status = 'activo'
                    ORDER BY created_at, id OFFSET 1 LIMIT 1);
  v_owner uuid := (SELECT id FROM users WHERE email = 'titular@dev.vaquita');
  v_m1 uuid := (SELECT id FROM users WHERE email = 'miembro1@dev.vaquita');
  v_m2 uuid := (SELECT id FROM users WHERE email = 'miembro2@dev.vaquita');
  v_m3 uuid := (SELECT id FROM users WHERE email = 'miembro3@dev.vaquita');
  v_now timestamptz := date_trunc('hour', now());
  v_request uuid;
  v_id uuid;
BEGIN
  IF v_admin IS NULL OR v_owner IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM host_enablements WHERE user_id = v_owner) THEN
    INSERT INTO host_enablements (user_id, reason, enabled_by, enabled_at)
    VALUES (v_owner, 'Titular de prueba del equipo de desarrollo', v_admin, v_now)
    RETURNING id INTO v_id;
    INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, reason, occurred_at)
    VALUES (v_admin, 'titular_habilitar', 'user', v_owner,
            'Titular de prueba del equipo de desarrollo', v_now);
  END IF;

  IF v_m1 IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM host_enablements WHERE user_id = v_m1 AND revoked_at IS NULL
  ) THEN
    INSERT INTO host_enablements (user_id, reason, enabled_by, enabled_at)
    VALUES (v_m1, 'Titular de prueba para el E2E de transferencia', v_admin, v_now);
    INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, reason, occurred_at)
    VALUES (v_admin, 'titular_habilitar', 'user', v_m1,
            'Titular de prueba para el E2E de transferencia', v_now);
  END IF;

  SELECT r.id INTO v_request
    FROM join_requests r JOIN groups g ON g.id = r.group_id
   WHERE g.invite_code = 'DEVGRPCC' AND r.applicant_id = v_m3 AND r.status = 'rechazada';
  IF v_request IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM join_disputes WHERE request_id = v_request AND opened_by = v_m1
  ) THEN
    INSERT INTO join_disputes (request_id, kind, opened_by, accused_id, description, opened_at)
    VALUES (v_request, 'comprobante_falso', v_m1, v_m3,
            'El comprobante que subió no aparece en el extracto de mi cuenta.',
            v_now - interval '18 hours');
  END IF;

  IF v_admin2 IS NOT NULL AND v_m2 IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM bans WHERE user_id = v_m2) THEN
    INSERT INTO bans (user_id, reason, source, banned_by, banned_at)
    VALUES (v_m2, 'Comprobantes falsos reportados por dos titulares', 'admin', v_admin,
            v_now - interval '3 days')
    RETURNING id INTO v_id;
    UPDATE bans
       SET revoked_at = v_now - interval '2 days', revoked_by = v_admin2,
           revoke_reason = 'Los titulares confirmaron que los pagos sí llegaron'
     WHERE id = v_id;
    INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, reason, occurred_at)
    VALUES (v_admin, 'usuario_banear', 'user', v_m2,
            'Comprobantes falsos reportados por dos titulares', v_now - interval '3 days'),
           (v_admin2, 'baneo_revertir', 'ban', v_id,
            'Los titulares confirmaron que los pagos sí llegaron', v_now - interval '2 days');
  END IF;
END;
$$;
