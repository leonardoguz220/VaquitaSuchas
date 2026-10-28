-- 0075_notifications_link_internal: el enlace de un aviso es siempre una ruta interna (spec 005,
-- data-model.md §1; RNF-005-02).
-- El CHECK de 0070 (link ~ '^/[^/]') dejaba pasar '/\evil.example': el navegador lee '\' como '/'
-- y abre //evil.example, un enlace a otro sitio. Ahora el enlace es una lista de segmentos con
-- letras, números, '-' y '_' (las rutas que arma el backend: /grupos, /cupos, /cobros/<id>,
-- /grupos/<id>, /solicitudes/<id>); sin barra invertida, '%', ':', espacios, '?' ni segmentos
-- vacíos. NULL sigue permitido (aviso sin enlace). Una ruta nueva con otros caracteres se agrega
-- en una migración.

ALTER TABLE notifications
  DROP CONSTRAINT notifications_link_check,
  ADD CONSTRAINT notifications_link_check CHECK (link ~ '^(/[A-Za-z0-9_-]+)+$');
