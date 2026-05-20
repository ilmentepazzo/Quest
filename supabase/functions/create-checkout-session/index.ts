import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

type TargetType = "story" | "booking" | "session_participant";

type PaymentTarget = {
  targetType: TargetType;
  targetId: string;
  storyId: string;
  userId: string;
  masterId: string;
  title: string;
  amountCents: number;
  currency: string;
  bookingId?: string | null;
  publicSessionId?: string | null;
  participantId?: string | null;
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

function toCents(value: unknown) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function fromCents(value: number) {
  return Math.round(value) / 100;
}

function isAccepted(status: unknown) {
  return ["accettata", "accepted", "confermata", "confirmed"].includes(String(status || "").trim().toLowerCase());
}

function safeUrl(value: unknown, fallback: string) {
  const raw = String(value || "").trim();
  try {
    const url = new URL(raw || fallback);
    return url.toString();
  } catch (_) {
    return fallback;
  }
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

  return payload;
}

async function loadStory(adminClient: any, storyId: string) {
  const { data, error } = await adminClient
    .from("stories")
    .select("*")
    .eq("id", storyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Storia non trovata.");
  return data;
}

function getStoryMasterId(story: Record<string, unknown>) {
  return normalizeId(story.author_id || story.master_id || story.owner_id || story.user_id);
}

function isStoryWithMaster(story: Record<string, unknown>) {
  const rawType = String(story.type || story.story_type || story.type_key || "").trim().toLowerCase();
  return rawType === "con master"
    || rawType === "with_master"
    || rawType === "with master"
    || rawType.includes("master");
}

async function resolvePaymentTarget(adminClient: any, user: { id: string; email?: string | null }, body: Record<string, unknown>): Promise<PaymentTarget> {
  const targetType = normalizeId(body.targetType) as TargetType;
  const targetId = normalizeId(body.targetId);
  const currency = String(body.currency || "EUR").toLowerCase();

  if (!["story", "booking", "session_participant"].includes(targetType)) {
    throw new Error("Tipo pagamento non valido.");
  }

  if (!targetId) throw new Error("Riferimento pagamento mancante.");

  if (targetType === "story") {
    const story = await loadStory(adminClient, targetId);
    const masterId = getStoryMasterId(story);
    if (!masterId) throw new Error("Master della storia non trovato.");
    if (masterId === user.id) throw new Error("Non puoi pagare una storia che hai creato tu.");
    if (isStoryWithMaster(story)) {
      throw new Error("Per questa storia devi prima selezionare uno slot e creare una prenotazione o unirti a una sessione pubblica.");
    }

    return {
      targetType,
      targetId,
      storyId: normalizeId(story.id),
      userId: user.id,
      masterId,
      title: `Lorecast · ${story.title || "Storia"}`,
      amountCents: toCents(story.price),
      currency
    };
  }

  if (targetType === "booking") {
    const { data: booking, error } = await adminClient
      .from("bookings")
      .select("*")
      .eq("id", targetId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Prenotazione non trovata.");
    if (normalizeId(booking.user_id) !== user.id) throw new Error("Puoi pagare solo le tue prenotazioni.");
    if (!isAccepted(booking.status)) throw new Error("Questa prenotazione non è ancora pronta per il pagamento.");
    if (String(booking.payment_status || "").toLowerCase() === "paid") throw new Error("Questa prenotazione risulta già pagata.");

    const story = await loadStory(adminClient, normalizeId(booking.story_id));
    const masterId = normalizeId(booking.master_id) || getStoryMasterId(story);
    if (!masterId) throw new Error("Master della prenotazione non trovato.");

    return {
      targetType,
      targetId,
      storyId: normalizeId(booking.story_id),
      userId: user.id,
      masterId,
      title: `Lorecast · ${booking.story_title || story.title || "Prenotazione"}`,
      amountCents: toCents(Number(booking.payment_amount || 0) > 0 ? booking.payment_amount : story.price),
      currency: String(booking.payment_currency || currency).toLowerCase(),
      bookingId: targetId
    };
  }

  const { data: participant, error: participantError } = await adminClient
    .from("session_participants")
    .select("*")
    .eq("id", targetId)
    .maybeSingle();

  if (participantError) throw new Error(participantError.message);
  if (!participant) throw new Error("Partecipazione non trovata.");
  if (normalizeId(participant.user_id) !== user.id) throw new Error("Puoi pagare solo le tue partecipazioni.");
  if (String(participant.payment_status || "").toLowerCase() === "paid") throw new Error("Questa partecipazione risulta già pagata.");

  const { data: session, error: sessionError } = await adminClient
    .from("public_sessions")
    .select("*")
    .eq("id", participant.session_id)
    .maybeSingle();

  if (sessionError) throw new Error(sessionError.message);
  if (!session) throw new Error("Sessione pubblica non trovata.");

  const story = await loadStory(adminClient, normalizeId(participant.story_id || session.story_id));
  const masterId = normalizeId(session.story_author_id) || getStoryMasterId(story);
  if (!masterId) throw new Error("Master della sessione non trovato.");

  return {
    targetType,
    targetId,
    storyId: normalizeId(story.id),
    userId: user.id,
    masterId,
    title: `Lorecast · ${story.title || session.story_title || "Sessione pubblica"}`,
    amountCents: toCents(Number(participant.payment_amount || 0) > 0 ? participant.payment_amount : story.price),
    currency: String(participant.payment_currency || session.payment_currency || currency).toLowerCase(),
    publicSessionId: normalizeId(session.id),
    participantId: targetId
  };
}

async function loadConnectedMaster(adminClient: any, masterId: string) {
  const { data, error } = await adminClient
    .from("profiles")
    .select("id, name, email, stripe_connect_account_id, stripe_connect_status, stripe_charges_enabled, stripe_payouts_enabled")
    .eq("id", masterId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Profilo Master non trovato.");
  if (!data.stripe_connect_account_id) throw new Error("Il Master non ha ancora collegato Stripe.");
  if (data.stripe_connect_status !== "active" || !data.stripe_charges_enabled) {
    throw new Error("Stripe del Master non è ancora pronto a ricevere pagamenti.");
  }

  return data;
}

async function updatePaymentTarget(adminClient: any, target: PaymentTarget, checkoutSessionId: string) {
  const payload = {
    payment_status: "pending",
    payment_provider: "stripe",
    payment_reference: checkoutSessionId
  };

  if (target.targetType === "booking" && target.bookingId) {
    const { error } = await adminClient.from("bookings").update(payload).eq("id", target.bookingId);
    if (error) throw new Error(error.message);
  }

  if (target.targetType === "session_participant" && target.participantId) {
    const { error } = await adminClient.from("session_participants").update(payload).eq("id", target.participantId);
    if (error) throw new Error(error.message);
  }
}

async function logPaymentEvent(adminClient: any, target: PaymentTarget, session: Record<string, unknown>, accountId: string, applicationFeeCents: number) {
  await adminClient.from("payment_events").insert({
    provider: "stripe",
    provider_event_id: `checkout_created_${session.id}`,
    event_type: "checkout.session.created",
    livemode: Boolean(session.livemode),
    status: "received",
    story_id: target.storyId,
    booking_id: target.bookingId || null,
    public_session_id: target.publicSessionId || null,
    participant_id: target.participantId || null,
    user_id: target.userId,
    master_id: target.masterId,
    amount: fromCents(target.amountCents),
    currency: target.currency.toUpperCase(),
    checkout_session_id: session.id,
    connected_account_id: accountId,
    application_fee_amount: fromCents(applicationFeeCents),
    payload: session
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
    const fallbackOrigin = req.headers.get("origin") || Deno.env.get("PUBLIC_SITE_URL") || "http://localhost:3000";
    const successUrl = safeUrl(body.successUrl, `${fallbackOrigin}#profilo`);
    const cancelUrl = safeUrl(body.cancelUrl, `${fallbackOrigin}#profilo`);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const target = await resolvePaymentTarget(adminClient, { id: userData.user.id, email: userData.user.email }, body);

    if (target.amountCents <= 0) throw new Error("Questo contenuto non richiede pagamento.");

    const master = await loadConnectedMaster(adminClient, target.masterId);
    const accountId = master.stripe_connect_account_id;
    const applicationFeePercent = Number(Deno.env.get("LORECAST_FEE_PERCENT") || "12");
    const applicationFeeCents = Math.max(0, Math.round(target.amountCents * (applicationFeePercent / 100)));

    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", successUrl);
    params.set("cancel_url", cancelUrl);
    params.set("client_reference_id", `${target.targetType}:${target.targetId}`);
    if (userData.user.email) params.set("customer_email", userData.user.email);
    params.set("payment_method_types[0]", "card");
    params.set("line_items[0][price_data][currency]", target.currency);
    params.set("line_items[0][price_data][product_data][name]", target.title.slice(0, 120));
    params.set("line_items[0][price_data][unit_amount]", String(target.amountCents));
    params.set("line_items[0][quantity]", "1");
    params.set("payment_intent_data[application_fee_amount]", String(applicationFeeCents));
    params.set("payment_intent_data[transfer_data][destination]", accountId);

    const metadata: Record<string, string> = {
      app: "lorecast",
      target_type: target.targetType,
      target_id: target.targetId,
      story_id: target.storyId,
      user_id: target.userId,
      master_id: target.masterId
    };
    if (target.bookingId) metadata.booking_id = target.bookingId;
    if (target.publicSessionId) metadata.public_session_id = target.publicSessionId;
    if (target.participantId) metadata.participant_id = target.participantId;

    Object.entries(metadata).forEach(([key, value]) => {
      params.set(`metadata[${key}]`, value);
      params.set(`payment_intent_data[metadata][${key}]`, value);
    });

    const session = await stripeRequest("/v1/checkout/sessions", {
      method: "POST",
      body: params
    }) as Record<string, unknown>;

    await updatePaymentTarget(adminClient, target, normalizeId(session.id));
    await logPaymentEvent(adminClient, target, session, accountId, applicationFeeCents).catch((error) => {
      console.warn("payment_events insert skipped", error.message || error);
    });

    return jsonResponse({
      url: session.url,
      checkoutSessionId: session.id,
      targetType: target.targetType,
      targetId: target.targetId,
      amount: fromCents(target.amountCents),
      currency: target.currency.toUpperCase(),
      applicationFeeAmount: fromCents(applicationFeeCents)
    });
  } catch (error) {
    console.error("create-checkout-session error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
