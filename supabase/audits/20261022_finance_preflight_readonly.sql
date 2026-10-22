-- HUB MIND — auditoría de esquema y RLS, SOLO LECTURA.
-- Ejecutar en Supabase SQL Editor y compartir los resultados.
-- No modifica tablas, roles, permisos ni datos.
SELECT table_schema,table_name,column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('organizations','organization_members','member_memberships','members_admin','finance_categories','finance_transactions')
ORDER BY table_name,ordinal_position;

SELECT schemaname,tablename,rowsecurity,forcerowsecurity
FROM pg_tables
WHERE schemaname='public'
 AND tablename IN ('organizations','organization_members','member_memberships','members_admin','finance_categories','finance_transactions')
ORDER BY tablename;

SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies
WHERE schemaname='public'
 AND tablename IN ('organizations','organization_members','member_memberships','members_admin','finance_categories','finance_transactions')
ORDER BY tablename,policyname;

SELECT routine_schema,routine_name,security_type
FROM information_schema.routines
WHERE routine_schema='public'
 AND (routine_name ILIKE '%role%' OR routine_name ILIKE '%member%' OR routine_name ILIKE '%finance%')
ORDER BY routine_name;
