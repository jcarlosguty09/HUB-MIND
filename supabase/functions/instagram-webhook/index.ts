// Instagram webhook — verification-only phase.
// Deploy with verify_jwt = false: Meta does not send Supabase JWTs.
// POST events are intentionally rejected until signature verification and
// durable event handling have been implemented.
const encoder = new TextEncoder();

async function sameSecret(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("INSTAGRAM_WEBHOOK_VERIFY_TOKEN");

    if (
      mode !== "subscribe" ||
      !token ||
      !expected ||
      !challenge ||
      !(await sameSecret(token, expected))
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  if (request.method === "POST") {
    // Do not acknowledge events before secure persistence is implemented.
    return new Response("Webhook events not enabled", { status: 503 });
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: { Allow: "GET, POST" },
  });
});
