-- HUB MIND | Auditoría V1 de integridad. SOLO LECTURA.
-- No importa Excel ni altera datos. Ejecutar en Supabase SQL Editor.
-- Los totales actuales se comparan con la fotografía histórica del Excel V2.
-- 1. Membresías por plan y estado.
SELECT COALESCE(p.name,'SIN PLAN') AS plan, m.status, count(*) AS total
FROM public.member_memberships m
LEFT JOIN public.membership_plans p ON p.id=m.plan_id
GROUP BY p.name,m.status ORDER BY total DESC;

-- 2. Membresías huérfanas, sin usuario o con organización discordante.
SELECT
  count(*) FILTER (WHERE p.id IS NULL AND m.plan_id IS NOT NULL) AS planes_huerfanos,
  count(*) FILTER (WHERE p.id IS NOT NULL AND p.organization_id IS DISTINCT FROM m.organization_id) AS organizacion_plan_incorrecta,
  count(*) FILTER (WHERE m.starts_at IS NOT NULL AND m.expires_at IS NOT NULL AND m.starts_at>m.expires_at) AS fechas_invertidas
FROM public.member_memberships m
LEFT JOIN public.membership_plans p ON p.id=m.plan_id;

-- 3. Paquetes y saldo neto, incluidos saldos negativos.
WITH saldos AS (
 SELECT m.id,m.user_id,m.status,p.name,
        COALESCE(sum(l.quantity),0)::integer AS saldo
 FROM public.member_memberships m
 JOIN public.membership_plans p ON p.id=m.plan_id
 LEFT JOIN public.membership_credit_ledger l ON l.membership_id=m.id
 WHERE p.access_type='class_pack'
 GROUP BY m.id,m.user_id,m.status,p.name
)
SELECT name,status,count(*) AS membresias,
       count(*) FILTER(WHERE saldo=0) AS saldo_cero,
       count(*) FILTER(WHERE saldo<0) AS saldo_negativo,
       count(*) FILTER(WHERE saldo>0) AS saldo_positivo
FROM saldos GROUP BY name,status ORDER BY name,status;

-- 4. Descuentos duplicados por check-in.
SELECT checkin_id,count(*) AS descuentos
FROM public.membership_credit_ledger
WHERE transaction_type='checkin' AND checkin_id IS NOT NULL
GROUP BY checkin_id HAVING count(*)>1;

-- 5. Créditos sin coincidencia de usuario u organización.
SELECT count(*) AS movimientos_inconsistentes
FROM public.membership_credit_ledger l
JOIN public.member_memberships m ON m.id=l.membership_id
WHERE l.user_id IS DISTINCT FROM m.user_id
   OR l.organization_id IS DISTINCT FROM m.organization_id;

-- 6. Check-ins sin usuario y check-ins sin movimiento de crédito:
-- el segundo dato es solo informativo (no todo check-in requiere descuento).
SELECT count(*) AS total_checkins,
       count(*) FILTER(WHERE user_id IS NULL) AS checkins_sin_usuario
FROM public.checkins;
