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

async function retrieveStripeAccount(accountId: string) {
  const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
  const response = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey}` }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Stripe error ${response.status}`;
    throw new Error(message);
  }

  return payload as StripeAccount;
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
      .select("stripe_connect_account_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);

    const accountId = profile?.stripe_connect_account_id || "";
    if (!accountId) {
      return jsonResponse({
        accountId: "",
        status: "not_started",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false
      }, 200, responseHeaders);
    }

    const account = await retrieveStripeAccount(accountId);
    const status = deriveConnectStatus(account);

    const { error: updateError } = await adminClient
      .from("profiles")
      .update({
        stripe_connect_status: status,
        stripe_charges_enabled: Boolean(account.charges_enabled),
        stripe_payouts_enabled: Boolean(account.payouts_enabled),
        stripe_details_submitted: Boolean(account.details_submitted),
        stripe_onboarding_updated_at: new Date().toISOString()
      })
      .eq("id", userData.user.id);

    if (updateError) throw new Error(updateError.message);

    return jsonResponse({
      accountId,
      status,
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted),
      currentlyDue: account.requirements?.currently_due || [],
      disabledReason: account.requirements?.disabled_reason || ""
    }, 200, responseHeaders);
  } catch (error) {
    console.error("refresh-connect-status error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400, responseHeaders);
  }
});
