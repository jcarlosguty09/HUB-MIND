-- HUB MIND | conciliación segura | auditoría READ ONLY
-- Ejecutar en Supabase SQL Editor. No realiza INSERT/UPDATE/DELETE.
-- Fuente de verdad: auth.users + organization_members + profiles.
-- Organización HUB MIND: e775f0f4-30e7-48e1-805c-1cd06d85248e

-- 1. Resumen de usuarios y correos
SELECT count(*) AS memberships_app,
       count(DISTINCT om.user_id) AS users_app,
       count(*) FILTER (WHERE om.is_active) AS active_memberships,
       count(*) FILTER (WHERE au.email IS NULL) AS without_auth_email
FROM public.organization_members om
LEFT JOIN auth.users au ON au.id = om.user_id
WHERE om.organization_id = 'e775f0f4-30e7-48e1-805c-1cd06d85248e'::uuid;

-- 2. Correos duplicados entre identidades de autenticación
SELECT lower(trim(au.email)) AS email, count(DISTINCT om.user_id) AS users,
       array_agg(DISTINCT om.user_id::text) AS user_ids
FROM public.organization_members om
JOIN auth.users au ON au.id = om.user_id
WHERE om.organization_id = 'e775f0f4-30e7-48e1-805c-1cd06d85248e'::uuid
  AND nullif(trim(au.email), '') IS NOT NULL
GROUP BY lower(trim(au.email))
HAVING count(DISTINCT om.user_id) > 1;

-- 3. Identidades especiales confirmadas: comprobar correo REAL, rol y vigencia
SELECT om.user_id, p.full_name, au.email AS email_app_preservar,
       om.role, om.is_active, om.membership_channel,
       om.membership_subtype, om.membership_expires
FROM public.organization_members om
LEFT JOIN public.profiles p ON p.id = om.user_id
LEFT JOIN auth.users au ON au.id = om.user_id
WHERE om.organization_id = 'e775f0f4-30e7-48e1-805c-1cd06d85248e'::uuid
  AND (
    lower(coalesce(au.email, '')) IN ('jiloredo@outlook.com', 'al.ta.co@icloud.com')
    OR lower(coalesce(p.full_name, '')) LIKE '%viridiana%corona%'
    OR lower(coalesce(p.full_name, '')) LIKE '%mari%arcila%'
    OR lower(coalesce(p.full_name, '')) LIKE '%annie%'
  )
ORDER BY p.full_name;

-- 4. Membresías: detectar múltiples vigentes o activas para un mismo usuario
SELECT mm.user_id, count(*) AS active_memberships,
       array_agg(mm.id::text ORDER BY mm.created_at DESC) AS membership_ids
FROM public.member_memberships mm
WHERE mm.organization_id = 'e775f0f4-30e7-48e1-805c-1cd06d85248e'::uuid
  AND mm.status = 'active'
GROUP BY mm.user_id
HAVING count(*) > 1;

-- 5. Catálogo de planes: verificar si existe plan 12 clases/mes
SELECT id, name, code, access_type, weekly_limit, included_classes,
       duration_days, default_price, is_active
FROM public.membership_plans
WHERE organization_id = 'e775f0f4-30e7-48e1-805c-1cd06d85248e'::uuid
ORDER BY name;

-- 6. Filas staging aprobadas sin identidad APP vinculada
SELECT id, source_row, source_name, source_package, match_type, approved,
       matched_user_id
FROM public.membership_import_staging
WHERE organization_id = 'e775f0f4-30e7-48e1-805c-1cd06d85248e'::uuid
  AND approved = true
  AND matched_user_id IS NULL
ORDER BY source_row;
