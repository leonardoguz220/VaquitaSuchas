-- 0002_job_runs: registro de ejecuciones de tareas programadas (spec 000, RF-000-14, RF-000-07,
-- data-model.md §3). error_message no lleva datos personales. Retención de 30 días a cargo de
-- la tarea maintenance.cleanup del backend.

CREATE TABLE job_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  trigger text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  processed_count integer NOT NULL DEFAULT 0,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_runs_pkey PRIMARY KEY (id),
  CONSTRAINT job_runs_trigger_check CHECK (trigger IN ('cron', 'external', 'manual', 'startup')),
  CONSTRAINT job_runs_status_check CHECK (status IN ('running', 'ok', 'error', 'skipped'))
);

-- Última ejecución de cada tarea (recuperación al arrancar y observabilidad, RF-000-14).
CREATE INDEX job_runs_name_started_idx ON job_runs (job_name, started_at DESC);

CREATE TRIGGER job_runs_set_updated_at
  BEFORE UPDATE ON job_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
