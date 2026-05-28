type McpErrorResult = { content: [{ type: "text"; text: string }] };

export class SapoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "SapoError";
  }
}

export class SapoNotFoundError extends SapoError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, 404);
    this.name = "SapoNotFoundError";
  }
}

export class SapoPermissionError extends SapoError {
  constructor(
    message: string,
    public readonly hint: string,
  ) {
    super(message, 403);
    this.name = "SapoPermissionError";
  }
}

export class SapoRateLimitError extends SapoError {
  constructor(public readonly retryAfter?: number) {
    super("Rate limit exceeded", 429);
    this.name = "SapoRateLimitError";
  }
}

export class SapoValidationError extends SapoError {
  constructor(message: string) {
    super(message, 422);
    this.name = "SapoValidationError";
  }
}

export function handleSapoError(error: unknown): McpErrorResult {
  const msg = error instanceof Error ? error.message : "Unknown error";
  return { content: [{ type: "text", text: `Error: ${msg}` }] };
}

export function parseSapoError(status: number, message: string): SapoError {
  switch (status) {
    case 404:
      return new SapoNotFoundError(message);
    case 403:
      return new SapoPermissionError(
        message,
        "Go to SAPO Admin → Apps → [App Name] → Permissions to enable the required permission.",
      );
    case 429:
      return new SapoRateLimitError();
    case 422:
      return new SapoValidationError(message);
    default:
      return new SapoError(message, status);
  }
}
