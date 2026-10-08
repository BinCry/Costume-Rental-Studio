# Xóa dữ liệu catalog an toàn

Bốn endpoint sau yêu cầu `Authorization: Bearer <access-token>` và quyền
`catalog.manage`:

```text
DELETE /api/v1/catalog/categories/{id}
DELETE /api/v1/catalog/models/{id}
DELETE /api/v1/catalog/variants/{id}
DELETE /api/v1/catalog/accessories/{id}
```

Các endpoint chỉ hard delete bản ghi chưa được sử dụng. Chúng không cascade xóa dữ liệu con,
media, unit hoặc lịch sử đơn thuê.

| Endpoint | Điều kiện được xóa | Mã lỗi `409` khi đang được sử dụng |
| --- | --- | --- |
| Category | Không có category con và không có model | `CATEGORY_IN_USE` |
| Model | Không có variant, phụ kiện chuẩn hoặc media | `MODEL_IN_USE` |
| Variant | Không có unit vật lý, dòng đơn thuê hoặc media | `VARIANT_IN_USE` |
| Accessory | Chưa xuất hiện trong snapshot phụ kiện của đơn thuê | `ACCESSORY_IN_USE` |

Mỗi thao tác chạy trong transaction, khóa bản ghi đích và đồng bộ thay đổi cây catalog để
tránh một request khác thêm quan hệ phụ thuộc trong lúc kiểm tra rồi xóa.

## Responses

- `204 No Content`: xóa thành công; response không có body.
- `400 VALIDATION_ERROR`: `id` không phải UUID hợp lệ.
- `401`: thiếu hoặc sai access token.
- `403`: actor không có quyền `catalog.manage`.
- `404 *_NOT_FOUND`: bản ghi không tồn tại.
- `409 *_IN_USE`: bản ghi đang có dữ liệu phụ thuộc hoặc lịch sử; chuyển sang inactive thay vì
  hard delete.

Ví dụ khi model đang được sử dụng:

```json
{
  "success": false,
  "error": {
    "code": "MODEL_IN_USE",
    "message": "Model has variants, accessories, media, or related business data; deactivate it instead"
  },
  "statusCode": 409,
  "timestamp": "2026-10-08T09:00:00.000Z"
}
```

## Phân biệt delete và inactive

Delete dành cho dữ liệu tạo nhầm và chưa có quan hệ phụ thuộc. Khi catalog đã được sử dụng,
giữ nguyên bản ghi để bảo toàn lịch sử và dùng endpoint deactivate tương ứng. Việc deactivate
category có thể vô hiệu hóa cây con; hard delete category thì không tự xóa bất kỳ phần tử con
nào.
