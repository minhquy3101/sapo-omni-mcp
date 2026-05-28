import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { SapoNotFoundError } from "../../utils/sapo-error.js";
import { registerCarrierTools } from "./index.js";

type ToolResult = { content: [{ type: "text"; text: string }] };
type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

const mocks = vi.hoisted(() => {
  const client = { get: vi.fn() };
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
  registerCarrierTools(server, TEST_CONFIG);
  return handlers;
}

const mockCarrierService = {
  id: 1,
  name: "ViettelPost",
  active: true,
  service_discovery: false,
  carrier_service_type: "api",
  callback_url: "https://api.viettelpost.com.vn/sapo/callback",
  format: "json",
};

describe("list_carrier_services", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns list of carrier services with required fields", async () => {
    mocks.client.get.mockResolvedValue({ data: { carrier_services: [mockCarrierService] } });

    const handlers = registerTools();
    const result = await handlers.list_carrier_services({});
    const data = JSON.parse(result.content[0].text) as Record<string, unknown>[];

    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      id: 1,
      name: "ViettelPost",
      active: true,
      service_discovery: false,
      carrier_service_type: "api",
      callback_url: "https://api.viettelpost.com.vn/sapo/callback",
    });
  });

  it("returns empty array when no carrier services are configured", async () => {
    mocks.client.get.mockResolvedValue({ data: { carrier_services: [] } });

    const handlers = registerTools();
    const result = await handlers.list_carrier_services({});
    const data = JSON.parse(result.content[0].text);

    expect(data).toEqual([]);
  });
});

describe("get_carrier_service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns full detail including format field", async () => {
    mocks.client.get.mockResolvedValue({ data: { carrier_service: mockCarrierService } });

    const handlers = registerTools();
    const result = await handlers.get_carrier_service({ carrier_service_id: 1 });
    const data = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(data.id).toBe(1);
    expect(data.name).toBe("ViettelPost");
    expect(data.format).toBe("json");
  });

  it("returns 'Carrier service not found' on SAPO 404", async () => {
    mocks.client.get.mockRejectedValue(new SapoNotFoundError("Not Found"));

    const handlers = registerTools();
    const result = await handlers.get_carrier_service({ carrier_service_id: 9999 });

    expect(result.content[0].text).toBe("Error: Carrier service not found");
  });
});
