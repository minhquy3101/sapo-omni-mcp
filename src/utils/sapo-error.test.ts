import { describe, it, expect } from "vitest";
import {
  SapoError,
  SapoNotFoundError,
  SapoPermissionError,
  SapoRateLimitError,
  SapoValidationError,
  handleSapoError,
  parseSapoError,
} from "./sapo-error.js";

describe("SapoError subclasses", () => {
  it("SapoNotFoundError has statusCode 404", () => {
    const e = new SapoNotFoundError("Product");
    expect(e.statusCode).toBe(404);
    expect(e.message).toBe("Product not found");
    expect(e instanceof SapoError).toBe(true);
  });

  it("SapoPermissionError carries a hint", () => {
    const e = new SapoPermissionError("Forbidden", "Enable X in SAPO Admin");
    expect(e.statusCode).toBe(403);
    expect(e.hint).toBe("Enable X in SAPO Admin");
  });

  it("SapoRateLimitError has statusCode 429", () => {
    const e = new SapoRateLimitError(5);
    expect(e.statusCode).toBe(429);
    expect(e.retryAfter).toBe(5);
  });

  it("SapoValidationError has statusCode 422", () => {
    const e = new SapoValidationError("Invalid input");
    expect(e.statusCode).toBe(422);
    expect(e.details).toBeUndefined();
  });

  it("SapoValidationError stores details when provided", () => {
    const details = { base: ["Title can't be blank"], sku: ["SKU already taken"] };
    const e = new SapoValidationError("Unprocessable Entity", details);
    expect(e.details).toEqual(details);
  });
});

describe("handleSapoError", () => {
  it("returns MCP error format for Error instances", () => {
    const result = handleSapoError(new Error("something failed"));
    expect(result).toEqual({
      content: [{ type: "text", text: "Error: something failed" }],
    });
  });

  it("returns MCP error format for unknown errors", () => {
    const result = handleSapoError("raw string error");
    expect(result).toEqual({
      content: [{ type: "text", text: "Error: Unknown error" }],
    });
  });

  it("handles SapoPermissionError by surfacing hint", () => {
    const e = new SapoPermissionError(
      "Store info permission not enabled",
      "Go to SAPO Admin → Apps → Permissions",
    );
    const result = handleSapoError(e);
    expect(result.content[0].text).toBe(
      "Error: Store info permission not enabled\nHint: Go to SAPO Admin → Apps → Permissions",
    );
  });

  it("handles SapoValidationError with details by listing field errors", () => {
    const e = new SapoValidationError("Unprocessable Entity", {
      base: ["Title can't be blank"],
      sku: ["SKU already taken"],
    });
    const result = handleSapoError(e);
    expect(result.content[0].text).toContain("Error: Unprocessable Entity");
    expect(result.content[0].text).toContain("base: Title can't be blank");
    expect(result.content[0].text).toContain("sku: SKU already taken");
  });

  it("handles SapoValidationError without details as plain error", () => {
    const e = new SapoValidationError("Inventory item must be connected");
    const result = handleSapoError(e);
    expect(result.content[0].text).toBe("Error: Inventory item must be connected");
  });
});

describe("parseSapoError", () => {
  it("maps 404 to SapoNotFoundError", () => {
    expect(parseSapoError(404, "Order") instanceof SapoNotFoundError).toBe(true);
  });

  it("maps 403 to SapoPermissionError with hint", () => {
    const e = parseSapoError(403, "Forbidden");
    expect(e instanceof SapoPermissionError).toBe(true);
    expect((e as SapoPermissionError).hint).toContain("SAPO Admin");
  });

  it("maps 429 to SapoRateLimitError", () => {
    expect(parseSapoError(429, "Too many requests") instanceof SapoRateLimitError).toBe(true);
  });

  it("maps unknown status to base SapoError", () => {
    const e = parseSapoError(500, "Server error");
    expect(e instanceof SapoError).toBe(true);
    expect(e.statusCode).toBe(500);
  });
});
