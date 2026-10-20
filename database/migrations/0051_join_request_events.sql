-- 0051_join_request_events: línea de tiempo de cada solicitud de ingreso (spec 010,
-- data-model.md §1 `join_request_events`; RF-010-27, RNF-010-08, CA-010-35).
-- Es de solo anexado (forbid_update_delete de 0001): un evento no se corrige ni se borra, y sirve
-- de evidencia para los reclamos (spec 009).
-- metadata guarda datos propios del evento (p. ej. la cotización enviada o el id del reclamo).

CREATE TABLE join_request_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  type text NOT NULL,
  actor_kind text NOT NULL,
  actor_id uuid NULL,
  from_status text NULL,
  to_status text NULL,
  -- Motivo del rechazo, de la cancelación o de la expiración.
  reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- updated_at = created_at: la tabla es de solo anexado.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT join_request_events_pkey PRIMARY KEY (id),
  CONSTRAINT join_request_events_request_id_fkey FOREIGN KEY (request_id)
    REFERENCES join_requests (id) ON DELETE RESTRICT,
  CONSTRAINT join_request_events_actor_id_fkey FOREIGN KEY (actor_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT join_request_events_type_check
    CHECK (type IN ('abierta', 'datos_pago_enviados', 'plazo_prorrogado', 'comprobante_subido',
                    'confirmada', 'efectivo_registrado', 'rechazada', 'cancelada', 'expirada',
                    'recordatorio_enviado', 'reclamo_abierto', 'reclamo_respondido',
                    'reclamo_resuelto')),
  CONSTRAINT join_request_events_actor_kind_check CHECK (actor_kind IN ('usuario', 'sistema')),
  -- Un evento de usuario nombra a la persona; uno del sistema no tiene actor.
  CONSTRAINT join_request_events_actor_id_check
    CHECK ((actor_kind = 'usuario') = (actor_id IS NOT NULL)),
  -- Convención de estados (spec 000): los estados son los de join_requests (RN-010-05).
  CONSTRAINT join_request_events_from_status_check
    CHECK (from_status IS NULL
           OR from_status IN ('abierta', 'esperando_pago', 'pago_informado', 'aceptada',
                              'rechazada', 'cancelada', 'expirada')),
  CONSTRAINT join_request_events_to_status_check
    CHECK (to_status IS NULL
           OR to_status IN ('abierta', 'esperando_pago', 'pago_informado', 'aceptada',
                            'rechazada', 'cancelada', 'expirada'))
);

-- Línea de tiempo de una solicitud (RF-010-27).
CREATE INDEX join_request_events_request_idx ON join_request_events (request_id, occurred_at);

-- Solo anexado. Los BEFORE triggers se disparan en orden alfabético de nombre, así que
-- join_request_events_forbid_update_delete corre antes que join_request_events_set_updated_at y
-- bloquea la operación (como en 0044_charge_events.sql).
CREATE TRIGGER join_request_events_forbid_update_delete
  BEFORE UPDATE OR DELETE ON join_request_events
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- Como UPDATE está prohibido, este disparador nunca llega a cambiar nada; se deja por la
-- convención del modelo (toda tabla mantiene updated_at con set_updated_at).
CREATE TRIGGER join_request_events_set_updated_at
  BEFORE UPDATE ON join_request_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
