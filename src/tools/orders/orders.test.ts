import { z } from "zod";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { SapoNotFoundError } from "../../utils/sapo-error.js";
import { registerOrderTools } from "./index.js";

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

  registerOrderTools(server, TEST_CONFIG);
  return { handlers, schemas };
}

const mockOrder = {
  id: 1001,
  order_number: "1001",
  status: "open",
  financial_status: "paid",
  fulfillment_status: null,
  total_price: "250000",
  note: null,
  email: "customer@example.com",
  payment_gateway: "COD",
  shipping_address: {
    first_name: "Nguyen",
    last_name: "Van A",
    name: "Nguyen Van A",
    address1: "123 Le Loi",
    address2: null,
    city: "Ho Chi Minh",
    province: "Ho Chi Minh",
    country: "Vietnam",
    zip: "700000",
    phone: "0901234567",
  },
  billing_address: null,
  fulfillments: [
    {
      id: 901,
      status: "success",
      tracking_number: "VN123",
      tracking_company: "ViettelPost",
      created_at: "2026-05-20T09:00:00Z",
    },
  ],
  customer: {
    id: 1,
    first_name: "Nguyen",
    last_name: "Van A",
    email: "customer@example.com",
    phone: null,
  },
  line_items: [
    {
      id: 201,
      product_id: 1,
      variant_id: 10,
      name: "Áo thun đen - M",
      sku: "VDEN-M",
      quantity: 2,
      price: "125000",
    },
  ],
  created_on: "2026-05-20T08:00:00Z",
};

// ── Story 3.1: Read operations ─────────────────────────────────────────────

describe("list_orders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated order list with normalizePage shape", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/count")) return Promise.resolve({ data: { count: 1 } });
      return Promise.resolve({ data: { orders: [mockOrder] } });
    });

    const { handlers } = registerTools();
    const result = await handlers.list_orders({ page: 1, limit: 20 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.page).toBe(1);
    expect(body.total).toBe(1);
    const items = body.items as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 1001,
      order_number: "1001",
      status: "open",
      customer_name: "Nguyen Van A",
      total_price: "250000",
      line_item_count: 1,
    });
  });

  it("rejects non-ISO-8601 date with Zod validation error", () => {
    const { schemas } = registerTools();
    const dateField = schemas["list_orders"].created_on_min;
    expect(() => dateField.parse("20-05-2026")).toThrow();
    expect(() => dateField.parse("2026-05-20")).toThrow();
    expect(dateField.parse("2026-05-20T00:00:00Z")).toBe("2026-05-20T00:00:00Z");
  });

  it("returns empty list when no orders exist", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/count")) return Promise.resolve({ data: { count: 0 } });
      return Promise.resolve({ data: { orders: [] } });
    });

    const { handlers } = registerTools();
    const result = await handlers.list_orders({ page: 1, limit: 20 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("returns error when created_on_min is after created_on_max", async () => {
    const { handlers } = registerTools();
    const result = await handlers.list_orders({
      page: 1,
      limit: 20,
      created_on_min: "2026-05-10T00:00:00Z",
      created_on_max: "2026-05-01T00:00:00Z",
    });

    expect(result.content[0].text).toContain("Error:");
    expect(result.content[0].text).toContain("created_on_min");
    expect(mocks.client.get).not.toHaveBeenCalled();
  });
});

describe("count_orders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a single integer count", async () => {
    mocks.client.get.mockResolvedValue({ data: { count: 42 } });

    const { handlers } = registerTools();
    const result = await handlers.count_orders({ financial_status: "pending" });
    const body = JSON.parse(result.content[0].text) as { count: number };

    expect(body.count).toBe(42);
    expect(mocks.client.get).toHaveBeenCalledWith(
      "/orders/count.json",
      expect.objectContaining({ params: expect.objectContaining({ financial_status: "pending" }) }),
    );
  });
});

describe("get_order", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns full order detail including shipping_address, payment_gateway, and fulfillments", async () => {
    mocks.client.get.mockResolvedValue({ data: { order: mockOrder } });

    const { handlers } = registerTools();
    const result = await handlers.get_order({ order_id: 1001 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.id).toBe(1001);
    expect(body.order_number).toBe("1001");
    expect(body.payment_gateway).toBe("COD");
    const shipping = body.shipping_address as Record<string, unknown>;
    expect(shipping.city).toBe("Ho Chi Minh");
    expect(shipping.phone).toBe("0901234567");
    expect(body.billing_address).toBeNull();
    const fulfillments = body.fulfillments as Record<string, unknown>[];
    expect(fulfillments).toHaveLength(1);
    expect(fulfillments[0]).toMatchObject({
      fulfillment_id: 901,
      tracking_number: "VN123",
      tracking_company: "ViettelPost",
    });
    const lineItems = body.line_items as Record<string, unknown>[];
    expect(lineItems[0]).toMatchObject({ sku: "VDEN-M", quantity: 2 });
  });

  it("returns fulfillments: [] when order has no fulfillments", async () => {
    const orderNoFulfillments = { ...mockOrder, fulfillments: undefined, fulfillment_status: null };
    mocks.client.get.mockResolvedValue({ data: { order: orderNoFulfillments } });

    const { handlers } = registerTools();
    const result = await handlers.get_order({ order_id: 1001 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.fulfillments).toEqual([]);
  });

  it("returns 'Order not found' for SAPO 404", async () => {
    mocks.client.get.mockRejectedValue(new SapoNotFoundError("Not Found"));

    const { handlers } = registerTools();
    const result = await handlers.get_order({ order_id: 9999 });

    expect(result.content[0].text).toBe("Error: Order not found");
  });
});

// ── Story 3.2: Create & Update ─────────────────────────────────────────────

describe("create_order", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an order and returns id, order_number, total_price", async () => {
    mocks.client.post.mockResolvedValue({ data: { order: mockOrder } });

    const { handlers } = registerTools();
    const result = await handlers.create_order({
      line_items: [{ variant_id: 10, quantity: 2 }],
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.id).toBe(1001);
    expect(body.order_number).toBe("1001");
    expect(body.total_price).toBe("250000");
  });

  it("rejects empty line_items with Zod validation", () => {
    const { schemas } = registerTools();
    const lineItemsField = schemas["create_order"].line_items;
    expect(() => lineItemsField.parse([])).toThrow();
    expect(lineItemsField.parse([{ variant_id: 1, quantity: 1 }])).toBeDefined();
  });
});

describe("update_order", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates note and returns updated order", async () => {
    const updatedOrder = { ...mockOrder, note: "Ring doorbell twice", email: mockOrder.email };
    mocks.client.put.mockResolvedValue({ data: { order: updatedOrder } });

    const { handlers } = registerTools();
    const result = await handlers.update_order({ order_id: 1001, note: "Ring doorbell twice" });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.note).toBe("Ring doorbell twice");
    expect(body.id).toBe(1001);
  });

  it("returns 'Order not found' for SAPO 404", async () => {
    mocks.client.put.mockRejectedValue(new SapoNotFoundError("Not Found"));

    const { handlers } = registerTools();
    const result = await handlers.update_order({ order_id: 9999, note: "test" });

    expect(result.content[0].text).toBe("Error: Order not found");
  });

  it("returns error when no fields are provided", async () => {
    const { handlers } = registerTools();
    const result = await handlers.update_order({ order_id: 1001 });

    expect(result.content[0].text).toContain("Error:");
    expect(mocks.client.put).not.toHaveBeenCalled();
  });

  it("rejects financial fields with explicit error and makes no API call", async () => {
    const { handlers } = registerTools();
    const result = await handlers.update_order({ order_id: 1001, total_price: "999999" });

    expect(result.content[0].text).toContain("Financial fields cannot be updated");
    expect(mocks.client.put).not.toHaveBeenCalled();
  });

  it("rejects line_items with explicit error and makes no API call", async () => {
    const { handlers } = registerTools();
    const result = await handlers.update_order({
      order_id: 1001,
      line_items: [{ variant_id: 1, quantity: 5 }],
    });

    expect(result.content[0].text).toContain("Financial fields cannot be updated");
    expect(mocks.client.put).not.toHaveBeenCalled();
  });
});

// ── Story 3.3: Archive, Unarchive & Fulfill ────────────────────────────────

describe("archive_order", () => {
  beforeEach(() => vi.clearAllMocks());

  it("archives an open order and returns status: closed", async () => {
    mocks.client.get.mockResolvedValue({ data: { order: mockOrder } });
    mocks.client.post.mockResolvedValue({ data: { order: { ...mockOrder, status: "closed" } } });

    const { handlers } = registerTools();
    const result = await handlers.archive_order({ order_id: 1001 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.status).toBe("closed");
  });

  it("returns already_in_state when order is already closed", async () => {
    mocks.client.get.mockResolvedValue({ data: { order: { ...mockOrder, status: "closed" } } });

    const { handlers } = registerTools();
    const result = await handlers.archive_order({ order_id: 1001 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.already_in_state).toBe(true);
    expect(mocks.client.post).not.toHaveBeenCalled();
  });
});

describe("unarchive_order", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reopens a closed order and returns status: open", async () => {
    mocks.client.get.mockResolvedValue({ data: { order: { ...mockOrder, status: "closed" } } });
    mocks.client.post.mockResolvedValue({ data: { order: { ...mockOrder, status: "open" } } });

    const { handlers } = registerTools();
    const result = await handlers.unarchive_order({ order_id: 1001 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.status).toBe("open");
  });

  it("returns already_in_state when order is already open", async () => {
    mocks.client.get.mockResolvedValue({ data: { order: mockOrder } });

    const { handlers } = registerTools();
    const result = await handlers.unarchive_order({ order_id: 1001 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.already_in_state).toBe(true);
    expect(mocks.client.post).not.toHaveBeenCalled();
  });
});

describe("fulfill_order", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates fulfillment and returns fulfillment_id and updated status", async () => {
    const fulfilledOrder = { ...mockOrder, fulfillment_status: "fulfilled" };
    mocks.client.get
      .mockResolvedValueOnce({ data: { order: mockOrder } })
      .mockResolvedValueOnce({ data: { order: fulfilledOrder } });
    mocks.client.post.mockResolvedValue({ data: { fulfillment: { id: 501, status: "success" } } });

    const { handlers } = registerTools();
    const result = await handlers.fulfill_order({
      order_id: 1001,
      tracking_number: "VN123456789",
      tracking_company: "ViettelPost",
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.fulfillment_id).toBe(501);
    expect(body.fulfillment_status).toBe("fulfilled");
  });

  it("returns error when order is already fulfilled", async () => {
    mocks.client.get.mockResolvedValue({
      data: { order: { ...mockOrder, fulfillment_status: "shipped" } },
    });

    const { handlers } = registerTools();
    const result = await handlers.fulfill_order({ order_id: 1001 });

    expect(result.content[0].text).toBe("Error: Order is already fulfilled");
    expect(mocks.client.post).not.toHaveBeenCalled();
  });
});

// ── Story 3.4: Cancel & Delete ─────────────────────────────────────────────

describe("cancel_order", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns dry_run preview with all 3 side effects when dry_run: true", async () => {
    mocks.client.get.mockResolvedValue({ data: { order: mockOrder } });

    const { handlers } = registerTools();
    const result = await handlers.cancel_order({ order_id: 1001, dry_run: true });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.dry_run).toBe(true);
    expect(mocks.client.post).not.toHaveBeenCalled();
    const effects = (body.would_affect as Record<string, unknown>).side_effects as string[];
    expect(effects).toHaveLength(3);
    expect(effects[0]).toContain("cancellation email");
    expect(effects[1].toLowerCase()).toContain("restock");
    expect(effects[2].toLowerCase()).toContain("refund");
    expect(effects[2]).toContain("COD");
  });

  it("executes cancellation when dry_run: false", async () => {
    const cancelledOrder = { ...mockOrder, status: "cancelled" };
    mocks.client.get.mockResolvedValue({ data: { order: mockOrder } });
    mocks.client.post.mockResolvedValue({ data: { order: cancelledOrder } });

    const { handlers } = registerTools();
    const result = await handlers.cancel_order({ order_id: 1001, dry_run: false });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.status).toBe("cancelled");
    expect(mocks.client.post).toHaveBeenCalledWith(
      `/orders/1001/cancel.json`,
      {},
    );
  });

  it("returns error when order is already cancelled", async () => {
    mocks.client.get.mockResolvedValue({ data: { order: { ...mockOrder, status: "cancelled" } } });

    const { handlers } = registerTools();
    const result = await handlers.cancel_order({ order_id: 1001, dry_run: false });

    expect(result.content[0].text).toBe("Error: Order is already cancelled");
    expect(mocks.client.post).not.toHaveBeenCalled();
  });
});

describe("delete_order", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns dry_run preview with permanent warning when dry_run: true", async () => {
    mocks.client.get.mockResolvedValue({ data: { order: mockOrder } });

    const { handlers } = registerTools();
    const result = await handlers.delete_order({ order_id: 1001, dry_run: true });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.dry_run).toBe(true);
    expect(mocks.client.delete).not.toHaveBeenCalled();
    const affect = body.would_affect as Record<string, unknown>;
    expect(affect.order_number).toBe("1001");
    expect(affect.warning).toContain("permanent");
  });

  it("executes deletion when dry_run: false", async () => {
    mocks.client.get.mockResolvedValue({ data: { order: mockOrder } });
    mocks.client.delete.mockResolvedValue({});

    const { handlers } = registerTools();
    const result = await handlers.delete_order({ order_id: 1001, dry_run: false });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.deleted).toBe(true);
    expect(body.order_id).toBe(1001);
    expect(mocks.client.delete).toHaveBeenCalledWith("/orders/1001.json");
  });
});
