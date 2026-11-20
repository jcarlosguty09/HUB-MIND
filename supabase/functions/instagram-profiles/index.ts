const origin = "https://wod.hubmind.shop";
const isId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);

Deno.serve(async (request: Request) => {
  const cors = {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization,apikey,content-type,x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
  };
  const reply = (body: unknown, status = 200) => Response.json(body, {
    status,
    headers: { ...cors, "cache-control": "no-store" },
  });
  if (request.headers.has("origin") && request.headers.get("origin") !== origin) {
    return reply({ error: "origin_not_allowed" }, 403);
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    return reply({ error: "unauthorized" }, 401);
  }
  const base = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const token = Deno.env.get("INSTAGRAM_SEND_ACCESS_TOKEN");
  const accountId = Deno.env.get("INSTAGRAM_SEND_ACCOUNT_ID")?.trim();
  const version = Deno.env.get("INSTAGRAM_GRAPH_API_VERSION");
  if (!base || !anon || !token || !accountId || !version || !/^v\d+\.\d+$/.test(version)) {
    return reply({ error: "server_not_configured" }, 503);
  }
  const input = await request.json().catch(() => null);
  const ids = input?.conversation_ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 10 || !ids.every(isId)) {
    return reply({ error: "invalid_input" }, 400);
  }

  try {
    const headers = { apikey: anon, Authorization: authorization };
    const user = await fetch(base + "/auth/v1/user", { headers });
    if (!user.ok) return reply({ error: "unauthorized" }, 401);

    // Resolve the Instagram account and sender IDs through the caller's RLS.
    const accounts = await fetch(base + "/rest/v1/organization_instagram_accounts?select=id&is_active=eq.true&instagram_user_id=eq." +
      encodeURIComponent(accountId), { headers });
    if (!accounts.ok) return reply({ error: "account_access_failed" }, 403);
    const accountIds = (await accounts.json()).map((account: { id: string }) => account.id).filter(isId);
    if (!accountIds.length) return reply({ profiles: [] });

    const conversations = await fetch(base + "/rest/v1/crm_instagram_conversations?select=id,instagram_sender_id&account_id=in.(" +
      accountIds.join(",") + ")&id=in.(" + ids.join(",") + ")", { headers });
    if (!conversations.ok) return reply({ error: "conversation_access_failed" }, 403);
    const rows: { id: string; instagram_sender_id: string }[] = await conversations.json();

    const profiles = await Promise.all(rows.filter(row => /^\d+$/.test(row.instagram_sender_id)).map(async row => {
      try {
        const profile = await fetch("https://graph.instagram.com/" + version + "/" + row.instagram_sender_id + "?fields=name,username", {
          headers: { Authorization: "Bearer " + token },
          signal: AbortSignal.timeout(5000),
        });
        if (!profile.ok) return null;
        const data = await profile.json();
        return {
          id: row.id,
          name: typeof data.name === "string" ? data.name : null,
          username: typeof data.username === "string" ? data.username : null,
        };
      } catch {
        return null;
      }
    }));
    return reply({ profiles: profiles.filter(Boolean) });
  } catch {
    return reply({ error: "profiles_unavailable" }, 503);
  }
});
