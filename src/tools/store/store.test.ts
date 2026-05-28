import { describe, expect, it, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { SapoError, SapoPermissionError } from "../../utils/sapo-error.js";
import { registerStoreTools } from "./index.js";

type ToolResult = { content: [{ type: "text"; text: string }] };
type ToolHandler = () => Promise<ToolResult>;

const mocks = vi.hoisted(() => {
  const client = {
    get: vi.fn(),
  };

  return {
    client,
    createSapoClient: vi.fn(() => client),
  };
});

vi.mock("../../utils/sapo-client.js", () => ({
  createSapoClient: mocks.createSapoClient,
}));

const TEST_CONFIG: Config = {
  sapoApiKey: "test-key",
  sapoApiSecret: "test-secret",
  sapoStoreUrl: "https://test.mysapo.net",
  serverName: "test",
  logLevel: "info",
};

function registerTool() {
  let handler: ToolHandler | undefined;

  const server = {
    tool: vi.fn(
      (
        _name: string,
        _description: string,
        _schema: Record<string, unknown>,
        callback: ToolHandler,
      ) => {
        handler = callback;
      },
    ),
  } as unknown as McpServer;

  registerStoreTools(server, TEST_CONFIG);

  if (!handler) {
    throw new Error("get_store handler was not registered");
  }

  return { server, handler };
}

describe("get_store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns structured store information", async () => {
    mocks.client.get.mockResolvedValue({
      data: {
        store: {
          name: "Demo Store",
          timezone: "Asia/Ho_Chi_Minh",
          currency: "VND",
          plan_display_name: "Pro",
          primary_domain: "demo.mysapo.net",
          email: "owner@example.com",
        },
      },
    });

    const { handler } = registerTool();
    const result = await handler();
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body).toEqual({
      store_name: "Demo Store",
      timezone: "Asia/Ho_Chi_Minh",
      currency: "VND",
      plan_display_name: "Pro",
      primary_domain: "demo.mysapo.net",
      contact_email: "owner@example.com",
    });
    expect(mocks.client.get).toHaveBeenCalledWith("/store.json");
  });

  it("returns an actionable Store info permission error for SAPO 403", async () => {
    mocks.client.get.mockRejectedValue(
      new SapoPermissionError(
        "Forbidden",
        "Go to SAPO Admin → Apps → [App Name] → Permissions to enable the required permission.",
      ),
    );

    const { handler } = registerTool();
    const result = await handler();

    expect(result.content[0].text).toBe(
      "Error: Store info permission not enabled. Go to SAPO Admin → Apps → [App Name] → Permissions and enable 'Store info'.",
    );
    expect(result.content[0].text).not.toContain("403");
  });

  it("returns generic API errors in standard MCP error format", async () => {
    mocks.client.get.mockRejectedValue(new SapoError("SAPO unavailable", 500));

    const { handler } = registerTool();
    const result = await handler();

    expect(result.content[0].text).toBe("Error: SAPO unavailable");
  });

  it("registers get_store with no params", () => {
    const { server } = registerTool();

    expect(server.tool).toHaveBeenCalledWith(
      "get_store",
      expect.any(String),
      {},
      expect.any(Function),
    );
  });
});
