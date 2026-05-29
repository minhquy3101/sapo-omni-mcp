# SAPO Omni MCP

[![npm version](https://img.shields.io/npm/v/sapo-omni-mcp)](https://www.npmjs.com/package/sapo-omni-mcp)
[![npm downloads](https://img.shields.io/npm/dm/sapo-omni-mcp)](https://www.npmjs.com/package/sapo-omni-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Phiên bản hiện tại: v0.2.0** — 51 tools · Node.js ≥ 20 · [Changelog](#changelog)

SAPO Omni MCP là MCP Server giúp trợ lý AI như Claude kết nối trực tiếp với SAPO Omni qua Admin API. Thay vì mở dashboard, nhớ endpoint hoặc viết script lặp lại, bạn có thể hỏi và thao tác bằng ngôn ngữ tự nhiên: xem đơn hàng, tra cứu sản phẩm, cập nhật tồn kho, tạo khách hàng, kiểm tra doanh thu hoặc tạo mã khuyến mãi.

Server được xây dựng trên [Model Context Protocol (MCP)](https://modelcontextprotocol.io), chuẩn mở giúp AI sử dụng công cụ bên ngoài một cách có cấu trúc và an toàn hơn.

## MCP này giúp gì?

- Quản lý vận hành nhanh hơn: hỏi Claude bằng tiếng Việt để lấy dữ liệu SAPO thay vì lọc thủ công trên nhiều màn hình.
- Hỗ trợ developer: thử nghiệm SAPO Admin API, kiểm tra dữ liệu thật và debug tích hợp mà không cần viết script riêng cho từng lần.
- Tự động hóa workflow: dùng AI như một bước trong quy trình xử lý đơn, tồn kho, khuyến mãi hoặc báo cáo.
- Giảm thao tác lặp lại: các tác vụ như kiểm tra SKU, cập nhật tồn kho, xem trạng thái đơn, tổng hợp doanh thu có thể thực hiện ngay trong hội thoại.

## Use case thực tế

Một số tình huống có thể dùng ngay sau khi cấu hình:

- Chăm sóc khách hàng: "Tìm đơn gần nhất của khách có số điện thoại 09xxxxxxxx và cho tôi biết trạng thái giao hàng."
- Kiểm kho: "Liệt kê các SKU còn dưới 10 sản phẩm tại kho chính."
- Cập nhật tồn kho: "Đặt tồn kho SKU ABC123 tại location 123456 về 50."
- Vận hành đơn hàng: "Cho tôi 20 đơn chưa fulfill được tạo hôm nay."
- Marketing: "Tạo mã giảm giá TET2026 giảm 15% cho đơn từ 500000, hết hạn cuối tháng."
- Báo cáo nhanh: "Doanh thu 7 ngày gần nhất là bao nhiêu, ngày nào cao nhất?"
- Kiểm tra dữ liệu sản phẩm: "Tìm sản phẩm theo SKU SP001 và cho tôi biết giá, trạng thái, tồn kho."
- Hỗ trợ kế toán hoặc đối soát: "Liệt kê giao dịch thanh toán của đơn hàng 123456789."

## Tính năng chính

SAPO Omni MCP hiện cung cấp 51 tools trên các nhóm nghiệp vụ:

| Nhóm | Khả năng |
|---|---|
| Cửa hàng | Xem thông tin cửa hàng, timezone, tiền tệ, địa chỉ |
| Sản phẩm | Danh sách, chi tiết, đếm, tìm theo SKU, tạo, cập nhật, xóa |
| Đơn hàng | Danh sách, chi tiết, tạo, cập nhật, fulfill, hủy, lưu trữ, khôi phục, xóa |
| Hoàn tiền và giao dịch | Xem refund, tạo refund, xem lịch sử giao dịch thanh toán |
| Khách hàng | Danh sách, tìm kiếm, chi tiết, tạo, cập nhật, xóa |
| Kho hàng | Xem inventory level, inventory item, kết nối location, cập nhật item, adjust/set tồn kho |
| Khuyến mãi | Quản lý price rules và discount codes |
| Báo cáo | Tổng hợp trạng thái đơn, doanh thu, top sản phẩm theo doanh thu |
| Vận chuyển | Xem carrier services đã cấu hình |

> Lưu ý: một số thao tác ghi có tác động thật lên dữ liệu SAPO, ví dụ hủy đơn, đặt tồn kho, tạo khuyến mãi hoặc xóa dữ liệu. Hãy kiểm tra kỹ prompt và quyền Private App trước khi dùng trên cửa hàng production.

## Yêu cầu

- [Node.js](https://nodejs.org) v20 trở lên
- Tài khoản SAPO có quyền tạo hoặc chỉnh sửa Private App
- API Key và API Secret của SAPO Private App
- [Claude Desktop](https://claude.ai/download) hoặc [Claude Code](https://claude.ai/code)

## Cài đặt nhanh với npx

Nếu package đã được publish lên npm, bạn không cần clone repo hoặc build thủ công. Claude có thể chạy server trực tiếp bằng `npx`:

```bash
npx -y sapo-omni-mcp
```

Khi dùng với MCP client, hãy truyền API key qua biến môi trường trong cấu hình Claude thay vì nhập trực tiếp trong terminal.

## Cài đặt từ source

Clone repo và build server:

```bash
git clone https://github.com/minhquy3101/sapo-omni-mcp.git
cd sapo-omni-mcp
npm install
npm run build
```

Kiểm tra nhanh server có build được:

```bash
npm run typecheck
npm test
```

## Tạo API Key trên SAPO

SAPO dùng Private App để cấp API Key và API Secret cho tích hợp qua Admin API. Theo tài liệu SAPO về [Ứng dụng riêng (Private Apps)](https://help.sapo.vn/ung-dung-rieng-private-apps), bạn tạo key như sau:

1. Đăng nhập trang quản trị SAPO.
2. Vào menu **Ứng dụng**.
3. Lướt tới phần **Bạn đang làm việc với nhà phát triển?** và chọn **Ứng dụng riêng**.
4. Chọn **Tạo ứng dụng riêng**.
5. Nhập **Tên ứng dụng** và **Email liên hệ**.
6. Cấp quyền cho các nhóm dữ liệu MCP cần dùng.
7. Chọn **Lưu**.
8. Sao chép **API Key** và **API Secret** sau khi ứng dụng được tạo.

Gợi ý quyền:

| Nhu cầu | Quyền nên cấp |
|---|---|
| Chỉ xem dữ liệu | Chọn **Chỉ đọc** cho Sản phẩm, Đơn hàng, Khách hàng, Khuyến mãi và các nhóm liên quan |
| Cho phép tạo/cập nhật | Chọn **Đọc và ghi** cho đúng nhóm cần thao tác |
| Dùng tool `get_store` | Cấp quyền đọc thông tin cửa hàng nếu SAPO hiển thị nhóm quyền này |
| An toàn production | Chỉ cấp quyền tối thiểu, tránh **Đọc và ghi** cho nhóm không dùng |

SAPO Private App sử dụng Basic Authentication với `API Key` và `API Secret`. MCP này nhận key qua biến môi trường và tự cấu hình xác thực khi gọi SAPO Admin API.

## Cấu hình biến môi trường

Bạn có thể tham khảo file [.env.example](.env.example):

```bash
SAPO_API_KEY=your_api_key
SAPO_API_SECRET=your_api_secret
SAPO_STORE_URL=https://yourstore.mysapo.net
MCP_SERVER_NAME=sapo-omni-mcp
LOG_LEVEL=info
```

Trong đó:

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `SAPO_API_KEY` | Có | API Key của Private App |
| `SAPO_API_SECRET` | Có | API Secret của Private App |
| `SAPO_STORE_URL` | Có | URL cửa hàng SAPO, ví dụ `https://yourstore.mysapo.net` |
| `MCP_SERVER_NAME` | Không | Tên server, mặc định `sapo-omni-mcp` |
| `LOG_LEVEL` | Không | Mức log: `info`, `debug`, `error` |

## Cấu hình Claude Desktop

Mở file cấu hình Claude Desktop:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### Dùng npx

```json
{
  "mcpServers": {
    "sapo-omni": {
      "command": "npx",
      "args": ["-y", "sapo-omni-mcp"],
      "env": {
        "SAPO_API_KEY": "your_api_key",
        "SAPO_API_SECRET": "your_api_secret",
        "SAPO_STORE_URL": "https://yourstore.mysapo.net",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Dùng source local

Nếu bạn clone repo và build local, dùng đường dẫn tuyệt đối tới file `dist/index.js`:

```json
{
  "mcpServers": {
    "sapo-omni": {
      "command": "node",
      "args": ["C:/absolute/path/to/sapo-omni-mcp/dist/index.js"],
      "env": {
        "SAPO_API_KEY": "your_api_key",
        "SAPO_API_SECRET": "your_api_secret",
        "SAPO_STORE_URL": "https://yourstore.mysapo.net",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

Sau đó khởi động lại Claude Desktop. Nếu cấu hình đúng, Claude sẽ thấy các tools của SAPO Omni MCP.

## Cấu hình Claude Code

### Dùng npx

```bash
claude mcp add sapo-omni \
  --env SAPO_API_KEY=your_api_key \
  --env SAPO_API_SECRET=your_api_secret \
  --env SAPO_STORE_URL=https://yourstore.mysapo.net \
  -- npx -y sapo-omni-mcp
```

### Dùng source local

```bash
claude mcp add sapo-omni \
  --env SAPO_API_KEY=your_api_key \
  --env SAPO_API_SECRET=your_api_secret \
  --env SAPO_STORE_URL=https://yourstore.mysapo.net \
  -- node /absolute/path/to/sapo-omni-mcp/dist/index.js
```

Hoặc thêm cấu hình tương đương vào file `.claude/mcp_servers.json` của project.

## Ví dụ prompt

Sau khi cài đặt xong, bạn có thể hỏi Claude:

```text
Cho tôi xem 10 sản phẩm active mới nhất.
```

```text
Tìm sản phẩm có SKU ABC123, trả về giá bán, variant id và tồn kho hiện tại.
```

```text
Cho tôi danh sách đơn hàng chưa giao được tạo từ hôm qua đến hôm nay.
```

```text
Tạo khách hàng mới tên Nguyễn Văn A, số điện thoại 09xxxxxxxx.
```

```text
Tổng hợp doanh thu từ 2026-05-01 đến 2026-05-07 theo từng ngày.
```

## Danh sách tools

### Cửa hàng

| Tool | Mô tả |
|---|---|
| `get_store` | Lấy thông tin cửa hàng: tên, địa chỉ, timezone, tiền tệ |

### Sản phẩm

| Tool | Mô tả |
|---|---|
| `list_products` | Danh sách sản phẩm, hỗ trợ phân trang và lọc |
| `get_product` | Chi tiết sản phẩm, variants, SKU, giá, hình ảnh |
| `count_products` | Đếm sản phẩm theo bộ lọc |
| `search_products_by_sku` | Tìm sản phẩm theo SKU |
| `create_product` | Tạo sản phẩm mới |
| `update_product` | Cập nhật sản phẩm |
| `delete_product` | Xóa sản phẩm |

### Đơn hàng

| Tool | Mô tả |
|---|---|
| `list_orders` | Danh sách đơn hàng theo trạng thái, ngày, khách hàng |
| `count_orders` | Đếm đơn hàng theo bộ lọc |
| `get_order` | Chi tiết đơn hàng, line items, địa chỉ, fulfillment |
| `create_order` | Tạo đơn hàng mới |
| `update_order` | Cập nhật thông tin đơn hàng |
| `fulfill_order` | Xác nhận giao hàng, thêm mã vận đơn |
| `cancel_order` | Hủy đơn hàng |
| `archive_order` | Lưu trữ đơn hàng |
| `unarchive_order` | Khôi phục đơn hàng khỏi lưu trữ |
| `delete_order` | Xóa đơn hàng |

### Hoàn tiền và giao dịch

| Tool | Mô tả |
|---|---|
| `list_refunds` | Danh sách hoàn tiền của một đơn hàng |
| `create_refund` | Tạo yêu cầu hoàn tiền |
| `list_transactions` | Lịch sử giao dịch thanh toán của đơn hàng |

### Khách hàng

| Tool | Mô tả |
|---|---|
| `list_customers` | Danh sách khách hàng, tìm theo tên, email, số điện thoại |
| `count_customers` | Đếm khách hàng |
| `get_customer` | Chi tiết khách hàng |
| `create_customer` | Tạo khách hàng mới |
| `update_customer` | Cập nhật khách hàng |
| `delete_customer` | Xóa khách hàng |

### Kho hàng

| Tool | Mô tả |
|---|---|
| `list_locations` | Danh sách kho/chi nhánh với id, tên, địa chỉ, trạng thái |
| `get_location` | Chi tiết một kho/chi nhánh theo id |
| `list_inventory_levels` | Tồn kho theo variant và location |
| `get_inventory_item` | Thông tin inventory item |
| `connect_inventory_item` | Kết nối inventory item với location |
| `update_inventory_item` | Cập nhật inventory item |
| `adjust_inventory` | Điều chỉnh tồn kho tương đối |
| `set_inventory_level` | Đặt tồn kho tuyệt đối cho một variant |
| `set_inventory_levels_multi` | Đặt tồn kho cho nhiều variant cùng lúc |

### Khuyến mãi

| Tool | Mô tả |
|---|---|
| `list_price_rules` | Danh sách chương trình khuyến mãi |
| `count_price_rules` | Đếm chương trình khuyến mãi |
| `get_price_rule` | Chi tiết chương trình khuyến mãi |
| `create_price_rule` | Tạo chương trình khuyến mãi |
| `update_price_rule` | Cập nhật chương trình khuyến mãi |
| `delete_price_rule` | Xóa chương trình khuyến mãi |
| `list_discount_codes` | Danh sách mã giảm giá |
| `create_discount_code` | Tạo mã giảm giá |
| `update_discount_code` | Cập nhật mã giảm giá |
| `delete_discount_code` | Xóa mã giảm giá |

### Báo cáo

| Tool | Mô tả |
|---|---|
| `order_status_summary` | Tổng hợp trạng thái đơn hàng theo khoảng thời gian |
| `revenue_summary` | Doanh thu, số đơn, giá trị trung bình đơn theo ngày |
| `top_products_by_revenue` | Top sản phẩm theo doanh thu trong kỳ |

Các tools báo cáo tổng hợp dữ liệu từ Admin API ở tầng MCP. Với cửa hàng có lượng đơn lớn, kết quả có thể bị giới hạn theo phân trang và rate limit của SAPO.

### Vận chuyển

| Tool | Mô tả |
|---|---|
| `list_carrier_services` | Danh sách đơn vị vận chuyển đã cấu hình |
| `get_carrier_service` | Chi tiết một đơn vị vận chuyển |

## Phát triển

```bash
npm run dev               # Chạy dev với tsx watch
npm run build             # Build TypeScript ra dist/
npm run start             # Chạy server đã build
npm run typecheck         # Kiểm tra TypeScript
npm test                  # Chạy unit tests
npm run test:integration  # Chạy integration tests, cần .env thật
npm run lint              # ESLint
```

## Bảo mật

- Không commit `.env` hoặc API Secret lên git.
- Tạo Private App riêng cho MCP, không dùng chung key với tích hợp khác.
- Cấp quyền tối thiểu theo nhu cầu thực tế.
- Với production, nên bắt đầu bằng quyền **Chỉ đọc**, sau đó mở dần quyền ghi cho nhóm nghiệp vụ thật sự cần.

## Changelog

### 0.2.0
- Fix `list_orders`: `status=any` truyền lên SAPO API trả về 0 kết quả — giờ bỏ qua param khi giá trị là `any` (tương đương lấy tất cả trạng thái)
- Fix `count_orders`: áp dụng cùng cách fix cho `status=any`

### 0.1.4
- Thêm version badge và thông tin phiên bản hiện tại vào đầu README

### 0.1.3
- Fix `create_price_rule` lỗi 422: field `starts_at`/`ends_at` đổi thành `starts_on`/`ends_on` đúng với SAPO API
- Fix `create_price_rule`: bỏ các fields không hợp lệ với SAPO API (`customer_selection`, `target_type`, `target_selection`, `allocation_method`)
- Fix `update_price_rule`: áp dụng cùng cách fix field date như trên

### 0.1.2
- Thêm `list_locations` — danh sách kho/chi nhánh với id, tên, địa chỉ, trạng thái active
- Thêm `get_location` — chi tiết một kho theo id
- Fix `list_inventory_levels(location_id)`: trước đây trả về rows của tất cả locations thay vì chỉ location được request

### 0.1.1
- Fix `get_customer.recent_orders` luôn trả về mảng rỗng: nguyên nhân là thiếu param `page=1` khi gọi SAPO orders API

### 0.1.0
- Release đầu tiên: 49 tools trên 8 nhóm nghiệp vụ (cửa hàng, sản phẩm, đơn hàng, khách hàng, kho hàng, khuyến mãi, báo cáo, vận chuyển)

## License

[MIT](LICENSE)
