-- HUB MIND — harden class-pack credit idempotency without modifying existing rows.
-- This migration prevents two 'checkin' ledger debits for the SAME checkin_id.
-- It intentionally does NOT collapse separate check-ins for the same person/day:
-- legitimate second visits must remain possible and require a distinct rule.
--
-- Fail closed if pre-existing duplicates exist: audit and reconcile before retrying.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.membership_credit_ledger
    WHERE transaction_type = 'checkin' AND checkin_id IS NOT NULL
    GROUP BY checkin_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate checkin credit ledger entries exist; reconcile before applying unique index';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS
  ux_membership_credit_ledger_one_debit_per_checkin
ON public.membership_credit_ledger (checkin_id)
WHERE transaction_type = 'checkin' AND checkin_id IS NOT NULL;

-- Read-only verification after migration:
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE schemaname='public' AND tablename='membership_credit_ledger'
-- AND indexname='ux_membership_credit_ledger_one_debit_per_checkin';
