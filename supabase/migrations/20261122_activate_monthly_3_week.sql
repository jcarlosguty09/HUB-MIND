-- Activate the existing 'Mensual · 3 días por semana' plan for HUB MIND.
-- Narrowly scoped to the exact organization, plan ID and expected code.
-- No memberships, credits, prices, or historical attendance are changed.
UPDATE public.membership_plans
SET is_active = true
WHERE id = '3c78fdbe-1952-40d2-b22d-9654a08c9c88'::uuid
  AND organization_id = 'e775f0f4-30e7-48e1-805c-1cd06d85248e'::uuid
  AND code = 'monthly_3_week'
  AND is_active = false;

-- Verify after deployment:
-- SELECT name, code, access_type, is_active FROM public.membership_plans
-- WHERE id = '3c78fdbe-1952-40d2-b22d-9654a08c9c88'::uuid;
