import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../src/config/index.js";
import { registerOrderTools } from "../../src/tools/orders/index.js";

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
  registerOrderTools(server, TEST_CONFIG);
  return handlers;
}

describe("Orders integration — list_orders", () => {
  it("returns paginated orders from msw fixture", async () => {
    const handlers = registerTools();
    const result = await handlers.list_orders({ page: 1, limit: 20 });
    const data = JSON.parse(result.content[0].text);
    expect(data.items).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items[0]).toMatchObject({
      id: 1001,
      order_number: "1001",
      status: "open",
      financial_status: "paid",
    });
    expect(data).toMatchObject({ page: 1, limit: 20, total: 1 });
  });
});

describe("Orders integration — get_order", () => {
  it("returns full order detail including shipping_address and fulfillments", async () => {
    const handlers = registerTools();
    const result = await handlers.get_order({ order_id: 1001 });
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe(1001);
    expect(data.shipping_address).toMatchObject({
      first_name: "Nguyen",
      city: "Ho Chi Minh",
      phone: "0901234567",
    });
    expect(data.payment_gateway).toBe("COD");
    expect(Array.isArray(data.fulfillments)).toBe(true);
    expect(data.fulfillments[0]).toMatchObject({
      fulfillment_id: 901,
      tracking_number: "VN123456",
      tracking_company: "ViettelPost",
    });
  });

  it("returns error message for non-existent order", async () => {
    const handlers = registerTools();
    const result = await handlers.get_order({ order_id: 9999 });
    expect(result.content[0].text).toBe("Error: Order not found");
  });
});

describe("Orders integration — create_order", () => {
  it("creates an order and returns id, order_number, total_price, status", async () => {
    const handlers = registerTools();
    const result = await handlers.create_order({
      line_items: [{ variant_id: 201, quantity: 1 }],
    });
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      id: 1002,
      order_number: "1002",
      status: "open",
    });
    expect(data.total_price).toBeDefined();
  });
});

// ⚠️ Skipped: triggers real money movement — manual test only
describe("cancel_order integration", () => {
  it.skip("cancel_order with dry_run:false executes real cancellation — manual test only", async () => {
    // ⚠️ Skipped: triggers real money movement — manual test only
    // To test manually: call cancel_order with a test order ID and dry_run: false
  });
});
