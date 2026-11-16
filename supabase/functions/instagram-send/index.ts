/**
 * HUB MIND — Instagram outbound messaging (staged, not deployed).
 *
 * Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY,
 * INSTAGRAM_SEND_ACCESS_TOKEN, INSTAGRAM_SEND_ACCOUNT_ID,
 * INSTAGRAM_SEND_ENABLED=true, INSTAGRAM_GRAPH_API_VERSION (e.g. vXX.X).
 *
 * One connected Instagram account only. Never expose tokens to the browser.
 * Uses the caller JWT and RLS to authorize access to the conversation.
 * IMPORTANT: Outbound persistence / production testing remains a separate step.
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
  const accountId = Deno.env.get("INSTAGRAM_SEND_ACCOUNT_ID");
  const version = Deno.env.get("INSTAGRAM_GRAPH_API_VERSION");
  if (!base || !anon || !accessToken || !accountId || !version || !/^v\d+\.\d+$/.test(version)) {
    return sendReply({ error: "server_not_configured" }, 503);
  }
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) return sendReply({ error: "unauthorized" }, 401);
  let input: unknown;
  try { input = await request.json(); } catch { return sendReply({ error: "invalid_json" }, 400); }
  if (!isRecord(input) || !validId(input.conversation_id) || typeof input.text !== "string" ||
      !input.text.trim() || input.text.length > 1000) return sendReply({ error: "invalid_input" }, 400);
  try {
    const headers = { apikey: anon, Authorization: authorization };
    const userResponse = await fetch(base + "/auth/v1/user", { headers });
    if (!userResponse.ok) return sendReply({ error: "unauthorized" }, 401);
    // Read through caller's RLS: a conversation invisible to the caller cannot be messaged.
    const path = "/rest/v1/crm_instagram_conversations?select=id,instagram_sender_id,account_id&id=eq." +
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
    if (!isRecord(account) || account.instagram_user_id !== accountId) return sendReply({ error: "account_not_configured" }, 403);

    const response = await fetch("https://graph.instagram.com/" + version + "/" + encodeURIComponent(accountId) + "/messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "content-type": "application/json" },
      body: JSON.stringify({ recipient: { id: conversation.instagram_sender_id }, message: { text: input.text.trim() } }),
    });
    if (!response.ok) {
      console.error("instagram_send_failed", { status: response.status });
      return sendReply({ error: "meta_send_failed", status: response.status }, 502);
    }
    const data: unknown = await response.json();
    const messageId = isRecord(data) && typeof data.message_id === "string" ? data.message_id : null;
    if (!messageId) return sendReply({ error: "meta_response_missing_message_id" }, 502);
    // Deliberately no fake database write: outbound persistence needs a verified schema/RPC.
    return sendReply({ sent: true, message_id: messageId, persisted: false });
  } catch (error) {
    console.error("instagram_send_error", error instanceof Error ? error.message : "unknown");
    return sendReply({ error: "send_unavailable" }, 503);
  }
});
