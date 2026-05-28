import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { createSapoClient } from "../../utils/sapo-client.js";
import { handleSapoError, SapoNotFoundError } from "../../utils/sapo-error.js";
import type { SapoCarrierService } from "../../types/sapo.js";

interface CarrierServicesResponse {
  carrier_services: SapoCarrierService[];
}

interface CarrierServiceResponse {
  carrier_service: SapoCarrierService;
}

function toListItem(cs: SapoCarrierService) {
  return {
    id: cs.id,
    name: cs.name,
    active: cs.active,
    service_discovery: cs.service_discovery,
    carrier_service_type: cs.carrier_service_type,
    callback_url: cs.callback_url ?? null,
  };
}

function toDetail(cs: SapoCarrierService) {
  return {
    ...toListItem(cs),
    format: cs.format ?? null,
  };
}

export function registerCarrierTools(server: McpServer, config: Config) {
  const client = createSapoClient(config);

  server.tool(
    "list_carrier_services",
    "List all carrier services configured in the SAPO store. Returns id, name, active status, and callback URL.",
    {},
    async () => {
      try {
        const { data } = await client.get<CarrierServicesResponse>("/carrier_services.json");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.carrier_services.map(toListItem), null, 2),
            },
          ],
        };
      } catch (error) {
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "get_carrier_service",
    "Get full detail of a carrier service by ID, including callback URL and format.",
    {
      carrier_service_id: z.number().int().positive(),
    },
    async ({ carrier_service_id }) => {
      try {
        const { data } = await client.get<CarrierServiceResponse>(
          `/carrier_services/${carrier_service_id}.json`,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(toDetail(data.carrier_service), null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Carrier service not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );
}
