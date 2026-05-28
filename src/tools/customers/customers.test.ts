import { z } from "zod";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { SapoNotFoundError, SapoValidationError } from "../../utils/sapo-error.js";
import { registerCustomerTools } from "./index.js";

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

  registerCustomerTools(server, TEST_CONFIG);
  return { handlers, schemas };
}

const mockAddress = {
  id: 10,
  address1: "123 Le Loi",
  address2: null,
  city: "Ho Chi Minh",
  province: "Ho Chi Minh",
  country: "Vietnam",
  zip: "700000",
  phone: null,
  name: "Nguyen Van A",
  default: true,
};

const mockCustomer = {
  id: 501,
  first_name: "Nguyen",
  last_name: "Van A",
  email: "nguyenvana@example.com",
  phone: "0901234567",
  orders_count: 3,
  total_spent: "750000",
  addresses: [mockAddress],
  default_address: mockAddress,
};

// ── Story 4.1: Read operations ─────────────────────────────────────────────

describe("list_customers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated customer list with normalizePage shape", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/count")) return Promise.resolve({ data: { count: 1 } });
      return Promise.resolve({ data: { customers: [mockCustomer] } });
    });

    const { handlers } = registerTools();
    const result = await handlers.list_customers({ page: 1, limit: 20 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.page).toBe(1);
    expect(body.total).toBe(1);
    const items = body.items as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 501,
      name: "Nguyen Van A",
      email: "nguyenvana@example.com",
      orders_count: 3,
      total_spent: "750000",
    });
  });

  it("returns empty list when no customers exist", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/count")) return Promise.resolve({ data: { count: 0 } });
      return Promise.resolve({ data: { customers: [] } });
    });

    const { handlers } = registerTools();
    const result = await handlers.list_customers({ page: 1, limit: 20 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });
});

describe("count_customers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a single integer count", async () => {
    mocks.client.get.mockResolvedValue({ data: { count: 15 } });

    const { handlers } = registerTools();
    const result = await handlers.count_customers({ email: "example@example.com" });
    const body = JSON.parse(result.content[0].text) as { count: number };

    expect(body.count).toBe(15);
    expect(mocks.client.get).toHaveBeenCalledWith(
      "/customers/count.json",
      expect.objectContaining({ params: expect.objectContaining({ email: "example@example.com" }) }),
    );
  });
});

const mockOrderSummary = {
  id: 3001,
  order_number: "3001",
  status: "open",
  financial_status: "paid",
  fulfillment_status: null,
  total_price: "250000",
  note: null,
  email: null,
  payment_gateway: "COD",
  line_items: [{ id: 1, product_id: 1, variant_id: 1, name: "Áo", sku: "A", quantity: 1, price: "250000" }],
  created_on: "2026-05-20T08:00:00Z",
};

describe("get_customer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns full customer profile with addresses and recent_orders", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/customers/")) return Promise.resolve({ data: { customer: mockCustomer } });
      return Promise.resolve({ data: { orders: [mockOrderSummary] } });
    });

    const { handlers } = registerTools();
    const result = await handlers.get_customer({ customer_id: 501 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.id).toBe(501);
    expect(body.orders_count).toBe(3);
    expect(body.total_spent).toBe("750000");
    const addresses = body.addresses as Record<string, unknown>[];
    expect(addresses[0]).toMatchObject({ is_default: true, city: "Ho Chi Minh" });
    const recentOrders = body.recent_orders as Record<string, unknown>[];
    expect(recentOrders).toHaveLength(1);
    expect(recentOrders[0]).toMatchObject({ order_id: 3001, total_price: "250000", line_item_count: 1 });
    expect((body.metadata as Record<string, unknown>).recent_orders_capped).toBe(false);
  });

  it("returns recent_orders: [] and capped: false when customer has no orders", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/customers/")) return Promise.resolve({ data: { customer: mockCustomer } });
      return Promise.resolve({ data: { orders: [] } });
    });

    const { handlers } = registerTools();
    const result = await handlers.get_customer({ customer_id: 501 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.recent_orders).toEqual([]);
    expect((body.metadata as Record<string, unknown>).recent_orders_capped).toBe(false);
  });

  it("sets recent_orders_capped: true when exactly 10 orders returned", async () => {
    const tenOrders = Array.from({ length: 10 }, (_, i) => ({ ...mockOrderSummary, id: 3000 + i }));
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/customers/")) return Promise.resolve({ data: { customer: mockCustomer } });
      return Promise.resolve({ data: { orders: tenOrders } });
    });

    const { handlers } = registerTools();
    const result = await handlers.get_customer({ customer_id: 501 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    const recentOrders = body.recent_orders as Record<string, unknown>[];
    expect(recentOrders).toHaveLength(10);
    expect((body.metadata as Record<string, unknown>).recent_orders_capped).toBe(true);
  });

  it("returns 'Customer not found' for SAPO 404", async () => {
    mocks.client.get.mockRejectedValue(new SapoNotFoundError("Not Found"));

    const { handlers } = registerTools();
    const result = await handlers.get_customer({ customer_id: 9999 });

    expect(result.content[0].text).toBe("Error: Customer not found");
  });

  it("D-4-1: returns customer data with empty recent_orders when orders fetch fails independently", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/customers/")) return Promise.resolve({ data: { customer: mockCustomer } });
      return Promise.reject(new Error("503 Service Unavailable"));
    });

    const { handlers } = registerTools();
    const result = await handlers.get_customer({ customer_id: 501 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.id).toBe(501);
    expect(body.recent_orders).toEqual([]);
    expect((body.metadata as Record<string, unknown>).recent_orders_capped).toBe(false);
  });
});

// ── Story 4.2: Create & Update ─────────────────────────────────────────────

describe("create_customer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates customer with only first_name (name alone satisfies requirement)", async () => {
    const nameOnlyCustomer = { ...mockCustomer, email: null, last_name: null };
    mocks.client.post.mockResolvedValue({ data: { customer: nameOnlyCustomer } });

    const { handlers } = registerTools();
    const result = await handlers.create_customer({ first_name: "Linh" });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.id).toBe(501);
    expect(mocks.client.post).toHaveBeenCalledOnce();
  });

  it("returns error when no email or name is provided", async () => {
    const { handlers } = registerTools();
    const result = await handlers.create_customer({});

    expect(result.content[0].text).toBe(
      "Error: Customer must have at least one of: email, first_name, last_name",
    );
    expect(mocks.client.post).not.toHaveBeenCalled();
  });

  it("returns human-readable error with existing ID for duplicate email", async () => {
    mocks.client.post.mockRejectedValue(new SapoValidationError("email has already been taken"));
    mocks.client.get.mockResolvedValue({ data: { customers: [{ ...mockCustomer, id: 456 }] } });

    const { handlers } = registerTools();
    const result = await handlers.create_customer({ email: "nguyenvana@example.com" });

    expect(result.content[0].text).toBe(
      "Error: A customer with this email already exists (ID: 456). Consider using update_customer instead.",
    );
  });
});

describe("update_customer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates note and returns updated customer", async () => {
    mocks.client.put.mockResolvedValue({
      data: { customer: { ...mockCustomer, note: "VIP customer" } },
    });

    const { handlers } = registerTools();
    const result = await handlers.update_customer({ customer_id: 501, note: "VIP customer" });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.id).toBe(501);
    expect(mocks.client.put).toHaveBeenCalledOnce();
  });

  it("returns 'Customer not found' for SAPO 404", async () => {
    mocks.client.put.mockRejectedValue(new SapoNotFoundError("Not Found"));

    const { handlers } = registerTools();
    const result = await handlers.update_customer({ customer_id: 9999, note: "test" });

    expect(result.content[0].text).toBe("Error: Customer not found");
  });

  it("returns error when no fields are provided", async () => {
    const { handlers } = registerTools();
    const result = await handlers.update_customer({ customer_id: 501 });

    expect(result.content[0].text).toContain("Error:");
    expect(mocks.client.put).not.toHaveBeenCalled();
  });

  it("warns when new email is already used by another customer, but update succeeds", async () => {
    mocks.client.get.mockResolvedValue({
      data: { customers: [{ ...mockCustomer, id: 999 }] },
    });
    mocks.client.put.mockResolvedValue({
      data: { customer: { ...mockCustomer, email: "taken@example.com" } },
    });

    const { handlers } = registerTools();
    const result = await handlers.update_customer({
      customer_id: 501,
      email: "taken@example.com",
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(typeof body.warning).toBe("string");
    expect(body.warning as string).toContain("Warning:");
    expect(body.warning as string).toContain("taken@example.com");
    expect(body.warning as string).toContain("999");
    expect(mocks.client.put).toHaveBeenCalledOnce();
  });
});

// ── Story 4.3: Delete ──────────────────────────────────────────────────────

describe("delete_customer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns dry_run preview with customer info and permanent warning when dry_run: true", async () => {
    mocks.client.get.mockResolvedValue({ data: { customer: mockCustomer } });

    const { handlers } = registerTools();
    const result = await handlers.delete_customer({ customer_id: 501, dry_run: true });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.dry_run).toBe(true);
    expect(mocks.client.delete).not.toHaveBeenCalled();
    const affect = body.would_affect as Record<string, unknown>;
    expect(affect.customer_id).toBe(501);
    expect(affect.email).toBe("nguyenvana@example.com");
    expect(affect.orders_count).toBe(3);
    expect(affect.warning as string).toContain("permanent");
  });

  it("executes deletion when dry_run: false and customer has no orders", async () => {
    mocks.client.get.mockResolvedValue({
      data: { customer: { ...mockCustomer, orders_count: 0 } },
    });
    mocks.client.delete.mockResolvedValue({});

    const { handlers } = registerTools();
    const result = await handlers.delete_customer({ customer_id: 501, dry_run: false });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.deleted).toBe(true);
    expect(body.customer_id).toBe(501);
    expect(mocks.client.delete).toHaveBeenCalledWith("/customers/501.json");
  });

  it("returns error when customer has existing orders", async () => {
    mocks.client.get.mockResolvedValue({
      data: { customer: { ...mockCustomer, orders_count: 3 } },
    });

    const { handlers } = registerTools();
    const result = await handlers.delete_customer({ customer_id: 501, dry_run: false });

    expect(result.content[0].text).toContain("Cannot delete customer");
    expect(result.content[0].text).toContain("3");
    expect(mocks.client.delete).not.toHaveBeenCalled();
  });
});
