-- HUB MIND / Finanzas: base transaccional (PROPUESTA; NO EJECUTADA)
-- Requiere revisión de roles/RLS y respaldo antes de aplicar a producción.
-- Nunca migrar amount_paid como cobro sin comprobante de transacción.
BEGIN;

CREATE TABLE IF NOT EXISTS public.finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('income','expense')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name, kind),
  UNIQUE (id, organization_id)
);

CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  category_id uuid NOT NULL,
  member_user_id uuid REFERENCES auth.users(id),
  membership_id uuid REFERENCES public.member_memberships(id),
  kind text NOT NULL CHECK (kind IN ('income','expense')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  occurred_on date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
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
  CONSTRAINT finance_category_same_org FOREIGN KEY (category_id, organization_id)
    REFERENCES public.finance_categories(id, organization_id),
  CONSTRAINT finance_posted_has_time CHECK (status <> 'posted' OR posted_at IS NOT NULL),
  CONSTRAINT finance_void_has_time CHECK (status <> 'void' OR voided_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_transactions_import_key
ON public.finance_transactions (organization_id, source, external_key)
WHERE external_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS finance_transactions_org_date
ON public.finance_transactions (organization_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS finance_transactions_member
ON public.finance_transactions (organization_id, member_user_id)
WHERE member_user_id IS NOT NULL;

-- Mantener datos financieros cerrados por defecto. El acceso se habilitará
-- mediante políticas/RPC revisadas contra roles efectivos de la organización.
ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_categories FROM anon, authenticated;
REVOKE ALL ON public.finance_transactions FROM anon, authenticated;

COMMIT;

-- Definiciones de métricas previstas:
-- Flujo de caja = ingresos posted - gastos posted por occurred_on.
-- Utilidad contable requiere devengos, impuestos y ajustes adicionales;
-- inicialmente mostrar 'resultado operativo de caja', no utilidad neta.
-- Adeudos / reembolsos: fases posteriores con documentos y movimientos enlazados.
