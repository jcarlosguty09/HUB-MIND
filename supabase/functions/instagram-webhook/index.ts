/**
 * HUB MIND CRM — Instagram Webhook V4.2
 *
 * Supports:
 * - Meta webhook verification (GET)
 * - HMAC SHA-256 signature validation (POST)
 * - entry.messaging[] events
 * - entry.changes[].value.message
 * - entry.changes[].value.messages[]
 * - Supabase RPC persistence
 *
 * Supabase Edge Function setting:
 * Verify JWT with legacy secret: OFF
 *
 * Required secrets:
 * INSTAGRAM_APP_SECRET
 * INSTAGRAM_WEBHOOK_VERIFY_TOKEN
 * INSTAGRAM_WEBHOOK_INGEST_ENABLED=true
 * SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY
 */

type Json = Record<string, unknown>;

type Outcome =
  | "inserted"
  | "duplicate"
  | "skipped"
  | "unknown";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function obj(value: unknown): Json | null {
  return value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ? value as Json
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0
    ? value
    : null;
}

function id(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (
    typeof value === "number" &&
    Number.isSafeInteger(value)
  ) {
    return String(value);
  }

  return null;
}

// Normalize IDs from either "123" or { id: "123" }.
function metaId(value: unknown): string | null {
  return id(value) ?? id(obj(value)?.id);
}

function respond(
  body: string,
  status = 200,
): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function equalBytes(
  a: Uint8Array,
  b: Uint8Array,
): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;

  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }

  return diff === 0;
}

async function verifySignature(
  body: Uint8Array,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (
    !signature ||
    !/^sha256=[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const expected = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      body,
    ),
  );

  const supplied = Uint8Array.from(
    signature.slice(7).match(/.{2}/g)!,
    (part) => parseInt(part, 16),
  );

  return equalBytes(expected, supplied);
}

function timestamp(
  value: unknown,
): string | null {
  if (
    typeof value !== "number" &&
    typeof value !== "string"
  ) {
    return null;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  const date = new Date(
    numeric < 1e11
      ? numeric * 1000
      : numeric,
  );

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

/**
 * Calls the existing database RPC.
 *
 * This function is responsible for:
 * - Finding the connected Instagram account
 * - Creating or finding the conversation
 * - Inserting the message
 * - Updating conversation metadata
 */
async function ingest(
  params: Json,
): Promise<Outcome> {
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY",
  );

  if (!base || !key) {
    throw new Error(
      "supabase_configuration_missing",
    );
  }

  const response = await fetch(
    `${base}/rest/v1/rpc/crm_instagram_ingest_inbound`,
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(params),
    },
  );

  if (!response.ok) {
    let code = "unknown";

    try {
      const error = await response.json();

      if (typeof error.code === "string") {
        code = error.code;
      }
    } catch {
      // Do not expose database error details.
    }

    console.error(
      "instagram_database_error",
      {
        status: response.status,
        code,
      },
    );

    throw new Error(
      `database_http_${response.status}`,
    );
  }

  const raw = await response.text();

  let result: unknown = null;

  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch {
      throw new Error(
        "invalid_rpc_response",
      );
    }
  }

  const data = obj(
    Array.isArray(result)
      ? result[0]
      : result,
  );

  if (data?.inserted === true) {
    return "inserted";
  }

  if (data?.inserted === false) {
    return "duplicate";
  }

  console.warn(
    "instagram_rpc_result_unknown",
    {
      has_result: result !== null,
      result_type: Array.isArray(result)
        ? "array"
        : typeof result,
      result_keys: data
        ? Object.keys(data)
        : [],
    },
  );

  return "unknown";
}

/**
 * Validates and saves a normalized
 * Instagram message.
 */
async function saveMessage(
  senderId: string | null,
  recipientId: string | null,
  messageId: string | null,
  body: string | null,
  attachments: unknown,
  time: unknown,
  rawPayload: Json,
): Promise<Outcome> {
  if (
    !senderId ||
    !recipientId ||
    !messageId
  ) {
    console.warn(
      "instagram_message_skipped",
      {
        reason: "missing_required_fields",
        has_sender: !!senderId,
        has_recipient: !!recipientId,
        has_mid: !!messageId,
      },
    );

    return "skipped";
  }

  const messageType = body
    ? "text"
    : Array.isArray(attachments) &&
        attachments.length > 0
    ? "attachment"
    : "unsupported";

  const outcome = await ingest({
    p_recipient_id: recipientId,
    p_sender_id: senderId,
    p_message_id: messageId,
    p_message_type: messageType,
    p_body: body,
    p_timestamp: timestamp(time),
    p_payload: rawPayload,
  });

  console.info(
    "instagram_message_persistence",
    {
      outcome,
    },
  );

  return outcome;
}

/**
 * Handles traditional Instagram
 * messaging webhook events.
 *
 * Format:
 * entry[].messaging[]
 */
async function processMessaging(
  entry: Json,
  event: Json,
): Promise<Outcome> {
  const message = obj(event.message);

  if (!message) {
    console.info(
      "instagram_message_skipped",
      {
        reason: "not_a_message",
        event_keys: Object.keys(event),
      },
    );

    return "skipped";
  }

  if (message.is_echo === true) {
    console.info(
      "instagram_message_skipped",
      {
        reason: "echo",
      },
    );

    return "skipped";
  }

  return await saveMessage(
    metaId(event.sender),
    metaId(event.recipient),
    metaId(message.mid) ??
      metaId(message.id),
    str(message.text),
    message.attachments,
    event.timestamp ?? entry.time,
    event,
  );
}

/**
 * Handles Instagram webhook
 * changes events.
 *
 * Supported formats:
 *
 * A:
 * entry[].changes[].value.message
 *
 * B:
 * entry[].changes[].value.messages[]
 */
async function processChange(
  entry: Json,
  change: Json,
): Promise<Outcome[]> {
  const field = str(change.field) ??
    "unknown";

  const value = obj(change.value);

  console.info(
    "instagram_change_received",
    {
      field,
      has_value: !!value,
      value_keys: value
        ? Object.keys(value)
        : [],
    },
  );

  if (
    field !== "messages" ||
    !value
  ) {
    return [];
  }

  // FIX V4.1:
  // Meta can send a single message object
  // instead of a messages array.
  const messages = Array.isArray(
      value.messages,
    )
    ? value.messages
    : obj(value.message)
    ? [value.message]
    : [];

  if (messages.length === 0) {
    console.info(
      "instagram_change_skipped",
      {
        reason: "no_message_found",
        has_message: !!obj(value.message),
        has_messages_array:
          Array.isArray(value.messages),
      },
    );

    return [];
  }

  const outcomes: Outcome[] = [];

  for (const rawMessage of messages) {
    const message = obj(rawMessage);

    if (!message) {
      outcomes.push("skipped");
      continue;
    }

    if (message.is_echo === true) {
      console.info(
        "instagram_message_skipped",
        {
          reason: "echo",
        },
      );

      outcomes.push("skipped");
      continue;
    }

    // Meta places sender and recipient
    // at the value level in this format.
    const senderId =
      metaId(message.sender) ??
      metaId(message.from) ??
      metaId(value.sender) ??
      metaId(value.from);

    const recipientId =
      metaId(message.recipient) ??
      metaId(message.to) ??
      metaId(value.recipient) ??
      metaId(value.to) ??
      metaId(entry.id);

    const messageId =
      metaId(message.mid) ??
      metaId(message.id);

    const body =
      str(message.text) ??
      str(obj(message.message)?.text);

    console.info(
  "instagram_message_detected",
  {
    has_sender: !!senderId,
    has_recipient: !!recipientId,
    has_mid: !!messageId,
    has_text: !!body,
    has_attachments:
      Array.isArray(message.attachments),
    recipient_id_suffix:
      recipientId?.slice(-5) ?? null,
  },
);

    const outcome = await saveMessage(
      senderId,
      recipientId,
      messageId,
      body,
      message.attachments,
      message.timestamp ??
        value.timestamp ??
        entry.time,
      change,
    );

    outcomes.push(outcome);
  }

  return outcomes;
}

/**
 * Main Supabase Edge Function.
 */
Deno.serve(
  async (
    request: Request,
  ): Promise<Response> => {
    // META WEBHOOK VERIFICATION
    if (request.method === "GET") {
      const url = new URL(
        request.url,
      );

      const mode = url.searchParams.get(
        "hub.mode",
      );

      const token = url.searchParams.get(
        "hub.verify_token",
      );

      const challenge = url.searchParams.get(
        "hub.challenge",
      );

      const expected = Deno.env.get(
        "INSTAGRAM_WEBHOOK_VERIFY_TOKEN",
      );

      if (
        mode !== "subscribe" ||
        !token ||
        !expected ||
        challenge === null
      ) {
        return respond(
          "Forbidden",
          403,
        );
      }

      const a = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          encoder.encode(token),
        ),
      );

      const b = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          encoder.encode(expected),
        ),
      );

      return equalBytes(a, b)
        ? respond(challenge)
        : respond(
          "Forbidden",
          403,
        );
    }

    if (request.method !== "POST") {
      return respond(
        "Method not allowed",
        405,
      );
    }

    const secret = Deno.env.get(
      "INSTAGRAM_APP_SECRET",
    );

    if (!secret) {
      return respond(
        "Webhook not configured",
        503,
      );
    }

    let raw: Uint8Array;

    try {
      raw = new Uint8Array(
        await request.arrayBuffer(),
      );
    } catch {
      return respond(
        "Invalid request body",
        400,
      );
    }

    if (
      raw.length >
      1024 * 1024
    ) {
      return respond(
        "Payload too large",
        413,
      );
    }

    const valid =
      await verifySignature(
        raw,
        request.headers.get(
          "x-hub-signature-256",
        ),
        secret,
      );

    if (!valid) {
      console.warn(
        "instagram_webhook_signature",
        {
          result:
            "invalid_or_missing",
        },
      );

      return respond(
        "Invalid signature",
        403,
      );
    }

    console.info(
      "instagram_webhook_signature",
      {
        result: "valid_signature",
      },
    );

    if (
      Deno.env.get(
        "INSTAGRAM_WEBHOOK_INGEST_ENABLED",
      ) !== "true"
    ) {
      console.warn(
        "instagram_ingestion_disabled",
      );

      return respond(
        "Ingestion disabled",
        503,
      );
    }

    let payload: Json | null;

    try {
      payload = obj(
        JSON.parse(
          decoder.decode(raw),
        ),
      );
    } catch {
      return respond(
        "Invalid JSON",
        400,
      );
    }

    if (
      !payload ||
      payload.object !==
        "instagram" ||
      !Array.isArray(
        payload.entry,
      )
    ) {
      console.warn(
        "instagram_unsupported_event",
      );

      return respond(
        "Unsupported event",
        400,
      );
    }

    const counts = {
      messaging: 0,
      changes: 0,
      inserted: 0,
      duplicate: 0,
      skipped: 0,
      unknown: 0,
    };

    const record = (
      outcome: Outcome,
    ) => {
      counts[outcome]++;
    };

    try {
      for (
        const rawEntry
        of payload.entry
      ) {
        const entry = obj(
          rawEntry,
        );

        if (!entry) {
          continue;
        }

        const messaging =
          Array.isArray(
            entry.messaging,
          )
            ? entry.messaging
            : [];

        const changes =
          Array.isArray(
            entry.changes,
          )
            ? entry.changes
            : [];

        console.info(
          "instagram_entry_received",
          {
            messaging_count:
              messaging.length,
            changes_count:
              changes.length,
          },
        );

        // Traditional messaging events
        for (
          const rawEvent
          of messaging
        ) {
          const event = obj(
            rawEvent,
          );

          if (!event) {
            continue;
          }

          counts.messaging++;

          const outcome =
            await processMessaging(
              entry,
              event,
            );

          record(outcome);
        }

        // Changes events
        for (
          const rawChange
          of changes
        ) {
          const change = obj(
            rawChange,
          );

          if (!change) {
            continue;
          }

          counts.changes++;

          const outcomes =
            await processChange(
              entry,
              change,
            );

          for (
            const outcome
            of outcomes
          ) {
            record(outcome);
          }
        }
      }

      console.info(
        "instagram_webhook_completed",
        counts,
      );

      return respond(
        "EVENT_RECEIVED",
        200,
      );
    } catch (error) {
      console.error(
        "instagram_webhook_processing_failed",
        {
          reason:
            error instanceof Error
              ? error.message
              : "unknown",
        },
      );

      return respond(
        "Processing failed",
        503,
      );
    }
  },
);