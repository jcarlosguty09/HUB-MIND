-- HUB MIND: Conversión 3x semana -> paquete de 12 clases.
-- Ejecutar manualmente en Supabase SQL Editor después de respaldar las tablas.
-- El saldo inicial de las membresías sin ledger será 0, editable por ADMIN MAESTRO.
-- No se altera el histórico de importes ni se crean cobros.
BEGIN;

-- Bloquear conversiones ambiguas (más de un plan destino por organización).
DO $$
DECLARE r record; target uuid;
BEGIN
  FOR r IN SELECT id,organization_id FROM public.membership_plans
    WHERE lower(trim(name)) IN ('mensual 3 veces por semana','mensual · 3 días por semana') FOR UPDATE
  LOOP
    SELECT id INTO STRICT target FROM public.membership_plans
      WHERE organization_id=r.organization_id AND lower(trim(name))='paquete 12 clases'
        AND access_type='class_pack' AND is_active=true;
    UPDATE public.member_memberships SET plan_id=target WHERE plan_id=r.id;
    UPDATE public.membership_plans SET is_active=false WHERE id=r.id;
  END LOOP;
END $$;

-- Impedir dos consumos para el mismo check-in, incluso en concurrencia.
-- Si existen duplicados históricos, este índice aborta la transacción sin modificar datos.
CREATE UNIQUE INDEX IF NOT EXISTS membership_credit_one_checkin_consumption
ON public.membership_credit_ledger(checkin_id)
WHERE transaction_type='checkin' AND checkin_id IS NOT NULL;

-- Cambio de saldo como ajuste contable en el ledger (sin sobreescribir eventos).
-- El ajuste escribe todos los campos obligatorios del ledger.
CREATE OR REPLACE FUNCTION public.master_set_membership_credit_balance(
  p_membership_id uuid, p_balance integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_org uuid; v_user uuid; v_plan_access text; v_current numeric; v_delta integer;
BEGIN
  IF p_balance IS NULL OR p_balance<0 OR p_balance>10000 THEN
    RAISE EXCEPTION 'Saldo inválido (0-10000)';
  END IF;
  SELECT p.organization_id,m.user_id,p.access_type INTO v_org,v_user,v_plan_access
  FROM public.member_memberships m
  JOIN public.membership_plans p ON p.id=m.plan_id
  WHERE m.id=p_membership_id FOR UPDATE OF m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Membresía no encontrada'; END IF;
  IF NOT public.is_org_master_admin(v_org) THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;
  IF v_plan_access <> 'class_pack' THEN
    RAISE EXCEPTION 'Solo se puede editar saldo de paquetes de clases';
  END IF;
  SELECT coalesce(sum(quantity),0) INTO v_current
  FROM public.membership_credit_ledger WHERE membership_id=p_membership_id;
  v_delta:=p_balance-v_current;
  IF v_delta<>0 THEN
    INSERT INTO public.membership_credit_ledger
      (organization_id,membership_id,user_id,quantity,transaction_type,note,created_by)
    VALUES
      (v_org,p_membership_id,v_user,v_delta,'adjustment',
       'Ajuste manual de saldo por ADMIN MAESTRO',auth.uid());
  END IF;
  RETURN p_balance;
END $$;

REVOKE ALL ON FUNCTION public.master_set_membership_credit_balance(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.master_set_membership_credit_balance(uuid,integer) TO authenticated;
COMMIT;

-- PRUEBA OBLIGATORIA: comprobar que el check-in válido registra -1 en membership_credit_ledger,
-- y que el mismo check-in no descuenta dos veces. Esta migración NO modifica el trigger.
