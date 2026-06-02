import { CONFIG } from "./config.js";

export class SecurityManager {
  static validateEmail(email) {
    if (!email || typeof email !== "string") return false;
    if (email.length > CONFIG.validation.email.maxLength) return false;
    return CONFIG.validation.email.pattern.test(email);
  }

  static validatePassword(password) {
    if (!password || typeof password !== "string") return false;
    return (
      password.length >= CONFIG.validation.password.minLength &&
      password.length <= CONFIG.validation.password.maxLength
    );
  }

  static validateStoryTitle(title) {
    if (!title || typeof title !== "string") return false;
    const trimmed = title.trim();
    return (
      trimmed.length >= CONFIG.validation.storyTitle.minLength &&
      trimmed.length <= CONFIG.validation.storyTitle.maxLength
    );
  }

  static validatePrice(price) {
    const num = Number(price);
    if (isNaN(num)) return false;
    return (
      num >= CONFIG.validation.storyPrice.min &&
      num <= CONFIG.validation.storyPrice.max
    );
  }

  static validateDescription(desc) {
    if (!desc || typeof desc !== "string") return false;
    const trimmed = desc.trim();
    return (
      trimmed.length >= CONFIG.validation.description.minLength &&
      trimmed.length <= CONFIG.validation.description.maxLength
    );
  }

  static escapeHtml(text) {
    if (!text || typeof text !== "string") return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  static sanitizeHtml(html, allowedTags = []) {
    if (!html || typeof html !== "string") return "";

    if (typeof DOMPurify !== "undefined") {
      return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: allowedTags,
        ALLOWED_ATTR: [],
        KEEP_CONTENT: true
      });
    }

    if (allowedTags.length === 0) {
      const div = document.createElement("div");
      div.textContent = html;
      return div.innerHTML;
    }

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    iframe.contentDocument.write(html);
    const sanitized = iframe.contentDocument.body.innerHTML;
    document.body.removeChild(iframe);
    return sanitized;
  }

  static normalizeId(value) {
    if (!value) return "";
    return String(value).trim();
  }

  static isValidUuid(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  static async sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }
}
