import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { createSapoClient } from "../../utils/sapo-client.js";
import { handleSapoError, SapoNotFoundError } from "../../utils/sapo-error.js";
import type { SapoTransaction } from "../../types/sapo.js";

interface TransactionsResponse {
  transactions: SapoTransaction[];
}

function toTransactionItem(t: SapoTransaction) {
  return {
    transaction_id: t.id,
    kind: t.kind,
    status: t.status,
    amount: t.amount,
    currency: t.currency,
    gateway: t.gateway,
    created_on: t.created_on,
    error_code: t.error_code ?? null,
  };
}

export function registerTransactionTools(server: McpServer, config: Config) {
  const client = createSapoClient(config);

  server.tool(
    "list_transactions",
    "List payment transactions on an order. Returns sale, refund, void, and capture events forming the payment timeline.",
    {
      order_id: z.number().int().positive(),
    },
    async ({ order_id }) => {
      try {
        const { data } = await client.get<TransactionsResponse>(
          `/orders/${order_id}/transactions.json`,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data.transactions.map(toTransactionItem), null, 2),
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
