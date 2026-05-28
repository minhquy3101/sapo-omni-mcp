import { vi, describe, it, expect, beforeEach } from "vitest";
import { createSapoClient, resetBucketForTesting } from "./sapo-client.js";
import {
  SapoPermissionError,
  SapoNotFoundError,
  SapoRateLimitError,
  SapoValidationError,
  SapoError,
  handleSapoError,
} from "./sapo-error.js";
import type { Config } from "../config/index.js";

// Capture the interceptor error handler registered during SapoClient construction
const mocks = vi.hoisted(() => {
  const capturedErrHandler: { fn?: (err: unknown) => Promise<unknown> } = {};

  const mockHttpInstance = {
    interceptors: {
      response: {
        use(
          _onFulfilled: unknown,
          onRejected: (err: unknown) => Promise<unknown>,
        ) {
          capturedErrHandler.fn = onRejected;
        },
      },
    },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };

  return { capturedErrHandler, mockHttpInstance };
});

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => mocks.mockHttpInstance),
    isAxiosError: (err: unknown): boolean =>
      typeof err === "object" &&
      err !== null &&
      "isAxiosError" in err &&
      (err as { isAxiosError: boolean }).isAxiosError === true,
  },
}));

const TEST_CONFIG: Config = {
  sapoApiKey: "test-key",
  sapoApiSecret: "test-secret",
  sapoStoreUrl: "https://test.mysapo.net",
  serverName: "test",
  logLevel: "info",
};

function axiosError(
  status: number,
  data: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return {
    isAxiosError: true,
    response: { status, data, headers },
    message: `Request failed with status ${status}`,
  };
}

describe("createSapoClient — shared rate limiter", () => {
  beforeEach(() => {
    resetBucketForTesting();
  });

  it("returns a SapoClient with get/post/put/delete methods", () => {
    const client = createSapoClient(TEST_CONFIG);
    expect(typeof client.get).toBe("function");
    expect(typeof client.post).toBe("function");
    expect(typeof client.put).toBe("function");
    expect(typeof client.delete).toBe("function");
  });

  it("two instances share the same rate limiter bucket", async () => {
    // Both clients are constructed — the mock instance is reused.
    // The shared _limiter module variable means both wrap the same bucket.
    const client1 = createSapoClient(TEST_CONFIG);
    const client2 = createSapoClient(TEST_CONFIG);
    mocks.mockHttpInstance.get.mockResolvedValue({ data: {} });

    // Fire 2 calls on client1 (drains 2 tokens from the shared bucket)
    await client1.get("/test.json");
    await client1.get("/test.json");

    // Third call on client2 must wait — same bucket, now exhausted
    const start = Date.now();
    await client2.get("/test.json");
    expect(Date.now() - start).toBeGreaterThanOrEqual(400);
  }, 3000);
});

describe("SapoClient response interceptor", () => {
  beforeEach(() => {
    resetBucketForTesting();
    createSapoClient(TEST_CONFIG); // registers the interceptor
  });

  it("translates 403 to SapoPermissionError with hint", async () => {
    const errFn = mocks.capturedErrHandler.fn!;
    await expect(
      errFn(axiosError(403, { error: "Forbidden" })),
    ).rejects.toBeInstanceOf(SapoPermissionError);

    await errFn(axiosError(403, { error: "Forbidden" })).catch((e: unknown) => {
      expect(e instanceof SapoPermissionError).toBe(true);
      expect((e as SapoPermissionError).hint).toContain("SAPO Admin");
    });
  });

  it("translates 404 to SapoNotFoundError", async () => {
    const errFn = mocks.capturedErrHandler.fn!;
    await expect(errFn(axiosError(404))).rejects.toBeInstanceOf(SapoNotFoundError);
  });

  it("translates 429 to SapoRateLimitError with Retry-After header", async () => {
    const errFn = mocks.capturedErrHandler.fn!;
    await errFn(axiosError(429, {}, { "retry-after": "3" })).catch((e: unknown) => {
      expect(e instanceof SapoRateLimitError).toBe(true);
      expect((e as SapoRateLimitError).retryAfter).toBe(3);
    });
  });

  it("translates 429 without Retry-After header", async () => {
    const errFn = mocks.capturedErrHandler.fn!;
    await errFn(axiosError(429)).catch((e: unknown) => {
      expect(e instanceof SapoRateLimitError).toBe(true);
      expect((e as SapoRateLimitError).retryAfter).toBeUndefined();
    });
  });

  it("translates 422 to SapoValidationError", async () => {
    const errFn = mocks.capturedErrHandler.fn!;
    await expect(errFn(axiosError(422))).rejects.toBeInstanceOf(SapoValidationError);
  });

  it("attaches errors map to SapoValidationError when SAPO returns errors body", async () => {
    const errFn = mocks.capturedErrHandler.fn!;
    const errBody = { errors: { base: ["Title can't be blank"], sku: ["SKU taken"] } };
    await errFn(axiosError(422, errBody)).catch((e: unknown) => {
      expect(e instanceof SapoValidationError).toBe(true);
      expect((e as SapoValidationError).details).toEqual(errBody.errors);
    });
  });

  it("translates unknown 5xx to base SapoError", async () => {
    const errFn = mocks.capturedErrHandler.fn!;
    await errFn(axiosError(500, { message: "Internal error" })).catch((e: unknown) => {
      expect(e instanceof SapoError).toBe(true);
      expect((e as SapoError).statusCode).toBe(500);
    });
  });

  it("passes through non-axios errors unchanged", async () => {
    const errFn = mocks.capturedErrHandler.fn!;
    const raw = new Error("network timeout");
    await expect(errFn(raw)).rejects.toBe(raw);
  });
});

describe("handleSapoError in catch block", () => {
  it("returns correctly formatted MCP response for SapoPermissionError with hint", () => {
    const e = new SapoPermissionError(
      "Store info permission not enabled",
      "Go to SAPO Admin → Apps → Permissions",
    );
    const result = handleSapoError(e);
    expect(result.content[0].text).toBe(
      "Error: Store info permission not enabled\nHint: Go to SAPO Admin → Apps → Permissions",
    );
  });

  it("returns correctly formatted MCP response for SapoNotFoundError", () => {
    const result = handleSapoError(new SapoNotFoundError("Order"));
    expect(result.content[0].text).toBe("Error: Order not found");
  });
});
