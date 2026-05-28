# SAPO Omni MCP

MCP Server cho phép Claude AI tương tác trực tiếp với SAPO platform — quản lý sản phẩm, đơn hàng, khách hàng, kho hàng, khuyến mãi và vận chuyển qua hội thoại tự nhiên.

> Xây dựng trên [Model Context Protocol (MCP)](https://modelcontextprotocol.io) — chuẩn mở để kết nối AI với các hệ thống bên ngoài.

---

## Yêu cầu

- [Node.js](https://nodejs.org) v20 trở lên
- Tài khoản SAPO và **Private App** có API Key + Secret
- [Claude Desktop](https://claude.ai/download) hoặc [Claude Code](https://claude.ai/code)

---

## Cài đặt

```bash
# 1. Clone repo
git clone https://github.com/minhquy3101/sapo-omni-mcp.git
cd sapo-omni-mcp

# 2. Cài dependencies
npm install

# 3. Build
npm run build
```

---

## Lấy API Key từ SAPO

1. Đăng nhập **SAPO Admin** → **Apps** → **Private Apps**
2. Tạo Private App mới
3. Cấp quyền cho các resource cần thiết (Products, Orders, Customers, Inventory, v.v.)
4. Lưu lại **API Key** và **API Secret**

---

## Cấu hình

### Claude Desktop

Mở file `claude_desktop_config.json` (thường ở `~/Library/Application Support/Claude/` trên macOS hoặc `%APPDATA%\Claude\` trên Windows) và thêm:

```json
{
  "mcpServers": {
    "sapo-omni": {
      "command": "node",
      "args": ["C:/absolute/path/to/sapo-omni-mcp/dist/index.js"],
      "env": {
        "SAPO_API_KEY": "your_api_key",
        "SAPO_API_SECRET": "your_api_secret",
        "SAPO_STORE_URL": "https://yourstore.mysapo.vn"
      }
    }
  }
}
```

### Claude Code

Thêm vào `.claude/mcp_servers.json` trong thư mục project hoặc chạy:

```bash
claude mcp add sapo-omni \
  --env SAPO_API_KEY=your_api_key \
  --env SAPO_API_SECRET=your_api_secret \
  --env SAPO_STORE_URL=https://yourstore.mysapo.vn \
  -- node /absolute/path/to/sapo-omni-mcp/dist/index.js
```

---

## Ví dụ sử dụng

Sau khi cài đặt, bạn có thể nói chuyện với Claude bằng tiếng Việt:

- _"Cho tôi xem danh sách 10 sản phẩm đang active"_
- _"Tìm đơn hàng của khách Nguyễn Văn A"_
- _"Cập nhật tồn kho SKU ABC123 lên 50"_
- _"Tạo mã giảm giá SUMMER20 giảm 20% cho đơn từ 500k"_
- _"Doanh thu tuần này bao nhiêu?"_

---

## Danh sách Tools

### Sản phẩm (7 tools)

| Tool | Mô tả |
|------|-------|
| `list_products` | Danh sách sản phẩm — phân trang, lọc theo status |
| `get_product` | Chi tiết sản phẩm: variants, SKU, giá, hình ảnh |
| `count_products` | Đếm tổng sản phẩm theo status |
| `search_products_by_sku` | Tìm sản phẩm theo mã SKU |
| `create_product` | Tạo sản phẩm mới với variants |
| `update_product` | Cập nhật tên, status sản phẩm |
| `delete_product` | Xóa sản phẩm (có dry_run an toàn) |

### Đơn hàng (10 tools)

| Tool | Mô tả |
|------|-------|
| `list_orders` | Danh sách đơn hàng — lọc theo status, ngày, khách hàng |
| `count_orders` | Đếm đơn hàng theo bộ lọc |
| `get_order` | Chi tiết đơn hàng: line items, địa chỉ, fulfillment |
| `create_order` | Tạo đơn hàng mới |
| `update_order` | Cập nhật ghi chú, địa chỉ đơn hàng |
| `fulfill_order` | Xác nhận giao hàng, thêm mã vận đơn |
| `cancel_order` | Hủy đơn hàng |
| `archive_order` | Lưu trữ đơn hàng đã xong |
| `unarchive_order` | Khôi phục đơn hàng khỏi lưu trữ |
| `delete_order` | Xóa đơn hàng (có dry_run an toàn) |

### Hoàn tiền & Giao dịch (3 tools)

| Tool | Mô tả |
|------|-------|
| `list_refunds` | Danh sách hoàn tiền của một đơn hàng |
| `create_refund` | Tạo yêu cầu hoàn tiền |
| `list_transactions` | Lịch sử giao dịch thanh toán của đơn hàng |

### Khách hàng (6 tools)

| Tool | Mô tả |
|------|-------|
| `list_customers` | Danh sách khách hàng — tìm theo tên, email, SĐT |
| `count_customers` | Đếm tổng khách hàng |
| `get_customer` | Chi tiết khách hàng và lịch sử đơn hàng |
| `create_customer` | Tạo khách hàng mới |
| `update_customer` | Cập nhật thông tin khách hàng |
| `delete_customer` | Xóa khách hàng (có dry_run an toàn) |

### Kho hàng (7 tools)

| Tool | Mô tả |
|------|-------|
| `list_inventory_levels` | Tồn kho theo variant và location |
| `get_inventory_item` | Thông tin inventory item (SKU, barcode, tracking) |
| `connect_inventory_item` | Kết nối inventory item với location |
| `update_inventory_item` | Cập nhật thông tin inventory item |
| `adjust_inventory` | Điều chỉnh tồn kho tương đối (±) |
| `set_inventory_level` | Đặt tồn kho tuyệt đối cho một variant |
| `set_inventory_levels_multi` | Đặt tồn kho cho nhiều variants cùng lúc |

### Khuyến mãi (10 tools)

| Tool | Mô tả |
|------|-------|
| `list_price_rules` | Danh sách chương trình khuyến mãi |
| `count_price_rules` | Đếm số chương trình khuyến mãi |
| `get_price_rule` | Chi tiết một chương trình khuyến mãi |
| `create_price_rule` | Tạo chương trình khuyến mãi mới |
| `update_price_rule` | Cập nhật chương trình khuyến mãi |
| `delete_price_rule` | Xóa chương trình khuyến mãi |
| `list_discount_codes` | Danh sách mã giảm giá của một chương trình |
| `create_discount_code` | Tạo mã giảm giá mới |
| `update_discount_code` | Cập nhật mã giảm giá |
| `delete_discount_code` | Xóa mã giảm giá |

### Báo cáo (3 tools)

| Tool | Mô tả |
|------|-------|
| `order_status_summary` | Tổng hợp trạng thái đơn hàng theo khoảng thời gian |
| `revenue_summary` | Doanh thu, giá trị trung bình đơn, số đơn theo ngày |
| `top_products_by_revenue` | Top sản phẩm theo doanh thu trong kỳ |

> **Lưu ý về báo cáo:** Các tools báo cáo tổng hợp raw data từ API SAPO (SAPO không có analytics endpoint riêng). Với cửa hàng có lượng đơn lớn (> 25.000 đơn/kỳ), kết quả có thể bị giới hạn — tool sẽ cảnh báo khi dữ liệu không đầy đủ.

### Dịch vụ vận chuyển (2 tools)

| Tool | Mô tả |
|------|-------|
| `list_carrier_services` | Danh sách đơn vị vận chuyển đã cấu hình |
| `get_carrier_service` | Chi tiết một đơn vị vận chuyển |

### Cửa hàng (1 tool)

| Tool | Mô tả |
|------|-------|
| `get_store` | Thông tin cửa hàng: tên, địa chỉ, múi giờ, tiền tệ |

---

## Biến môi trường

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `SAPO_API_KEY` | Có | API Key của Private App |
| `SAPO_API_SECRET` | Có | API Secret của Private App |
| `SAPO_STORE_URL` | Có | URL cửa hàng, ví dụ `https://mystore.mysapo.vn` |
| `MCP_SERVER_NAME` | Không | Tên server (mặc định: `sapo-omni-mcp`) |
| `LOG_LEVEL` | Không | Mức log: `info`, `debug`, `error` (mặc định: `info`) |

Xem [`.env.example`](.env.example) để tham khảo.

---

## Phát triển

```bash
npm run dev          # Chạy dev với hot reload
npm run build        # Build TypeScript → dist/
npm run typecheck    # Kiểm tra type errors
npm test             # Chạy unit tests (171 tests)
npm run test:integration  # Chạy integration tests (cần .env thật)
npm run lint         # ESLint
```

---

## License

[MIT](LICENSE)
