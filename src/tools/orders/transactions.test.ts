import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { SapoNotFoundError } from "../../utils/sapo-error.js";
import { registerTransactionTools } from "./transactions.js";

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
  registerTransactionTools(server, TEST_CONFIG);
  return handlers;
}

const mockTransaction = {
  id: 4001,
  kind: "sale" as const,
  status: "success",
  amount: "250000",
  currency: "VND",
  gateway: "COD",
  created_at: "2026-05-20T09:05:00Z",
  error_code: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("list_transactions", () => {
  it("returns transaction list for a valid order", async () => {
    mocks.client.get.mockResolvedValue({ data: { transactions: [mockTransaction] } });
    const handlers = registerTools();
    const result = await handlers.list_transactions({ order_id: 1001 });
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toMatchObject({
      transaction_id: 4001,
      kind: "sale",
      status: "success",
      amount: "250000",
      currency: "VND",
      gateway: "COD",
      error_code: null,
    });
    expect(data[0].created_at).toBeDefined();
  });

  it("returns empty array for COD unpaid order with no transactions", async () => {
    mocks.client.get.mockResolvedValue({ data: { transactions: [] } });
    const handlers = registerTools();
    const result = await handlers.list_transactions({ order_id: 1001 });
    const data = JSON.parse(result.content[0].text);
    expect(data).toEqual([]);
  });

  it("returns Order not found for non-existent order", async () => {
    mocks.client.get.mockRejectedValue(new SapoNotFoundError());
    const handlers = registerTools();
    const result = await handlers.list_transactions({ order_id: 9999 });
    expect(result.content[0].text).toBe("Error: Order not found");
  });

  it("includes error_code when transaction failed", async () => {
    const failedTxn = { ...mockTransaction, kind: "capture" as const, status: "failure", error_code: "card_declined" };
    mocks.client.get.mockResolvedValue({ data: { transactions: [failedTxn] } });
    const handlers = registerTools();
    const result = await handlers.list_transactions({ order_id: 1001 });
    const data = JSON.parse(result.content[0].text);
    expect(data[0].error_code).toBe("card_declined");
    expect(data[0].status).toBe("failure");
  });
});
