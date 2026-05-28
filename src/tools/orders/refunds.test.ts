import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { SapoNotFoundError } from "../../utils/sapo-error.js";
import { registerRefundTools } from "./refunds.js";

type ToolResult = { content: [{ type: "text"; text: string }] };
type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

const mocks = vi.hoisted(() => {
  const client = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
  return { client, createSapoClient: vi.fn(() => client) };
});

vi.mock("../../utils/sapo-client.js", () => ({
  createSapoClient: mocks.createSapoClient,
}));

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
  registerRefundTools(server, TEST_CONFIG);
  return handlers;
}

const mockOrder = {
  id: 1001,
  order_number: "1001",
  status: "open",
  financial_status: "paid",
  fulfillment_status: null,
  total_price: "250000",
  line_items: [{ id: 2001, product_id: 101, variant_id: 201, name: "Ao thun", sku: "AT-001", quantity: 2, price: "125000" }],
  customer: null,
  created_on: "2026-05-20T09:00:00Z",
  note: null,
  email: null,
  payment_gateway: "COD",
};

const mockRefund = {
  id: 3001,
  created_on: "2026-05-25T10:00:00Z",
  note: "Customer returned item",
  refund_line_items: [
    { line_item_id: 2001, variant_id: 201, title: "Ao thun", quantity: 1, subtotal: "125000" },
  ],
  transactions: [
    { id: 4001, amount: "125000", gateway: "COD", status: "success" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("list_refunds", () => {
  it("returns refund list for a valid order", async () => {
    mocks.client.get.mockResolvedValue({ data: { refunds: [mockRefund] } });
    const handlers = registerTools();
    const result = await handlers.list_refunds({ order_id: 1001 });
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toMatchObject({
      refund_id: 3001,
      note: "Customer returned item",
      refund_line_items: [{ quantity: 1, subtotal: "125000" }],
      transactions: [{ amount: "125000", gateway: "COD", status: "success" }],
    });
  });

  it("returns empty array when order has no refunds", async () => {
    mocks.client.get.mockResolvedValue({ data: { refunds: [] } });
    const handlers = registerTools();
    const result = await handlers.list_refunds({ order_id: 1001 });
    const data = JSON.parse(result.content[0].text);
    expect(data).toEqual([]);
  });

  it("returns Order not found for invalid order_id", async () => {
    mocks.client.get.mockRejectedValue(new SapoNotFoundError());
    const handlers = registerTools();
    const result = await handlers.list_refunds({ order_id: 9999 });
    expect(result.content[0].text).toBe("Error: Order not found");
  });
});

describe("create_refund — dry_run: true (default)", () => {
  it("returns preview without calling refunds endpoint", async () => {
    mocks.client.get.mockResolvedValue({ data: { order: mockOrder } });
    const handlers = registerTools();
    const result = await handlers.create_refund({
      order_id: 1001,
      dry_run: true,
      refund_line_items: [{ line_item_id: 2001, quantity: 1, restock: true }],
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.dry_run).toBe(true);
    expect(data.action).toContain("Create refund on order #1001");
    expect(data.would_affect.restock_count).toBe(1);
    // POST should NOT have been called
    expect(mocks.client.post).not.toHaveBeenCalled();
  });

  it("dry_run defaults to true when not specified", async () => {
    mocks.client.get.mockResolvedValue({ data: { order: mockOrder } });
    const handlers = registerTools();
    const result = await handlers.create_refund({ order_id: 1001 });
    const data = JSON.parse(result.content[0].text);
    expect(data.dry_run).toBe(true);
    expect(mocks.client.post).not.toHaveBeenCalled();
  });
});

describe("create_refund — dry_run: false", () => {
  it("creates refund and returns refund_id, total_refunded, financial_status", async () => {
    mocks.client.get
      .mockResolvedValueOnce({ data: { order: mockOrder } })          // pre-check
      .mockResolvedValueOnce({ data: { order: { ...mockOrder, financial_status: "partially_refunded" } } }); // post-create fetch
    mocks.client.post.mockResolvedValue({ data: { refund: mockRefund } });

    const handlers = registerTools();
    const result = await handlers.create_refund({
      order_id: 1001,
      dry_run: false,
      refund_line_items: [{ line_item_id: 2001, quantity: 1, restock: true }],
      note: "Customer returned item",
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.refund_id).toBe(3001);
    expect(data.total_refunded).toBe("125000");
    expect(data.financial_status).toBe("partially_refunded");
    expect(mocks.client.post).toHaveBeenCalledWith(
      "/orders/1001/refunds.json",
      expect.objectContaining({ refund: expect.objectContaining({ note: "Customer returned item" }) }),
    );
  });
});

describe("create_refund — dry_run:false without refund_line_items", () => {
  it("returns error when dry_run is false and refund_line_items is missing", async () => {
    mocks.client.get.mockResolvedValue({ data: { order: mockOrder } });
    const handlers = registerTools();
    const result = await handlers.create_refund({ order_id: 1001, dry_run: false });
    expect(result.content[0].text).toContain("refund_line_items is required when dry_run is false");
    expect(mocks.client.post).not.toHaveBeenCalled();
  });
});

describe("create_refund — already cancelled/refunded", () => {
  it("returns error for cancelled order", async () => {
    mocks.client.get.mockResolvedValue({
      data: { order: { ...mockOrder, status: "cancelled", financial_status: "voided" } },
    });
    const handlers = registerTools();
    const result = await handlers.create_refund({ order_id: 1001, dry_run: false });
    expect(result.content[0].text).toContain("Error: Cannot create refund — order is already cancelled");
    expect(mocks.client.post).not.toHaveBeenCalled();
  });

  it("returns error for already refunded order", async () => {
    mocks.client.get.mockResolvedValue({
      data: { order: { ...mockOrder, status: "closed", financial_status: "refunded" } },
    });
    const handlers = registerTools();
    const result = await handlers.create_refund({ order_id: 1001, dry_run: false });
    expect(result.content[0].text).toContain("Error: Cannot create refund — order is already refunded");
    expect(mocks.client.post).not.toHaveBeenCalled();
  });
});
