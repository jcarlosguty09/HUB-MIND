-- DIAGNÓSTICO FINAL, SOLO LECTURA. Ejecutar en Supabase SQL Editor.
-- 1. Valores permitidos en transaction_type y reglas de integridad.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid='public.membership_credit_ledger'::regclass
ORDER BY conname;

-- 2. Triggers de check-in y ledger (para verificar descuento y deduplicación).
SELECT c.relname AS tabla,t.tgname,pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('checkins','membership_credit_ledger')
  AND NOT t.tgisinternal ORDER BY c.relname,t.tgname;

-- 3. Planes relevantes y tipo de acceso.
SELECT id,organization_id,name,access_type,is_active
FROM public.membership_plans
WHERE lower(trim(name)) IN ('mensual 3 veces por semana','paquete 12 clases')
ORDER BY organization_id,name;

-- 4. Créditos existentes en plan antiguo, sin datos personales.
SELECT m.id,m.status,coalesce(sum(l.quantity),0) AS saldo_actual,
       count(l.id) AS movimientos
FROM public.member_memberships m
JOIN public.membership_plans p ON p.id=m.plan_id
LEFT JOIN public.membership_credit_ledger l ON l.membership_id=m.id
WHERE lower(trim(p.name))='mensual 3 veces por semana'
GROUP BY m.id,m.status ORDER BY m.status;
