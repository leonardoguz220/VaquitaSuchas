-- 0042_receipts: comprobantes de pago y reserva de referencias por grupo (spec 002,
-- data-model.md §1 `receipts` y `payment_references`; RF-002-06, RF-002-07, RF-002-08,
-- RN-002-06, RN-002-08, CA-002-05, CA-002-26, CA-002-27, CA-010-41).
-- El archivo vive en el almacén privado (Supabase Storage); aquí solo su clave.
-- El comprobante pasa a 'confirmado' o 'rechazado' cuando el titular decide, y a 'reemplazado'
-- cuando el miembro sube otro mientras el cobro está 'en_revision' (RF-002-08). Las transiciones
-- las decide el backend; la base solo garantiza un comprobante 'vigente' por cobro y que las
-- columnas del archivo no cambien.

CREATE TABLE receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  charge_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  -- La "última subida" de la reputación (spec 007, RF-007-12).
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  -- Clave en el almacén, p. ej. receipts/<groupId>/<chargeId>/<uuid>.jpg.
  file_key text NOT NULL,
  mime text NOT NULL,
  size_bytes integer NOT NULL,
  method text NOT NULL,
  -- Texto como lo escribió la persona; la clave normalizada va en payment_references.
  reference text NOT NULL,
  status text NOT NULL DEFAULT 'vigente',
  -- Retención de 2 meses (RN-002-06): el archivo se borra del almacén y la fila queda.
  file_deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receipts_pkey PRIMARY KEY (id),
  CONSTRAINT receipts_charge_id_fkey FOREIGN KEY (charge_id)
    REFERENCES charges (id) ON DELETE RESTRICT,
  CONSTRAINT receipts_uploaded_by_fkey FOREIGN KEY (uploaded_by)
    REFERENCES users (id) ON DELETE RESTRICT,
  -- CA-002-05: solo imagen JPEG o PNG, o PDF.
  CONSTRAINT receipts_mime_check CHECK (mime IN ('image/jpeg', 'image/png', 'application/pdf')),
  -- CA-002-05: de 1 byte a 5 MB.
  CONSTRAINT receipts_size_bytes_check CHECK (size_bytes BETWEEN 1 AND 5242880),
  CONSTRAINT receipts_method_check CHECK (method IN ('qr', 'transferencia')),
  CONSTRAINT receipts_reference_check CHECK (char_length(btrim(reference)) BETWEEN 1 AND 100),
  CONSTRAINT receipts_status_check
    CHECK (status IN ('vigente', 'reemplazado', 'rechazado', 'confirmado'))
);

-- RF-002-08: un solo comprobante vigente por cobro.
CREATE UNIQUE INDEX receipts_one_active_uq ON receipts (charge_id) WHERE status = 'vigente';

-- Comprobantes de un cobro, el más reciente primero (detalle del cobro y reputación).
CREATE INDEX receipts_charge_idx ON receipts (charge_id, uploaded_at DESC);

-- Limpieza de archivos vencidos (CA-002-33), con unión a groups.closed_at.
CREATE INDEX receipts_retention_idx ON receipts (charge_id) WHERE file_deleted_at IS NULL;

-- ---------------------------------------------------------------------------------------------
-- receipts_file_immutable (data-model.md §1)
-- Las columnas del archivo no cambian nunca: solo cambian status, file_deleted_at y updated_at.
-- Se compara columna por columna; una columna nueva de receipts debe agregarse aquí en la
-- migración que la cree. restrict_violation (23001), como en 0032_group_triggers.sql.
-- Orden de los BEFORE UPDATE (alfabético): receipts_file_immutable, receipts_set_updated_at;
-- updated_at queda fuera de la comparación, así que el orden no importa.

CREATE FUNCTION receipts_forbid_file_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.charge_id IS DISTINCT FROM OLD.charge_id
     OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
     OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at
     OR NEW.file_key IS DISTINCT FROM OLD.file_key
     OR NEW.mime IS DISTINCT FROM OLD.mime
     OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'receipt file cannot change'
      USING DETAIL = format('receipt %s', OLD.id),
            ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER receipts_file_immutable
  BEFORE UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION receipts_forbid_file_change();

CREATE TRIGGER receipts_set_updated_at
  BEFORE UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- payment_references: reserva de referencias de pago por grupo, compartida con los comprobantes
-- de las solicitudes de ingreso (spec 010, RN-010-14). Vive en la spec 002 porque es la
-- dependencia más baja.
-- reference_key es la referencia normalizada por el backend (upper(btrim(reference)), espacios
-- internos colapsados, solo [A-Z0-9 ./_-]; plan §5). El modelo no define un CHECK de formato
-- ([NECESITA ACLARACIÓN] M4), así que la base no lo impone.
-- source_id es polimórfico (id de receipts o de join_requests según source_type), por eso no
-- lleva clave foránea; la coherencia la garantiza el backend en la misma transacción.
-- released_at se llena cuando el comprobante se rechaza o se reemplaza, y libera la referencia.

CREATE TABLE payment_references (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  reference_key text NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_references_pkey PRIMARY KEY (id),
  CONSTRAINT payment_references_group_id_fkey FOREIGN KEY (group_id)
    REFERENCES groups (id) ON DELETE RESTRICT,
  CONSTRAINT payment_references_source_type_check
    CHECK (source_type IN ('receipt', 'join_request'))
);

-- CA-002-27, CA-010-41: una referencia activa no se repite dentro del grupo; liberada se reutiliza.
CREATE UNIQUE INDEX payment_references_active_uq ON payment_references (group_id, reference_key)
  WHERE released_at IS NULL;

-- Liberar la reserva de un comprobante o de una solicitud.
CREATE INDEX payment_references_source_idx ON payment_references (source_type, source_id);

CREATE TRIGGER payment_references_set_updated_at
  BEFORE UPDATE ON payment_references
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
