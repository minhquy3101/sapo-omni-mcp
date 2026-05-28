import { z } from "zod";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { registerReportTools } from "./index.js";

type ToolResult = { content: [{ type: "text"; text: string }] };
type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

const serviceMocks = vi.hoisted(() => ({
  fetchOrders: vi.fn(),
}));

const clientMocks = vi.hoisted(() => {
  const client = { get: vi.fn() };
  return { client, createSapoClient: vi.fn(() => client) };
});

vi.mock("../orders/service.js", () => ({
  fetchOrders: serviceMocks.fetchOrders,
}));
vi.mock("../../utils/sapo-client.js", () => ({
  createSapoClient: clientMocks.createSapoClient,
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
  const schemas: Record<string, Record<string, z.ZodTypeAny>> = {};

  const server = {
    tool: vi.fn(
      (
        name: string,
        _desc: string,
        schema: Record<string, z.ZodTypeAny>,
        callback: ToolHandler,
      ) => {
        handlers[name] = callback;
        schemas[name] = schema;
      },
    ),
  } as unknown as McpServer;

  registerReportTools(server, TEST_CONFIG);
  return { handlers, schemas };
}

// ── Story 6.2: Order Status Summary ───────────────────────────────────────

describe("order_status_summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMocks.client.get.mockResolvedValue({ data: { count: 0 } });
  });

  it("returns counts by status and surfaces pending COD orders", async () => {
    serviceMocks.fetchOrders.mockResolvedValue({
      orders: [
        { status: "open", financial_status: "paid", payment_gateway: "credit_card", total_price: "100000", created_on: "2026-05-01T10:00:00Z", line_items: [] },
        { status: "open", financial_status: "pending", payment_gateway: "COD", total_price: "200000", created_on: "2026-05-02T10:00:00Z", line_items: [] },
        { status: "closed", financial_status: "paid", payment_gateway: "credit_card", total_price: "150000", created_on: "2026-05-03T10:00:00Z", line_items: [] },
        { status: "cancelled", financial_status: "voided", payment_gateway: "COD", total_price: "80000", created_on: "2026-05-04T10:00:00Z", line_items: [] },
      ],
      truncated: false,
    });

    const { handlers } = registerTools();
    const result = await handlers.order_status_summary({
      date_from: "2026-05-01",
      date_to: "2026-05-26",
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.open).toBe(2);
    expect(body.closed).toBe(1);
    expect(body.cancelled).toBe(1);
    expect(body.pending_cod).toBe(1);
    expect(body.metadata).toMatchObject({
      total_records: 4,
      date_from: "2026-05-01",
      date_to: "2026-05-26",
      is_complete: true,
    });
    expect((body.metadata as Record<string, unknown>).warning).toBeUndefined();
  });

  it("sets is_complete: false and adds warning when fetchOrders is truncated", async () => {
    serviceMocks.fetchOrders.mockResolvedValue({
      orders: [
        { status: "open", financial_status: "paid", payment_gateway: "COD", total_price: "100000", created_on: "2026-05-01T10:00:00Z", line_items: [] },
      ],
      truncated: true,
    });

    const { handlers } = registerTools();
    const result = await handlers.order_status_summary({
      date_from: "2026-05-01",
      date_to: "2026-05-26",
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;
    const metadata = body.metadata as Record<string, unknown>;

    expect(metadata.is_complete).toBe(false);
    expect(typeof metadata.warning).toBe("string");
    expect((metadata.warning as string)).toContain("25,000");
  });

  it("fails fast when order count exceeds 25,000", async () => {
    clientMocks.client.get.mockResolvedValue({ data: { count: 30000 } });

    const { handlers } = registerTools();
    const result = await handlers.order_status_summary({
      date_from: "2026-05-01",
      date_to: "2026-05-26",
    });

    expect(result.content[0].text).toContain("Error: Too many orders");
    expect(result.content[0].text).toContain("30,000");
    expect(serviceMocks.fetchOrders).not.toHaveBeenCalled();
  });

  it("rejects missing date_from at schema level (required field)", async () => {
    const { schemas } = registerTools();
    expect(() => schemas["order_status_summary"].date_from.parse(undefined)).toThrow();
  });

  it("rejects date range exceeding 90 days", async () => {
    const { handlers } = registerTools();
    const result = await handlers.order_status_summary({
      date_from: "2026-01-01",
      date_to: "2026-05-01",
    });

    expect(result.content[0].text).toBe(
      "Error: Date range cannot exceed 90 days. Split into shorter periods.",
    );
    expect(serviceMocks.fetchOrders).not.toHaveBeenCalled();
  });
});

// ── Story 6.3: Revenue Summary ─────────────────────────────────────────────

describe("revenue_summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMocks.client.get.mockResolvedValue({ data: { count: 0 } });
  });

  it("returns total revenue, order count, and average order value", async () => {
    serviceMocks.fetchOrders.mockResolvedValue({
      orders: [
        { status: "closed", financial_status: "paid", total_price: "300000", created_on: "2026-05-01T10:00:00Z", payment_gateway: "COD", line_items: [], currency: "VND" },
        { status: "closed", financial_status: "paid", total_price: "200000", created_on: "2026-05-02T10:00:00Z", payment_gateway: "COD", line_items: [], currency: "VND" },
      ],
      truncated: false,
    });

    const { handlers } = registerTools();
    const result = await handlers.revenue_summary({
      date_from: "2026-05-01",
      date_to: "2026-05-26",
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.total_revenue).toBe(500000);
    expect(body.order_count).toBe(2);
    expect(body.average_order_value).toBe(250000);
    expect(body.currency).toBe("VND");
    expect(body.metadata).toMatchObject({ total_records: 2, is_complete: true });
    expect((body.metadata as Record<string, unknown>).warning).toBeUndefined();
  });

  it("sets is_complete: false and adds warning when fetchOrders is truncated", async () => {
    serviceMocks.fetchOrders.mockResolvedValue({
      orders: [
        { status: "closed", financial_status: "paid", total_price: "100000", created_on: "2026-05-01T10:00:00Z", payment_gateway: "COD", line_items: [], currency: "VND" },
      ],
      truncated: true,
    });

    const { handlers } = registerTools();
    const result = await handlers.revenue_summary({
      date_from: "2026-05-01",
      date_to: "2026-05-26",
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;
    const metadata = body.metadata as Record<string, unknown>;

    expect(metadata.is_complete).toBe(false);
    expect(typeof metadata.warning).toBe("string");
    expect((metadata.warning as string)).toContain("25,000");
  });

  it("fails fast when paid order count exceeds 25,000", async () => {
    clientMocks.client.get.mockResolvedValue({ data: { count: 26000 } });

    const { handlers } = registerTools();
    const result = await handlers.revenue_summary({
      date_from: "2026-05-01",
      date_to: "2026-05-26",
    });

    expect(result.content[0].text).toContain("Error: Too many orders");
    expect(result.content[0].text).toContain("26,000");
    expect(serviceMocks.fetchOrders).not.toHaveBeenCalled();
  });

  it("returns zero revenue when no paid orders exist", async () => {
    serviceMocks.fetchOrders.mockResolvedValue({ orders: [], truncated: false });

    const { handlers } = registerTools();
    const result = await handlers.revenue_summary({
      date_from: "2026-05-01",
      date_to: "2026-05-26",
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.total_revenue).toBe(0);
    expect(body.order_count).toBe(0);
    expect(body.average_order_value).toBe(0);
  });

  it("includes daily_breakdown when include_daily_breakdown: true", async () => {
    serviceMocks.fetchOrders.mockResolvedValue({
      orders: [
        { status: "closed", financial_status: "paid", total_price: "300000", created_on: "2026-05-01T10:00:00Z", payment_gateway: "COD", line_items: [] },
        { status: "closed", financial_status: "paid", total_price: "200000", created_on: "2026-05-02T10:00:00Z", payment_gateway: "COD", line_items: [] },
      ],
      truncated: false,
    });

    const { handlers } = registerTools();
    const result = await handlers.revenue_summary({
      date_from: "2026-05-01",
      date_to: "2026-05-26",
      include_daily_breakdown: true,
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    const breakdown = body.daily_breakdown as Record<string, unknown>[];
    expect(breakdown).toHaveLength(2);
    expect(breakdown[0]).toMatchObject({ date: "2026-05-01", revenue: 300000, order_count: 1 });
    expect(breakdown[1]).toMatchObject({ date: "2026-05-02", revenue: 200000, order_count: 1 });
  });

  it("rejects date range exceeding 90 days", async () => {
    const { handlers } = registerTools();
    const result = await handlers.revenue_summary({
      date_from: "2026-01-01",
      date_to: "2026-05-01",
    });

    expect(result.content[0].text).toContain("cannot exceed 90 days");
    expect(serviceMocks.fetchOrders).not.toHaveBeenCalled();
  });

  it("rejects missing date_from at schema level (required field)", async () => {
    const { schemas } = registerTools();
    expect(() => schemas["revenue_summary"].date_from.parse(undefined)).toThrow();
  });
});

// ── Story 6.4: Top Products by Revenue ────────────────────────────────────

describe("top_products_by_revenue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ranked list using line item names, only paid orders, no catalog fetch", async () => {
    serviceMocks.fetchOrders.mockResolvedValue({
      orders: [
        {
          status: "closed",
          financial_status: "paid",
          total_price: "500000",
          created_on: "2026-05-01T10:00:00Z",
          payment_gateway: "COD",
          line_items: [
            { id: 1, product_id: 1, variant_id: 10, price: "100000", quantity: 3, name: "Áo M", sku: "A-M" },
            { id: 2, product_id: 2, variant_id: 20, price: "200000", quantity: 1, name: "Quần L", sku: "Q-L" },
          ],
        },
      ],
      truncated: false,
    });

    const { handlers } = registerTools();
    const result = await handlers.top_products_by_revenue({
      date_from: "2026-05-01",
      date_to: "2026-05-26",
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    const items = body.items as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      rank: 1,
      product_name: "Áo M",
      total_revenue: 300000,
      total_units_sold: 3,
    });
    expect(items[1]).toMatchObject({
      rank: 2,
      product_name: "Quần L",
      total_revenue: 200000,
      total_units_sold: 1,
    });
    expect((body.metadata as Record<string, unknown>).is_complete).toBe(true);
  });

  it("passes financial_status: paid to fetchOrders", async () => {
    serviceMocks.fetchOrders.mockResolvedValue({ orders: [], truncated: false });

    const { handlers } = registerTools();
    await handlers.top_products_by_revenue({ date_from: "2026-05-01", date_to: "2026-05-26" });

    expect(serviceMocks.fetchOrders).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ financial_status: "paid" }),
    );
  });

  it("rejects date range exceeding 30 days", async () => {
    const { handlers } = registerTools();
    const result = await handlers.top_products_by_revenue({
      date_from: "2026-05-01",
      date_to: "2026-07-01",
    });

    expect(result.content[0].text).toBe(
      "Error: Top products report is limited to 30 days maximum to ensure accuracy",
    );
    expect(serviceMocks.fetchOrders).not.toHaveBeenCalled();
  });

  it("marks is_complete: false and includes note when orders exceed 500 cap", async () => {
    const manyOrders = Array.from({ length: 501 }, (_, i) => ({
      status: "closed",
      financial_status: "paid",
      total_price: "100000",
      created_on: "2026-05-01T10:00:00Z",
      payment_gateway: "COD",
      line_items: [{ id: i, product_id: 1, variant_id: 1, price: "100000", quantity: 1, name: "P", sku: "S" }],
    }));
    serviceMocks.fetchOrders.mockResolvedValue({ orders: manyOrders, truncated: false });

    const { handlers } = registerTools();
    const result = await handlers.top_products_by_revenue({
      date_from: "2026-05-01",
      date_to: "2026-05-26",
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;
    const metadata = body.metadata as Record<string, unknown>;

    expect(metadata.is_complete).toBe(false);
    expect(metadata.note as string).toContain("500 orders");
  });

  it("marks is_complete: false when fetchOrders is truncated even if under 500 orders", async () => {
    serviceMocks.fetchOrders.mockResolvedValue({
      orders: [
        { status: "closed", financial_status: "paid", total_price: "100000", created_on: "2026-05-01T10:00:00Z", payment_gateway: "COD", line_items: [{ id: 1, product_id: 1, variant_id: 1, price: "100000", quantity: 1, name: "P", sku: "S" }] },
      ],
      truncated: true,
    });

    const { handlers } = registerTools();
    const result = await handlers.top_products_by_revenue({
      date_from: "2026-05-01",
      date_to: "2026-05-26",
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;
    const metadata = body.metadata as Record<string, unknown>;

    expect(metadata.is_complete).toBe(false);
  });

  it("rejects missing date_from at schema level (required field)", async () => {
    const { schemas } = registerTools();
    expect(() => schemas["top_products_by_revenue"].date_from.parse(undefined)).toThrow();
  });

  it("rejects inverted date range (date_from > date_to)", async () => {
    const { handlers } = registerTools();
    const result = await handlers.top_products_by_revenue({
      date_from: "2026-05-10",
      date_to: "2026-05-01",
    });
    expect(result.content[0].text).toBe("Error: date_from must be before or equal to date_to");
    expect(serviceMocks.fetchOrders).not.toHaveBeenCalled();
  });
});

// ── D-6-1: Date validation & D-6-2: Currency note ─────────────────────────

describe("revenue_summary — date validation & currency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMocks.client.get.mockResolvedValue({ data: { count: 0 } });
  });

  it("rejects inverted date range (date_from > date_to)", async () => {
    const { handlers } = registerTools();
    const result = await handlers.revenue_summary({
      date_from: "2026-05-10",
      date_to: "2026-05-01",
    });
    expect(result.content[0].text).toBe("Error: date_from must be before or equal to date_to");
    expect(serviceMocks.fetchOrders).not.toHaveBeenCalled();
  });

  it("returns currency_note when no orders exist in range", async () => {
    serviceMocks.fetchOrders.mockResolvedValue({ orders: [], truncated: false });

    const { handlers } = registerTools();
    const result = await handlers.revenue_summary({
      date_from: "2026-05-01",
      date_to: "2026-05-10",
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(body.currency).toBe("VND");
    expect(body.currency_note).toContain("no orders in range");
  });
});
