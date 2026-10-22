-- HUB MIND — Finanzas: RLS exclusivo para ADMIN MAESTRO
-- PREPARADO PARA REVISIÓN, NO EJECUTAR HASTA VALIDAR LA MIGRACIÓN BASE.
-- Ejecutar DESPUÉS de crear finance_categories y finance_transactions.
BEGIN;

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

-- No depender del estado del cliente: autorización desde la base de datos.
DROP POLICY IF EXISTS finance_categories_master_select ON public.finance_categories;
DROP POLICY IF EXISTS finance_categories_master_insert ON public.finance_categories;
DROP POLICY IF EXISTS finance_categories_master_update ON public.finance_categories;
DROP POLICY IF EXISTS finance_transactions_master_select ON public.finance_transactions;
DROP POLICY IF EXISTS finance_transactions_master_insert ON public.finance_transactions;
DROP POLICY IF EXISTS finance_transactions_master_update ON public.finance_transactions;

CREATE POLICY finance_categories_master_select ON public.finance_categories
FOR SELECT TO authenticated
USING (public.is_org_master_admin(organization_id));

CREATE POLICY finance_categories_master_insert ON public.finance_categories
FOR INSERT TO authenticated
WITH CHECK (public.is_org_master_admin(organization_id));

CREATE POLICY finance_categories_master_update ON public.finance_categories
FOR UPDATE TO authenticated
USING (public.is_org_master_admin(organization_id))
WITH CHECK (public.is_org_master_admin(organization_id));

CREATE POLICY finance_transactions_master_select ON public.finance_transactions
FOR SELECT TO authenticated
USING (public.is_org_master_admin(organization_id));

CREATE POLICY finance_transactions_master_insert ON public.finance_transactions
FOR INSERT TO authenticated
WITH CHECK (public.is_org_master_admin(organization_id)
  AND created_by = auth.uid()
  AND status = 'draft'
  AND posted_at IS NULL
  AND voided_at IS NULL);

-- No permitir UPDATE/DELETE directo de movimientos financieros:
-- publicar/anular mediante RPC SECURITY DEFINER con validaciones y auditoría.
-- La ausencia de políticas UPDATE/DELETE bloquea estos métodos vía API.
REVOKE ALL ON public.finance_categories FROM anon;
REVOKE ALL ON public.finance_transactions FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.finance_categories TO authenticated;
GRANT SELECT, INSERT ON public.finance_transactions TO authenticated;

COMMIT;

-- PENDIENTE antes de ejecutar:
-- (1) validar FK de member_memberships y organizations,
-- (2) impedir reclasificación de kind en categorías usadas,
-- (3) verificar coherencia category.kind = transaction.kind,
-- (4) crear RPC segura para publicar/anular y log de auditoría,
-- (5) pruebas REST con admin, coach, atleta y master_admin.
