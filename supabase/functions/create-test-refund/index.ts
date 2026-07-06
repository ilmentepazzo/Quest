import { createClient } from "npm:@supabase/supabase-js@2";

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const publicSite = Deno.env.get("PUBLIC_SITE_URL");
  if (publicSite) allowed.push(publicSite);
  if (Deno.env.get("ALLOW_LOCALHOST") === "1") allowed.push("http://localhost:3000");

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function jsonResponse(body: Record<string, unknown>, status = 200, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
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
      ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(init.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Stripe error ${response.status}`;
    throw new Error(message);
  }

  return payload as Record<string, unknown>;
}

function paymentIntentId(session: Record<string, unknown>) {
  const value = session.payment_intent as unknown;
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "id" in value) return normalizeId((value as Record<string, unknown>).id);
  return "";
}

async function loadMasterPaymentEvent(adminClient: any, checkoutSessionId: string, masterId: string) {
  const { data, error } = await adminClient
    .from("payment_events")
    .select("*")
    .eq("provider", "stripe")
    .eq("checkout_session_id", checkoutSessionId)
    .eq("master_id", masterId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  const events = data || [];
  if (!events.length) throw new Error("Pagamento non trovato per questo Master.");

  const alreadyRefunded = events.some((event: Record<string, unknown>) => {
    const eventType = String(event.event_type || "").toLowerCase();
    const providerEventId = String(event.provider_event_id || "").toLowerCase();
    return eventType.includes("refund") || providerEventId.includes("refund");
  });

  if (alreadyRefunded) throw new Error("Questo pagamento risulta già rimborsato.");

  const paidEvent = events.find((event: Record<string, unknown>) => {
    const eventType = String(event.event_type || "").toLowerCase();
    return eventType === "checkout.session.completed" || event.status === "processed" || event.status === "received";
  });

  return paidEvent || events[0];
}

async function assertNoRefundAlreadyLogged(adminClient: any, checkoutSessionId: string, paymentIntentId: string) {
  const { data, error } = await adminClient
    .from("payment_events")
    .select("id,event_type,provider_event_id")
    .eq("provider", "stripe")
    .or(`checkout_session_id.eq.${checkoutSessionId},payment_intent_id.eq.${paymentIntentId}`)
    .limit(50);

  if (error) throw new Error(error.message);

  const hasRefund = (data || []).some((event: Record<string, unknown>) => {
    const eventType = String(event.event_type || "").toLowerCase();
    const providerEventId = String(event.provider_event_id || "").toLowerCase();
    return eventType.includes("refund") || providerEventId.includes("refund");
  });

  if (hasRefund) throw new Error("Rimborso già eseguito per questo pagamento.");
}

async function assertNoStripeRefundExists(paymentIntentId: string) {
  const refunds = await stripeRequest(`/v1/refunds?payment_intent=${encodeURIComponent(paymentIntentId)}&limit=1`);
  const items = Array.isArray(refunds.data) ? refunds.data : [];
  if (items.length > 0) throw new Error("Stripe indica già un rimborso per questo pagamento.");
}

async function updateRefundedTarget(adminClient: any, event: Record<string, unknown>, checkoutSessionId: string) {
  const payload = {
    payment_status: "refunded",
    payment_provider: "stripe",
    payment_reference: checkoutSessionId
  };

  const bookingId = normalizeId(event.booking_id);
  const participantId = normalizeId(event.participant_id);
  const storyId = normalizeId(event.story_id);
  const userId = normalizeId(event.user_id);

  if (bookingId) {
    const { error } = await adminClient.from("bookings").update(payload).eq("id", bookingId);
    if (error) throw new Error(error.message);
    return;
  }

  if (participantId) {
    const { error } = await adminClient.from("session_participants").update(payload).eq("id", participantId);
    if (error) throw new Error(error.message);
    return;
  }

  if (storyId && userId) {
    const { error } = await adminClient
      .from("story_purchases")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("story_id", storyId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
}

async function loadStoryTitle(adminClient: any, storyId: string) {
  if (!storyId) return "contenuto Lorecast";
  const { data } = await adminClient
    .from("stories")
    .select("title")
    .eq("id", storyId)
    .maybeSingle();
  return data?.title || "contenuto Lorecast";
}

async function createRefundNotifications(adminClient: any, event: Record<string, unknown>) {
  const storyId = normalizeId(event.story_id);
  const userId = normalizeId(event.user_id);
  const masterId = normalizeId(event.master_id);
  const bookingId = normalizeId(event.booking_id);
  const title = await loadStoryTitle(adminClient, storyId);
  const notifications = [];

  if (userId) {
    notifications.push({
      user_id: userId,
      message: `Rimborso test registrato per "${title}".`,
      type: "info",
      read: false,
      story_id: storyId || null,
      booking_id: bookingId || null,
      page: "profilo"
    });
  }

  if (masterId) {
    notifications.push({
      user_id: masterId,
      message: `Rimborso test completato per "${title}".`,
      type: "info",
      read: false,
      story_id: storyId || null,
      booking_id: bookingId || null,
      page: "area-master"
    });
  }

  if (!notifications.length) return;
  const { error } = await adminClient.from("notifications").insert(notifications);
  if (error) console.warn("refund notifications skipped", error.message || error);
}

async function logRefundEvent(adminClient: any, event: Record<string, unknown>, checkoutSessionId: string, refund: Record<string, unknown>, session: Record<string, unknown>) {
  const { error } = await adminClient.from("payment_events").insert({
    provider: "stripe",
    provider_event_id: normalizeId(refund.id),
    event_type: "refund.created",
    livemode: Boolean(refund.livemode || session.livemode),
    status: "processed",
    story_id: event.story_id || null,
    booking_id: event.booking_id || null,
    public_session_id: event.public_session_id || null,
    participant_id: event.participant_id || null,
    user_id: event.user_id || null,
    master_id: event.master_id || null,
    amount: fromCents(refund.amount || session.amount_total),
    currency: String(refund.currency || session.currency || "EUR").toUpperCase(),
    checkout_session_id: checkoutSessionId,
    payment_intent_id: paymentIntentId(session) || null,
    connected_account_id: event.connected_account_id || null,
    application_fee_amount: null,
    payload: refund,
    processed_at: new Date().toISOString()
  });

  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  const responseHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, responseHeaders);

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    requireEnv("STRIPE_SECRET_KEY");

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return jsonResponse({ error: "Login required" }, 401, responseHeaders);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } }
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: "Login required" }, 401, responseHeaders);

    const body = await req.json().catch(() => ({}));
    const checkoutSessionId = normalizeId(body.checkoutSessionId);
    if (!checkoutSessionId) throw new Error("Checkout session mancante.");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const event = await loadMasterPaymentEvent(adminClient, checkoutSessionId, userData.user.id);

    const session = await stripeRequest(`/v1/checkout/sessions/${encodeURIComponent(checkoutSessionId)}`);
    if (session.livemode) throw new Error("I rimborsi live non sono abilitati da Lorecast in questa fase.");
    if (session.payment_status !== "paid") throw new Error("Il pagamento non risulta pagato su Stripe.");

    const paymentIntent = paymentIntentId(session);
    if (!paymentIntent) throw new Error("PaymentIntent Stripe non trovato.");

    await assertNoRefundAlreadyLogged(adminClient, checkoutSessionId, paymentIntent);
    await assertNoStripeRefundExists(paymentIntent);

    const params = new URLSearchParams();
    params.set("payment_intent", paymentIntent);
    params.set("reverse_transfer", "true");
    params.set("refund_application_fee", "true");
    params.set("metadata[app]", "lorecast");
    params.set("metadata[checkout_session_id]", checkoutSessionId);
    params.set("metadata[reason]", "test_refund_from_lorecast");

    const refund = await stripeRequest("/v1/refunds", {
      method: "POST",
      body: params
    });

    await updateRefundedTarget(adminClient, event, checkoutSessionId);
    await logRefundEvent(adminClient, event, checkoutSessionId, refund, session);
    await createRefundNotifications(adminClient, event).catch((error) => {
      console.warn("refund notifications skipped", error.message || error);
    });

    return jsonResponse({
      ok: true,
      refundId: refund.id,
      checkoutSessionId,
      status: "refunded"
    }, 200, responseHeaders);
  } catch (error) {
    console.error("create-test-refund error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400, responseHeaders);
  }
});
