-- PREVIEW ONLY: ejecutar en Supabase SQL Editor para inspeccionar ANTES de migrar.
-- No altera registros.
SELECT organization_id, id, name, access_type, included_classes, weekly_limit, is_active
FROM public.membership_plans
WHERE lower(trim(name)) IN ('mensual 3 veces por semana','paquete 12 clases')
ORDER BY organization_id,name;

SELECT p.organization_id,p.name,p.id AS plan_id,
       count(m.id) AS total_memberships,
       count(m.id) FILTER (WHERE m.status='active') AS active_memberships
FROM public.membership_plans p
LEFT JOIN public.member_memberships m ON m.plan_id=p.id
WHERE lower(trim(p.name)) IN ('mensual 3 veces por semana','paquete 12 clases')
GROUP BY p.organization_id,p.name,p.id
ORDER BY p.organization_id,p.name;

SELECT m.id AS membership_id,m.user_id,m.status,m.starts_at,m.expires_at,m.amount_paid,
       coalesce(sum(l.quantity),0) AS existing_credit_balance,
       count(l.membership_id) AS credit_events
FROM public.member_memberships m
JOIN public.membership_plans p ON p.id=m.plan_id
LEFT JOIN public.membership_credit_ledger l ON l.membership_id=m.id
WHERE lower(trim(p.name))='mensual 3 veces por semana'
GROUP BY m.id,m.user_id,m.status,m.starts_at,m.expires_at,m.amount_paid
ORDER BY m.status,m.expires_at;

-- Para confirmar descuentos automáticos: revisar trigger/function en Supabase:
SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
WHERE t.tgrelid='public.checkins'::regclass AND NOT t.tgisinternal;
