-- 0044_charge_events: línea de tiempo de cada cobro (spec 002, data-model.md §1 `charge_events`
-- con el ajuste H1; RF-002-17, RNF-002-04).
-- Es de solo anexado (forbid_update_delete de 0001): un evento no se corrige ni se borra.
-- group_id es una copia para consultar el historial del grupo sin unir con charges.
-- metadata guarda datos propios del evento, p. ej. { "receiptId": "…", "invalidReceipt": true,
-- "paidAt": "…" }; la reputación (spec 007) lee metadata.invalidReceipt.
-- El seed de desarrollo de cobros va en T047 (M3), no aquí.

CREATE TABLE charge_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  charge_id uuid NOT NULL,
  group_id uuid NOT NULL,
  type text NOT NULL,
  actor_kind text NOT NULL,
  actor_id uuid NULL,
  from_status text NULL,
  to_status text NULL,
  -- Motivo de rechazo o cancelación, o nota del pago manual.
  reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- updated_at = created_at: la tabla es de solo anexado.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT charge_events_pkey PRIMARY KEY (id),
  CONSTRAINT charge_events_charge_id_fkey FOREIGN KEY (charge_id)
    REFERENCES charges (id) ON DELETE RESTRICT,
  CONSTRAINT charge_events_group_id_fkey FOREIGN KEY (group_id)
    REFERENCES groups (id) ON DELETE RESTRICT,
  CONSTRAINT charge_events_actor_id_fkey FOREIGN KEY (actor_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT charge_events_type_check
    CHECK (type IN ('generado', 'ingreso_registrado', 'comprobante_subido',
                    'comprobante_reemplazado', 'rechazado', 'confirmado', 'pago_manual',
                    'atrasado', 'cancelado', 'retiro_por_mora')),
  CONSTRAINT charge_events_actor_kind_check CHECK (actor_kind IN ('usuario', 'sistema')),
  -- Un evento de usuario nombra a la persona; uno del sistema no tiene actor.
  CONSTRAINT charge_events_actor_id_check
    CHECK ((actor_kind = 'usuario') = (actor_id IS NOT NULL)),
  -- H1: los estados son los de charges (RN-002-01).
  CONSTRAINT charge_events_from_status_check
    CHECK (from_status IS NULL
           OR from_status IN ('pendiente', 'en_revision', 'pagado', 'atrasado', 'cancelado')),
  CONSTRAINT charge_events_to_status_check
    CHECK (to_status IS NULL
           OR to_status IN ('pendiente', 'en_revision', 'pagado', 'atrasado', 'cancelado'))
);

-- Línea de tiempo de un cobro (RF-002-17).
CREATE INDEX charge_events_charge_idx ON charge_events (charge_id, occurred_at);

-- Historial del grupo paginado, el más reciente primero.
CREATE INDEX charge_events_group_idx ON charge_events (group_id, occurred_at DESC);

-- Solo anexado. Los BEFORE triggers se disparan en orden alfabético de nombre, así que
-- charge_events_forbid_update_delete corre antes que charge_events_set_updated_at y bloquea la
-- operación (como en 0003_rate_limit_events.sql).
CREATE TRIGGER charge_events_forbid_update_delete
  BEFORE UPDATE OR DELETE ON charge_events
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- Como UPDATE está prohibido, este disparador nunca llega a cambiar nada; se deja por la
-- convención del modelo (toda tabla mantiene updated_at con set_updated_at).
CREATE TRIGGER charge_events_set_updated_at
  BEFORE UPDATE ON charge_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
