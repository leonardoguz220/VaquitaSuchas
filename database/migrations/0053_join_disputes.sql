-- 0053_join_disputes: reclamos sobre una solicitud de ingreso (spec 010, data-model.md §1
-- `join_disputes` con el ajuste M1; RF-010-21 a RF-010-24, CA-010-28).
-- Cada parte (solicitante o titular) abre como máximo un reclamo por solicitud; la otra parte
-- responde una sola vez y un administrador lo resuelve (spec 009, DisputesService.resolve).
-- Quién es el acusado según el tipo (titular en 'pago_sin_ingreso', solicitante en
-- 'comprobante_falso') lo valida el servicio; la base solo exige que no sea quien lo abre.
-- La evidencia vive en el almacén privado (Supabase Storage); aquí solo sus claves.

CREATE TABLE join_disputes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  kind text NOT NULL,
  opened_by uuid NOT NULL,
  accused_id uuid NOT NULL,
  description text NOT NULL,
  evidence_key text NULL,
  evidence_mime text NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  -- Respuesta de la parte acusada (RF-010-22).
  response_text text NULL,
  response_evidence_key text NULL,
  response_evidence_mime text NULL,
  responded_at timestamptz NULL,
  status text NOT NULL DEFAULT 'abierto',
  resolution text NULL,
  resolution_reason text NULL,
  resolved_by uuid NULL,
  resolved_at timestamptz NULL,
  -- Retención de 2 meses (RNF-010-09): los archivos se borran del almacén y la fila queda.
  evidence_purged_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT join_disputes_pkey PRIMARY KEY (id),
  CONSTRAINT join_disputes_request_id_fkey FOREIGN KEY (request_id)
    REFERENCES join_requests (id) ON DELETE RESTRICT,
  CONSTRAINT join_disputes_opened_by_fkey FOREIGN KEY (opened_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT join_disputes_accused_id_fkey FOREIGN KEY (accused_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT join_disputes_resolved_by_fkey FOREIGN KEY (resolved_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT join_disputes_kind_check CHECK (kind IN ('pago_sin_ingreso', 'comprobante_falso')),
  CONSTRAINT join_disputes_description_check
    CHECK (char_length(btrim(description)) BETWEEN 10 AND 500),
  CONSTRAINT join_disputes_evidence_mime_check
    CHECK (evidence_mime IN ('image/jpeg', 'image/png')),
  CONSTRAINT join_disputes_response_evidence_mime_check
    CHECK (response_evidence_mime IN ('image/jpeg', 'image/png')),
  CONSTRAINT join_disputes_response_text_check
    CHECK (char_length(btrim(response_text)) BETWEEN 10 AND 500),
  CONSTRAINT join_disputes_status_check CHECK (status IN ('abierto', 'resuelto')),
  CONSTRAINT join_disputes_resolution_check
    CHECK (resolution IN ('estafa_confirmada', 'sin_falta')),
  CONSTRAINT join_disputes_resolution_reason_check
    CHECK (char_length(btrim(resolution_reason)) BETWEEN 10 AND 300),
  -- Un reclamo está resuelto si y solo si tiene todos los datos de la resolución.
  CONSTRAINT join_disputes_resolved_check
    CHECK ((status = 'resuelto') = (resolution IS NOT NULL AND resolution_reason IS NOT NULL
                                    AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
  -- La respuesta y su hora van juntas.
  CONSTRAINT join_disputes_response_check
    CHECK ((response_text IS NULL) = (responded_at IS NULL)),
  CONSTRAINT join_disputes_accused_id_check CHECK (opened_by <> accused_id),
  -- CA-010-28: un reclamo por parte y solicitud.
  CONSTRAINT join_disputes_request_id_opened_by_key UNIQUE (request_id, opened_by)
);

-- Cola del administrador, del más antiguo al más reciente (spec 009).
CREATE INDEX join_disputes_open_idx ON join_disputes (opened_at) WHERE status = 'abierto';

-- Reclamos de una solicitud.
CREATE INDEX join_disputes_request_idx ON join_disputes (request_id);

-- ---------------------------------------------------------------------------------------------
-- join_disputes_resolved_immutable y join_disputes_single_response (data-model.md §1;
-- RF-010-22, RF-010-24)
-- La respuesta se da una sola vez: response_text y responded_at, una vez fijados, no cambian.
-- La resolución es definitiva: un reclamo 'resuelto' no cambia en ninguna columna, salvo
-- evidence_purged_at, que la limpieza por retención (RNF-010-09) llena al borrar los archivos del
-- almacén; las claves de la evidencia se conservan (como file_key en receipts, 0042).
-- Se compara columna por columna; una columna nueva de join_disputes debe agregarse aquí en la
-- migración que la cree. restrict_violation (23001), como en 0042_receipts.sql.
-- Orden de los BEFORE UPDATE (alfabético): join_disputes_resolved_immutable,
-- join_disputes_set_updated_at, join_disputes_single_response; updated_at queda fuera de las
-- comparaciones, así que el orden no importa.

CREATE FUNCTION join_disputes_forbid_resolved_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'resuelto' AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.request_id IS DISTINCT FROM OLD.request_id
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.opened_by IS DISTINCT FROM OLD.opened_by
       OR NEW.accused_id IS DISTINCT FROM OLD.accused_id
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.evidence_key IS DISTINCT FROM OLD.evidence_key
       OR NEW.evidence_mime IS DISTINCT FROM OLD.evidence_mime
       OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
       OR NEW.response_text IS DISTINCT FROM OLD.response_text
       OR NEW.response_evidence_key IS DISTINCT FROM OLD.response_evidence_key
       OR NEW.response_evidence_mime IS DISTINCT FROM OLD.response_evidence_mime
       OR NEW.responded_at IS DISTINCT FROM OLD.responded_at
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.resolution IS DISTINCT FROM OLD.resolution
       OR NEW.resolution_reason IS DISTINCT FROM OLD.resolution_reason
       OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
       OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'resolved join dispute cannot change'
      USING DETAIL = format('join dispute %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER join_disputes_resolved_immutable
  BEFORE UPDATE ON join_disputes
  FOR EACH ROW EXECUTE FUNCTION join_disputes_forbid_resolved_change();

CREATE TRIGGER join_disputes_set_updated_at
  BEFORE UPDATE ON join_disputes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION join_disputes_forbid_second_response() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.response_text IS NOT NULL
      AND NEW.response_text IS DISTINCT FROM OLD.response_text)
     OR (OLD.responded_at IS NOT NULL
         AND NEW.responded_at IS DISTINCT FROM OLD.responded_at) THEN
    RAISE EXCEPTION 'join dispute response can only be set once'
      USING DETAIL = format('join dispute %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER join_disputes_single_response
  BEFORE UPDATE ON join_disputes
  FOR EACH ROW EXECUTE FUNCTION join_disputes_forbid_second_response();
