-- Apply before redeploying instagram-send. No existing rows are changed.
BEGIN;
CREATE OR REPLACE FUNCTION public.crm_instagram_record_outbound(
  p_conversation_id uuid, p_actor_id uuid, p_instagram_account_id text,
  p_message_id text, p_body text, p_sent_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_conversation record;
  v_message_id uuid;
  v_existing record;
BEGIN
  IF p_actor_id IS NULL OR p_message_id IS NULL OR btrim(p_message_id) = ''
     OR p_body IS NULL OR btrim(p_body) = '' OR length(p_body) > 1000
     OR p_sent_at IS NULL THEN
    RAISE EXCEPTION 'Invalid outbound message';
  END IF;
  SELECT c.id, c.organization_id, c.account_id, c.instagram_sender_id
    INTO STRICT v_conversation
  FROM public.crm_instagram_conversations c
  JOIN public.organization_instagram_accounts a
    ON a.id = c.account_id AND a.organization_id = c.organization_id
  WHERE c.id = p_conversation_id
    AND a.is_active = true AND a.instagram_user_id = p_instagram_account_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_conversation.organization_id
      AND om.user_id = p_actor_id AND om.is_active = true
      AND om.role IN ('master_admin', 'admin', 'sales')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  -- Same lock as inbound ingestion.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_conversation.organization_id::text || ':' ||
    v_conversation.account_id::text || ':' ||
    v_conversation.instagram_sender_id, 0));
  INSERT INTO public.crm_instagram_messages
    (organization_id, conversation_id, instagram_message_id, direction,
     message_type, body, instagram_timestamp, raw_payload, sent_by)
  VALUES
    (v_conversation.organization_id, p_conversation_id, p_message_id,
     'outbound', 'text', p_body, p_sent_at, '{}'::jsonb, p_actor_id)
  ON CONFLICT (organization_id, instagram_message_id) DO NOTHING
  RETURNING id INTO v_message_id;
  IF v_message_id IS NULL THEN
    SELECT conversation_id, direction INTO STRICT v_existing
    FROM public.crm_instagram_messages
    WHERE organization_id = v_conversation.organization_id
      AND instagram_message_id = p_message_id;
    IF v_existing.conversation_id <> p_conversation_id
       OR v_existing.direction <> 'outbound' THEN
      RAISE EXCEPTION 'Message identity conflict';
    END IF;
  ELSE
    UPDATE public.crm_instagram_conversations
    SET last_message_at = p_sent_at, last_message_preview = p_body,
        last_message_direction = 'outbound', updated_at = now()
    WHERE id = p_conversation_id
      AND organization_id = v_conversation.organization_id
      AND (last_message_at IS NULL OR last_message_at <= p_sent_at);
  END IF;
  RETURN jsonb_build_object('persisted', true, 'inserted', v_message_id IS NOT NULL);
END;
$function$;
-- Only the Edge Function may attest that Meta accepted the message.
REVOKE ALL ON FUNCTION public.crm_instagram_record_outbound(uuid,uuid,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_instagram_record_outbound(uuid,uuid,text,text,text,timestamptz) TO service_role;
COMMIT;
