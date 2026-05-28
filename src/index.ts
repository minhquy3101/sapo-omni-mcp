import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { registerChannelTools } from "./tools/channels/index.js";
import { registerCarrierTools } from "./tools/carriers/index.js";
import { registerPromotionTools } from "./tools/promotions/index.js";
import { registerReportTools } from "./tools/reports/index.js";
import { loadConfig } from "./config/index.js";
import { registerPrompts } from "./prompts/index.js";
import { registerResources } from "./resources/index.js";
import { registerCustomerTools } from "./tools/customers/index.js";
import { registerInventoryTools } from "./tools/inventory/index.js";
import { registerOrderTools } from "./tools/orders/index.js";
import { registerProductTools } from "./tools/products/index.js";
import { registerStoreTools } from "./tools/store/index.js";

const config = loadConfig();

function createMcpServer() {
  const server = new McpServer({
    name: config.serverName,
    version: "0.1.0",
  });
  registerStoreTools(server, config);
  registerCustomerTools(server, config);
  registerProductTools(server, config);
  registerInventoryTools(server, config);
  registerOrderTools(server, config);
  registerChannelTools(server, config);
  registerCarrierTools(server, config);
  registerPromotionTools(server, config);
  registerReportTools(server, config);
  registerResources(server, config);
  registerPrompts(server);
  return server;
}

const useHttp = process.env.MCP_TRANSPORT === "http";

if (useHttp) {
  const port = parseInt(process.env.MCP_PORT ?? "3456", 10);
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    if (req.url !== "/mcp") {
      res.writeHead(404).end();
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      await sessions.get(sessionId)!.handleRequest(req, res);
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };

    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);

    if (transport.sessionId) sessions.set(transport.sessionId, transport);
  });

  httpServer.listen(port, "127.0.0.1", () => {
    process.stderr.write(`sapo-omni MCP HTTP server running on http://127.0.0.1:${port}/mcp\n`);
  });
} else {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
