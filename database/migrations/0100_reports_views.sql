-- 0100_reports_views: vistas de lectura del panel y los reportes (spec 006, data-model.md §2;
-- RF-006-02, RF-006-03, RF-006-06, RN-006-01, RN-006-02, RN-006-06, RN-006-07, RNF-006-06).
-- Leen las copias del ciclo y del cobro, nunca los valores actuales del grupo, salvo el precio
-- individual de referencia, que el grupo copia una sola vez al crearse. Excluyen los cobros
-- 'cancelado'. Todo en centavos enteros (bigint).
-- individual_price_bs_cents: NULL si no hay precio individual, o si está en USD y el ciclo no
-- tiene tipo de cambio («sin dato»).

CREATE VIEW v_user_cost_lines AS
SELECT c.user_id,
       c.group_id,
       c.period,
       'miembro'::text AS role,
       c.id AS charge_id,
       c.cycle_id,
       c.amount_cents AS cost_cents,
       c.status,
       CASE WHEN c.status = 'pagado' THEN c.amount_cents ELSE 0::bigint END AS paid_cents,
       CASE
         WHEN g.individual_price_cents_snapshot IS NULL THEN NULL
         WHEN g.individual_price_currency_snapshot = 'BS' THEN g.individual_price_cents_snapshot
         WHEN bc.exchange_rate IS NOT NULL
           THEN round(g.individual_price_cents_snapshot * bc.exchange_rate)::bigint
         ELSE NULL
       END AS individual_price_bs_cents
FROM charges c
JOIN billing_cycles bc ON bc.id = c.cycle_id
JOIN groups g ON g.id = c.group_id
WHERE c.status <> 'cancelado'
UNION ALL
SELECT bc.owner_id,
       bc.group_id,
       bc.period,
       'titular'::text,
       NULL::uuid,
       bc.id,
       bc.owner_share_cents,
       NULL::text,
       NULL::bigint,
       CASE
         WHEN g.individual_price_cents_snapshot IS NULL THEN NULL
         WHEN g.individual_price_currency_snapshot = 'BS' THEN g.individual_price_cents_snapshot
         WHEN bc.exchange_rate IS NOT NULL
           THEN round(g.individual_price_cents_snapshot * bc.exchange_rate)::bigint
         ELSE NULL
       END
FROM billing_cycles bc
JOIN groups g ON g.id = bc.group_id;

-- Cobranza del titular por grupo y período (RF-006-06). pending_cents incluye en_revision.
CREATE VIEW v_group_collection AS
SELECT bc.group_id,
       bc.period,
       bc.owner_id,
       COALESCE(sum(c.amount_cents), 0)::bigint AS expected_cents,
       COALESCE(sum(c.amount_cents) FILTER (WHERE c.status = 'pagado'), 0)::bigint
         AS collected_cents,
       COALESCE(sum(c.amount_cents) FILTER (WHERE c.status = 'en_revision'), 0)::bigint
         AS in_review_cents,
       (COALESCE(sum(c.amount_cents), 0)
         - COALESCE(sum(c.amount_cents) FILTER (WHERE c.status = 'pagado'), 0))::bigint
         AS pending_cents,
       count(c.id)::integer AS charge_count,
       (count(c.id) FILTER (WHERE c.status = 'pagado'))::integer AS paid_count
FROM billing_cycles bc
LEFT JOIN charges c ON c.cycle_id = bc.id AND c.status <> 'cancelado'
GROUP BY bc.id, bc.group_id, bc.period, bc.owner_id;
