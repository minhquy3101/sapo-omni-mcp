import type { SapoClient } from "../../utils/sapo-client.js";
import { fetchAllPages } from "../../utils/pagination.js";
import type { SapoProduct } from "../../types/sapo.js";

interface ProductsResponse {
  products: SapoProduct[];
}

export async function fetchProducts(
  client: SapoClient,
  params: { status?: "active" | "inactive" | "draft"; limit?: number },
): Promise<SapoProduct[]> {
  const limit = params.limit ?? 250;
  return fetchAllPages<SapoProduct>(
    (page, lim) =>
      client
        .get<ProductsResponse>("/products.json", { params: { page, limit: lim, status: params.status } })
        .then((res) => res.data.products),
    limit,
  );
}
