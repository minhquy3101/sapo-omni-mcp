import type { SapoClient } from "../../utils/sapo-client.js";
import type { SapoOrder } from "../../types/sapo.js";

interface OrdersResponse {
  orders: SapoOrder[];
}

const MAX_PAGES = 100;

export async function fetchOrders(
  client: SapoClient,
  params: {
    status?: string;
    financial_status?: string;
    created_on_min?: string;
    created_on_max?: string;
    limit?: number;
  },
): Promise<{ orders: SapoOrder[]; truncated: boolean }> {
  const limit = params.limit ?? 250;
  const all: SapoOrder[] = [];
  let truncated = false;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await client.get<OrdersResponse>("/orders.json", {
      params: { ...params, page, limit },
    });
    all.push(...data.orders);
    if (data.orders.length < limit) break;
    if (page === MAX_PAGES) truncated = true;
  }

  return { orders: all, truncated };
}
