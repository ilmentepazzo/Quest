export const CONFIG = {
  supabase: {
    url: process.env.REACT_APP_SUPABASE_URL || "",
    anonKey: process.env.REACT_APP_SUPABASE_ANON_KEY || ""
  },
  stripe: {
    publicKey: process.env.REACT_APP_STRIPE_PUBLIC_KEY || ""
  },
  app: {
    name: "Lorecast",
    version: "1.0.0",
    supportEmail: process.env.REACT_APP_SUPPORT_EMAIL || "info.dix.doitfor@gmail.com",
    siteUrl: process.env.REACT_APP_PUBLIC_SITE_URL || "http://localhost:3000"
  },
  security: {
    enableCSP: true,
    enableSRI: true,
    maxInputLength: 5000,
    rateLimit: {
      maxRequests: 10,
      timeWindow: 60000
    }
  },
  validation: {
    email: {
      maxLength: 255,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    password: {
      minLength: 8,
      maxLength: 128
    },
    storyTitle: {
      minLength: 3,
      maxLength: 200
    },
    storyPrice: {
      min: 0,
      max: 9999.99
    },
    description: {
      minLength: 10,
      maxLength: 5000
    }
  },
  api: {
    checkoutSession: "/functions/v1/create-checkout-session",
    confirmCheckout: "/functions/v1/confirm-checkout-session",
    connectAccount: "/functions/v1/create-connect-account",
    refreshConnect: "/functions/v1/refresh-connect-status"
  }
};

export function validateConfig() {
  const errors = [];
  if (!CONFIG.supabase.url) errors.push("REACT_APP_SUPABASE_URL non configurato");
  if (!CONFIG.supabase.anonKey) errors.push("REACT_APP_SUPABASE_ANON_KEY non configurato");
  if (!CONFIG.stripe.publicKey) errors.push("REACT_APP_STRIPE_PUBLIC_KEY non configurato");

  if (errors.length > 0) {
    console.error("❌ Errori configurazione:", errors);
    throw new Error("Configurazione incompleta. Controlla .env.local");
  }

  console.log("✅ Configurazione validata");
}
