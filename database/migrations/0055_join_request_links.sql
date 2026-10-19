-- 0055_join_request_links: claves foráneas pendientes hacia join_requests (spec 010,
-- data-model.md §2, ajustes M2 y M3 de /speckit-analyze; RN-010-03, RF-010-17).
-- 0031_group_members y 0041_charges ya están aplicadas (RN-000-02): no se editan y las
-- restricciones que dejaron pendientes para la spec 010 se agregan aquí.
-- - charges.join_request_id: el cobro de ingreso apunta a la solicitud que lo originó
--   (RF-010-17). El UNIQUE parcial deja un solo cobro de ingreso por solicitud (M2).
-- - group_members.join_request_id: la estadía que nace de una solicitud aceptada apunta a ella
--   (spec 001, PR #43 H3). El CHECK liga join_source con la columna: 'solicitud' la exige y
--   'creacion' la prohíbe (M3). El UNIQUE parcial deja una sola estadía por solicitud (M2).
-- Las FK son ON DELETE RESTRICT: la solicitud es historial del cobro y de la estadía.

ALTER TABLE charges
  ADD CONSTRAINT charges_join_request_id_fkey FOREIGN KEY (join_request_id)
    REFERENCES join_requests (id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX charges_join_request_uq
  ON charges (join_request_id)
  WHERE join_request_id IS NOT NULL;

ALTER TABLE group_members
  ADD CONSTRAINT group_members_join_request_id_fkey FOREIGN KEY (join_request_id)
    REFERENCES join_requests (id) ON DELETE RESTRICT,
  ADD CONSTRAINT group_members_join_source_request_check
    CHECK ((join_source = 'solicitud') = (join_request_id IS NOT NULL));

CREATE UNIQUE INDEX group_members_join_request_uq
  ON group_members (join_request_id)
  WHERE join_request_id IS NOT NULL;
