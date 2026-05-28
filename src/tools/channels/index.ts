import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";

// SAPO Admin API does not expose a Channel or Sales Channel endpoint.
// Multi-channel (Shopee/Lazada/TikTok Shop) is a dashboard UI feature only — not accessible via Private App API.
// Verified 2026-05-27. This file is intentionally empty and kept as a marker only.
export function registerChannelTools(_server: McpServer, _config: Config) {
  // no-op: no SAPO Channel API exists
}
