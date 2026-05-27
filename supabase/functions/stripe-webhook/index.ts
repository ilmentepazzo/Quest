import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = {
  "Content-Type": "application/json"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
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

function paymentIntentId(session: Record<string, unknown>) {
  const value = session.payment_intent as unknown;
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "id" in value) return normalizeId((value as Record<string, unknown>).id);
  return "";
}

function getStripeSignaturePart(signatureHeader: string, key: string) {
  return signatureHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`))
    ?.slice(key.length + 1) || "";
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string) {
  const timestamp = getStripeSignaturePart(signatureHeader, "t");
  const signature = getStripeSignaturePart(signatureHeader, "v1");

  if (!timestamp || !signature) throw new Error("Firma webhook Stripe mancante.");

  const toleranceSeconds = 300;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) throw new Error("Timestamp webhook Stripe non valido.");
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > toleranceSeconds) {
    throw new Error("Webhook Stripe troppo vecchio o fuori tolleranza.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signedPayload = `${timestamp}.${rawBody}`;
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = hex(digest);

  if (!safeEqual(expected, signature)) throw new Error("Firma webhook Stripe non valida.");
}

async function paymentEventExists(adminClient: any, eventId: string) {
  const { data, error } = await adminClient
    .from("payment_events")
    .select("id,status")
    .eq("provider", "stripe")
    .eq("provider_event_id", eventId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

async function updatePaidTarget(adminClient: any, targetType: string, targetId: string, session: Record<string, unknown>, paymentStatus: string) {
  const paid = paymentStatus === "paid";
  const failed = paymentStatus === "failed";
  const paidAt = paid ? new Date().toISOString() : null;
  const metadata = (session.metadata || {}) as Record<string, string>;
  const status = paid ? "paid" : failed ? "failed" : "pending";

  const payload: Record<string, unknown> = {
    payment_status: status,
    payment_provider: "stripe",
    payment_reference: normalizeId(session.id),
    paid_at: paidAt
  };

  if (targetType === "story") {
    const { error } = await adminClient.from("story_purchases").upsert({
      user_id: metadata.user_id,
      master_id: metadata.master_id || null,
      story_id: metadata.story_id || targetId,
      payment_status: status,
      payment_amount: fromCents(session.amount_total),
      payment_currency: String(session.currency || "EUR").toUpperCase(),
      payment_provider: "stripe",
      payment_reference: normalizeId(session.id),
      paid_at: paidAt,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,story_id" });
    if (error) throw new Error(error.message);
  }

  if (targetType === "booking") {
    if (paid) payload.status = "Accettata";
    const { error } = await adminClient.from("bookings").update(payload).eq("id", targetId);
    if (error) throw new Error(error.message);
  }

  if (targetType === "session_participant") {
    const { error } = await adminClient.from("session_participants").update(payload).eq("id", targetId);
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

async function createPaymentNotifications(adminClient: any, session: Record<string, unknown>, metadata: Record<string, string>, paymentStatus: string) {
  if (paymentStatus !== "paid") return;
  const storyTitle = await loadStoryTitle(adminClient, metadata.story_id || "");
  const notifications = [];

  if (metadata.user_id) {
    notifications.push({
      user_id: metadata.user_id,
      message: `Pagamento confermato per "${storyTitle}". Materiali sbloccati.`,
      type: "success",
      read: false,
      story_id: metadata.story_id || null,
      booking_id: metadata.booking_id || null,
      page: "profilo"
    });
  }

  if (metadata.master_id && metadata.master_id !== metadata.user_id) {
    notifications.push({
      user_id: metadata.master_id,
      message: `Pagamento ricevuto per "${storyTitle}".`,
      type: "success",
      read: false,
      story_id: metadata.story_id || null,
      booking_id: metadata.booking_id || null,
      page: "area-master"
    });
  }

  if (!notifications.length) return;
  const { error } = await adminClient.from("notifications").insert(notifications);
  if (error) console.warn("payment notifications skipped", error.message || error);
}

async function logPaymentEvent(adminClient: any, event: Record<string, unknown>, session: Record<string, unknown>, metadata: Record<string, string>, paymentStatus: string) {
  const paymentIntent = paymentIntentId(session);
  const applicationFeeAmount = Number(session?.total_details && typeof session.total_details === "object" ? 0 : 0);
  await adminClient.from("payment_events").insert({
    provider: "stripe",
    provider_event_id: normalizeId(event.id),
    event_type: normalizeId(event.type),
    livemode: Boolean(event.livemode),
    status: paymentStatus === "paid" ? "processed" : paymentStatus === "failed" ? "failed" : "received",
    story_id: metadata.story_id || null,
    booking_id: metadata.booking_id || null,
    public_session_id: metadata.public_session_id || null,
    participant_id: metadata.participant_id || null,
    user_id: metadata.user_id || null,
    master_id: metadata.master_id || null,
    amount: fromCents(session.amount_total),
    currency: String(session.currency || "EUR").toUpperCase(),
    checkout_session_id: normalizeId(session.id),
    payment_intent_id: paymentIntent || null,
    connected_account_id: null,
    application_fee_amount: applicationFeeAmount || null,
    payload: event,
    processed_at: new Date().toISOString()
  });
}

function getWebhookPaymentStatus(eventType: string, session: Record<string, unknown>) {
  if (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") {
    return session.payment_status === "paid" ? "paid" : "pending";
  }
  if (eventType === "checkout.session.async_payment_failed") return "failed";
  return "ignored";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("Stripe-Signature") || "";
    await verifyStripeSignature(rawBody, signatureHeader, requireEnv("STRIPE_WEBHOOK_SECRET"));

    const event = JSON.parse(rawBody) as Record<string, unknown>;
    const eventId = normalizeId(event.id);
    const eventType = normalizeId(event.type);
    if (!eventId) throw new Error("Evento Stripe senza ID.");

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (await paymentEventExists(adminClient, eventId)) {
      return jsonResponse({ received: true, duplicate: true });
    }

    const data = (event.data || {}) as Record<string, unknown>;
    const session = (data.object || {}) as Record<string, unknown>;
    const metadata = (session.metadata || {}) as Record<string, string>;

    if (metadata.app !== "lorecast") {
      await logPaymentEvent(adminClient, event, session, metadata, "ignored").catch((error) => {
        console.warn("ignored event log skipped", error.message || error);
      });
      return jsonResponse({ received: true, ignored: true });
    }

    const targetType = normalizeId(metadata.target_type);
    const targetId = normalizeId(metadata.target_id);
    const paymentStatus = getWebhookPaymentStatus(eventType, session);

    if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"].includes(eventType)) {
      await logPaymentEvent(adminClient, event, session, metadata, "ignored").catch((error) => {
        console.warn("ignored event log skipped", error.message || error);
      });
      return jsonResponse({ received: true, ignored: true });
    }

    if (!targetType || !targetId) throw new Error("Metadati pagamento incompleti.");
    if (paymentStatus !== "ignored") {
      await updatePaidTarget(adminClient, targetType, targetId, session, paymentStatus);
      await createPaymentNotifications(adminClient, session, metadata, paymentStatus).catch((error) => {
        console.warn("payment notifications skipped", error.message || error);
      });
    }

    await logPaymentEvent(adminClient, event, session, metadata, paymentStatus);

    return jsonResponse({ received: true, status: paymentStatus });
  } catch (error) {
    console.error("stripe-webhook error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
