-- HUB MIND | Prevent duplicate attendance for the same linked member on the same Mexico City calendar day.
-- Non-destructive: preserves existing rows and does not try to merge historic duplicates.
-- Only applies to rows with user_id. Unknown biometric identities and unlinked walk-ins require a separate identity-reconciliation rule.
-- Intended to cover the overlap between manually-created check-ins and biometric (face) ingestion.

CREATE OR REPLACE FUNCTION public.hm_checkins_dedupe_linked_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_local_date date;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Check-in organization_id is required';
  END IF;

  IF NEW."timestamp" IS NULL THEN
    NEW."timestamp" := now();
  END IF;

  v_local_date := (NEW."timestamp" AT TIME ZONE 'America/Mexico_City')::date;
  v_start := v_local_date::timestamp AT TIME ZONE 'America/Mexico_City';
  v_end := (v_local_date + 1)::timestamp AT TIME ZONE 'America/Mexico_City';

  -- Serialize simultaneous face/manual arrivals even if neither is committed yet.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'hm:checkin:' || NEW.organization_id::text || ':' ||
      NEW.user_id::text || ':' || v_local_date::text,
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.checkins c
    WHERE c.organization_id = NEW.organization_id
      AND c.user_id = NEW.user_id
      AND c."timestamp" >= v_start
      AND c."timestamp" < v_end
  ) THEN
    -- Silently ignore a second event. Important for biometric sync retries,
    -- which should not cause the entire sync batch to fail.
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hm_checkins_dedupe_linked_member_before_insert
  ON public.checkins;

CREATE TRIGGER hm_checkins_dedupe_linked_member_before_insert
BEFORE INSERT ON public.checkins
FOR EACH ROW
EXECUTE FUNCTION public.hm_checkins_dedupe_linked_member();

-- Verification (read-only): duplicates that ALREADY exist are not removed.
-- SELECT organization_id, user_id,
--        ("timestamp" AT TIME ZONE 'America/Mexico_City')::date AS local_day,
--        count(*) AS entries
-- FROM public.checkins
-- WHERE user_id IS NOT NULL
-- GROUP BY 1,2,3
-- HAVING count(*) > 1
-- ORDER BY entries DESC;
