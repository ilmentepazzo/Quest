import { createClient } from "npm:@supabase/supabase-js@2";

type JsonBody = Record<string, unknown>;

type EmailContext = {
  type: "conversation_message";
  recipientId: string;
  senderId: string;
  recipientEmail: string;
  recipientName: string;
  senderName: string;
  storyTitle: string;
  messagePreview: string;
  targetUrl: string;
  idempotencyKey: string;
};

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

function jsonResponse(body: JsonBody, status = 200, headers: Record<string, string> = { "Content-Type": "application/json" }) {
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

function cleanText(value: unknown, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function truncate(value: unknown, max = 420) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function siteBaseUrl() {
  const raw = Deno.env.get("PUBLIC_SITE_URL") || "http://localhost:3000";
  try {
    const url = new URL(raw);
    return url.toString().replace(/\/$/, "");
  } catch (_) {
    return "http://localhost:3000";
  }
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function loadProfile(adminClient: any, userId: string) {
  const { data, error } = await adminClient
    .from("profiles")
    .select("id,name,email")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || { id: userId, name: "Utente Lorecast", email: "" };
}

async function buildConversationEmailContext(adminClient: any, userId: string, body: JsonBody): Promise<EmailContext> {
  const conversationId = normalizeId(body.conversationId || body.conversation_id);
  const messageId = normalizeId(body.messageId || body.message_id);

  if (!conversationId) throw new Error("conversationId mancante.");
  if (!messageId) throw new Error("messageId mancante.");

  const { data: conversation, error: conversationError } = await adminClient
    .from("conversations")
    .select("id,story_id,player_id,master_id,type,status")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) throw new Error(conversationError.message);
  if (!conversation) throw new Error("Conversazione non trovata.");

  const playerId = normalizeId(conversation.player_id);
  const masterId = normalizeId(conversation.master_id);

  if (!playerId || !masterId) throw new Error("Partecipanti conversazione non validi.");
  if (userId !== playerId && userId !== masterId) throw new Error("Accesso non autorizzato alla conversazione.");

  const { data: message, error: messageError } = await adminClient
    .from("conversation_messages")
    .select("id,conversation_id,sender_id,body,created_at")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (messageError) throw new Error(messageError.message);
  if (!message) throw new Error("Messaggio non trovato.");

  const senderId = normalizeId(message.sender_id);
  if (senderId !== userId) throw new Error("Puoi notificare solo messaggi inviati da te.");

  const recipientId = senderId === playerId ? masterId : playerId;
  const [senderProfile, recipientProfile] = await Promise.all([
    loadProfile(adminClient, senderId),
    loadProfile(adminClient, recipientId)
  ]);

  const recipientEmail = cleanText(recipientProfile?.email).toLowerCase();
  if (!recipientEmail || !looksLikeEmail(recipientEmail)) {
    throw new Error("Il destinatario non ha una email valida nel profilo.");
  }

  let storyTitle = "una storia Lorecast";
  const storyId = normalizeId(conversation.story_id);
  if (storyId) {
    const { data: story, error: storyError } = await adminClient
      .from("stories")
      .select("title")
      .eq("id", storyId)
      .maybeSingle();

    if (storyError) throw new Error(storyError.message);
    if (story?.title) storyTitle = cleanText(story.title, storyTitle);
  }

  const targetHash = recipientId === masterId ? "area-master" : "profilo";

  return {
    type: "conversation_message",
    recipientId,
    senderId,
    recipientEmail,
    recipientName: cleanText(recipientProfile?.name, "utente Lorecast"),
    senderName: cleanText(senderProfile?.name, "utente Lorecast"),
    storyTitle,
    messagePreview: truncate(message.body),
    targetUrl: `${siteBaseUrl()}/#${targetHash}`,
    idempotencyKey: `lorecast-conversation-${message.id}`
  };
}

function buildEmailPayload(context: EmailContext) {
  const supportEmail = Deno.env.get("RESEND_REPLY_TO") || "info.dix.doitfor@gmail.com";
  const isForMaster = context.recipientId !== context.senderId && context.targetUrl.includes("#area-master");
  const subject = isForMaster
    ? `Nuovo contatto per ${context.storyTitle}`
    : `Nuova risposta su ${context.storyTitle}`;

  const intro = isForMaster
    ? `${context.senderName} ti ha scritto su Lorecast.`
    : `${context.senderName} ti ha risposto su Lorecast.`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#241b2f;max-width:620px;margin:0 auto;padding:24px;">
      <h1 style="margin:0 0 12px;font-size:24px;">Nuovo messaggio Lorecast</h1>
      <p>Ciao ${escapeHtml(context.recipientName)},</p>
      <p>${escapeHtml(intro)}</p>
      <p><strong>Storia:</strong> ${escapeHtml(context.storyTitle)}</p>
      <blockquote style="border-left:4px solid #d9c7ff;margin:18px 0;padding:10px 14px;background:#faf7ff;">
        ${escapeHtml(context.messagePreview)}
      </blockquote>
      <p>
        <a href="${escapeHtml(context.targetUrl)}" style="display:inline-block;background:#241b2f;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:999px;">
          Apri Lorecast
        </a>
      </p>
      <p style="font-size:13px;color:#6b6278;margin-top:28px;">
        Email automatica beta. Per assistenza o richieste: ${escapeHtml(supportEmail)}
      </p>
    </div>
  `;

  const text = [
    "Nuovo messaggio Lorecast",
    "",
    `Ciao ${context.recipientName},`,
    intro,
    `Storia: ${context.storyTitle}`,
    "",
    `Messaggio: ${context.messagePreview}`,
    "",
    `Apri Lorecast: ${context.targetUrl}`,
    "",
    `Assistenza beta: ${supportEmail}`
  ].join("\n");

  return { subject, html, text };
}

async function sendWithResend(context: EmailContext) {
  const emailsEnabled = Deno.env.get("RESEND_EMAILS_ENABLED") === "true";
  if (!emailsEnabled) {
    return {
      skipped: true,
      reason: "RESEND_EMAILS_ENABLED non è true.",
      recipientId: context.recipientId
    };
  }

  const apiKey = requireEnv("RESEND_API_KEY");
  const from = requireEnv("RESEND_FROM");
  const replyTo = Deno.env.get("RESEND_REPLY_TO") || "info.dix.doitfor@gmail.com";
  const payload = buildEmailPayload(context);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": context.idempotencyKey
    },
    body: JSON.stringify({
      from,
      to: [context.recipientEmail],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      reply_to: replyTo,
      tags: [
        { name: "app", value: "lorecast" },
        { name: "type", value: context.type }
      ]
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result?.message || result?.error || `Resend error ${response.status}`;
    throw new Error(String(message));
  }

  return { sent: true, id: result?.id || null, recipientId: context.recipientId };
}

Deno.serve(async (req) => {
  const responseHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, responseHeaders);

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return jsonResponse({ error: "Login required" }, 401, responseHeaders);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } }
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: "Login required" }, 401, responseHeaders);

    const body = await req.json().catch(() => ({}));
    const type = normalizeId(body.type);
    if (type !== "conversation_message") {
      return jsonResponse({ error: "Tipo notifica email non supportato." }, 400, responseHeaders);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const context = await buildConversationEmailContext(adminClient, userData.user.id, body);
    const result = await sendWithResend(context);

    return jsonResponse({ ok: true, ...result }, 200, responseHeaders);
  } catch (error) {
    console.error("send-notification-email error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400, responseHeaders);
  }
});
