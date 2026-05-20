import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function normalizeId(value: unknown) {
  return String(value ?? "").trim();
}

function fromCents(value: unknown) {
  return Math.round(Number(value || 0)) / 100;
}

async function stripeRequest(path: string, init: RequestInit = {}) {
  const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
  const response = await fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      ...(init.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Stripe error ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function paymentIntentId(session: Record<string, unknown>) {
  const value = session.payment_intent as unknown;
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "id" in value) return normalizeId((value as Record<string, unknown>).id);
  return "";
}

async function updatePaidTarget(adminClient: any, targetType: string, targetId: string, session: Record<string, unknown>) {
  const paid = session.payment_status === "paid";
  const payload = {
    payment_status: paid ? "paid" : "pending",
    payment_provider: "stripe",
    payment_reference: normalizeId(session.id),
    paid_at: paid ? new Date().toISOString() : null
  };

  if (targetType === "booking") {
    const { error } = await adminClient.from("bookings").update(payload).eq("id", targetId);
    if (error) throw new Error(error.message);
  }

  if (targetType === "session_participant") {
    const { error } = await adminClient.from("session_participants").update(payload).eq("id", targetId);
    if (error) throw new Error(error.message);
  }
}

async function logPaymentEvent(adminClient: any, session: Record<string, unknown>, metadata: Record<string, string>, userId: string) {
  const paymentIntent = paymentIntentId(session);
  await adminClient.from("payment_events").insert({
    provider: "stripe",
    provider_event_id: `checkout_return_${session.id}_${Date.now()}`,
    event_type: "checkout.session.return",
    livemode: Boolean(session.livemode),
    status: session.payment_status === "paid" ? "processed" : "received",
    story_id: metadata.story_id || null,
    booking_id: metadata.booking_id || null,
    public_session_id: metadata.public_session_id || null,
    participant_id: metadata.participant_id || null,
    user_id: userId,
    master_id: metadata.master_id || null,
    amount: fromCents(session.amount_total),
    currency: String(session.currency || "EUR").toUpperCase(),
    checkout_session_id: session.id,
    payment_intent_id: paymentIntent || null,
    connected_account_id: null,
    payload: session,
    processed_at: new Date().toISOString()
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    requireEnv("STRIPE_SECRET_KEY");

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return jsonResponse({ error: "Login required" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } }
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: "Login required" }, 401);

    const body = await req.json().catch(() => ({}));
    const sessionId = normalizeId(body.sessionId);
    if (!sessionId) throw new Error("Checkout session mancante.");

    const session = await stripeRequest(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent`) as Record<string, unknown>;
    const metadata = (session.metadata || {}) as Record<string, string>;

    if (metadata.app !== "lorecast") throw new Error("Checkout non riconosciuto.");
    if (metadata.user_id !== userData.user.id) throw new Error("Questo pagamento appartiene a un altro utente.");

    const targetType = normalizeId(metadata.target_type);
    const targetId = normalizeId(metadata.target_id);
    if (!targetType || !targetId) throw new Error("Metadati pagamento incompleti.");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    await updatePaidTarget(adminClient, targetType, targetId, session);
    await logPaymentEvent(adminClient, session, metadata, userData.user.id).catch((error) => {
      console.warn("payment_events insert skipped", error.message || error);
    });

    return jsonResponse({
      status: session.payment_status === "paid" ? "paid" : "pending",
      checkoutSessionId: session.id,
      paymentIntentId: paymentIntentId(session),
      targetType,
      targetId,
      storyId: metadata.story_id || "",
      amount: fromCents(session.amount_total),
      currency: String(session.currency || "EUR").toUpperCase()
    });
  } catch (error) {
    console.error("confirm-checkout-session error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
