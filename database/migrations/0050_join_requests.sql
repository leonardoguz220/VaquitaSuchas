-- 0050_join_requests: solicitudes de ingreso a un grupo (spec 010, data-model.md §1 con los
-- ajustes H1 y L1 aprobados el 2026-10-19; RF-010-02, RF-010-13, RF-010-17, RF-010-20, RF-010-28,
-- RN-010-01, RN-010-02, RN-010-05, RN-010-10, RNF-010-04, RNF-010-09).
-- Una fila por solicitud: estado, plazos, copia de la cotización y de los datos de pago,
-- comprobante y cierre. La línea de tiempo vive en join_request_events (0051).
-- Los disparadores de negocio (estado inicial, transiciones, cotización inmutable, estados
-- finales de solo lectura, límite de 5 activas, no miembro y grupo abierto) van en
-- 0054_join_request_triggers.sql. No hay control de capacidad en esta tabla (H1): lo impone el
-- servicio y, al final, group_members_capacity (spec 001).
-- listing_id no tiene FK: la agrega la migración de la spec 008 (listings).
-- Las FK de charges.join_request_id y group_members.join_request_id hacia esta tabla van en 0055.

CREATE TABLE join_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  applicant_id uuid NOT NULL,
  -- 'publicacion': solicitud a un cupo publicado (spec 008).
  source text NOT NULL DEFAULT 'codigo',
  listing_id uuid NULL,
  status text NOT NULL DEFAULT 'abierta',
  opened_at timestamptz NOT NULL,
  -- min(opened_at + 24 h, fin de la ventana de ingreso al abrir) (RN-010-05).
  open_deadline_at timestamptz NOT NULL,
  -- Cotización y datos de pago: se fijan al enviar los datos de pago (RN-010-01, RN-010-10).
  quote_amount_cents bigint NULL,
  quote_price_cents bigint NULL,
  quote_currency text NULL,
  -- Bs por 1 USD.
  quote_exchange_rate numeric(10, 4) NULL,
  quote_total_bs_cents bigint NULL,
  -- Miembros actuales + 1.
  quote_member_count smallint NULL,
  payment_text text NULL,
  -- Copia propia del QR (no depende de cambios posteriores del grupo).
  payment_qr_key text NULL,
  payment_qr_mime text NULL,
  payment_sent_at timestamptz NULL,
  -- payment_sent_at + 15 min (+15 si hay prórroga).
  pay_deadline_at timestamptz NULL,
  -- Una sola prórroga (RF-010-28).
  extended_at timestamptz NULL,
  -- Comprobante del solicitante (RF-010-13).
  proof_key text NULL,
  proof_mime text NULL,
  proof_size_bytes integer NULL,
  proof_method text NULL,
  proof_reference text NULL,
  proof_uploaded_at timestamptz NULL,
  -- proof_uploaded_at + 60 min (RF-010-17).
  decision_deadline_at timestamptz NULL,
  -- Recordatorio a los 30 min (CA-010-14).
  reminder_sent_at timestamptz NULL,
  -- Cierre.
  final_at timestamptz NULL,
  final_reason text NULL,
  -- Titular que confirmó, rechazó o registró efectivo.
  decided_by uuid NULL,
  reject_reason text NULL,
  -- El titular marcó el comprobante como falso (RF-010-16).
  rejected_as_false boolean NOT NULL DEFAULT false,
  accepted_method text NULL,
  -- Cobro de ingreso creado al aceptar (RN-010-03).
  charge_id uuid NULL,
  -- Retención de 2 meses (RNF-010-09).
  content_purged_at timestamptz NULL,
  -- Control optimista.
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT join_requests_pkey PRIMARY KEY (id),
  CONSTRAINT join_requests_group_id_fkey FOREIGN KEY (group_id)
    REFERENCES groups (id) ON DELETE RESTRICT,
  CONSTRAINT join_requests_applicant_id_fkey FOREIGN KEY (applicant_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT join_requests_decided_by_fkey FOREIGN KEY (decided_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT join_requests_charge_id_fkey FOREIGN KEY (charge_id)
    REFERENCES charges (id) ON DELETE RESTRICT,
  -- Checks de columna.
  CONSTRAINT join_requests_source_check CHECK (source IN ('codigo', 'publicacion')),
  CONSTRAINT join_requests_listing_id_check
    CHECK ((source = 'publicacion') = (listing_id IS NOT NULL)),
  CONSTRAINT join_requests_status_check
    CHECK (status IN ('abierta', 'esperando_pago', 'pago_informado', 'aceptada', 'rechazada',
                      'cancelada', 'expirada')),
  CONSTRAINT join_requests_quote_amount_cents_check CHECK (quote_amount_cents > 0),
  CONSTRAINT join_requests_payment_text_check CHECK (char_length(payment_text) <= 500),
  CONSTRAINT join_requests_proof_mime_check
    CHECK (proof_mime IN ('image/jpeg', 'image/png', 'application/pdf')),
  CONSTRAINT join_requests_proof_size_bytes_check
    CHECK (proof_size_bytes BETWEEN 1 AND 5242880),
  CONSTRAINT join_requests_proof_method_check CHECK (proof_method IN ('qr', 'transferencia')),
  CONSTRAINT join_requests_proof_reference_check
    CHECK (char_length(btrim(proof_reference)) BETWEEN 1 AND 100),
  CONSTRAINT join_requests_final_reason_check
    CHECK (final_reason IN ('confirmada', 'efectivo', 'rechazo_titular', 'cancelada_solicitante',
                            'plazo_solicitud', 'ventana_cerrada', 'plazo_pago',
                            'titular_sin_respuesta', 'grupo_cerrado', 'titular_baneado',
                            'sin_cupo', 'solicitante_suspendido', 'aceptado_en_otro_grupo')),
  CONSTRAINT join_requests_reject_reason_check
    CHECK (char_length(btrim(reject_reason)) BETWEEN 5 AND 200),
  CONSTRAINT join_requests_accepted_method_check
    CHECK (accepted_method IN ('comprobante', 'efectivo')),
  -- Checks de coherencia (las implicaciones a => b se escriben NOT a OR b).
  -- Un estado final tiene fecha y motivo de cierre, y solo él.
  CONSTRAINT join_requests_final_check
    CHECK ((status IN ('aceptada', 'rechazada', 'cancelada', 'expirada'))
           = (final_at IS NOT NULL AND final_reason IS NOT NULL)),
  -- Aceptar exige el cobro de ingreso, el método y el titular que decidió (RN-010-03).
  CONSTRAINT join_requests_accepted_check
    CHECK (status <> 'aceptada'
           OR (charge_id IS NOT NULL AND accepted_method IS NOT NULL AND decided_by IS NOT NULL)),
  -- Esperar o informar el pago exige datos de pago enviados, cotización y plazo de pago.
  CONSTRAINT join_requests_payment_sent_check
    CHECK (status NOT IN ('esperando_pago', 'pago_informado')
           OR (payment_sent_at IS NOT NULL AND quote_amount_cents IS NOT NULL
               AND pay_deadline_at IS NOT NULL)),
  -- Pago informado exige comprobante con referencia y plazo de decisión.
  CONSTRAINT join_requests_proof_informed_check
    CHECK (status <> 'pago_informado'
           OR (proof_reference IS NOT NULL AND proof_uploaded_at IS NOT NULL
               AND decision_deadline_at IS NOT NULL)),
  -- La cotización existe si y solo si se enviaron los datos de pago.
  CONSTRAINT join_requests_quote_check
    CHECK ((quote_amount_cents IS NULL) = (payment_sent_at IS NULL)),
  -- Al purgar el contenido se borra el archivo, no la referencia.
  CONSTRAINT join_requests_proof_reference_uploaded_check
    CHECK (proof_reference IS NULL OR proof_uploaded_at IS NOT NULL),
  -- RF-010-16: solo se marca como falso un comprobante subido de una solicitud rechazada.
  CONSTRAINT join_requests_rejected_as_false_check
    CHECK (NOT rejected_as_false OR (status = 'rechazada' AND proof_uploaded_at IS NOT NULL)),
  -- La prórroga solo existe si se enviaron los datos de pago (RF-010-28).
  CONSTRAINT join_requests_extended_at_check
    CHECK (extended_at IS NULL OR payment_sent_at IS NOT NULL)
);

-- RF-010-02: una sola solicitud activa por persona y grupo.
CREATE UNIQUE INDEX join_requests_active_uq ON join_requests (group_id, applicant_id)
  WHERE status IN ('abierta', 'esperando_pago', 'pago_informado');

-- "Mis solicitudes" (RNF-010-07).
CREATE INDEX join_requests_applicant_idx ON join_requests (applicant_id, status, opened_at DESC);

-- Cola del titular, de la más antigua a la más reciente.
CREATE INDEX join_requests_group_idx ON join_requests (group_id, status, opened_at);

-- Cupos reservados (RN-010-02).
CREATE INDEX join_requests_reserved_idx ON join_requests (group_id)
  WHERE status IN ('esperando_pago', 'pago_informado');

-- Barrido de plazos vencidos.
CREATE INDEX join_requests_sweep_idx
  ON join_requests (status, open_deadline_at, pay_deadline_at, decision_deadline_at)
  WHERE status IN ('abierta', 'esperando_pago', 'pago_informado');

-- Barrido de retención (RNF-010-09).
CREATE INDEX join_requests_retention_idx ON join_requests (final_at)
  WHERE content_purged_at IS NULL AND final_at IS NOT NULL;

CREATE TRIGGER join_requests_set_updated_at
  BEFORE UPDATE ON join_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
