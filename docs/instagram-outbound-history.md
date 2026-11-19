# Instagram reply history — installation

1. Merge this branch.
2. In Supabase SQL Editor, run supabase/migrations/20261119_instagram_outbound_history.sql.
   It creates one RPC and its execute grants; it does not backfill or delete existing messages.
3. Replace the deployed instagram-send code with supabase/functions/instagram-send/index.ts
   from the merged branch and deploy updates. Keep Verify JWT enabled.
4. Existing secrets remain; SUPABASE_SERVICE_ROLE_KEY must be available to the Edge Function
   (Supabase supplies it by default). Never put it in the frontend.
5. Reload HUB MIND and send a new reply in the existing test conversation.
   Verify delivery in Instagram, "Enviado y registrado.", an outbound bubble after refresh,
   and persistence after a full page reload.

Old replies sent before this change are not backfilled.

The RPC is service_role-only. The Edge Function validates the caller session and reads the
conversation/account with caller RLS before sending. The RPC also verifies the actor's active
organization role, the active Instagram account, and conversation organization.
Message ID conflicts are idempotent only within the same conversation and direction.
Preview updates are atomic with message insertion and cannot overwrite a newer preview.
Outbound sends do not increase unread_count.

If Meta accepts the reply but saving fails, the response remains sent:true/persisted:false.
The UI warns not to resend. Automatic re-sending is deliberately absent.
Check instagram_history_failed/unavailable logs and restore the record using its Meta message ID
through an authorized server workflow; do not send the same message again.
A network failure after Meta acceptance can still leave delivery uncertain; full durable
send reconciliation is outside this change.

Validation: node tests/instagram-send-history.test.mjs (Node 24+), plus JS syntax check.
Five mocked backend scenarios passed. SQL has been checked against the provided live column/index
contract but has not been executed here; live DB constraints and end-to-end deployment need validation.
Rollback: restore previous Edge Function and UI; the unused RPC can remain without affecting inbound.
