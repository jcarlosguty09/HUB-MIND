-- HUB MIND / Finanzas v1: migración inicial
-- REVISAR ANTES DE EJECUTAR EN SUPABASE. No importa cobros históricos.
-- Requiere funciones public.is_org_master_admin(uuid) existentes.
BEGIN;

CREATE TABLE public.finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  kind text NOT NULL CHECK (kind IN ('income','expense')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name, kind),
  UNIQUE (id, organization_id),
  UNIQUE (id, organization_id, kind)
);

CREATE TABLE public.finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  category_id uuid NOT NULL,
  member_user_id uuid REFERENCES auth.users(id),
  membership_id uuid REFERENCES public.member_memberships(id),
  kind text NOT NULL CHECK (kind IN ('income','expense')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  occurred_on date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'MXN' CHECK (currency='MXN'),
  payment_method text CHECK (payment_method IN ('cash','card','transfer','other')),
  reference text,
  description text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','integration','import')),
  external_key text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  CONSTRAINT finance_category_same_org_kind
    FOREIGN KEY (category_id,organization_id,kind)
    REFERENCES public.finance_categories(id,organization_id,kind),
  CONSTRAINT finance_status_times CHECK (
    (status='draft' AND posted_at IS NULL AND voided_at IS NULL)
    OR (status='posted' AND posted_at IS NOT NULL AND voided_at IS NULL)
    OR (status='void' AND voided_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX finance_transactions_external_key_unique
 ON public.finance_transactions(organization_id,source,external_key)
 WHERE external_key IS NOT NULL;
CREATE INDEX finance_transactions_org_date
 ON public.finance_transactions(organization_id,occurred_on DESC);

-- Verificar organización de membresía enlazada, si se proporciona.
CREATE OR REPLACE FUNCTION public.finance_check_membership_org()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.membership_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.member_memberships m
   WHERE m.id=NEW.membership_id
     AND m.organization_id=NEW.organization_id
     AND (NEW.member_user_id IS NULL OR m.user_id=NEW.member_user_id)
 ) THEN
   RAISE EXCEPTION 'Membresía y organización/usuario no coinciden';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_validate_membership
 BEFORE INSERT OR UPDATE ON public.finance_transactions
 FOR EACH ROW EXECUTE FUNCTION public.finance_check_membership_org();

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_categories_master_select ON public.finance_categories
 FOR SELECT TO authenticated USING (public.is_org_master_admin(organization_id));
CREATE POLICY finance_categories_master_insert ON public.finance_categories
 FOR INSERT TO authenticated WITH CHECK (public.is_org_master_admin(organization_id));
CREATE POLICY finance_categories_master_update ON public.finance_categories
 FOR UPDATE TO authenticated
 USING (public.is_org_master_admin(organization_id))
 WITH CHECK (public.is_org_master_admin(organization_id));

CREATE POLICY finance_transactions_master_select ON public.finance_transactions
 FOR SELECT TO authenticated USING (public.is_org_master_admin(organization_id));
CREATE POLICY finance_transactions_master_insert ON public.finance_transactions
 FOR INSERT TO authenticated
 WITH CHECK (public.is_org_master_admin(organization_id)
  AND created_by=auth.uid() AND status='draft'
  AND posted_at IS NULL AND voided_at IS NULL);

-- Sin políticas UPDATE/DELETE para transacciones. Se implementarán RPC auditables.
REVOKE ALL ON public.finance_categories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.finance_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.finance_categories TO authenticated;
GRANT SELECT,INSERT ON public.finance_transactions TO authenticated;

COMMIT;
