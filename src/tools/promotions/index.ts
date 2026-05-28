import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../config/index.js";
import { createSapoClient } from "../../utils/sapo-client.js";
import { handleSapoError, SapoNotFoundError, SapoValidationError } from "../../utils/sapo-error.js";
import { normalizePage } from "../../utils/pagination.js";
import { isDryRun, buildDryRunResult } from "../../utils/dry-run.js";
import type { SapoPriceRule, SapoDiscountCode } from "../../types/sapo.js";
import { ISO8601_DATE } from "../../utils/iso8601.js";

interface PriceRulesResponse {
  price_rules: SapoPriceRule[];
}

interface PriceRuleResponse {
  price_rule: SapoPriceRule;
}

interface CountResponse {
  count: number;
}

interface DiscountCodesResponse {
  discount_codes: SapoDiscountCode[];
}

interface DiscountCodeResponse {
  discount_code: SapoDiscountCode;
}

const DISCOUNT_TYPES = ["percentage", "fixed_amount", "fixed_price", "free_shipping"] as const;

const NO_EXPIRY_WARNING =
  "⚠️ No end date set — this promotion will run indefinitely until manually deleted.";

function toListItem(r: SapoPriceRule) {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    discount_type: r.discount_type,
    value: r.value,
    starts_on: r.starts_on,
    ends_on: r.ends_on,
    no_expiry: r.ends_on === null,
    times_used: r.times_used,
    usage_limit: r.usage_limit,
  };
}

function toDetail(r: SapoPriceRule) {
  return {
    ...toListItem(r),
    prerequisite_product_ids: r.prerequisite_product_ids,
    prerequisite_collection_ids: r.prerequisite_collection_ids,
    entitled_product_ids: r.entitled_product_ids,
    entitled_collection_ids: r.entitled_collection_ids,
    created_on: r.created_on,
    modified_on: r.modified_on,
  };
}

export function registerPromotionTools(server: McpServer, config: Config) {
  const client = createSapoClient(config);

  // ── Story 5.1: Price Rule Read operations ──────────────────────────────────

  server.tool(
    "list_price_rules",
    "List price rules with optional filters. Rules with no end date are flagged as no_expiry: true.",
    {
      status: z.enum(["enabled", "disabled"]).optional(),
      discount_type: z.enum(DISCOUNT_TYPES).optional(),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(250).default(20),
    },
    async ({ status, discount_type, page, limit }) => {
      try {
        const filterParams: Record<string, unknown> = {};
        if (status) filterParams.status = status;
        if (discount_type) filterParams.discount_type = discount_type;

        const [listRes, countRes] = await Promise.all([
          client.get<PriceRulesResponse>("/price_rules.json", {
            params: { ...filterParams, page, limit },
          }),
          client.get<CountResponse>("/price_rules/count.json", { params: filterParams }),
        ]);

        const paginated = normalizePage(
          listRes.data.price_rules.map(toListItem),
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
    "count_price_rules",
    "Count price rules matching optional status filter.",
    {
      status: z.enum(["enabled", "disabled"]).optional(),
    },
    async ({ status }) => {
      try {
        const params: Record<string, unknown> = {};
        if (status) params.status = status;

        const { data } = await client.get<CountResponse>("/price_rules/count.json", { params });
        return { content: [{ type: "text", text: JSON.stringify({ count: data.count }, null, 2) }] };
      } catch (error) {
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "get_price_rule",
    "Get full configuration of a price rule including applicable products/collections and all date fields.",
    { price_rule_id: z.number().int().positive() },
    async ({ price_rule_id }) => {
      try {
        const { data } = await client.get<PriceRuleResponse>(`/price_rules/${price_rule_id}.json`);
        return {
          content: [{ type: "text", text: JSON.stringify(toDetail(data.price_rule), null, 2) }],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Price rule not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  // ── Story 5.2: Price Rule Create & Update ──────────────────────────────────

  server.tool(
    "create_price_rule",
    "Create a price rule (promotion). No idempotency key — calling twice creates two identical rules. Always call list_price_rules first and check for existing rules with matching SKUs and overlapping time window before creating.",
    {
      title: z.string().min(1),
      discount_type: z.enum(DISCOUNT_TYPES, {
        errorMap: () => ({
          message: "discount_type must be one of: percentage, fixed_amount, fixed_price, free_shipping",
        }),
      }),
      value: z.number(),
      start_date: ISO8601_DATE,
      end_date: ISO8601_DATE.optional(),
      usage_limit: z.number().int().positive().optional(),
    },
    async ({ title, discount_type, value, start_date, end_date, usage_limit }) => {
      try {
        const payload: Record<string, unknown> = {
          title,
          discount_type,
          value,
          starts_on: start_date,
        };
        if (end_date) payload.ends_on = end_date;
        if (usage_limit !== undefined) payload.usage_limit = usage_limit;

        const { data } = await client.post<PriceRuleResponse>("/price_rules.json", {
          price_rule: payload,
        });
        const result = toDetail(data.price_rule);

        if (!end_date) {
          return {
            content: [{ type: "text", text: JSON.stringify({ ...result, warning: NO_EXPIRY_WARNING }, null, 2) }],
          };
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "update_price_rule",
    "Update a price rule's title, value, dates, or usage limit. discount_type is immutable after creation.",
    {
      price_rule_id: z.number().int().positive(),
      title: z.string().min(1).optional(),
      value: z.number().optional(),
      discount_type: z.string().optional(),
      start_date: ISO8601_DATE.optional(),
      end_date: ISO8601_DATE.optional(),
      usage_limit: z.number().int().positive().optional(),
    },
    async ({ price_rule_id, title, value, discount_type, start_date, end_date, usage_limit }) => {
      if (discount_type !== undefined) {
        return {
          content: [{
            type: "text",
            text: "Error: discount_type is immutable after creation and cannot be changed",
          }],
        };
      }

      const payload: Record<string, unknown> = {};
      if (title !== undefined) payload.title = title;
      if (value !== undefined) payload.value = value;
      if (start_date !== undefined) payload.starts_on = start_date;
      if (end_date !== undefined) payload.ends_on = end_date;
      if (usage_limit !== undefined) payload.usage_limit = usage_limit;

      if (Object.keys(payload).length === 0) {
        return { content: [{ type: "text", text: "Error: No fields provided to update" }] };
      }

      try {
        const { data } = await client.put<PriceRuleResponse>(`/price_rules/${price_rule_id}.json`, {
          price_rule: payload,
        });
        return { content: [{ type: "text", text: JSON.stringify(toDetail(data.price_rule), null, 2) }] };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Price rule not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  // ── Story 5.3: Price Rule Delete (Cascading) ───────────────────────────────

  server.tool(
    "delete_price_rule",
    "Delete a price rule and ALL associated discount codes. Use dry_run: true (default) to preview cascade impact before deleting.",
    {
      price_rule_id: z.number().int().positive(),
      dry_run: z.boolean().default(true),
    },
    async ({ price_rule_id, dry_run }) => {
      try {
        const [ruleRes, codeCountRes] = await Promise.all([
          client.get<PriceRuleResponse>(`/price_rules/${price_rule_id}.json`),
          client.get<CountResponse>(`/price_rules/${price_rule_id}/discount_codes/count.json`),
        ]);

        const rule = ruleRes.data.price_rule;
        const codeCount = codeCountRes.data.count;

        if (isDryRun({ dry_run })) {
          return buildDryRunResult({
            action: "DELETE",
            endpoint: `/price_rules/${price_rule_id}.json`,
            would_affect: {
              price_rule_id,
              title: rule.title,
              discount_type: rule.discount_type,
              value: rule.value,
              discount_codes_count: codeCount,
              warning: `Deleting this rule will also permanently delete ${codeCount} associated discount codes.`,
            },
          });
        }

        await client.delete(`/price_rules/${price_rule_id}.json`);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(
              { deleted: true, price_rule_id, title: rule.title, discount_codes_deleted: codeCount },
              null,
              2,
            ),
          }],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Price rule not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  // ── Story 5.4: Discount Codes CRUD ─────────────────────────────────────────

  server.tool(
    "list_discount_codes",
    "List all discount codes attached to a price rule with usage counts.",
    {
      price_rule_id: z.number().int().positive(),
    },
    async ({ price_rule_id }) => {
      try {
        const { data } = await client.get<DiscountCodesResponse>(
          `/price_rules/${price_rule_id}/discount_codes.json`,
        );
        const codes = data.discount_codes.map((c) => ({
          id: c.id,
          code: c.code,
          usage_count: c.usage_count,
          created_on: c.created_on,
        }));
        return { content: [{ type: "text", text: JSON.stringify(codes, null, 2) }] };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Price rule not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "create_discount_code",
    "Create a new discount code under a price rule.",
    {
      price_rule_id: z.number().int().positive(),
      code: z.string().min(1),
    },
    async ({ price_rule_id, code }) => {
      try {
        const { data } = await client.post<DiscountCodeResponse>(
          `/price_rules/${price_rule_id}/discount_codes.json`,
          { discount_code: { code } },
        );
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ id: data.discount_code.id, code: data.discount_code.code }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof SapoValidationError) {
          return {
            content: [{
              type: "text",
              text: `Error: Discount code '${code}' already exists under this price rule`,
            }],
          };
        }
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Price rule not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "update_discount_code",
    "Update the code string of an existing discount code.",
    {
      price_rule_id: z.number().int().positive(),
      code_id: z.number().int().positive(),
      code: z.string().min(1),
    },
    async ({ price_rule_id, code_id, code }) => {
      try {
        const { data } = await client.put<DiscountCodeResponse>(
          `/price_rules/${price_rule_id}/discount_codes/${code_id}.json`,
          { discount_code: { code } },
        );
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ id: data.discount_code.id, code: data.discount_code.code }, null, 2),
          }],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Discount code not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );

  server.tool(
    "delete_discount_code",
    "Delete a specific discount code without affecting the parent price rule.",
    {
      price_rule_id: z.number().int().positive(),
      code_id: z.number().int().positive(),
    },
    async ({ price_rule_id, code_id }) => {
      try {
        await client.delete(`/price_rules/${price_rule_id}/discount_codes/${code_id}.json`);
        return {
          content: [{ type: "text", text: JSON.stringify({ deleted: true, code_id }, null, 2) }],
        };
      } catch (error) {
        if (error instanceof SapoNotFoundError) {
          return { content: [{ type: "text", text: "Error: Discount code not found" }] };
        }
        return handleSapoError(error);
      }
    },
  );
}
