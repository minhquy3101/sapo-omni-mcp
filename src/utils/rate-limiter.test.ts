import { describe, it, expect, beforeEach } from "vitest";
import { createRateLimiter, resetBucketForTesting } from "./rate-limiter.js";

describe("createRateLimiter", () => {
  beforeEach(() => {
    resetBucketForTesting();
  });

  it("allows immediate execution within rate limit", async () => {
    const limiter = createRateLimiter(2);
    let count = 0;
    const start = Date.now();
    await limiter.schedule(async () => { count++; });
    await limiter.schedule(async () => { count++; });
    expect(count).toBe(2);
    expect(Date.now() - start).toBeLessThan(200);
  });

  it("delays the third request at 2 req/s so total elapsed >= 500ms", async () => {
    const limiter = createRateLimiter(2);
    const start = Date.now();
    await limiter.schedule(async () => {});
    await limiter.schedule(async () => {});
    await limiter.schedule(async () => {});
    expect(Date.now() - start).toBeGreaterThanOrEqual(450);
  }, 3000);

  it("returns the function result", async () => {
    const limiter = createRateLimiter(2);
    const result = await limiter.schedule(async () => 42);
    expect(result).toBe(42);
  });
});

describe("resetBucketForTesting", () => {
  it("clears accumulated delay so next calls are immediate after reset", async () => {
    const limiter = createRateLimiter(2);
    // Drain tokens
    await limiter.schedule(async () => {});
    await limiter.schedule(async () => {});
    // Reset shared bucket state
    resetBucketForTesting();
    // A new limiter should still work immediately (bucket is per-instance)
    const start = Date.now();
    const limiter2 = createRateLimiter(2);
    await limiter2.schedule(async () => {});
    await limiter2.schedule(async () => {});
    expect(Date.now() - start).toBeLessThan(200);
  });
});
