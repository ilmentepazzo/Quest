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

function getAllowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const publicSite = Deno.env.get("PUBLIC_SITE_URL");
  if (publicSite) allowed.push(publicSite);
  if (Deno.env.get("ALLOW_LOCALHOST") === "1") allowed.push("http://localhost:3000");

  if (origin && allowed.includes(origin)) return origin;
  if (publicSite) return publicSite;
  if (Deno.env.get("ALLOW_LOCALHOST") === "1") return "http://localhost:3000";
  throw new Error("Origine non configurata. Imposta PUBLIC_SITE_URL o ALLOWED_ORIGINS.");
}

function isAllowedUrl(value: string, allowedOrigin: string) {
  try {
    return new URL(value).origin === allowedOrigin;
  } catch (_) {
    return false;
  }
}

type StripeAccount = {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: {
    disabled_reason?: string | null;
    currently_due?: string[];
  };
};

function jsonResponse(body: Record<string, unknown>, status = 200, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function deriveConnectStatus(account: StripeAccount) {
  if (account.charges_enabled && account.payouts_enabled && account.details_submitted) return "active";
  if (account.requirements?.disabled_reason) return "restricted";
  if (account.details_submitted) return "pending";
  return "onboarding_started";
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

async function createStripeExpressAccount(user: { id: string; email?: string | null }) {
  const params = new URLSearchParams();
  params.set("type", "express");
  params.set("country", Deno.env.get("STRIPE_CONNECT_COUNTRY") || "IT");
  params.set("capabilities[card_payments][requested]", "true");
  params.set("capabilities[transfers][requested]", "true");
  params.set("metadata[lorecast_user_id]", user.id);

  if (user.email) params.set("email", user.email);

  return await stripeRequest("/v1/accounts", {
    method: "POST",
    body: params
  }) as StripeAccount;
}

async function createAccountLink(accountId: string, returnUrl: string, refreshUrl: string) {
  const params = new URLSearchParams();
  params.set("account", accountId);
  params.set("refresh_url", refreshUrl);
  params.set("return_url", returnUrl);
  params.set("type", "account_onboarding");
  params.set("collection_options[fields]", "eventually_due");

  return await stripeRequest("/v1/account_links", {
    method: "POST",
    body: params
  }) as { url: string };
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, email, name, stripe_connect_account_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);

    let accountId = profile?.stripe_connect_account_id || "";
    let account: StripeAccount | null = null;

    if (!accountId) {
      account = await createStripeExpressAccount({
        id: userData.user.id,
        email: profile?.email || userData.user.email
      });
      accountId = account.id;
    } else {
      account = await stripeRequest(`/v1/accounts/${accountId}`) as StripeAccount;
    }

    const body = await req.json().catch(() => ({}));
    const fallbackOrigin = getAllowedOrigin(req);
    const returnUrl = String(body.returnUrl || `${fallbackOrigin}#area-master`);
    const refreshUrl = String(body.refreshUrl || returnUrl);
    if (!isAllowedUrl(returnUrl, fallbackOrigin) || !isAllowedUrl(refreshUrl, fallbackOrigin)) {
      throw new Error("URL di ritorno Stripe non consentito per questa origine.");
    }

    const accountLink = await createAccountLink(accountId, returnUrl, refreshUrl);
    const status = deriveConnectStatus(account);

    const updatePayload = {
      id: userData.user.id,
      email: profile?.email || userData.user.email || null,
      name: profile?.name || userData.user.user_metadata?.name || userData.user.user_metadata?.full_name || userData.user.email?.split("@")[0] || "Master Lorecast",
      stripe_connect_account_id: accountId,
      stripe_connect_status: status,
      stripe_charges_enabled: Boolean(account.charges_enabled),
      stripe_payouts_enabled: Boolean(account.payouts_enabled),
      stripe_details_submitted: Boolean(account.details_submitted),
      stripe_onboarding_updated_at: new Date().toISOString()
    };

    const { error: updateError } = await adminClient
      .from("profiles")
      .upsert(updatePayload, { onConflict: "id" });

    if (updateError) throw new Error(updateError.message);

    return jsonResponse({
      url: accountLink.url,
      accountId,
      status,
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted)
    }, 200, responseHeaders);
  } catch (error) {
    console.error("create-connect-account error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400, responseHeaders);
  }
});
