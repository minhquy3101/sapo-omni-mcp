import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { createSapoClient } from "../../utils/sapo-client.js";
import { handleSapoError, SapoNotFoundError, SapoValidationError } from "../../utils/sapo-error.js";
import { isDryRun, buildDryRunResult } from "../../utils/dry-run.js";
import type {
  SapoInventoryLevel,
  SapoInventoryItem,
  SapoLocation,
  SapoProduct,
} from "../../types/sapo.js";

interface InventoryLevelsResponse {
  inventory_levels: SapoInventoryLevel[];
}
interface InventoryLevelResponse {
  inventory_level: SapoInventoryLevel;
}
interface InventoryItemResponse {
  inventory_item: SapoInventoryItem;
}
interface InventoryItemsResponse {
  inventory_items: SapoInventoryItem[];
}
interface LocationsResponse {
  locations: SapoLocation[];
}
interface ProductResponse {
  product: SapoProduct;
}

const UNCONNECTED_ERROR =
  "Error: Inventory item must be connected to this location first. Use connect_inventory_item.";

export function registerInventoryTools(server: McpServer, config: Config) {
  const client = createSapoClient(config);

  // ── Story 2.3: Read operations ────────────────────────────────────────────

  server.tool(
    "list_inventory_levels",
    "List inventory levels filtered by product, location, or inventory item. At least one filter required.",
    {
      location_id: z.number().int().positive().optional(),
      product_id: z.number().int().positive().optional(),
      inventory_item_id: z.number().int().positive().optional(),
    },
    async ({ location_id, product_id, inventory_item_id }) => {
      if (!location_id && !product_id && !inventory_item_id) {
        return {
          content: [
            {
              type: "text",
              text: "Error: At least one of location_id, product_id, or inventory_item_id is required",
            },
          ],
        };
      }

      try {
        const locRes = await client.get<LocationsResponse>("/locations.json");
        const locationMap = new Map(locRes.data.locations.map((l) => [l.id, l.name]));

        if (product_id !== undefined) {
          const productRes = await client.get<ProductResponse>(`/products/${product_id}.json`);
          const product = productRes.data.product;
          const itemIds = product.variants.map((v) => v.inventory_item_id).join(",");
          const skuMap = new Map(product.variants.map((v) => [v.inventory_item_id, v.sku]));

          const levelsRes = await client.get<InventoryLevelsResponse>("/inventory_levels.json", {
            params: { inventory_item_ids: itemIds },
          });
          const items = levelsRes.data.inventory_levels.map((level) => ({
            inventory_item_id: level.inventory_item_id,
            location_id: level.location_id,
            sku: skuMap.get(level.inventory_item_id) ?? null,
            product_name: product.name,
            location_name: locationMap.get(level.location_id) ?? null,
            available: level.available,
          }));
          return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
        }

        const params: Record<string, unknown> = {};
        if (location_id !== undefined) params.location_id = location_id;
        if (inventory_item_id !== undefined) params.inventory_item_ids = inventory_item_id;

        const levelsRes = await client.get<InventoryLevelsResponse>("/inventory_levels.json", {
          params,
        });
        const levels = levelsRes.data.inventory_levels;

        if (levels.length === 0) {
          return { content: [{ type: "text", text: JSON.stringify([], null, 2) }] };
        }

        const uniqueItemIds = [...new Set(levels.map((l) => l.inventory_item_id))];
        const itemsRes = await client.get<InventoryItemsResponse>("/inventory_items.json", {
          params: { ids: uniqueItemIds.join(",") },
        });
        const skuMap = new Map(itemsRes.data.inventory_items.map((item) => [item.id, item.sku]));

        const result = levels.map((level) => ({
          inventory_item_id: level.inventory_item_id,
          location_id: level.location_id,
          sku: skuMap.get(level.inventory_item_id) ?? null,
          product_name: null,
          location_name: locationMap.get(level.location_id) ?? null,
          available: level.available,
        }));
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "get_inventory_item",
    "Get inventory item details: SKU, cost, and whether SAPO tracks inventory for it.",
    {
      inventory_item_id: z.number().int().positive(),
    },
    async ({ inventory_item_id }) => {
      try {
        const { data } = await client.get<InventoryItemResponse>(
          `/inventory_items/${inventory_item_id}.json`,
        );
        const item = data.inventory_item;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ sku: item.sku, cost: item.cost, tracked: item.tracked }, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Inventory item not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  // ── Story 2.4: Connect & metadata update ─────────────────────────────────

  server.tool(
    "connect_inventory_item",
    "Link an inventory item to a location to enable stock tracking there.",
    {
      inventory_item_id: z.number().int().positive(),
      location_id: z.number().int().positive(),
    },
    async ({ inventory_item_id, location_id }) => {
      try {
        await client.post("/inventory_levels/connect.json", {
          inventory_item_id,
          location_id,
          relocate_if_necessary: false,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ connected: true, inventory_item_id, location_id }, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "update_inventory_item",
    "Update inventory item metadata (SKU or cost). Response shows old → new SKU when SKU is changed.",
    {
      inventory_item_id: z.number().int().positive(),
      sku: z.string().min(1).optional(),
      cost: z.string().min(1).optional(),
    },
    async ({ inventory_item_id, sku, cost }) => {
      try {
        const currentRes = await client.get<InventoryItemResponse>(
          `/inventory_items/${inventory_item_id}.json`,
        );
        const current = currentRes.data.inventory_item;

        const payload: Record<string, unknown> = {};
        if (sku !== undefined) payload.sku = sku;
        if (cost !== undefined) payload.cost = cost;

        const { data: updated } = await client.put<InventoryItemResponse>(
          `/inventory_items/${inventory_item_id}.json`,
          { inventory_item: payload },
        );
        const item = updated.inventory_item;

        const responseData: Record<string, unknown> = { inventory_item_id };
        if (sku !== undefined) {
          responseData.message = `SKU updated: ${current.sku} → ${item.sku}`;
        }
        if (cost !== undefined) {
          responseData.cost = item.cost;
        }

        return {
          content: [{ type: "text", text: JSON.stringify(responseData, null, 2) }],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Inventory item not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  // ── Story 2.5: Adjustments & destructive writes ───────────────────────────

  server.tool(
    "adjust_inventory",
    "Adjust inventory by a relative delta (+N or -N). Prevents negative stock. Requires inventory write permission in SAPO Admin → Apps → Permissions.",
    {
      inventory_item_id: z.number().int().positive(),
      location_id: z.number().int().positive(),
      adjustment: z.number().int(),
    },
    async ({ inventory_item_id, location_id, adjustment }) => {
      try {
        const levelsRes = await client.get<InventoryLevelsResponse>("/inventory_levels.json", {
          params: { inventory_item_ids: inventory_item_id, location_id },
        });
        const current = levelsRes.data.inventory_levels[0]?.available ?? 0;
        const resulting = current + adjustment;

        if (resulting < 0) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Adjustment would result in negative stock (current: ${current}, adjustment: ${adjustment})`,
              },
            ],
          };
        }

        await client.post("/inventory_levels/adjust.json", {
          inventory_item_id,
          location_id,
          available_adjustment: adjustment,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  inventory_item_id,
                  location_id,
                  current_quantity: current,
                  adjustment,
                  resulting_quantity: resulting,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "set_inventory_level",
    "Set absolute inventory level. Use dry_run: true (default) to preview before writing. Inventory item must be connected to the location first via connect_inventory_item.",
    {
      inventory_item_id: z.number().int().positive(),
      location_id: z.number().int().positive(),
      available: z.number().int().min(0),
      dry_run: z.boolean().default(true),
    },
    async ({ inventory_item_id, location_id, available, dry_run }) => {
      try {
        const [levelsRes, itemRes, locRes] = await Promise.all([
          client.get<InventoryLevelsResponse>("/inventory_levels.json", {
            params: { inventory_item_ids: inventory_item_id, location_id },
          }),
          client.get<InventoryItemResponse>(`/inventory_items/${inventory_item_id}.json`),
          client.get<LocationsResponse>("/locations.json"),
        ]);

        const current = levelsRes.data.inventory_levels[0]?.available ?? 0;
        const sku = itemRes.data.inventory_item.sku;
        const location =
          locRes.data.locations.find((l) => l.id === location_id)?.name ?? String(location_id);

        if (isDryRun({ dry_run })) {
          return buildDryRunResult({
            action: `Set inventory level for SKU ${sku} at ${location}`,
            endpoint: "POST /admin/inventory_levels/set.json",
            would_affect: { sku, location, current_quantity: current, new_quantity: available },
          });
        }

        const { data } = await client.post<InventoryLevelResponse>("/inventory_levels/set.json", {
          inventory_item_id,
          location_id,
          available,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  inventory_item_id,
                  location_id,
                  available: data.inventory_level.available,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        if (error instanceof SapoValidationError) {
          return { content: [{ type: "text", text: UNCONNECTED_ERROR }] };
        }
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "set_inventory_levels_multi",
    "Bulk-set inventory levels for up to 50 variants at once. Use dry_run: true (default) to preview.",
    {
      records: z
        .array(
          z.object({
            inventory_item_id: z.number().int().positive(),
            location_id: z.number().int().positive(),
            available: z.number().int().min(0),
          }),
        )
        .min(1)
        .max(50),
      dry_run: z.boolean().default(true),
    },
    async ({ records, dry_run }) => {
      if (records.length > 50) {
        return {
          content: [{ type: "text", text: "Error: Maximum 50 records per multi-set call" }],
        };
      }

      try {
        const uniqueItemIds = [...new Set(records.map((r) => r.inventory_item_id))];

        const [itemsRes, locRes, levelsRes] = await Promise.all([
          client.get<InventoryItemsResponse>("/inventory_items.json", {
            params: { ids: uniqueItemIds.join(",") },
          }),
          client.get<LocationsResponse>("/locations.json"),
          client.get<InventoryLevelsResponse>("/inventory_levels.json", {
            params: { inventory_item_ids: uniqueItemIds.join(",") },
          }),
        ]);

        const skuMap = new Map(itemsRes.data.inventory_items.map((item) => [item.id, item.sku]));
        const locationMap = new Map(locRes.data.locations.map((l) => [l.id, l.name]));
        const currentMap = new Map(
          levelsRes.data.inventory_levels.map((l) => [
            `${l.inventory_item_id}:${l.location_id}`,
            l.available,
          ]),
        );

        const previews = records.map((r) => ({
          sku: skuMap.get(r.inventory_item_id) ?? null,
          location: locationMap.get(r.location_id) ?? String(r.location_id),
          current_quantity: currentMap.get(`${r.inventory_item_id}:${r.location_id}`) ?? 0,
          new_quantity: r.available,
        }));

        if (isDryRun({ dry_run })) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ dry_run: true, records: previews }, null, 2),
              },
            ],
          };
        }

        const results = await Promise.all(
          records.map((r) =>
            client
              .post<InventoryLevelResponse>("/inventory_levels/set.json", {
                inventory_item_id: r.inventory_item_id,
                location_id: r.location_id,
                available: r.available,
              })
              .then((res) => ({
                inventory_item_id: r.inventory_item_id,
                location_id: r.location_id,
                available: res.data.inventory_level.available,
              })),
          ),
        );

        return {
          content: [{ type: "text", text: JSON.stringify({ updated: results }, null, 2) }],
        };
      } catch (error) {
        if (error instanceof SapoValidationError) {
          return { content: [{ type: "text", text: UNCONNECTED_ERROR }] };
        }
        return handleSapoError(error);
      }
    },
  );
}
