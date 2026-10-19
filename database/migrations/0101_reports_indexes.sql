-- 0101_reports_indexes: índices de los reportes (spec 006, data-model.md §2; RNF-006-01).
-- Gasto, ahorro y gráficos por persona (< 1 s con 20 suscripciones y 12 meses) y cuotas de
-- referencia del titular por período.

CREATE INDEX charges_user_period_idx ON charges (user_id, period) WHERE status <> 'cancelado';

CREATE INDEX billing_cycles_owner_period_idx ON billing_cycles (owner_id, period);
