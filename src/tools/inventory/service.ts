import type { SapoClient } from "../../utils/sapo-client.js";
import { fetchAllPages } from "../../utils/pagination.js";
import type { SapoInventoryLevel } from "../../types/sapo.js";

interface InventoryLevelsResponse {
  inventory_levels: SapoInventoryLevel[];
}

export async function fetchInventoryLevels(
  client: SapoClient,
  params: { location_id?: number; inventory_item_ids?: string },
): Promise<SapoInventoryLevel[]> {
  return fetchAllPages<SapoInventoryLevel>(
    (page, limit) =>
      client
        .get<InventoryLevelsResponse>("/inventory_levels.json", {
          params: { ...params, page, limit },
        })
        .then((res) => res.data.inventory_levels),
    250,
  );
}
