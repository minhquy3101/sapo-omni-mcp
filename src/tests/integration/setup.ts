import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { beforeAll, afterEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): unknown {
  const raw = readFileSync(join(__dirname, "fixtures", name), "utf-8");
  return JSON.parse(raw);
}

export const TEST_STORE_URL = "https://test.mysapo.net";
const BASE = `${TEST_STORE_URL}/admin`;

const ordersListFixture = loadFixture("orders-list.json") as unknown[];
const orderDetailFixture = loadFixture("order-detail.json");
const orderCreatedFixture = loadFixture("order-created.json");
const productsListFixture = loadFixture("products-list.json") as unknown[];
const customerDetailFixture = loadFixture("customer-detail.json");
const customerOrdersFixture = loadFixture("customer-orders.json") as unknown[];
const inventoryLevelsFixture = loadFixture("inventory-levels.json") as unknown[];
const inventoryItemsFixture = loadFixture("inventory-items.json") as unknown[];
const locationsFixture = loadFixture("locations.json") as unknown[];
const promotionsListFixture = loadFixture("promotions-list.json") as unknown[];
const promotionDetailFixture = loadFixture("promotion-detail.json");

export const mswServer = setupServer(
  // Orders list + count
  http.get(`${BASE}/orders.json`, ({ request }) => {
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customer_id");
    if (customerId === "5001") {
      return HttpResponse.json({ orders: customerOrdersFixture });
    }
    return HttpResponse.json({ orders: ordersListFixture });
  }),
  http.get(`${BASE}/orders/count.json`, () =>
    HttpResponse.json({ count: ordersListFixture.length }),
  ),

  // Order detail by id — 1001 returns detail, anything else → 404
  http.get(`${BASE}/orders/:id.json`, ({ params }) => {
    if (String(params.id) === "1001") {
      return HttpResponse.json({ order: orderDetailFixture });
    }
    return new HttpResponse(null, { status: 404 });
  }),

  // Create order (POST)
  http.post(`${BASE}/orders.json`, () =>
    HttpResponse.json({ order: orderCreatedFixture }, { status: 201 }),
  ),

  // Products list + count
  http.get(`${BASE}/products.json`, () =>
    HttpResponse.json({ products: productsListFixture }),
  ),
  http.get(`${BASE}/products/count.json`, () =>
    HttpResponse.json({ count: productsListFixture.length }),
  ),

  // Customer detail — 5001 returns fixture, else → 404
  http.get(`${BASE}/customers/:id.json`, ({ params }) => {
    if (String(params.id) === "5001") {
      return HttpResponse.json({ customer: customerDetailFixture });
    }
    return new HttpResponse(null, { status: 404 });
  }),

  // Customers list + count (for list_customers)
  http.get(`${BASE}/customers.json`, () =>
    HttpResponse.json({ customers: [customerDetailFixture] }),
  ),
  http.get(`${BASE}/customers/count.json`, () =>
    HttpResponse.json({ count: 1 }),
  ),

  // Locations
  http.get(`${BASE}/locations.json`, () =>
    HttpResponse.json({ locations: locationsFixture }),
  ),

  // Inventory levels + items
  http.get(`${BASE}/inventory_levels.json`, () =>
    HttpResponse.json({ inventory_levels: inventoryLevelsFixture }),
  ),
  http.get(`${BASE}/inventory_items.json`, () =>
    HttpResponse.json({ inventory_items: inventoryItemsFixture }),
  ),

  // Promotions (price rules) list + count + detail
  http.get(`${BASE}/price_rules.json`, () =>
    HttpResponse.json({ price_rules: promotionsListFixture }),
  ),
  http.get(`${BASE}/price_rules/count.json`, () =>
    HttpResponse.json({ count: promotionsListFixture.length }),
  ),
  http.get(`${BASE}/price_rules/:id.json`, ({ params }) => {
    if (String(params.id) === "9001") {
      return HttpResponse.json({ price_rule: promotionDetailFixture });
    }
    return new HttpResponse(null, { status: 404 });
  }),
);

beforeAll(() => mswServer.listen({ onUnhandledRequest: "warn" }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
