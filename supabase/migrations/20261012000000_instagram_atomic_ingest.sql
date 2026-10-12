-- Instagram inbound webhook: atomic, idempotent ingestion.
-- Execute as a database owner. Only service_role may invoke the RPC.
CREATE OR REPLACE FUNCTION public.crm_instagram_ingest_inbound(
  p_recipient_id text,
  p_sender_id text,
  p_message_id text,
  p_message_type text,
  p_body text,
  p_timestamp timestamptz,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account record;
  v_conversation_id uuid;
  v_message_id uuid;
  v_sent_at timestamptz := coalesce(p_timestamp, now());
BEGIN
  IF p_recipient_id IS NULL OR p_recipient_id = ''
    OR p_sender_id IS NULL OR p_sender_id = ''
    OR p_message_id IS NULL OR p_message_id = '' THEN
    RAISE EXCEPTION 'Missing Instagram event identifiers';
  END IF;
  IF p_message_type NOT IN ('text','attachment','unsupported') THEN
    RAISE EXCEPTION 'Invalid message type';
  END IF;

  SELECT id, organization_id INTO STRICT v_account
  FROM public.organization_instagram_accounts
  WHERE instagram_user_id = p_recipient_id AND is_active = true;

  -- Serialize concurrent deliveries for the same account/contact.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_account.organization_id::text || ':' || v_account.id::text || ':' || p_sender_id, 0)
  );

  INSERT INTO public.crm_instagram_conversations
    (organization_id, account_id, instagram_sender_id, status)
  VALUES (v_account.organization_id, v_account.id, p_sender_id, 'open')
  ON CONFLICT (organization_id, account_id, instagram_sender_id) DO NOTHING;

  SELECT id INTO STRICT v_conversation_id
  FROM public.crm_instagram_conversations
  WHERE organization_id = v_account.organization_id
    AND account_id = v_account.id AND instagram_sender_id = p_sender_id;

  INSERT INTO public.crm_instagram_messages
    (organization_id, conversation_id, instagram_message_id, direction,
     message_type, body, instagram_timestamp, raw_payload)
  VALUES
    (v_account.organization_id, v_conversation_id, p_message_id, 'inbound',
     p_message_type, p_body, p_timestamp, coalesce(p_payload, '{}'::jsonb))
  ON CONFLICT (organization_id, instagram_message_id) DO NOTHING
  RETURNING id INTO v_message_id;

  IF v_message_id IS NOT NULL THEN
    UPDATE public.crm_instagram_conversations
    SET last_message_at = CASE
          WHEN last_message_at IS NULL OR last_message_at <= v_sent_at
          THEN v_sent_at ELSE last_message_at END,
        last_message_preview = CASE
          WHEN last_message_at IS NULL OR last_message_at <= v_sent_at
          THEN coalesce(p_body, '[Adjunto]') ELSE last_message_preview END,
        last_message_direction = CASE
          WHEN last_message_at IS NULL OR last_message_at <= v_sent_at
          THEN 'inbound' ELSE last_message_direction END,
        unread_count = unread_count + 1,
        updated_at = now()
    WHERE organization_id = v_account.organization_id AND id = v_conversation_id;
  END IF;

  RETURN jsonb_build_object(
    'inserted', v_message_id IS NOT NULL,
    'conversation_id', v_conversation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_instagram_ingest_inbound(
  text,text,text,text,text,timestamptz,jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_instagram_ingest_inbound(
  text,text,text,text,text,timestamptz,jsonb
) TO service_role;
