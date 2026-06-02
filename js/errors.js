export class AppError extends Error {
  constructor(message, code = "APP_ERROR", statusCode = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

export class AuthError extends AppError {
  constructor(message) {
    super(message, "AUTH_ERROR", 401);
    this.name = "AuthError";
  }
}

export class NotFoundError extends AppError {
  constructor(message) {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class PermissionError extends AppError {
  constructor(message) {
    super(message, "PERMISSION_DENIED", 403);
    this.name = "PermissionError";
  }
}

export class NetworkError extends AppError {
  constructor(message) {
    super(message, "NETWORK_ERROR", 503);
    this.name = "NetworkError";
  }
}

export function handleError(error) {
  console.error("Error:", error);

  if (error instanceof ValidationError) {
    showError(`Errore validazione: ${error.message}`);
  } else if (error instanceof AuthError) {
    showError(`Errore autenticazione: ${error.message}`);
  } else if (error instanceof NotFoundError) {
    showError(`Non trovato: ${error.message}`);
  } else if (error instanceof PermissionError) {
    showError(`Permesso negato: ${error.message}`);
  } else if (error instanceof NetworkError) {
    showError(`Errore rete: ${error.message}`);
  } else {
    showError(error.message || "Errore sconosciuto");
  }
}

function showError(message) {
  console.error(message);
  alert(message);
}
