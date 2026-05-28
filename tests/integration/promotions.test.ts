import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../src/config/index.js";
import { registerPromotionTools } from "../../src/tools/promotions/index.js";

type ToolResult = { content: [{ type: "text"; text: string }] };
type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

const TEST_CONFIG: Config = {
  sapoApiKey: "key",
  sapoApiSecret: "secret",
  sapoStoreUrl: "https://test.mysapo.net",
  serverName: "test",
  logLevel: "info",
};

function registerTools() {
  const handlers: Record<string, ToolHandler> = {};
  const server = {
    tool: vi.fn(
      (name: string, _desc: string, _schema: unknown, callback: ToolHandler) => {
        handlers[name] = callback;
      },
    ),
  } as unknown as McpServer;
  registerPromotionTools(server, TEST_CONFIG);
  return handlers;
}

describe("Promotions integration — list_price_rules", () => {
  it("returns paginated list of price rules from msw fixture", async () => {
    const handlers = registerTools();
    const result = await handlers.list_price_rules({ page: 1, limit: 20 });
    const data = JSON.parse(result.content[0].text);

    expect(data.items).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items[0]).toMatchObject({
      id: 9001,
      title: "Giam gia 10% he 2026",
      discount_type: "percentage",
      no_expiry: false,
    });
    expect(data.total).toBe(1);
  });
});

describe("Promotions integration — get_price_rule", () => {
  it("returns full price rule detail", async () => {
    const handlers = registerTools();
    const result = await handlers.get_price_rule({ price_rule_id: 9001 });
    const data = JSON.parse(result.content[0].text);

    expect(data.id).toBe(9001);
    expect(data.title).toBe("Giam gia 10% he 2026");
    expect(data.discount_type).toBe("percentage");
    expect(Array.isArray(data.entitled_product_ids)).toBe(true);
    expect(data.created_at).toBeDefined();
  });

  it("returns error for non-existent price rule", async () => {
    const handlers = registerTools();
    const result = await handlers.get_price_rule({ price_rule_id: 9999 });
    expect(result.content[0].text).toBe("Error: Price rule not found");
  });
});
