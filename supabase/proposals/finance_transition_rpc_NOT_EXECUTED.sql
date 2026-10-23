-- Finanzas HUB MIND: propuesta de transición controlada
-- NO EJECUTAR hasta revisar seguridad y probar con usuarios reales.
BEGIN;
CREATE TABLE public.finance_transaction_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 transaction_id uuid NOT NULL REFERENCES public.finance_transactions(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 action text NOT NULL CHECK (action IN ('posted','voided')),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 note text
);
ALTER TABLE public.finance_transaction_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_events_master_select ON public.finance_transaction_events
 FOR SELECT TO authenticated USING (public.is_org_master_admin(organization_id));
REVOKE ALL ON public.finance_transaction_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.finance_transaction_events TO authenticated;

CREATE FUNCTION public.finance_transition_transaction(
 p_transaction_id uuid, p_action text, p_reason text DEFAULT NULL
) RETURNS public.finance_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 v_actor uuid := auth.uid();
 v_row public.finance_transactions%ROWTYPE;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Autenticación requerida'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('post','void') THEN
  RAISE EXCEPTION 'Acción no permitida';
 END IF;
 SELECT * INTO v_row FROM public.finance_transactions
 WHERE id = p_transaction_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;
 IF NOT public.is_org_master_admin(v_row.organization_id) THEN
  RAISE EXCEPTION 'Acceso financiero denegado';
 END IF;
 IF p_action = 'post' THEN
  IF v_row.status <> 'draft' THEN RAISE EXCEPTION 'Solo borradores pueden confirmarse'; END IF;
  UPDATE public.finance_transactions SET status = 'posted', posted_at = now()
   WHERE id = p_transaction_id RETURNING * INTO v_row;
  INSERT INTO public.finance_transaction_events(transaction_id,organization_id,action,actor_id)
   VALUES (v_row.id,v_row.organization_id,'posted',v_actor);
 ELSE
  IF v_row.status NOT IN ('draft','posted') THEN RAISE EXCEPTION 'Movimiento ya anulado'; END IF;
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Motivo obligatorio'; END IF;
  UPDATE public.finance_transactions SET status='void',voided_at=now(),void_reason=btrim(p_reason)
   WHERE id=p_transaction_id RETURNING * INTO v_row;
  INSERT INTO public.finance_transaction_events(transaction_id,organization_id,action,actor_id,note)
   VALUES (v_row.id,v_row.organization_id,'voided',v_actor,btrim(p_reason));
 END IF;
 RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.finance_transition_transaction(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_transition_transaction(uuid,text,text) TO authenticated;
COMMIT;
