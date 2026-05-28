import { z } from "zod";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { SapoNotFoundError, SapoValidationError } from "../../utils/sapo-error.js";
import { registerPromotionTools } from "./index.js";

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

  registerPromotionTools(server, TEST_CONFIG);
  return { handlers, schemas };
}

const mockPriceRule = {
  id: 301,
  title: "Summer Sale 15%",
  discount_type: "percentage",
  value: "-15.0",
  starts_at: "2026-06-01T00:00:00Z",
  ends_at: "2026-08-31T23:59:59Z",
  usage_limit: null,
  times_used: 5,
  prerequisite_product_ids: [],
  prerequisite_collection_ids: [],
  entitled_product_ids: [],
  entitled_collection_ids: [],
  created_at: "2026-05-27T07:00:00Z",
  updated_at: "2026-05-27T07:00:00Z",
};

const mockDiscountCode = {
  id: 601,
  price_rule_id: 301,
  code: "TET2026",
  usage_count: 2,
  created_at: "2026-05-27T07:00:00Z",
  updated_at: "2026-05-27T07:00:00Z",
};

// ── Story 5.1: Price Rule Read operations ──────────────────────────────────

describe("list_price_rules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated list with no_expiry: false for rule with end date", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/count")) return Promise.resolve({ data: { count: 1 } });
      return Promise.resolve({ data: { price_rules: [mockPriceRule] } });
    });

    const { handlers } = registerTools();
    const result = await handlers.list_price_rules({ page: 1, limit: 20 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.page).toBe(1);
    expect(body.total).toBe(1);
    const items = body.items as Record<string, unknown>[];
    expect(items[0]).toMatchObject({
      id: 301,
      title: "Summer Sale 15%",
      discount_type: "percentage",
      no_expiry: false,
      times_used: 5,
    });
  });

  it("flags no_expiry: true for rule with no end date", async () => {
    const noExpiryRule = { ...mockPriceRule, ends_at: null };
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/count")) return Promise.resolve({ data: { count: 1 } });
      return Promise.resolve({ data: { price_rules: [noExpiryRule] } });
    });

    const { handlers } = registerTools();
    const result = await handlers.list_price_rules({ page: 1, limit: 20 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;
    const items = body.items as Record<string, unknown>[];

    expect(items[0].no_expiry).toBe(true);
    expect(items[0].ends_at).toBeNull();
  });

  it("returns empty list when no price rules exist", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/count")) return Promise.resolve({ data: { count: 0 } });
      return Promise.resolve({ data: { price_rules: [] } });
    });

    const { handlers } = registerTools();
    const result = await handlers.list_price_rules({ page: 1, limit: 20 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });
});

describe("count_price_rules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a single integer count", async () => {
    mocks.client.get.mockResolvedValue({ data: { count: 7 } });

    const { handlers } = registerTools();
    const result = await handlers.count_price_rules({ status: "enabled" });
    const body = JSON.parse(result.content[0].text) as { count: number };

    expect(body.count).toBe(7);
    expect(mocks.client.get).toHaveBeenCalledWith(
      "/price_rules/count.json",
      expect.objectContaining({ params: expect.objectContaining({ status: "enabled" }) }),
    );
  });
});

describe("get_price_rule", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns full rule detail with products/collections arrays", async () => {
    mocks.client.get.mockResolvedValue({ data: { price_rule: mockPriceRule } });

    const { handlers } = registerTools();
    const result = await handlers.get_price_rule({ price_rule_id: 301 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.id).toBe(301);
    expect(body.title).toBe("Summer Sale 15%");
    expect(body.entitled_product_ids).toEqual([]);
    expect(body.created_at).toBe("2026-05-27T07:00:00Z");
  });

  it("returns 'Price rule not found' for SAPO 404", async () => {
    mocks.client.get.mockRejectedValue(new SapoNotFoundError("Not Found"));

    const { handlers } = registerTools();
    const result = await handlers.get_price_rule({ price_rule_id: 9999 });

    expect(result.content[0].text).toBe("Error: Price rule not found");
  });
});

// ── Story 5.2: Price Rule Create & Update ──────────────────────────────────

describe("create_price_rule", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates rule with end_date and returns no warning", async () => {
    mocks.client.post.mockResolvedValue({ data: { price_rule: mockPriceRule } });

    const { handlers } = registerTools();
    const result = await handlers.create_price_rule({
      title: "Summer Sale 15%",
      discount_type: "percentage",
      value: -15,
      start_date: "2026-06-01T00:00:00Z",
      end_date: "2026-08-31T23:59:59Z",
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.id).toBe(301);
    expect(body.warning).toBeUndefined();
  });

  it("creates rule without end_date and includes no-expiry warning", async () => {
    const noExpiryRule = { ...mockPriceRule, ends_at: null };
    mocks.client.post.mockResolvedValue({ data: { price_rule: noExpiryRule } });

    const { handlers } = registerTools();
    const result = await handlers.create_price_rule({
      title: "Unlimited Promo",
      discount_type: "fixed_amount",
      value: -50000,
      start_date: "2026-06-01T00:00:00Z",
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.id).toBe(301);
    expect(typeof body.warning).toBe("string");
    expect(body.warning as string).toContain("⚠️");
    expect(body.warning as string).toContain("indefinitely");
  });

  it("rejects invalid discount_type with Zod validation error", () => {
    const { schemas } = registerTools();
    const discountTypeField = schemas["create_price_rule"].discount_type;
    expect(() => discountTypeField.parse("buy_one_get_one")).toThrow();
    expect(discountTypeField.parse("percentage")).toBe("percentage");
  });
});

describe("update_price_rule", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates end_date and returns updated rule", async () => {
    const updatedRule = { ...mockPriceRule, ends_at: "2026-09-30T23:59:59Z" };
    mocks.client.put.mockResolvedValue({ data: { price_rule: updatedRule } });

    const { handlers } = registerTools();
    const result = await handlers.update_price_rule({
      price_rule_id: 301,
      end_date: "2026-09-30T23:59:59Z",
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.ends_at).toBe("2026-09-30T23:59:59Z");
    expect(mocks.client.put).toHaveBeenCalledOnce();
  });

  it("rejects when discount_type is in payload", async () => {
    const { handlers } = registerTools();
    const result = await handlers.update_price_rule({
      price_rule_id: 301,
      discount_type: "fixed_amount",
    });

    expect(result.content[0].text).toBe(
      "Error: discount_type is immutable after creation and cannot be changed",
    );
    expect(mocks.client.put).not.toHaveBeenCalled();
  });

  it("returns error when no fields are provided", async () => {
    const { handlers } = registerTools();
    const result = await handlers.update_price_rule({ price_rule_id: 301 });

    expect(result.content[0].text).toContain("Error:");
    expect(mocks.client.put).not.toHaveBeenCalled();
  });

  it("returns 'Price rule not found' for SAPO 404", async () => {
    mocks.client.put.mockRejectedValue(new SapoNotFoundError("Not Found"));

    const { handlers } = registerTools();
    const result = await handlers.update_price_rule({
      price_rule_id: 9999,
      title: "New title",
    });

    expect(result.content[0].text).toBe("Error: Price rule not found");
  });
});

// ── Story 5.3: Price Rule Delete (Cascading) ───────────────────────────────

describe("delete_price_rule", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns dry_run preview with code count when dry_run: true", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/discount_codes/count")) return Promise.resolve({ data: { count: 12 } });
      return Promise.resolve({ data: { price_rule: mockPriceRule } });
    });

    const { handlers } = registerTools();
    const result = await handlers.delete_price_rule({ price_rule_id: 301, dry_run: true });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.dry_run).toBe(true);
    expect(mocks.client.delete).not.toHaveBeenCalled();
    const affect = body.would_affect as Record<string, unknown>;
    expect(affect.price_rule_id).toBe(301);
    expect(affect.title).toBe("Summer Sale 15%");
    expect(affect.discount_codes_count).toBe(12);
    expect(affect.warning as string).toContain("12");
  });

  it("executes deletion and returns with code count when dry_run: false", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/discount_codes/count")) return Promise.resolve({ data: { count: 3 } });
      return Promise.resolve({ data: { price_rule: mockPriceRule } });
    });
    mocks.client.delete.mockResolvedValue({});

    const { handlers } = registerTools();
    const result = await handlers.delete_price_rule({ price_rule_id: 301, dry_run: false });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.deleted).toBe(true);
    expect(body.price_rule_id).toBe(301);
    expect(body.discount_codes_deleted).toBe(3);
    expect(mocks.client.delete).toHaveBeenCalledWith("/price_rules/301.json");
  });

  it("returns 'Price rule not found' for SAPO 404", async () => {
    mocks.client.get.mockRejectedValue(new SapoNotFoundError("Not Found"));

    const { handlers } = registerTools();
    const result = await handlers.delete_price_rule({ price_rule_id: 9999, dry_run: true });

    expect(result.content[0].text).toBe("Error: Price rule not found");
  });
});

// ── Story 5.4: Discount Codes CRUD ─────────────────────────────────────────

describe("list_discount_codes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns codes with usage count and created date", async () => {
    mocks.client.get.mockResolvedValue({ data: { discount_codes: [mockDiscountCode] } });

    const { handlers } = registerTools();
    const result = await handlers.list_discount_codes({ price_rule_id: 301 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>[];

    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 601,
      code: "TET2026",
      usage_count: 2,
    });
  });
});

describe("create_discount_code", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates code and returns id and code string", async () => {
    mocks.client.post.mockResolvedValue({ data: { discount_code: mockDiscountCode } });

    const { handlers } = registerTools();
    const result = await handlers.create_discount_code({ price_rule_id: 301, code: "TET2026" });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.id).toBe(601);
    expect(body.code).toBe("TET2026");
  });

  it("returns human-readable error for duplicate code", async () => {
    mocks.client.post.mockRejectedValue(new SapoValidationError("code has already been taken"));

    const { handlers } = registerTools();
    const result = await handlers.create_discount_code({ price_rule_id: 301, code: "TET2026" });

    expect(result.content[0].text).toBe(
      "Error: Discount code 'TET2026' already exists under this price rule",
    );
  });
});

describe("update_discount_code", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates code string and returns updated code", async () => {
    const updatedCode = { ...mockDiscountCode, code: "TET2026_V2" };
    mocks.client.put.mockResolvedValue({ data: { discount_code: updatedCode } });

    const { handlers } = registerTools();
    const result = await handlers.update_discount_code({
      price_rule_id: 301,
      code_id: 601,
      code: "TET2026_V2",
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.code).toBe("TET2026_V2");
    expect(body.id).toBe(601);
  });
});

describe("delete_discount_code", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes code and returns confirmation", async () => {
    mocks.client.delete.mockResolvedValue({});

    const { handlers } = registerTools();
    const result = await handlers.delete_discount_code({ price_rule_id: 301, code_id: 601 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.deleted).toBe(true);
    expect(body.code_id).toBe(601);
    expect(mocks.client.delete).toHaveBeenCalledWith(
      "/price_rules/301/discount_codes/601.json",
    );
  });

  it("returns 'Discount code not found' for SAPO 404", async () => {
    mocks.client.delete.mockRejectedValue(new SapoNotFoundError("Not Found"));

    const { handlers } = registerTools();
    const result = await handlers.delete_discount_code({ price_rule_id: 301, code_id: 9999 });

    expect(result.content[0].text).toBe("Error: Discount code not found");
  });
});
