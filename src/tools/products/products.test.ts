import { z } from "zod";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { SapoNotFoundError } from "../../utils/sapo-error.js";
import { registerProductTools } from "./index.js";

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

  registerProductTools(server, TEST_CONFIG);
  return { server, handlers, schemas };
}

const mockProduct = {
  id: 1,
  name: "Áo thun đen",
  status: "active" as const,
  variants: [
    {
      id: 10,
      sku: "VDEN-M",
      price: "100000",
      inventory_item_id: 100,
      weight: 0.5,
      inventory_quantity: 5,
    },
  ],
  images: [{ id: 1, src: "https://cdn.sapo.vn/img.jpg", alt: null }],
};

describe("list_products", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated product list with normalizePage shape", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/count")) return Promise.resolve({ data: { count: 1 } });
      return Promise.resolve({ data: { products: [mockProduct] } });
    });

    const { handlers } = registerTools();
    const result = await handlers.list_products({ page: 1, limit: 20 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body).toEqual({
      items: [
        { id: 1, name: "Áo thun đen", status: "active", variant_count: 1, inventory_total: 5 },
      ],
      page: 1,
      limit: 20,
      total: 1,
    });
  });

  it("rejects limit=0 and limit=251 with Zod validation", () => {
    const { schemas } = registerTools();
    const limitField = schemas["list_products"].limit;
    expect(() => limitField.parse(0)).toThrow();
    expect(() => limitField.parse(251)).toThrow();
    expect(limitField.parse(1)).toBe(1);
    expect(limitField.parse(250)).toBe(250);
  });

  it("returns empty items list when no products exist", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/count")) return Promise.resolve({ data: { count: 0 } });
      return Promise.resolve({ data: { products: [] } });
    });

    const { handlers } = registerTools();
    const result = await handlers.list_products({ page: 1, limit: 20 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });
});

describe("get_product", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns full product detail with variants and images", async () => {
    mocks.client.get.mockResolvedValue({ data: { product: mockProduct } });

    const { handlers } = registerTools();
    const result = await handlers.get_product({ product_id: 1 });
    const body = JSON.parse(result.content[0].text) as {
      id: number;
      title: string;
      status: string;
      variants: { sku: string; inventory_item_id: number }[];
      images: { src: string }[];
    };

    expect(body).toMatchObject({ id: 1, name: "Áo thun đen", status: "active" });
    expect(body.variants).toHaveLength(1);
    expect(body.variants[0].sku).toBe("VDEN-M");
    expect(body.variants[0].inventory_item_id).toBe(100);
    expect(body.images).toHaveLength(1);
  });

  it("returns 'Product not found' for SAPO 404", async () => {
    mocks.client.get.mockRejectedValue(new SapoNotFoundError("Not Found"));

    const { handlers } = registerTools();
    const result = await handlers.get_product({ product_id: 9999 });

    expect(result.content[0].text).toBe("Error: Product not found");
  });
});

describe("count_products", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a single integer count", async () => {
    mocks.client.get.mockResolvedValue({ data: { count: 42 } });

    const { handlers } = registerTools();
    const result = await handlers.count_products({});
    const body = JSON.parse(result.content[0].text) as { count: number };

    expect(body.count).toBe(42);
  });

  it("passes status filter to the API", async () => {
    mocks.client.get.mockResolvedValue({ data: { count: 10 } });

    const { handlers } = registerTools();
    await handlers.count_products({ status: "active" });

    expect(mocks.client.get).toHaveBeenCalledWith(
      "/products/count.json",
      expect.objectContaining({ params: { status: "active" } }),
    );
  });
});

describe("search_products_by_sku", () => {
  beforeEach(() => vi.clearAllMocks());

  it("finds a product by exact SKU", async () => {
    mocks.client.get.mockResolvedValue({ data: { products: [mockProduct] } });

    const { handlers } = registerTools();
    const result = await handlers.search_products_by_sku({ sku: "VDEN-M" });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.product_id).toBe(1);
    expect(body.sku).toBe("VDEN-M");
    expect(body.inventory_item_id).toBe(100);
  });

  it("is case-insensitive", async () => {
    mocks.client.get.mockResolvedValue({ data: { products: [mockProduct] } });

    const { handlers } = registerTools();
    const result = await handlers.search_products_by_sku({ sku: "vden-m" });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.sku).toBe("VDEN-M");
  });

  it("returns 'No product found' when SKU does not match", async () => {
    mocks.client.get.mockResolvedValue({ data: { products: [mockProduct] } });

    const { handlers } = registerTools();
    const result = await handlers.search_products_by_sku({ sku: "NOT-EXIST" });

    expect(result.content[0].text).toBe("No product found with SKU: NOT-EXIST");
  });

  it("returns 'No product found' for empty product list", async () => {
    mocks.client.get.mockResolvedValue({ data: { products: [] } });

    const { handlers } = registerTools();
    const result = await handlers.search_products_by_sku({ sku: "ANY-SKU" });

    expect(result.content[0].text).toBe("No product found with SKU: ANY-SKU");
  });
});

// ── Write operations ──────────────────────────────────────────────────────────

const mockCreatedProduct = {
  id: 2,
  name: "Áo sơ mi trắng",
  status: "draft" as const,
  variants: [{ id: 20, sku: "ASM-M", price: "200000", inventory_item_id: 200, weight: 0.3, inventory_quantity: 0 }],
  images: [],
};

describe("create_product", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs with title/status/variants and returns id + variant skus", async () => {
    mocks.client.post.mockResolvedValue({ data: { product: mockCreatedProduct } });

    const { handlers } = registerTools();
    const result = await handlers.create_product({
      title: "Áo sơ mi trắng",
      status: "draft",
      variants: [{ sku: "ASM-M", price: "200000", weight: 0.3 }],
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.id).toBe(2);
    expect(body.title).toBe("Áo sơ mi trắng");
    expect(body.status).toBe("draft");
    expect(mocks.client.post).toHaveBeenCalledWith("/products.json", {
      product: expect.objectContaining({ title: "Áo sơ mi trắng" }),
    });
  });

  it("returns error on SAPO validation failure", async () => {
    mocks.client.post.mockRejectedValue(new Error("422 Unprocessable Entity"));

    const { handlers } = registerTools();
    const result = await handlers.create_product({
      title: "X",
      status: "draft",
      variants: [{ sku: "SKU", price: "0", weight: 0 }],
    });

    expect(result.content[0].text).toContain("Error");
  });
});

describe("update_product", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GETs current then PUTs updated fields, returns updated name and previous_name", async () => {
    const updatedProduct = { ...mockProduct, name: "Áo thun đen mới" };
    mocks.client.get.mockResolvedValue({ data: { product: mockProduct } });
    mocks.client.put.mockResolvedValue({ data: { product: updatedProduct } });

    const { handlers } = registerTools();
    const result = await handlers.update_product({ product_id: 1, title: "Áo thun đen mới" });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.name).toBe("Áo thun đen mới");
    expect(body.previous_name).toBe("Áo thun đen");
    expect(mocks.client.put).toHaveBeenCalledWith(
      "/products/1.json",
      { product: { title: "Áo thun đen mới" } },
    );
  });

  it("returns 'Product not found' on SAPO 404", async () => {
    mocks.client.get.mockRejectedValue(new SapoNotFoundError("Not Found"));

    const { handlers } = registerTools();
    const result = await handlers.update_product({ product_id: 9999, title: "X" });

    expect(result.content[0].text).toBe("Error: Product not found");
  });
});

describe("delete_product", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dry_run:true returns preview without calling DELETE", async () => {
    mocks.client.get.mockResolvedValue({ data: { product: mockProduct } });

    const { handlers } = registerTools();
    const result = await handlers.delete_product({ product_id: 1, dry_run: true });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.dry_run).toBe(true);
    expect(body.action).toContain("Delete product #1");
    expect(mocks.client.delete).not.toHaveBeenCalled();
  });

  it("dry_run:false deletes product and returns confirmed deletion", async () => {
    mocks.client.get.mockResolvedValue({ data: { product: mockProduct } });
    mocks.client.delete.mockResolvedValue({});

    const { handlers } = registerTools();
    const result = await handlers.delete_product({ product_id: 1, dry_run: false });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.deleted).toBe(true);
    expect(body.product_id).toBe(1);
    expect(mocks.client.delete).toHaveBeenCalledWith("/products/1.json");
  });

  it("returns 'Product not found' on SAPO 404", async () => {
    mocks.client.get.mockRejectedValue(new SapoNotFoundError("Not Found"));

    const { handlers } = registerTools();
    const result = await handlers.delete_product({ product_id: 9999, dry_run: true });

    expect(result.content[0].text).toBe("Error: Product not found");
  });
});
