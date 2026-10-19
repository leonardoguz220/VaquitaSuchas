-- 0081_listing_reports: reportes de usuarios sobre una publicación (spec 008, data-model.md §1;
-- RF-008-17, CA-008-18). Un reporte por usuario y publicación. Solo se insertan: el disparador de
-- solo anexado y el que impide que el titular reporte su publicación van en 0082.

CREATE TABLE listing_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  reporter_id uuid NOT NULL,
  reason text NOT NULL,
  comment text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listing_reports_pkey PRIMARY KEY (id),
  CONSTRAINT listing_reports_listing_id_fkey FOREIGN KEY (listing_id)
    REFERENCES listings (id) ON DELETE RESTRICT,
  CONSTRAINT listing_reports_reporter_id_fkey FOREIGN KEY (reporter_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT listing_reports_listing_id_reporter_id_key UNIQUE (listing_id, reporter_id),
  CONSTRAINT listing_reports_reason_check
    CHECK (reason IN ('spam', 'datos_falsos', 'conducta_indebida', 'otro')),
  CONSTRAINT listing_reports_comment_check
    CHECK (comment IS NULL OR char_length(comment) <= 300)
);

CREATE INDEX listing_reports_listing_idx ON listing_reports (listing_id, created_at);

CREATE TRIGGER listing_reports_set_updated_at
  BEFORE UPDATE ON listing_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
