# SAPO Omni MCP

MCP Server cung cấp tools để Claude tương tác với SAPO platform (sản phẩm, đơn hàng, khách hàng, kho hàng, đa kênh).

## Lệnh thường dùng

```bash
npm run dev          # Chạy dev với hot reload (tsx watch)
npm run build        # Build TypeScript → dist/
npm run typecheck    # Kiểm tra type errors
npm test             # Chạy toàn bộ tests
npm run lint         # ESLint
```

## Cấu trúc

- `src/tools/` — MCP tools nhóm theo domain (products, orders, customers, inventory, channels)
- `src/resources/` — MCP resources (store-info, ...)
- `src/prompts/` — MCP prompt templates
- `src/types/sapo.ts` — TypeScript types cho SAPO API responses
- `src/utils/sapo-client.ts` — Axios client có sẵn auth
- `src/config/` — Load và validate env vars qua Zod

## Quy ước code

- Mỗi domain tool group có file `src/tools/<domain>/index.ts` export `register<Domain>Tools(server, config)`
- Dùng Zod để validate tất cả input schema của tools
- Không dùng `any` — strict TypeScript
- Test file đặt cạnh source: `src/tools/products/products.test.ts`

## Lưu ý SAPO API

- Base URL: `/admin/` (không có `/api/`)
- `shop.json` bị 403 — Private App chưa cấp quyền "Store info" (cần bật trong SAPO Admin → Apps)
- Các endpoint hoạt động: products, orders, customers, inventory_levels, locations

## Env vars

Xem `.env.example`. Copy thành `.env` để chạy local.
