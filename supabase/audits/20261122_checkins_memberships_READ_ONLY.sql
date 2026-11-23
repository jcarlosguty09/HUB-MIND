-- READ ONLY: run in Supabase SQL Editor. No changes to production data.
-- 1. Confirm which membership types are inactive, by organization.
select organization_id, id, name, code, is_active
from public.membership_plans
order by organization_id, name;

-- 2. Check for exact biometric replays (same device, PIN and timestamp).
select device_sn, zk_user_id, "timestamp", count(*) as copies,
       array_agg(id order by id) as checkin_ids
from public.checkins
where device_sn is not null and zk_user_id is not null
group by device_sn, zk_user_id, "timestamp"
having count(*) > 1
order by copies desc, "timestamp" desc
limit 100;

-- 3. Check manual/biometric overlap on the same local calendar date.
-- These are REVIEW candidates, not automatically removable duplicates.
select user_id,
       ("timestamp" at time zone 'America/Mexico_City')::date as local_day,
       count(*) as total,
       count(*) filter (where is_manual is true) as manual_count,
       count(*) filter (where is_manual is not true) as device_count,
       min("timestamp") as first_at, max("timestamp") as last_at
from public.checkins
where user_id is not null
group by user_id, ("timestamp" at time zone 'America/Mexico_City')::date
having count(*) filter (where is_manual is true) > 0
   and count(*) filter (where is_manual is not true) > 0
order by local_day desc
limit 100;

-- 4. List current constraints and indexes before designing an idempotent ingest.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('checkins','membership_plans')
order by tablename, indexname;

-- 5. Check existing triggers that may debit or refund class credits.
select event_object_table, trigger_name, action_timing, event_manipulation,
       action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('checkins','member_memberships')
order by event_object_table, trigger_name;
