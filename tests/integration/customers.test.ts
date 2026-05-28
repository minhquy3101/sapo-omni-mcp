import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../src/config/index.js";
import { registerCustomerTools } from "../../src/tools/customers/index.js";

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
  registerCustomerTools(server, TEST_CONFIG);
  return handlers;
}

describe("Customers integration — get_customer", () => {
  it("returns customer detail with addresses and recent_orders", async () => {
    const handlers = registerTools();
    const result = await handlers.get_customer({ customer_id: 5001 });
    const data = JSON.parse(result.content[0].text);

    expect(data.id).toBe(5001);
    expect(data.first_name).toBe("Nguyen");
    expect(data.email).toBe("nguyenvana@example.com");
    expect(Array.isArray(data.addresses)).toBe(true);
    expect(data.addresses[0]).toMatchObject({
      city: "Ho Chi Minh",
      is_default: true,
    });
    expect(Array.isArray(data.recent_orders)).toBe(true);
    expect(data.recent_orders.length).toBeGreaterThan(0);
    expect(data.recent_orders[0]).toMatchObject({
      order_id: expect.any(Number),
      total_price: expect.any(String),
      status: expect.any(String),
    });
    expect(data.metadata.recent_orders_capped).toBe(false);
  });

  it("returns error for non-existent customer", async () => {
    const handlers = registerTools();
    const result = await handlers.get_customer({ customer_id: 9999 });
    expect(result.content[0].text).toBe("Error: Customer not found");
  });
});
