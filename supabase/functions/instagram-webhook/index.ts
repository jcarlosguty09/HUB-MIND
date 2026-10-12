// Instagram webhook V2: signed events, tenant-scoped persistence.
// Meta calls this endpoint without a Supabase JWT; deploy with Verify JWT OFF.
// Keep INSTAGRAM_WEBHOOK_INGEST_ENABLED unset until the Instagram account is mapped.
const encoder = new TextEncoder();
const reply = (body: string, status = 200) => new Response(body, {
  status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
});

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifySignature(body: Uint8Array, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !/^sha256=[0-9a-f]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), {
    name: "HMAC", hash: "SHA-256",
  }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  const supplied = Uint8Array.from(signature.slice(7).match(/.{2}/g)!, x => parseInt(x, 16));
  return constantTimeEqual(expected, supplied);
}

type Json = Record<string, unknown>;
function obj(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function timestamp(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const date = new Date(n < 1e11 ? n * 1000 : n);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const base = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
async function db(path: string, init: RequestInit = {}): Promise<unknown> {
  if (!base || !serviceKey) throw new Error("Supabase service configuration missing");
  const response = await fetch(base + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      "content-type": "application/json",
      Prefer: "return=representation" + (init.method === "POST" ? ",resolution=ignore-duplicates" : ""),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error("Database request failed: " + response.status);
  // PATCH can return 204 with no body; do not treat successful empty responses as errors.
  const body = await response.text();
  return body ? JSON.parse(body) : [];
}

async function storeMessage(entry: Json, event: Json): Promise<void> {
  const sender = obj(event.sender);
  const recipient = obj(event.recipient);
  const message = obj(event.message);
  const mid = str(message?.mid);
  const senderId = str(sender?.id);
  const recipientId = str(recipient?.id);
  if (!mid || !senderId || !recipientId || message?.is_echo === true) return;
  const messageType = str(message?.text) ? "text" :
    Array.isArray(message?.attachments) ? "attachment" : "unsupported";
  await db("rpc/crm_instagram_ingest_inbound", {
    method: "POST",
    body: JSON.stringify({
      p_recipient_id: recipientId,
      p_sender_id: senderId,
      p_message_id: mid,
      p_message_type: messageType,
      p_body: str(message?.text),
      p_timestamp: timestamp(event.timestamp ?? entry.time),
      p_payload: event,
    }),
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const token = url.searchParams.get("hub.verify_token");
    const expected = Deno.env.get("INSTAGRAM_WEBHOOK_VERIFY_TOKEN");
    if (url.searchParams.get("hub.mode") !== "subscribe" || !token || !expected ||
        !url.searchParams.get("hub.challenge") ||
        !constantTimeEqual(
          new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token))),
          new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(expected)))
        )) return reply("Forbidden", 403);
    return reply(url.searchParams.get("hub.challenge")!);
  }
  if (request.method !== "POST") return reply("Method not allowed", 405);
  const secret = Deno.env.get("INSTAGRAM_APP_SECRET");
  if (!secret) return reply("Webhook not configured", 503);
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.length > 1024 * 1024) return reply("Payload too large", 413);
  if (!(await verifySignature(raw, request.headers.get("x-hub-signature-256"), secret))) {
    return reply("Invalid signature", 403);
  }
  // Fail closed until account mapping and ingestion tests are completed.
  if (Deno.env.get("INSTAGRAM_WEBHOOK_INGEST_ENABLED") !== "true") {
    return reply("Ingestion not enabled", 503);
  }
  try {
    const payload = obj(JSON.parse(new TextDecoder().decode(raw)));
    if (!payload || payload.object !== "instagram" || !Array.isArray(payload.entry)) {
      return reply("Unsupported event", 400);
    }
    for (const item of payload.entry) {
      const entry = obj(item);
      if (!entry) continue;
      if (!Array.isArray(entry.messaging)) continue;
      for (const rawEvent of entry.messaging) {
        const event = obj(rawEvent);
        if (event) await storeMessage(entry, event);
      }
    }
    return reply("EVENT_RECEIVED");
  } catch (error) {
    console.error("Instagram webhook processing failed", error instanceof Error ? error.message : "unknown");
    return reply("Processing failed", 503); // Meta may retry; message IDs dedupe.
  }
});
