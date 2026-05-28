import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { createSapoClient } from "../../utils/sapo-client.js";
import { handleSapoError, SapoNotFoundError } from "../../utils/sapo-error.js";
import { isDryRun, buildDryRunResult } from "../../utils/dry-run.js";
import type { SapoRefund, SapoOrder } from "../../types/sapo.js";

interface RefundsResponse {
  refunds: SapoRefund[];
}

interface RefundResponse {
  refund: SapoRefund;
}

interface OrderResponse {
  order: SapoOrder;
}

function toRefundItem(r: SapoRefund) {
  return {
    refund_id: r.id,
    created_at: r.created_at,
    note: r.note ?? null,
    refund_line_items: r.refund_line_items.map((li) => ({
      line_item_id: li.line_item_id,
      variant_id: li.variant_id ?? null,
      title: li.title,
      quantity: li.quantity,
      subtotal: li.subtotal,
    })),
    transactions: r.transactions.map((t) => ({
      amount: t.amount,
      gateway: t.gateway,
      status: t.status,
    })),
  };
}

export function registerRefundTools(server: McpServer, config: Config) {
  const client = createSapoClient(config);

  server.tool(
    "list_refunds",
    "List all refunds on an order. Returns refund records with line items and transaction amounts.",
    {
      order_id: z.number().int().positive(),
    },
    async ({ order_id }) => {
      try {
        const { data } = await client.get<RefundsResponse>(
          `/orders/${order_id}/refunds.json`,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.refunds.map(toRefundItem), null, 2),
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
    "create_refund",
    "Create a refund on an order. Use dry_run: true (default) to preview. When dry_run is false, refund_line_items is required.",
    {
      order_id: z.number().int().positive(),
      dry_run: z.boolean().default(true),
      refund_line_items: z
        .array(
          z.object({
            line_item_id: z.number().int().positive(),
            quantity: z.number().int().positive(),
            restock: z.boolean().default(true),
          }),
        )
        .min(1)
        .optional(),
      note: z.string().optional(),
    },
    async ({ order_id, dry_run, refund_line_items, note }) => {
      try {
        const { data: orderData } = await client.get<OrderResponse>(
          `/orders/${order_id}.json`,
        );
        const o = orderData.order;

        if (o.status === "cancelled" || o.financial_status === "refunded") {
          return {
            content: [
              {
                type: "text",
                text: `Error: Cannot create refund — order is already ${o.status === "cancelled" ? "cancelled" : "refunded"}`,
              },
            ],
          };
        }

        const refundAmount = o.total_price;
        const restockCount = (refund_line_items ?? []).reduce(
          (sum, li) => sum + li.quantity,
          0,
        );

        if (!isDryRun({ dry_run }) && (refund_line_items === undefined || refund_line_items.length === 0)) {
          return {
            content: [{
              type: "text",
              text: "Error: refund_line_items is required when dry_run is false (use dry_run: true to preview without line items)",
            }],
          };
        }

        if (isDryRun({ dry_run })) {
          return buildDryRunResult({
            action: `Create refund on order #${o.order_number}`,
            endpoint: `POST /admin/orders/${order_id}/refunds.json`,
            would_affect: {
              order_number: o.order_number,
              refund_amount: refundAmount,
              restock_count: restockCount,
            },
          });
        }

        const payload: Record<string, unknown> = {};
        if (refund_line_items !== undefined) payload.refund_line_items = refund_line_items;
        if (note !== undefined) payload.note = note;

        const { data } = await client.post<RefundResponse>(
          `/orders/${order_id}/refunds.json`,
          { refund: payload },
        );

        const r = data.refund;
        // Integer arithmetic to avoid floating-point drift (amounts in VND have no decimals)
        const totalRefunded = Math.round(
          r.transactions.reduce((sum, t) => sum + parseFloat(t.amount) * 100, 0) / 100,
        );

        const { data: updated } = await client.get<OrderResponse>(
          `/orders/${order_id}.json`,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  refund_id: r.id,
                  total_refunded: String(totalRefunded),
                  financial_status: updated.order.financial_status,
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
}
