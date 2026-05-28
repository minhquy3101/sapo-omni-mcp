import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { createSapoClient } from "../../utils/sapo-client.js";
import { handleSapoError, SapoNotFoundError, SapoValidationError } from "../../utils/sapo-error.js";
import { normalizePage } from "../../utils/pagination.js";
import { isDryRun, buildDryRunResult } from "../../utils/dry-run.js";
import type { SapoOrder } from "../../types/sapo.js";
import { registerRefundTools } from "./refunds.js";
import { registerTransactionTools } from "./transactions.js";
import { ISO8601_DATE } from "../../utils/iso8601.js";

interface OrdersResponse {
  orders: SapoOrder[];
}

interface OrderResponse {
  order: SapoOrder;
}

interface CountResponse {
  count: number;
}

interface FulfillmentResponse {
  fulfillment: {
    id: number;
    status: string;
  };
}

function toListItem(o: SapoOrder) {
  const customerName =
    o.customer
      ? [o.customer.first_name, o.customer.last_name].filter(Boolean).join(" ") || null
      : null;
  return {
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    financial_status: o.financial_status,
    fulfillment_status: o.fulfillment_status,
    total_price: o.total_price,
    customer_name: customerName,
    line_item_count: o.line_items.length,
    created_on: o.created_on,
  };
}

function toDetail(o: SapoOrder) {
  return {
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    financial_status: o.financial_status,
    fulfillment_status: o.fulfillment_status,
    total_price: o.total_price,
    note: o.note,
    payment_gateway: o.payment_gateway ?? null,
    customer: o.customer,
    shipping_address: o.shipping_address ?? null,
    billing_address: o.billing_address ?? null,
    fulfillments: (o.fulfillments ?? []).map((f) => ({
      fulfillment_id: f.id,
      status: f.status,
      tracking_number: f.tracking_number ?? null,
      tracking_company: f.tracking_company ?? null,
      created_at: f.created_at,
    })),
    line_items: o.line_items.map((li) => ({
      id: li.id,
      name: li.name,
      sku: li.sku,
      quantity: li.quantity,
      price: li.price,
      variant_id: li.variant_id,
      product_id: li.product_id,
    })),
    created_on: o.created_on,
  };
}

export function registerOrderTools(server: McpServer, config: Config) {
  registerRefundTools(server, config);
  registerTransactionTools(server, config);

  const client = createSapoClient(config);

  // ── Story 3.1: Read operations ─────────────────────────────────────────────

  server.tool(
    "list_orders",
    "List orders with filters. Returns order ID, number, status, customer name, total price, and line item count per order.",
    {
      page: z.number().int().positive().default(1),
      limit: z.number().int().min(1).max(250).default(20),
      status: z.enum(["open", "closed", "cancelled", "any"]).optional(),
      financial_status: z
        .enum(["pending", "authorized", "partially_paid", "paid", "partially_refunded", "refunded", "voided"])
        .optional(),
      fulfillment_status: z
        .enum(["shipped", "partial", "unshipped", "any"])
        .optional(),
      customer_id: z.number().int().positive().optional(),
      created_on_min: ISO8601_DATE.optional(),
      created_on_max: ISO8601_DATE.optional(),
    },
    async ({ page, limit, status, financial_status, fulfillment_status, customer_id, created_on_min, created_on_max }) => {
      if (created_on_min && created_on_max && created_on_min > created_on_max) {
        return { content: [{ type: "text", text: "Error: created_on_min must be before or equal to created_on_max" }] };
      }

      try {
        const params: Record<string, unknown> = { page, limit };
        if (status !== undefined) params.status = status;
        if (financial_status !== undefined) params.financial_status = financial_status;
        if (fulfillment_status !== undefined) params.fulfillment_status = fulfillment_status;
        if (customer_id !== undefined) params.customer_id = customer_id;
        if (created_on_min !== undefined) params.created_on_min = created_on_min;
        if (created_on_max !== undefined) params.created_on_max = created_on_max;

        const countParams: Record<string, unknown> = {};
        if (status !== undefined) countParams.status = status;
        if (financial_status !== undefined) countParams.financial_status = financial_status;
        if (fulfillment_status !== undefined) countParams.fulfillment_status = fulfillment_status;
        if (customer_id !== undefined) countParams.customer_id = customer_id;
        if (created_on_min !== undefined) countParams.created_on_min = created_on_min;
        if (created_on_max !== undefined) countParams.created_on_max = created_on_max;

        const [ordersRes, countRes] = await Promise.all([
          client.get<OrdersResponse>("/orders.json", { params }),
          client.get<CountResponse>("/orders/count.json", { params: countParams }),
        ]);

        const items = ordersRes.data.orders.map(toListItem);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(normalizePage(items, { page, limit }, countRes.data.count), null, 2),
            },
          ],
        };
      } catch (error) {
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "count_orders",
    "Count orders with optional filters. Returns a single integer.",
    {
      status: z.enum(["open", "closed", "cancelled", "any"]).optional(),
      financial_status: z
        .enum(["pending", "authorized", "partially_paid", "paid", "partially_refunded", "refunded", "voided"])
        .optional(),
      fulfillment_status: z.enum(["shipped", "partial", "unshipped", "any"]).optional(),
      customer_id: z.number().int().positive().optional(),
      created_on_min: ISO8601_DATE.optional(),
      created_on_max: ISO8601_DATE.optional(),
    },
    async ({ status, financial_status, fulfillment_status, customer_id, created_on_min, created_on_max }) => {
      try {
        const params: Record<string, unknown> = {};
        if (status !== undefined) params.status = status;
        if (financial_status !== undefined) params.financial_status = financial_status;
        if (fulfillment_status !== undefined) params.fulfillment_status = fulfillment_status;
        if (customer_id !== undefined) params.customer_id = customer_id;
        if (created_on_min !== undefined) params.created_on_min = created_on_min;
        if (created_on_max !== undefined) params.created_on_max = created_on_max;

        const { data } = await client.get<CountResponse>("/orders/count.json", { params });
        return {
          content: [{ type: "text", text: JSON.stringify({ count: data.count }, null, 2) }],
        };
      } catch (error) {
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "get_order",
    "Get full order detail including line items (SKU, quantity, price), customer info, and fulfillment status.",
    {
      order_id: z.number().int().positive(),
    },
    async ({ order_id }) => {
      try {
        const { data } = await client.get<OrderResponse>(`/orders/${order_id}.json`);
        return {
          content: [{ type: "text", text: JSON.stringify(toDetail(data.order), null, 2) }],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Order not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  // ── Story 3.2: Create & Update ─────────────────────────────────────────────

  server.tool(
    "create_order",
    "Create a manual order (phone/in-person sales). Requires at least one line item with variant_id and quantity.",
    {
      line_items: z
        .array(
          z.object({
            variant_id: z.number().int().positive(),
            quantity: z.number().int().positive(),
          }),
        )
        .min(1),
      customer_id: z.number().int().positive().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      note: z.string().optional(),
    },
    async ({ line_items, customer_id, email, phone, note }) => {
      try {
        const payload: Record<string, unknown> = { line_items };
        if (customer_id !== undefined) payload.customer = { id: customer_id };
        if (email !== undefined) payload.email = email;
        if (phone !== undefined) payload.phone = phone;
        if (note !== undefined) payload.note = note;

        const { data } = await client.post<OrderResponse>("/orders.json", { order: payload });
        const o = data.order;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { id: o.id, order_number: o.order_number, total_price: o.total_price, status: o.status },
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
    "update_order",
    "Update non-financial order fields: note, email, phone. Financial fields (line items, total price) cannot be changed.",
    {
      order_id: z.number().int().positive(),
      note: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      total_price: z.unknown().optional(),
      line_items: z.unknown().optional(),
      subtotal_price: z.unknown().optional(),
    },
    async ({ order_id, note, email, phone, total_price, line_items, subtotal_price }) => {
      if (total_price !== undefined || line_items !== undefined || subtotal_price !== undefined) {
        return { content: [{ type: "text", text: "Error: Financial fields cannot be updated via this tool (total_price, line_items, subtotal_price)" }] };
      }

      if (note === undefined && email === undefined && phone === undefined) {
        return { content: [{ type: "text", text: "Error: At least one field (note, email, phone) must be provided" }] };
      }

      try {
        const payload: Record<string, unknown> = {};
        if (note !== undefined) payload.note = note;
        if (email !== undefined) payload.email = email;
        if (phone !== undefined) payload.phone = phone;

        const { data } = await client.put<OrderResponse>(`/orders/${order_id}.json`, {
          order: payload,
        });
        const o = data.order;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: o.id,
                  order_number: o.order_number,
                  note: o.note,
                  email: o.email,
                  status: o.status,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Order not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  // ── Story 3.3: Archive, Unarchive & Fulfill ────────────────────────────────

  server.tool(
    "archive_order",
    "Archive (close) an order. If already closed, returns an already_in_state response.",
    {
      order_id: z.number().int().positive(),
    },
    async ({ order_id }) => {
      try {
        const { data: current } = await client.get<OrderResponse>(`/orders/${order_id}.json`);
        if (current.order.status === "closed") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ already_in_state: true, order_id, status: "closed" }, null, 2),
              },
            ],
          };
        }

        const { data } = await client.post<OrderResponse>(`/orders/${order_id}/close.json`, {});
        const o = data.order;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ id: o.id, order_number: o.order_number, status: o.status }, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Order not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "unarchive_order",
    "Unarchive (reopen) a closed order.",
    {
      order_id: z.number().int().positive(),
    },
    async ({ order_id }) => {
      try {
        const { data: current } = await client.get<OrderResponse>(`/orders/${order_id}.json`);
        if (current.order.status === "open") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ already_in_state: true, order_id, status: "open" }, null, 2),
              },
            ],
          };
        }

        const { data } = await client.post<OrderResponse>(`/orders/${order_id}/open.json`, {});
        const o = data.order;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ id: o.id, order_number: o.order_number, status: o.status }, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Order not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "fulfill_order",
    "Create a fulfillment record for an order with optional tracking number and company.",
    {
      order_id: z.number().int().positive(),
      tracking_number: z.string().optional(),
      tracking_company: z.string().optional(),
    },
    async ({ order_id, tracking_number, tracking_company }) => {
      try {
        const { data: orderData } = await client.get<OrderResponse>(`/orders/${order_id}.json`);
        if (orderData.order.fulfillment_status === "shipped") {
          return { content: [{ type: "text", text: "Error: Order is already fulfilled" }] };
        }

        const payload: Record<string, unknown> = {};
        if (tracking_number !== undefined) payload.tracking_number = tracking_number;
        if (tracking_company !== undefined) payload.tracking_company = tracking_company;

        const { data } = await client.post<FulfillmentResponse>(
          `/orders/${order_id}/fulfillments.json`,
          { fulfillment: payload },
        );

        const { data: updated } = await client.get<OrderResponse>(`/orders/${order_id}.json`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  fulfillment_id: data.fulfillment.id,
                  fulfillment_status: updated.order.fulfillment_status,
                  order_id,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Order not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  // ── Story 3.4: Cancel & Delete (high-risk destructive writes) ──────────────

  server.tool(
    "cancel_order",
    "Cancel an order. Use dry_run: true (default) to preview all side effects before executing.",
    {
      order_id: z.number().int().positive(),
      dry_run: z.boolean().default(true),
    },
    async ({ order_id, dry_run }) => {
      try {
        const { data: orderData } = await client.get<OrderResponse>(`/orders/${order_id}.json`);
        const o = orderData.order;

        if (o.status === "cancelled") {
          return { content: [{ type: "text", text: "Error: Order is already cancelled" }] };
        }

        const customerEmail =
          o.customer?.email ?? o.customer?.phone ?? "no contact info";
        const inventoryItemCount = o.line_items.reduce((sum, li) => sum + li.quantity, 0);
        const paymentMethod = o.payment_gateway ?? o.financial_status;

        if (isDryRun({ dry_run })) {
          return buildDryRunResult({
            action: `Cancel order #${o.order_number}`,
            endpoint: `POST /admin/orders/${order_id}/cancel.json`,
            would_affect: {
              order_number: o.order_number,
              side_effects: [
                `(1) Send a cancellation email to ${customerEmail}`,
                `(2) Restock ${inventoryItemCount} inventory item(s)`,
                `(3) Trigger a refund of ${o.total_price} via ${paymentMethod}`,
              ],
            },
          });
        }

        const { data } = await client.post<OrderResponse>(`/orders/${order_id}/cancel.json`, {});
        const cancelled = data.order;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { id: cancelled.id, order_number: cancelled.order_number, status: cancelled.status },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Order not found" }] };
        }
        if (error instanceof SapoValidationError) {
          return { content: [{ type: "text", text: `Error: ${error.message}` }] };
        }
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "delete_order",
    "Permanently delete an order. Use dry_run: true (default) to preview before deletion.",
    {
      order_id: z.number().int().positive(),
      dry_run: z.boolean().default(true),
    },
    async ({ order_id, dry_run }) => {
      try {
        const { data: orderData } = await client.get<OrderResponse>(`/orders/${order_id}.json`);
        const o = orderData.order;

        const customerName =
          o.customer
            ? [o.customer.first_name, o.customer.last_name].filter(Boolean).join(" ") || "Unknown"
            : "Unknown";

        if (isDryRun({ dry_run })) {
          return buildDryRunResult({
            action: `Delete order #${o.order_number} permanently`,
            endpoint: `DELETE /admin/orders/${order_id}.json`,
            would_affect: {
              order_id,
              order_number: o.order_number,
              customer_name: customerName,
              total_price: o.total_price,
              warning: "This action is permanent and cannot be undone",
            },
          });
        }

        await client.delete(`/orders/${order_id}.json`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { deleted: true, order_id, order_number: o.order_number },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Order not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );
}
