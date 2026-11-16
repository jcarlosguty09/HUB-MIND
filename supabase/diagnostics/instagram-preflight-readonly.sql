-- HUB MIND / Instagram — READ-ONLY preflight
-- Run in Supabase SQL Editor. This script does not create, update or delete anything.
-- Share the results (excluding any token or sensitive message content) before enabling instagram-send.

-- 1. Does the inbound webhook RPC exist, and what arguments does it accept?
select n.nspname as schema_name, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as returns,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'crm_instagram_ingest_inbound';

-- 2. Columns actually available for conversations, messages, and connected accounts.
--    This validates frontend assumptions: conversation_id, body, direction,
--    instagram_timestamp, instagram_sender_id, account_id, instagram_user_id, is_active.
select table_name, ordinal_position, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('crm_instagram_conversations','crm_instagram_messages','organization_instagram_accounts')
order by table_name, ordinal_position;

-- 3. RLS enabled and policies present (names and expressions, not private data).
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('crm_instagram_conversations','crm_instagram_messages','organization_instagram_accounts');

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in ('crm_instagram_conversations','crm_instagram_messages','organization_instagram_accounts')
order by tablename, policyname;

-- 4. Check the unique constraints/indexes needed for message idempotency.
select tablename, indexname, indexdef
from pg_indexes
where schemaname='public'
  and tablename in ('crm_instagram_conversations','crm_instagram_messages','organization_instagram_accounts')
order by tablename,indexname;

-- Do not enable INSTAGRAM_SEND_ENABLED until the schema, policies,
-- account mapping and outbound persistence have been reviewed.
