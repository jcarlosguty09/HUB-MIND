-- HUB MIND | propuesta de plan 12 clases por 30 días
-- NO ejecutar hasta verificar cómo consume créditos la app.
-- Inserción idempotente: no duplica el plan si ya existe el código.
-- IMPORTANTE: crear el plan NO asigna membresía a Viridiana.
INSERT INTO public.membership_plans (
  organization_id, name, code, access_type,
  weekly_limit, included_classes, duration_days, default_price, is_active
)
SELECT
  'e775f0f4-30e7-48e1-805c-1cd06d85248e'::uuid,
  'Paquete 12 clases',
  'pack_12_monthly',
  'class_pack',
  NULL,
  12,
  30,
  NULL,
  TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM public.membership_plans
  WHERE organization_id = 'e775f0f4-30e7-48e1-805c-1cd06d85248e'::uuid
    AND code = 'pack_12_monthly'
);

-- Verificación después de insertar:
SELECT id, organization_id, name, code, access_type,
       weekly_limit, included_classes, duration_days, is_active
FROM public.membership_plans
WHERE organization_id = 'e775f0f4-30e7-48e1-805c-1cd06d85248e'::uuid
  AND code = 'pack_12_monthly';
