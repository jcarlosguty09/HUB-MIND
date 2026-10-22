-- Auditoría adicional de funciones y protección de roles (SOLO LECTURA).
-- No modifica ninguna tabla ni política.
SELECT n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('is_org_admin','is_org_master_admin','is_org_member')
ORDER BY p.proname;

SELECT event_object_schema, event_object_table, trigger_name,
       action_timing, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_schema='public'
  AND event_object_table='organization_members'
ORDER BY trigger_name;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='organization_members'
  AND grantee IN ('anon','authenticated','PUBLIC')
ORDER BY grantee, privilege_type;
