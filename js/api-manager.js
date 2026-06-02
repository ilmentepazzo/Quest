import { CONFIG } from "./config.js";
import { AuthManager } from "./auth-manager.js";
import { NetworkError, ValidationError } from "./errors.js";

export class APIManager {
  constructor(supabaseClient) {
    this.auth = new AuthManager(supabaseClient);
    this.baseUrl = CONFIG.app.siteUrl;
  }

  async secureFetch(endpoint, options = {}) {
    try {
      const token = await this.auth.getToken();
      if (!token) {
        throw new Error("Non autenticato");
      }

      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        ...options.headers
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(endpoint, {
        ...options,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new NetworkError(
          errorData.error || `HTTP ${response.status}`
        );
      }

      return await response.json();
    } catch (err) {
      if (err.name === "AbortError") {
        throw new NetworkError("Richiesta scaduta");
      }
      throw err;
    }
  }

  async createCheckoutSession(targetType, targetId, amount) {
    if (!targetType || !targetId) {
      throw new ValidationError("Dati pagamento incompleti");
    }

    return this.secureFetch(`${CONFIG.app.siteUrl}${CONFIG.api.checkoutSession}`, {
      method: "POST",
      body: JSON.stringify({
        targetType,
        targetId,
        amount
      })
    });
  }

  async confirmCheckoutSession(sessionId) {
    if (!sessionId) {
      throw new ValidationError("Session ID mancante");
    }

    return this.secureFetch(`${CONFIG.app.siteUrl}${CONFIG.api.confirmCheckout}`, {
      method: "POST",
      body: JSON.stringify({ sessionId })
    });
  }

  async createConnectAccount() {
    return this.secureFetch(`${CONFIG.app.siteUrl}${CONFIG.api.connectAccount}`, {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  async refreshConnectStatus() {
    return this.secureFetch(`${CONFIG.app.siteUrl}${CONFIG.api.refreshConnect}`, {
      method: "POST",
      body: JSON.stringify({})
    });
  }
}
