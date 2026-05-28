import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { createSapoClient } from "../../utils/sapo-client.js";
import { handleSapoError, SapoPermissionError } from "../../utils/sapo-error.js";

const STORE_INFO_PERMISSION_ERROR =
  "Store info permission not enabled. Go to SAPO Admin → Apps → [App Name] → Permissions and enable 'Store info'.";

interface SapoStoreResponse {
  store?: {
    name?: string;
    timezone?: string;
    currency?: string;
    plan_display_name?: string;
    primary_domain?: string;
    email?: string;
    contact_email?: string;
  };
}

interface StoreInfo {
  store_name: string | null;
  timezone: string | null;
  currency: string | null;
  plan_display_name: string | null;
  primary_domain: string | null;
  contact_email: string | null;
}

function normalizeStoreInfo(data: SapoStoreResponse): StoreInfo {
  const store = data.store;

  return {
    store_name: store?.name ?? null,
    timezone: store?.timezone ?? null,
    currency: store?.currency ?? null,
    plan_display_name: store?.plan_display_name ?? null,
    primary_domain: store?.primary_domain ?? null,
    contact_email: store?.contact_email ?? store?.email ?? null,
  };
}

export function registerStoreTools(server: McpServer, config: Config) {
  const client = createSapoClient(config);

  server.tool(
    "get_store",
    "Get store information and configuration settings. Requires the SAPO Admin 'Store info' permission.",
    {},
    async () => {
      try {
        const { data } = await client.get<SapoStoreResponse>("/store.json");
        return {
          content: [
            { type: "text", text: JSON.stringify(normalizeStoreInfo(data), null, 2) },
          ],
        };
      } catch (error) {
        if (error instanceof SapoPermissionError) {
          return {
            content: [
              { type: "text", text: `Error: ${STORE_INFO_PERMISSION_ERROR}` },
            ],
          };
        }

        return handleSapoError(error);
      }
    }
  );
}
