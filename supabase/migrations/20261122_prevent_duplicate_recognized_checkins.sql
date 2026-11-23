-- HUB MIND: prevent duplicate recognized check-ins across manual and biometric sources.
-- Does not delete or modify historical rows.
-- Day boundary is America/Mexico_City, not UTC.
-- Different athletes and different days remain unaffected.
-- Anonymous walk-ins (user_id and zk_user_id both NULL) are intentionally excluded:
-- name matching is unsafe and would merge different people.
CREATE OR REPLACE FUNCTION public.prevent_duplicate_recognized_checkin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day date;
BEGIN
  IF NEW.user_id IS NULL AND NEW.zk_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_day := (NEW."timestamp" AT TIME ZONE 'America/Mexico_City')::date;
  -- Prevent two concurrent check-ins for the same identified athlete.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW.organization_id::text || ':' || v_day::text,
      0
    )
  );

  IF EXISTS (
    SELECT 1 FROM public.checkins existing
    WHERE existing.organization_id = NEW.organization_id
      AND (existing."timestamp" AT TIME ZONE 'America/Mexico_City')::date = v_day
      AND (
        (NEW.user_id IS NOT NULL AND existing.user_id = NEW.user_id)
        OR
        (NEW.zk_user_id IS NOT NULL AND existing.zk_user_id = NEW.zk_user_id)
      )
  ) THEN
    -- Idempotent webhook/manual retries: keep the original row/class/audit.
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS checkins_prevent_duplicate_recognized ON public.checkins;
CREATE TRIGGER checkins_prevent_duplicate_recognized
BEFORE INSERT ON public.checkins
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_recognized_checkin();

-- Inspect (do not delete) historical duplicates before a separate reconciliation:
-- SELECT organization_id, user_id, ("timestamp" AT TIME ZONE 'America/Mexico_City')::date AS local_day,
--        count(*) AS rows
-- FROM public.checkins WHERE user_id IS NOT NULL
-- GROUP BY 1,2,3 HAVING count(*) > 1 ORDER BY rows DESC;
