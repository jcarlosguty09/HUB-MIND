/**
 * HUB MIND — Instagram outbound messaging (outbound history).
 *
 * Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY,
 * INSTAGRAM_SEND_ACCESS_TOKEN, INSTAGRAM_SEND_ACCOUNT_ID,
 * INSTAGRAM_SEND_ENABLED=true, INSTAGRAM_GRAPH_API_VERSION (e.g. vXX.X).
 *
 * One connected Instagram account only. Never expose tokens to the browser.
 * Uses the caller JWT and RLS to authorize access to the conversation.
 * Requires SUPABASE_SERVICE_ROLE_KEY and crm_instagram_record_outbound migration.
 */
const cors = (request: Request) => {
  const origin = request.headers.get("origin") || "";
  // Only the HUB MIND production app can invoke from a browser.
  return origin === "https://wod.hubmind.shop" ? {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization,apikey,content-type,x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
  } : {};
};
const reply = (body: unknown, status = 200, corsHeaders: Record<string,string> = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store", ...corsHeaders },
});
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const validId = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v);

Deno.serve(async (request: Request) => {
  const responseCors = cors(request);
  const sendReply = (body: unknown, status = 200) => reply(body, status, responseCors);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseCors });
  if (request.headers.get("origin") && !responseCors["access-control-allow-origin"]) return sendReply({error:"origin_not_allowed"},403);
  if (request.method !== "POST") return sendReply({ error: "method_not_allowed" }, 405);
  if (Deno.env.get("INSTAGRAM_SEND_ENABLED") !== "true") return sendReply({ error: "send_not_enabled" }, 503);
  const base = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const accessToken = Deno.env.get("INSTAGRAM_SEND_ACCESS_TOKEN");
  const accountId = Deno.env.get("INSTAGRAM_SEND_ACCOUNT_ID")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const version = Deno.env.get("INSTAGRAM_GRAPH_API_VERSION");
  if (!base || !anon || !serviceKey || !accessToken || !accountId || !version || !/^v\d+\.\d+$/.test(version)) {
    return sendReply({ error: "server_not_configured" }, 503);
  }
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) return sendReply({ error: "unauthorized" }, 401);
  let input: unknown;
  try { input = await request.json(); } catch { return sendReply({ error: "invalid_json" }, 400); }
  if (!isRecord(input) || !validId(input.conversation_id) || (typeof input.text !== "string" || !input.text.trim() || input.text.length > 1000) && typeof input.image_base64 !== "string") return sendReply({ error: "invalid_input" }, 400);
  const imageBase64 = typeof input.image_base64 === "string" ? input.image_base64 : null;
  if (imageBase64 && (imageBase64.length > 7_000_000 || !/^\/9j\//.test(imageBase64))) return sendReply({error:"invalid_image_jpeg_max_5mb"},400);
  if (imageBase64 && typeof input.text === "string" && input.text.trim()) return sendReply({error:"send_image_or_text_separately"},400);
  try {
    const headers = { apikey: anon, Authorization: authorization };
    const userResponse = await fetch(base + "/auth/v1/user", { headers });
    if (!userResponse.ok) return sendReply({ error: "unauthorized" }, 401);
    const user: unknown = await userResponse.json();
    if (!isRecord(user) || !validId(user.id)) return sendReply({ error: "unauthorized" }, 401);
    // Read through caller's RLS: a conversation invisible to the caller cannot be messaged.
    const path = "/rest/v1/crm_instagram_conversations?select=id,organization_id,instagram_sender_id,account_id&id=eq." +
      encodeURIComponent(input.conversation_id) + "&limit=1";
    const conversationResponse = await fetch(base + path, { headers });
    if (!conversationResponse.ok) return sendReply({ error: "conversation_access_failed" }, 403);
    const conversations: unknown = await conversationResponse.json();
    const conversation = Array.isArray(conversations) ? conversations[0] : null;
    if (!isRecord(conversation) || !validId(conversation.instagram_sender_id) || !validId(conversation.account_id)) {
      return sendReply({ error: "conversation_not_found" }, 404);
    }
    // Confirm the conversation belongs to the configured Instagram account.
    const accountResponse = await fetch(base + "/rest/v1/organization_instagram_accounts?select=id,instagram_user_id&is_active=eq.true&id=eq." +
      encodeURIComponent(conversation.account_id) + "&limit=1", { headers });
    if (!accountResponse.ok) return sendReply({ error: "account_access_failed" }, 403);
    const accounts: unknown = await accountResponse.json();
    const account = Array.isArray(accounts) ? accounts[0] : null;
    if (!isRecord(account)) return sendReply({ error: "account_not_visible_to_user" }, 403);
    if (String(account.instagram_user_id).trim() !== accountId) return sendReply({ error: "account_id_secret_mismatch" }, 403);

    let imageUrl: string | null = null;
    if (imageBase64) {
      const bytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
      if (bytes.length > 5_000_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length-2] !== 0xff || bytes[bytes.length-1] !== 0xd9) return sendReply({error:"invalid_jpeg"},400);
      const objectName = crypto.randomUUID() + ".jpg";
      const upload = await fetch(base + "/storage/v1/object/crm-instagram-outbound/" + objectName, {
        method:"POST", headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey,"content-type":"image/jpeg","x-upsert":"false"},body:bytes
      });
      if (!upload.ok) { const detail = await upload.json().catch(() => null); console.error("instagram_image_upload_failed", { status: upload.status, code: isRecord(detail) && typeof detail.error === "string" ? detail.error : null }); return sendReply({error:"image_upload_failed",storage_status:upload.status,storage_code:isRecord(detail) && typeof detail.error === "string" ? detail.error : null},502); }
      imageUrl = base + "/storage/v1/object/public/crm-instagram-outbound/" + objectName;
    }
    const response = await fetch("https://graph.instagram.com/" + version + "/" + encodeURIComponent(accountId) + "/messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "content-type": "application/json" },
      body: JSON.stringify({ recipient: { id: conversation.instagram_sender_id }, message: imageUrl ? { attachment: { type:"image", payload:{ url:imageUrl } } } : { text: String(input.text).trim() } }),
    });
    if (!response.ok) {
      // Meta may return user-identifying content and request traces. Only expose numeric
      // error codes and a generic category; keep full messages/tokens out of responses.
      const failure: unknown = await response.json().catch(() => null);
      const metaError = isRecord(failure) && isRecord(failure.error) ? failure.error : null;
      const code = typeof metaError?.code === "number" ? metaError.code : null;
      const subcode = typeof metaError?.error_subcode === "number" ? metaError.error_subcode : null;
      const category = typeof metaError?.type === "string" && /^[A-Za-z_]{1,80}$/.test(metaError.type)
        ? metaError.type : null;
      console.error("instagram_send_failed", { status: response.status, code, subcode, category });
      return sendReply({ error: "meta_send_failed", status: response.status, meta_code: code, meta_subcode: subcode, meta_type: category }, 502);
    }
    const data: unknown = await response.json();
    const messageId = isRecord(data) && typeof data.message_id === "string" ? data.message_id : null;
    if (!messageId) return sendReply({ error: "meta_response_missing_message_id" }, 502);
    // Meta has accepted the message. A history failure must never invite a resend.
    try {
      const saved = await fetch(base + "/rest/v1/rpc/crm_instagram_record_outbound", {
        method: "POST",
        headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "content-type": "application/json" },
        body: JSON.stringify({
          p_conversation_id: conversation.id,
          p_actor_id: user.id,
          p_instagram_account_id: accountId,
          p_message_id: messageId,
          p_body: imageUrl ? "[Imagen enviada] " + imageUrl : String(input.text).trim(),
          p_sent_at: new Date().toISOString()
        }),
      });
      const record: unknown = await saved.json().catch(() => null);
      if (saved.ok && isRecord(record) && record.persisted === true) {
        return sendReply({ sent: true, message_id: messageId, persisted: true });
      }
      console.error("instagram_history_failed", { status: saved.status, message_id: messageId });
    } catch {
      console.error("instagram_history_unavailable", { message_id: messageId });
    }
    return sendReply({ sent: true, message_id: messageId, persisted: false, warning: "history_not_saved" });
  } catch (error) {
    console.error("instagram_send_error", error instanceof Error ? error.message : "unknown");
    return sendReply({ error: "send_unavailable" }, 503);
  }
});
