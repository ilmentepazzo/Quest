import { SecurityManager } from "./security.js";

export class AuthManager {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.currentUser = null;
  }

  async loginWithEmail(email, password) {
    if (!SecurityManager.validateEmail(email)) {
      throw new Error("Email non valida");
    }

    if (!SecurityManager.validatePassword(password)) {
      throw new Error("Password non valida (min 8 caratteri)");
    }

    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      this.currentUser = data.user;
      return data;
    } catch (err) {
      console.error("Login error:", err);
      throw new Error(err.message || "Errore login");
    }
  }

  async signUpWithEmail(email, password, metadata = {}) {
    if (!SecurityManager.validateEmail(email)) {
      throw new Error("Email non valida");
    }

    if (!SecurityManager.validatePassword(password)) {
      throw new Error("Password non valida (min 8 caratteri)");
    }

    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: metadata.name || "Utente Lorecast"
          }
        }
      });

      if (error) throw error;

      this.currentUser = data.user;
      return data;
    } catch (err) {
      console.error("Signup error:", err);
      throw new Error(err.message || "Errore registrazione");
    }
  }

  async logout() {
    try {
      const { error } = await this.supabase.auth.signOut();
      if (error) throw error;

      this.currentUser = null;
      sessionStorage.clear();
    } catch (err) {
      console.error("Logout error:", err);
      throw new Error(err.message || "Errore logout");
    }
  }

  async getCurrentUser() {
    try {
      const { data: { user }, error } = await this.supabase.auth.getUser();

      if (error || !user) {
        this.currentUser = null;
        return null;
      }

      this.currentUser = user;
      return user;
    } catch (err) {
      console.error("Get user error:", err);
      this.currentUser = null;
      return null;
    }
  }

  isLoggedIn() {
    return this.currentUser !== null;
  }

  async getToken() {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      if (error || !session) return null;
      return session.access_token;
    } catch (err) {
      console.error("Get token error:", err);
      return null;
    }
  }
}
