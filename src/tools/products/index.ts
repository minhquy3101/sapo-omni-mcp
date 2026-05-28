import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { createSapoClient } from "../../utils/sapo-client.js";
import { handleSapoError, SapoNotFoundError } from "../../utils/sapo-error.js";
import { normalizePage, fetchAllPages } from "../../utils/pagination.js";
import { isDryRun, buildDryRunResult } from "../../utils/dry-run.js";
import type { SapoProduct } from "../../types/sapo.js";

interface ProductsResponse {
  products: SapoProduct[];
}

interface ProductResponse {
  product: SapoProduct;
}

interface CountResponse {
  count: number;
}

function toListItem(p: SapoProduct) {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    variant_count: p.variants.length,
    inventory_total: p.variants.reduce((s, v) => s + (v.inventory_quantity ?? 0), 0),
  };
}

function toDetail(p: SapoProduct) {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      price: v.price,
      inventory_item_id: v.inventory_item_id,
      weight: v.weight,
      inventory_quantity: v.inventory_quantity,
    })),
    images: (p.images ?? []).map((img) => ({
      id: img.id,
      src: img.src,
      alt: img.alt,
    })),
  };
}

export function registerProductTools(server: McpServer, config: Config) {
  const client = createSapoClient(config);

  server.tool(
    "list_products",
    "List products with pagination. Returns ID, title, status, variant count, and total inventory per product.",
    {
      page: z.number().int().positive().default(1),
      limit: z.number().int().min(1).max(250).default(20),
      status: z.enum(["active", "inactive", "draft"]).optional(),
    },
    async ({ page, limit, status }) => {
      try {
        const [productsRes, countRes] = await Promise.all([
          client.get<ProductsResponse>("/products.json", { params: { page, limit, status } }),
          client.get<CountResponse>("/products/count.json", { params: { status } }),
        ]);
        const items = productsRes.data.products.map(toListItem);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                normalizePage(items, { page, limit }, countRes.data.count),
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
    "get_product",
    "Get full product detail including all variants (SKU, price, inventory_item_id, weight) and images.",
    {
      product_id: z.number().int().positive(),
    },
    async ({ product_id }) => {
      try {
        const { data } = await client.get<ProductResponse>(`/products/${product_id}.json`);
        return {
          content: [{ type: "text", text: JSON.stringify(toDetail(data.product), null, 2) }],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Product not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "count_products",
    "Count products with optional status filter. Returns a single integer.",
    {
      status: z.enum(["active", "inactive", "draft"]).optional(),
    },
    async ({ status }) => {
      try {
        const { data } = await client.get<CountResponse>("/products/count.json", {
          params: { status },
        });
        return {
          content: [{ type: "text", text: JSON.stringify({ count: data.count }, null, 2) }],
        };
      } catch (error) {
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "search_products_by_sku",
    "Search for a product by variant SKU (case-insensitive). Returns the matching variant and its parent product.",
    {
      sku: z.string().min(1),
    },
    async ({ sku }) => {
      try {
        const needle = sku.toLowerCase();
        const allProducts = await fetchAllPages<SapoProduct>(
          (page, limit) =>
            client
              .get<ProductsResponse>("/products.json", { params: { page, limit } })
              .then((res) => res.data.products),
          250,
        );

        for (const product of allProducts) {
          const variant = product.variants.find((v) => (v.sku ?? "").toLowerCase() === needle);
          if (variant) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      product_id: product.id,
                      product_name: product.name,
                      variant_id: variant.id,
                      sku: variant.sku,
                      price: variant.price,
                      inventory_item_id: variant.inventory_item_id,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        }

        return { content: [{ type: "text", text: `No product found with SKU: ${sku}` }] };
      } catch (error) {
        return handleSapoError(error);
      }
    },
  );

  // ── Write operations ──────────────────────────────────────────────────────

  server.tool(
    "create_product",
    "Create a new product with variants. Requires title, status, and at least one variant with sku, price, and weight.",
    {
      title: z.string().min(1),
      status: z.enum(["active", "inactive", "draft"]).default("draft"),
      variants: z
        .array(
          z.object({
            sku: z.string().min(1),
            price: z.string().min(1),
            weight: z.number().nonnegative().default(0),
          }),
        )
        .min(1),
    },
    async ({ title, status, variants }) => {
      try {
        // SAPO uses 'title' for write, 'name' for read — these are the same field
        const { data } = await client.post<ProductResponse>("/products.json", {
          product: { title, status, variants },
        });
        const p = data.product;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: p.id,
                  title: p.name,
                  status: p.status,
                  variants: p.variants.map((v) => ({ id: v.id, sku: v.sku })),
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
    "update_product",
    "Update product fields (title, status) or variant prices. Partial updates supported — only provided fields are modified.",
    {
      product_id: z.number().int().positive(),
      title: z.string().min(1).optional(),
      status: z.enum(["active", "inactive", "draft"]).optional(),
    },
    async ({ product_id, title, status }) => {
      try {
        const { data } = await client.get<ProductResponse>(`/products/${product_id}.json`);
        const currentProduct = data.product;

        const payload: Record<string, unknown> = {};
        if (title !== undefined) payload.title = title;
        if (status !== undefined) payload.status = status;

        const { data: updated } = await client.put<ProductResponse>(
          `/products/${product_id}.json`,
          { product: payload },
        );

        const p = updated.product;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: p.id,
                  name: p.name,
                  status: p.status,
                  previous_name: currentProduct.name,
                  variant_skus: p.variants.map((v) => v.sku),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Product not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "delete_product",
    "Delete a product permanently. Use dry_run: true (default) to preview before deletion.",
    {
      product_id: z.number().int().positive(),
      dry_run: z.boolean().default(true),
    },
    async ({ product_id, dry_run }) => {
      try {
        const { data } = await client.get<ProductResponse>(`/products/${product_id}.json`);
        const p = data.product;

        if (isDryRun({ dry_run })) {
          return buildDryRunResult({
            action: `Delete product #${product_id} "${p.name}"`,
            endpoint: `DELETE /admin/products/${product_id}.json`,
            would_affect: {
              product_name: p.name,
              variant_count: p.variants.length,
            },
          });
        }

        await client.delete(`/products/${product_id}.json`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { deleted: true, product_id, product_name: p.name },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Product not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );
}
