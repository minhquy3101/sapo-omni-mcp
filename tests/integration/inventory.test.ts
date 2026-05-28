import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../src/config/index.js";
import { registerInventoryTools } from "../../src/tools/inventory/index.js";

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
  registerInventoryTools(server, TEST_CONFIG);
  return handlers;
}

describe("Inventory integration — list_inventory_levels", () => {
  it("returns inventory levels array when filtered by location_id", async () => {
    const handlers = registerTools();
    const result = await handlers.list_inventory_levels({ location_id: 7001 });
    const data = JSON.parse(result.content[0].text);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toMatchObject({
      sku: expect.any(String),
      location_name: "Kho chinh",
      available: expect.any(Number),
    });
  });
});
