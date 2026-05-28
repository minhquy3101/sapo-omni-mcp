import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { createSapoClient } from "../../utils/sapo-client.js";
import { handleSapoError } from "../../utils/sapo-error.js";
import { fetchOrders } from "../orders/service.js";

interface CountResponse {
  count: number;
}

const DATE_ONLY = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format (e.g. 2026-05-01)");

function toIsoMin(date: string) {
  return `${date}T00:00:00Z`;
}

function toIsoMax(date: string) {
  return `${date}T23:59:59Z`;
}

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function diffDays(from: string, to: string): number {
  return Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));
}

const MAX_ORDERS = 25000;

export function registerReportTools(server: McpServer, config: Config) {
  const client = createSapoClient(config);

  // ── Story 6.2: Order Status Summary ───────────────────────────────────────

  server.tool(
    "order_status_summary",
    "Count orders by status in a date range. Surfaces pending COD orders explicitly. Max 90-day window.",
    {
      date_from: DATE_ONLY,
      date_to: DATE_ONLY.optional(),
    },
    async ({ date_from, date_to }) => {
      const effectiveTo = date_to ?? todayString();

      if (date_to && date_from > date_to) {
        return {
          content: [{
            type: "text",
            text: "Error: date_from must be before or equal to date_to",
          }],
        };
      }

      if (diffDays(date_from, effectiveTo) > 90) {
        return {
          content: [{
            type: "text",
            text: "Error: Date range cannot exceed 90 days. Split into shorter periods.",
          }],
        };
      }

      try {
        const countRes = await client.get<CountResponse>("/orders/count.json", {
          params: {
            created_on_min: toIsoMin(date_from),
            created_on_max: toIsoMax(effectiveTo),
          },
        });
        if (countRes.data.count > MAX_ORDERS) {
          return {
            content: [{
              type: "text",
              text: `Error: Too many orders in date range (${countRes.data.count.toLocaleString()} orders, max ${MAX_ORDERS.toLocaleString()}). Use a shorter date range.`,
            }],
          };
        }

        const { orders, truncated } = await fetchOrders(client, {
          created_on_min: toIsoMin(date_from),
          created_on_max: toIsoMax(effectiveTo),
        });

        const counts: Record<string, number> = {};
        let pending_cod = 0;
        for (const order of orders) {
          const status = order.status ?? "unknown";
          counts[status] = (counts[status] ?? 0) + 1;
          if (
            order.financial_status === "pending" &&
            order.payment_gateway?.toLowerCase().includes("cod")
          ) {
            pending_cod++;
          }
        }

        const metadata: Record<string, unknown> = {
          total_records: orders.length,
          date_from,
          date_to: effectiveTo,
          is_complete: !truncated,
        };
        if (truncated) {
          metadata.warning = `Results are based on the first ${MAX_ORDERS.toLocaleString()} orders — total may differ`;
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(
              { ...counts, pending_cod, metadata },
              null,
              2,
            ),
          }],
        };
      } catch (error) {
        return handleSapoError(error);
      }
    },
  );

  // ── Story 6.3: Revenue Summary ─────────────────────────────────────────────

  server.tool(
    "revenue_summary",
    "Total revenue, order count, and average order value for paid orders. Max 90-day window.",
    {
      date_from: DATE_ONLY,
      date_to: DATE_ONLY.optional(),
      include_daily_breakdown: z.boolean().default(false),
    },
    async ({ date_from, date_to, include_daily_breakdown }) => {
      const effectiveTo = date_to ?? todayString();

      if (date_to && date_from > date_to) {
        return {
          content: [{ type: "text", text: "Error: date_from must be before or equal to date_to" }],
        };
      }

      if (diffDays(date_from, effectiveTo) > 90) {
        return {
          content: [{
            type: "text",
            text: "Error: Date range cannot exceed 90 days. Split into shorter periods.",
          }],
        };
      }

      try {
        const countRes = await client.get<CountResponse>("/orders/count.json", {
          params: {
            financial_status: "paid",
            created_on_min: toIsoMin(date_from),
            created_on_max: toIsoMax(effectiveTo),
          },
        });
        if (countRes.data.count > MAX_ORDERS) {
          return {
            content: [{
              type: "text",
              text: `Error: Too many orders in date range (${countRes.data.count.toLocaleString()} paid orders, max ${MAX_ORDERS.toLocaleString()}). Use a shorter date range.`,
            }],
          };
        }

        const { orders, truncated } = await fetchOrders(client, {
          financial_status: "paid",
          created_on_min: toIsoMin(date_from),
          created_on_max: toIsoMax(effectiveTo),
        });

        const order_count = orders.length;
        const total_revenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price), 0);
        const average_order_value = order_count > 0 ? Math.round(total_revenue / order_count) : 0;
        const currencyDetected = orders[0]?.currency;
        const currency = currencyDetected ?? "VND";

        const metadata: Record<string, unknown> = {
          total_records: order_count,
          date_from,
          date_to: effectiveTo,
          is_complete: !truncated,
        };
        if (truncated) {
          metadata.warning = `Results are based on the first ${MAX_ORDERS.toLocaleString()} orders — total may differ`;
        }

        const result: Record<string, unknown> = {
          total_revenue,
          order_count,
          average_order_value,
          currency,
          ...(currencyDetected === undefined || currencyDetected === null
            ? { currency_note: "Defaulted to VND — no orders in range to detect currency" }
            : {}),
          metadata,
        };

        if (include_daily_breakdown) {
          const dailyMap = new Map<string, { revenue: number; order_count: number }>();
          for (const order of orders) {
            const date = order.created_on.split("T")[0];
            const entry = dailyMap.get(date) ?? { revenue: 0, order_count: 0 };
            entry.revenue += parseFloat(order.total_price);
            entry.order_count++;
            dailyMap.set(date, entry);
          }
          result.daily_breakdown = [...dailyMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, data]) => ({
              date,
              revenue: data.revenue,
              order_count: data.order_count,
            }));
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return handleSapoError(error);
      }
    },
  );

  // ── Story 6.4: Top Products by Revenue ────────────────────────────────────

  server.tool(
    "top_products_by_revenue",
    "Ranked products by revenue from paid order line items. Max 30-day window, 500-order cap.",
    {
      date_from: DATE_ONLY,
      date_to: DATE_ONLY.optional(),
    },
    async ({ date_from, date_to }) => {
      const effectiveTo = date_to ?? todayString();

      if (date_to && date_from > date_to) {
        return {
          content: [{ type: "text", text: "Error: date_from must be before or equal to date_to" }],
        };
      }

      if (diffDays(date_from, effectiveTo) > 30) {
        return {
          content: [{
            type: "text",
            text: "Error: Top products report is limited to 30 days maximum to ensure accuracy",
          }],
        };
      }

      try {
        const { orders: allOrders, truncated } = await fetchOrders(client, {
          financial_status: "paid",
          created_on_min: toIsoMin(date_from),
          created_on_max: toIsoMax(effectiveTo),
        });

        const is_complete = !truncated && allOrders.length <= 500;
        const orders = allOrders.slice(0, 500);

        const revenueMap = new Map<number, { revenue: number; units: number; name: string }>();
        for (const order of orders) {
          for (const item of order.line_items) {
            const revenue = parseFloat(item.price) * item.quantity;
            const entry = revenueMap.get(item.product_id) ?? { revenue: 0, units: 0, name: item.name };
            entry.revenue += revenue;
            entry.units += item.quantity;
            revenueMap.set(item.product_id, entry);
          }
        }

        const items = [...revenueMap.entries()]
          .sort(([, a], [, b]) => b.revenue - a.revenue)
          .map(([product_id, data], index) => ({
            rank: index + 1,
            product_id,
            product_name: data.name,
            total_revenue: data.revenue,
            total_units_sold: data.units,
          }));

        const metadata: Record<string, unknown> = {
          total_records: items.length,
          orders_analyzed: orders.length,
          date_from,
          date_to: effectiveTo,
          is_complete,
        };
        if (!is_complete) {
          metadata.note = "Results based on first 500 orders — total may differ";
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ items, metadata }, null, 2) }],
        };
      } catch (error) {
        return handleSapoError(error);
      }
    },
  );
}
