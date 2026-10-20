-- 0095_admin_audit_log_recent_idx: índice del log de auditoría sin filtros (spec 009 T037,
-- CA-009-21). La pantalla de auditoría abre con las entradas más recientes primero
-- (AuditRepository.list, ORDER BY occurred_at DESC, id DESC) y pagina con cursor sobre el mismo
-- par. Sin este índice esa consulta recorre toda la tabla, que es de solo anexado y crece sin
-- límite; con él lee solo la página. Los filtros por administrador, acción y objeto ya tienen sus
-- índices en 0092.

CREATE INDEX admin_audit_log_recent_idx ON admin_audit_log (occurred_at DESC, id DESC);
