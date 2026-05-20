import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

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

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
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
      });
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
    });
  } catch (error) {
    console.error("refresh-connect-status error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
