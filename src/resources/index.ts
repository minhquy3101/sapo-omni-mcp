import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config/index.js";
import { createSapoClient } from "../utils/sapo-client.js";

export function registerResources(server: McpServer, config: Config) {
  const client = createSapoClient(config);

  server.resource(
    "store-info",
    "sapo://store/info",
    async (_uri) => {
      const { data } = await client.get("/store.json");
      return {
        contents: [{ uri: "sapo://store/info", mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
      };
    }
  );
}
