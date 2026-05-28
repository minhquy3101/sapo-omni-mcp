import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { createSapoClient } from "../../utils/sapo-client.js";
import { handleSapoError, SapoNotFoundError, SapoValidationError } from "../../utils/sapo-error.js";
import { normalizePage } from "../../utils/pagination.js";
import { isDryRun, buildDryRunResult } from "../../utils/dry-run.js";
import type { SapoCustomer, SapoOrder } from "../../types/sapo.js";

interface CustomersResponse {
  customers: SapoCustomer[];
}

interface CustomerResponse {
  customer: SapoCustomer;
}

interface OrdersResponse {
  orders: SapoOrder[];
}

interface CountResponse {
  count: number;
}

function customerFullName(c: SapoCustomer): string | null {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
}

function toListItem(c: SapoCustomer) {
  return {
    id: c.id,
    name: customerFullName(c),
    email: c.email,
    phone: c.phone,
    orders_count: c.orders_count ?? 0,
    total_spent: c.total_spent ?? "0",
  };
}

function toDetail(c: SapoCustomer, recentOrders: SapoOrder[] = [], recentOrdersError?: string) {
  const capped = recentOrders.length === 10;
  const metadata: Record<string, unknown> = { recent_orders_capped: capped };
  if (recentOrdersError) metadata.recent_orders_error = recentOrdersError;
  return {
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    phone: c.phone,
    orders_count: c.orders_count ?? 0,
    total_spent: c.total_spent ?? "0",
    addresses: (c.addresses ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      address1: a.address1,
      address2: a.address2,
      city: a.city,
      province: a.province,
      country: a.country,
      zip: a.zip,
      phone: a.phone,
      is_default: a.default,
    })),
    recent_orders: recentOrders.map((o) => ({
      order_id: o.id,
      created_on: o.created_on,
      total_price: o.total_price,
      status: o.status,
      fulfillment_status: o.fulfillment_status,
      line_item_count: o.line_items.length,
    })),
    metadata,
  };
}

export function registerCustomerTools(server: McpServer, config: Config) {
  const client = createSapoClient(config);

  // ── Story 4.1: Read operations ─────────────────────────────────────────────

  server.tool(
    "list_customers",
    "List customers with optional filters. Returns paginated summary with name, email, phone, order count, and total spent.",
    {
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(250).default(20),
    },
    async ({ name, email, phone, page, limit }) => {
      try {
        const filterParams: Record<string, unknown> = {};
        if (name) filterParams.name = name;
        if (email) filterParams.email = email;
        if (phone) filterParams.phone = phone;

        const [listRes, countRes] = await Promise.all([
          client.get<CustomersResponse>("/customers.json", {
            params: { ...filterParams, page, limit },
          }),
          client.get<CountResponse>("/customers/count.json", { params: filterParams }),
        ]);

        const paginated = normalizePage(
          listRes.data.customers.map(toListItem),
          { page, limit },
          countRes.data.count,
        );
        return { content: [{ type: "text", text: JSON.stringify(paginated, null, 2) }] };
      } catch (error) {
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "count_customers",
    "Count customers matching optional filters.",
    {
      email: z.string().optional(),
      name: z.string().optional(),
      phone: z.string().optional(),
    },
    async ({ email, name, phone }) => {
      try {
        const params: Record<string, unknown> = {};
        if (email) params.email = email;
        if (name) params.name = name;
        if (phone) params.phone = phone;

        const { data } = await client.get<CountResponse>("/customers/count.json", { params });
        return { content: [{ type: "text", text: JSON.stringify({ count: data.count }, null, 2) }] };
      } catch (error) {
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "get_customer",
    "Get full customer profile including all saved addresses, order summary, and recent orders.",
    { customer_id: z.number().int().positive() },
    async ({ customer_id }) => {
      const [customerResult, ordersResult] = await Promise.allSettled([
        client.get<CustomerResponse>(`/customers/${customer_id}.json`),
        client.get<OrdersResponse>("/orders.json", {
          params: { customer_id, page: 1, limit: 10 },
        }),
      ]);

      if (customerResult.status === "rejected") {
        const err = customerResult.reason as Error;
        if (err instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Customer not found" }] };
        }
        return handleSapoError(err);
      }

      const recentOrders =
        ordersResult.status === "fulfilled"
          ? (ordersResult.value.data.orders ?? [])
          : [];
      const recentOrdersError =
        ordersResult.status === "rejected"
          ? (ordersResult.reason as Error).message
          : undefined;

      return {
        content: [{ type: "text", text: JSON.stringify(toDetail(customerResult.value.data.customer, recentOrders, recentOrdersError), null, 2) }],
      };
    },
  );

  // ── Story 4.2: Create & Update ─────────────────────────────────────────────

  server.tool(
    "create_customer",
    "Create a new customer. Requires at least one of: email, first_name, last_name. Detects duplicate emails.",
    {
      email: z.string().email().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      phone: z.string().optional(),
      note: z.string().optional(),
    },
    async ({ email, first_name, last_name, phone, note }) => {
      if (!email && !first_name && !last_name) {
        return {
          content: [{ type: "text", text: "Error: Customer must have at least one of: email, first_name, last_name" }],
        };
      }

      try {
        const payload: Record<string, unknown> = {};
        if (email) payload.email = email;
        if (first_name) payload.first_name = first_name;
        if (last_name) payload.last_name = last_name;
        if (phone) payload.phone = phone;
        if (note) payload.note = note;

        const { data } = await client.post<CustomerResponse>("/customers.json", { customer: payload });
        return { content: [{ type: "text", text: JSON.stringify(toDetail(data.customer), null, 2) }] };
      } catch (error) {
        if (error instanceof SapoValidationError && email) {
          try {
            const { data } = await client.get<CustomersResponse>("/customers.json", {
              params: { email, limit: 1 },
            });
            if (data.customers.length > 0) {
              const existing = data.customers[0];
              return {
                content: [{
                  type: "text",
                  text: `Error: A customer with this email already exists (ID: ${existing.id}). Consider using update_customer instead.`,
                }],
              };
            }
          } catch {
            // fall through to generic error
          }
        }
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "update_customer",
    "Update customer contact info or tags. Only provided fields are modified. Warns if new email is already used by another customer. tags is a comma-separated string.",
    {
      customer_id: z.number().int().positive(),
      email: z.string().email().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      phone: z.string().optional(),
      note: z.string().optional(),
      tags: z.string().optional(),
    },
    async ({ customer_id, email, first_name, last_name, phone, note, tags }) => {
      const payload: Record<string, unknown> = {};
      if (email !== undefined) payload.email = email;
      if (first_name !== undefined) payload.first_name = first_name;
      if (last_name !== undefined) payload.last_name = last_name;
      if (phone !== undefined) payload.phone = phone;
      if (note !== undefined) payload.note = note;
      if (tags !== undefined) payload.tags = tags;

      if (Object.keys(payload).length === 0) {
        return { content: [{ type: "text", text: "Error: No fields provided to update" }] };
      }

      let emailWarning: string | null = null;
      if (email) {
        try {
          const { data } = await client.get<CustomersResponse>("/customers.json", {
            params: { email, limit: 1 },
          });
          const conflict = data.customers.find((c) => c.id !== customer_id);
          if (conflict) {
            emailWarning = `Warning: ${email} is already used by customer ID ${conflict.id}. Update saved.`;
          }
        } catch {
          // ignore pre-check failure, proceed with update
        }
      }

      try {
        const { data } = await client.put<CustomerResponse>(`/customers/${customer_id}.json`, {
          customer: payload,
        });
        const result = toDetail(data.customer);
        if (emailWarning) {
          return {
            content: [{ type: "text", text: JSON.stringify({ ...result, warning: emailWarning }, null, 2) }],
          };
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Customer not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  // ── Story 4.3: Delete ──────────────────────────────────────────────────────

  server.tool(
    "delete_customer",
    "Permanently delete a customer. Use dry_run: true (default) to preview before deleting. Fails if customer has existing orders.",
    {
      customer_id: z.number().int().positive(),
      dry_run: z.boolean().default(true),
    },
    async ({ customer_id, dry_run }) => {
      try {
        const { data } = await client.get<CustomerResponse>(`/customers/${customer_id}.json`);
        const c = data.customer;

        if (isDryRun({ dry_run })) {
          return buildDryRunResult({
            action: "DELETE",
            endpoint: `/customers/${customer_id}.json`,
            would_affect: {
              customer_id,
              name: customerFullName(c) ?? "(no name)",
              email: c.email,
              orders_count: c.orders_count ?? 0,
              warning: "This action is permanent and cannot be undone.",
            },
          });
        }

        const ordersCount = c.orders_count ?? 0;
        if (ordersCount > 0) {
          return {
            content: [{
              type: "text",
              text: `Error: Cannot delete customer — they have ${ordersCount} existing orders. Archive or reassign orders before deleting.`,
            }],
          };
        }

        await client.delete(`/customers/${customer_id}.json`);
        return {
          content: [{ type: "text", text: JSON.stringify({ deleted: true, customer_id }, null, 2) }],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Customer not found" }] };
        }
        if (error instanceof SapoValidationError) {
          return {
            content: [{
              type: "text",
              text: "Error: Cannot delete customer — they have existing orders. Archive or reassign orders before deleting.",
            }],
          };
        }
        return handleSapoError(error);
      }
    },
  );
}
