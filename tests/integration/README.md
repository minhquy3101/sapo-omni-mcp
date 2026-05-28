# Integration Tests

## Overview

These tests verify tool handler behavior end-to-end against msw (Mock Service Worker) fixtures that simulate the SAPO API. They complement unit tests by testing the full tool lifecycle: input validation → HTTP call → response mapping.

## How fixtures work

Fixtures are **hand-crafted JSON files** located at `src/tests/integration/fixtures/`. They are NOT recorded from live API calls. This means:

- Fixtures may diverge from the actual SAPO API response format if SAPO updates their schema.
- When the SAPO API changes a response shape, update the relevant fixture file manually.
- When adding a new tool that uses a new endpoint, add a corresponding fixture and handler in `src/tests/integration/setup.ts`.

| Fixture file | Endpoint simulated |
|---|---|
| `orders-list.json` | `GET /admin/orders.json` |
| `order-detail.json` | `GET /admin/orders/1001.json` |
| `order-created.json` | `POST /admin/orders.json` |
| `products-list.json` | `GET /admin/products.json` |
| `customer-detail.json` | `GET /admin/customers/5001.json` |
| `customer-orders.json` | `GET /admin/orders.json?customer_id=5001` |
| `inventory-levels.json` | `GET /admin/inventory_levels.json` |
| `inventory-items.json` | `GET /admin/inventory_items.json` |
| `locations.json` | `GET /admin/locations.json` |
| `promotions-list.json` | `GET /admin/price_rules.json` |
| `promotion-detail.json` | `GET /admin/price_rules/9001.json` |

## Running tests

```bash
# Unit tests only (does NOT run integration tests)
npm test

# Integration tests only (no live API required — uses msw fixtures)
npm run test:integration
```

## Running against a live SAPO store

Set these environment variables in `.env`:

```
SAPO_STORE_URL=https://yourstore.mysapo.net
SAPO_API_KEY=your_api_key
SAPO_API_SECRET=your_api_secret
```

When these are set, msw's `onUnhandledRequest: "warn"` mode allows real HTTP calls to pass through for any endpoint not covered by a fixture handler. Tests that rely on fixture data will still use the fixture; others will hit the live API.

## Permanently skipped tests

`cancel_order` integration test is permanently `.skip`:

> ⚠️ Skipped: triggers real money movement — manual test only

Do not unskip this test in CI. To test cancel_order manually, use a dedicated test order in a SAPO sandbox store.

## Adding new integration tests

1. Create fixture JSON file in `src/tests/integration/fixtures/<name>.json`
2. Load it in `src/tests/integration/setup.ts` with `loadFixture("<name>.json")`
3. Add an msw handler in `setupServer(...)` for the endpoint
4. Create `tests/integration/<domain>.test.ts` following the existing pattern
5. Run `npm run test:integration` to verify all tests pass
