import { describe, it, expect, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../src/config/index.js";
import { registerProductTools } from "../../src/tools/products/index.js";

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
  registerProductTools(server, TEST_CONFIG);
  return handlers;
}

describe("Products integration — list_products", () => {
  it("returns paginated products from msw fixture", async () => {
    const handlers = registerTools();
    const result = await handlers.list_products({ page: 1, limit: 20 });
    const data = JSON.parse(result.content[0].text);
    expect(data.items).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBe(2);
    expect(data.items[0]).toMatchObject({
      id: 101,
      name: "Ao thun nam",
      status: "active",
    });
    expect(data).toMatchObject({ page: 1, limit: 20, total: 2 });
  });
});
