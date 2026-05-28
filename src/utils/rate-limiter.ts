export interface RateLimiter {
  schedule<T>(fn: () => Promise<T>): Promise<T>;
}

class TokenBucket implements RateLimiter {
  private tokens: number;
  private lastRefillMs: number;

  constructor(private readonly rps: number) {
    this.tokens = rps;
    this.lastRefillMs = Date.now();
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForToken();
    return fn();
  }

  private async waitForToken(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil((1 - this.tokens) * (1000 / this.rps));
    await new Promise<void>(resolve => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefillMs) / 1000;
    this.tokens = Math.min(this.rps, this.tokens + elapsed * this.rps);
    this.lastRefillMs = now;
  }

  reset(): void {
    this.tokens = this.rps;
    this.lastRefillMs = Date.now();
  }
}

export function createRateLimiter(rps: number): RateLimiter {
  return new TokenBucket(rps);
}

// Module-level shared bucket (2 req/s) — used by SapoClient across all instances
const _sharedBucket = new TokenBucket(2);

export function getSharedRateLimiter(): RateLimiter {
  return _sharedBucket;
}

export function resetBucketForTesting(): void {
  _sharedBucket.reset();
}
