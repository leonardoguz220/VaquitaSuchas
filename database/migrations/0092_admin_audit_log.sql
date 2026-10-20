-- 0092_admin_audit_log: registro de las acciones de administración y de cada apertura de
-- evidencia (spec 009, data-model.md §1; RF-009-18, RNF-009-03, RNF-009-05, CA-009-18,
-- CA-009-19). Solo anexado (forbid_update_delete de 0001): updated_at = created_at. metadata
-- guarda los cambios (antes/después) sin datos sensibles: nunca CI, contraseñas ni chats.
-- reason (10-300) es obligatorio cuando la acción lo exige; eso lo valida el backend.

CREATE TABLE admin_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NULL,
  reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT admin_audit_log_admin_id_fkey FOREIGN KEY (admin_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT admin_audit_log_action_check CHECK (action IN (
    'catalogo_crear', 'catalogo_editar', 'catalogo_activar', 'catalogo_desactivar',
    'catalogo_importar', 'usuario_suspender', 'usuario_reactivar', 'usuario_banear',
    'baneo_revertir', 'rol_promover', 'rol_quitar', 'titular_habilitar',
    'titular_quitar_habilitacion', 'reclamo_abrir_evidencia', 'reclamo_resolver',
    'publicacion_restaurar', 'publicacion_eliminar', 'publicacion_eliminar_y_suspender',
    'titularidad_transferir'
  )),
  CONSTRAINT admin_audit_log_target_type_check CHECK (target_type IN (
    'user', 'group', 'catalog_service', 'catalog_plan', 'join_dispute', 'listing', 'ban'
  )),
  CONSTRAINT admin_audit_log_reason_check
    CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 10 AND 300)
);

CREATE INDEX admin_audit_log_admin_idx ON admin_audit_log (admin_id, occurred_at DESC);

CREATE INDEX admin_audit_log_target_idx
  ON admin_audit_log (target_type, target_id, occurred_at DESC);

CREATE INDEX admin_audit_log_action_idx ON admin_audit_log (action, occurred_at DESC);

-- admin_audit_log_append_only corre antes que admin_audit_log_set_updated_at y bloquea la
-- operación.
CREATE TRIGGER admin_audit_log_append_only
  BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

CREATE TRIGGER admin_audit_log_set_updated_at
  BEFORE UPDATE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
