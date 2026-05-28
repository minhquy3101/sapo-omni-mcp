import { describe, it, expect, beforeEach } from "vitest";
import { loadConfig } from "../../src/config/index.js";

describe("loadConfig", () => {
  beforeEach(() => {
    process.env.SAPO_API_KEY = "test-key";
    process.env.SAPO_API_SECRET = "test-secret";
    process.env.SAPO_STORE_URL = "https://test.mysapo.vn";
  });

  it("loads valid config", () => {
    const config = loadConfig();
    expect(config.sapoApiKey).toBe("test-key");
    expect(config.serverName).toBe("sapo-omni-mcp");
  });

  it("throws when required env vars are missing", () => {
    delete process.env.SAPO_API_KEY;
    expect(() => loadConfig()).toThrow();
  });
});
