import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { SapoNotFoundError, SapoValidationError } from "../../utils/sapo-error.js";
import { registerInventoryTools } from "./index.js";

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
    tool: vi.fn((_name: string, _desc: string, _schema: unknown, callback: ToolHandler) => {
      handlers[_name] = callback;
    }),
  } as unknown as McpServer;
  registerInventoryTools(server, TEST_CONFIG);
  return { handlers };
}

const mockLocations = [{ id: 1, name: "Kho Hà Nội" }];
const mockInventoryLevel = { inventory_item_id: 100, location_id: 1, available: 10 };
const mockInventoryItem = { id: 100, sku: "VDEN-M", cost: "50000", tracked: true };
const mockProduct = {
  id: 1,
  name: "Áo thun đen",
  status: "active" as const,
  variants: [{ id: 10, sku: "VDEN-M", price: "100000", inventory_item_id: 100, weight: 0.5, inventory_quantity: 10 }],
  images: [],
};

describe("list_inventory_levels", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires at least one filter", async () => {
    const { handlers } = registerTools();
    const result = await handlers.list_inventory_levels({});
    expect(result.content[0].text).toContain("Error:");
    expect(result.content[0].text).toContain("required");
  });

  it("returns levels with SKU and product name when filtering by product_id", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/locations")) return Promise.resolve({ data: { locations: mockLocations } });
      if (url.includes("/products/")) return Promise.resolve({ data: { product: mockProduct } });
      return Promise.resolve({ data: { inventory_levels: [mockInventoryLevel] } });
    });

    const { handlers } = registerTools();
    const result = await handlers.list_inventory_levels({ product_id: 1 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>[];

    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      sku: "VDEN-M",
      product_name: "Áo thun đen",
      location_name: "Kho Hà Nội",
      available: 10,
    });
  });

  it("returns empty array for empty result", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/locations")) return Promise.resolve({ data: { locations: mockLocations } });
      return Promise.resolve({ data: { inventory_levels: [] } });
    });

    const { handlers } = registerTools();
    const result = await handlers.list_inventory_levels({ location_id: 1 });
    expect(JSON.parse(result.content[0].text)).toEqual([]);
  });
});

describe("get_inventory_item", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns sku, cost, and tracked", async () => {
    mocks.client.get.mockResolvedValue({ data: { inventory_item: mockInventoryItem } });

    const { handlers } = registerTools();
    const result = await handlers.get_inventory_item({ inventory_item_id: 100 });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body).toEqual({ sku: "VDEN-M", cost: "50000", tracked: true });
  });

  it("returns 'Inventory item not found' for 404", async () => {
    mocks.client.get.mockRejectedValue(new SapoNotFoundError("Not Found"));

    const { handlers } = registerTools();
    const result = await handlers.get_inventory_item({ inventory_item_id: 9999 });

    expect(result.content[0].text).toBe("Error: Inventory item not found");
  });
});

describe("adjust_inventory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns before/after quantities on success", async () => {
    mocks.client.get.mockResolvedValue({ data: { inventory_levels: [mockInventoryLevel] } });
    mocks.client.post.mockResolvedValue({ data: {} });

    const { handlers } = registerTools();
    const result = await handlers.adjust_inventory({
      inventory_item_id: 100,
      location_id: 1,
      adjustment: 5,
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.current_quantity).toBe(10);
    expect(body.resulting_quantity).toBe(15);
    expect(mocks.client.post).toHaveBeenCalledWith(
      "/inventory_levels/adjust.json",
      expect.objectContaining({ available_adjustment: 5 }),
    );
  });

  it("blocks adjustment that would result in negative stock", async () => {
    mocks.client.get.mockResolvedValue({ data: { inventory_levels: [{ ...mockInventoryLevel, available: 2 }] } });

    const { handlers } = registerTools();
    const result = await handlers.adjust_inventory({
      inventory_item_id: 100,
      location_id: 1,
      adjustment: -3,
    });

    expect(result.content[0].text).toBe(
      "Error: Adjustment would result in negative stock (current: 2, adjustment: -3)",
    );
    expect(mocks.client.post).not.toHaveBeenCalled();
  });
});

describe("set_inventory_level", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns dry-run preview by default", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/inventory_items/")) {
        return Promise.resolve({ data: { inventory_item: mockInventoryItem } });
      }
      if (url.includes("/locations")) {
        return Promise.resolve({ data: { locations: mockLocations } });
      }
      return Promise.resolve({ data: { inventory_levels: [mockInventoryLevel] } });
    });

    const { handlers } = registerTools();
    const result = await handlers.set_inventory_level({
      inventory_item_id: 100,
      location_id: 1,
      available: 20,
      dry_run: true,
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.dry_run).toBe(true);
    expect((body.would_affect as Record<string, unknown>).new_quantity).toBe(20);
    expect(mocks.client.post).not.toHaveBeenCalled();
  });

  it("executes set when dry_run is false", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/inventory_items/")) {
        return Promise.resolve({ data: { inventory_item: mockInventoryItem } });
      }
      if (url.includes("/locations")) {
        return Promise.resolve({ data: { locations: mockLocations } });
      }
      return Promise.resolve({ data: { inventory_levels: [mockInventoryLevel] } });
    });
    mocks.client.post.mockResolvedValue({
      data: { inventory_level: { inventory_item_id: 100, location_id: 1, available: 20 } },
    });

    const { handlers } = registerTools();
    const result = await handlers.set_inventory_level({
      inventory_item_id: 100,
      location_id: 1,
      available: 20,
      dry_run: false,
    });
    const body = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(body.available).toBe(20);
    expect(mocks.client.post).toHaveBeenCalledWith(
      "/inventory_levels/set.json",
      expect.objectContaining({ available: 20 }),
    );
  });

  it("returns connection error for 422", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/inventory_items/")) {
        return Promise.resolve({ data: { inventory_item: mockInventoryItem } });
      }
      if (url.includes("/locations")) {
        return Promise.resolve({ data: { locations: mockLocations } });
      }
      return Promise.resolve({ data: { inventory_levels: [] } });
    });
    mocks.client.post.mockRejectedValue(new SapoValidationError("Unprocessable Entity"));

    const { handlers } = registerTools();
    const result = await handlers.set_inventory_level({
      inventory_item_id: 100,
      location_id: 1,
      available: 5,
      dry_run: false,
    });

    expect(result.content[0].text).toBe(
      "Error: Inventory item must be connected to this location first. Use connect_inventory_item.",
    );
  });
});

describe("set_inventory_levels_multi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns dry-run preview listing all records", async () => {
    mocks.client.get.mockImplementation((url: string) => {
      if (url.includes("/inventory_items")) {
        return Promise.resolve({ data: { inventory_items: [mockInventoryItem] } });
      }
      if (url.includes("/locations")) {
        return Promise.resolve({ data: { locations: mockLocations } });
      }
      return Promise.resolve({ data: { inventory_levels: [mockInventoryLevel] } });
    });

    const { handlers } = registerTools();
    const result = await handlers.set_inventory_levels_multi({
      records: [{ inventory_item_id: 100, location_id: 1, available: 25 }],
      dry_run: true,
    });
    const body = JSON.parse(result.content[0].text) as {
      dry_run: boolean;
      records: { sku: string; new_quantity: number }[];
    };

    expect(body.dry_run).toBe(true);
    expect(body.records).toHaveLength(1);
    expect(body.records[0].sku).toBe("VDEN-M");
    expect(body.records[0].new_quantity).toBe(25);
    expect(mocks.client.post).not.toHaveBeenCalled();
  });
});
