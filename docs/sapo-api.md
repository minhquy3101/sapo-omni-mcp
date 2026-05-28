# SAPO API Reference

Tài liệu SAPO API chính thức: https://docs.sapo.vn/docs/api/admin-rest/overview/

## Base URL

```
https://{store}.mysapo.net/admin/{resource}.json
```

## Authentication

SAPO hỗ trợ 2 cách xác thực:

**1. HTTP Basic Auth** (Private App):
```
Authorization: Basic base64(api_key:api_secret)
```

**2. OAuth2** (Public App):
```
X-Sapo-Access-Token: {access_token}
```

OAuth2 token được tạo qua Partner Admin Panel. Mỗi application phải khai báo đúng access scopes cần thiết khi cài đặt.

## Rate Limits

SAPO dùng **leaky bucket algorithm**:

| Thông số | Giá trị |
|---|---|
| Bucket capacity | 40 requests / app / store |
| Leak rate | 2 requests/giây |
| Recommended rate | ~2 requests/giây |

Response header `X-Sapo-Api-Call-Limit` cho biết lượng request hiện tại so với giới hạn, ví dụ: `32/40`.

Mỗi app-store combination có bucket riêng — các app khác nhau không ảnh hưởng lẫn nhau.

Nếu nhận `429 Too Many Requests`: retry sau khoảng thời gian ghi trong `Retry-After` header.

## Pagination

Tất cả list endpoints hỗ trợ `page` và `limit` (max 250).

```
GET /admin/products.json?page=2&limit=50
```

## Data Format

- **JSON** cho toàn bộ request/response body (`Content-Type: application/json`)
- **DateTime**: ISO-8601 UTC, ví dụ `2024-03-05T03:20:29Z`
- **Số thập phân**: tự động làm tròn tối đa 3 chữ số thập phân cho trường quantity

## HTTP Status Codes

| Code | Ý nghĩa |
|---|---|
| `200` | Thành công |
| `201` | Tạo mới thành công |
| `401` | Chưa xác thực (token không hợp lệ) |
| `403` | Không có quyền (thiếu scope) |
| `404` | Không tìm thấy resource |
| `422` | Request không hợp lệ (sai format, thiếu field, vi phạm business logic) |
| `429` | Rate limit exceeded |
| `5xx` | Lỗi server |

## Resources

| Resource | Mô tả |
|---|---|
| `products` | Sản phẩm và variants |
| `orders` | Đơn hàng |
| `customers` | Khách hàng |
| `inventory_levels` | Tồn kho theo location |
| `locations` | Địa điểm kho hàng |
| `checkouts` | Giỏ hàng / checkout |
| `discounts` | Khuyến mãi, mã giảm giá |
| `webhooks` | Webhook subscriptions |
| `store_properties` | Thông tin cửa hàng |

## Endpoints thường dùng

```
GET  /admin/products.json
GET  /admin/products/{id}.json
POST /admin/products.json

GET  /admin/orders.json
GET  /admin/orders/{id}.json

GET  /admin/customers.json
GET  /admin/customers/search.json

GET  /admin/inventory_levels.json
GET  /admin/locations.json
```

> **Lưu ý:** `shop.json` trả về 403 nếu Private App chưa được cấp quyền "Store info" trong SAPO Admin → Apps.
