# API Response Contract

## Tổng quan

Mọi endpoint JSON của backend dùng cùng một response envelope. Frontend nên dựa vào trường `success` để phân biệt kết quả thành công và lỗi.

Mỗi response có header `X-Request-Id`. Khi báo lỗi hoặc tra log, client nên lưu và gửi lại giá trị này để đối chiếu request trên backend.

## Response thành công

```json
{
  "success": true,
  "data": {},
  "message": "Operation successful"
}
```

- `data`: dữ liệu của endpoint; kiểu dữ liệu phụ thuộc từng API.
- `message`: thông báo ngắn, phù hợp để frontend hiển thị khi cần.

Ví dụ `GET /health`:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "costume-api"
  },
  "message": "API is healthy"
}
```

## Response lỗi

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "password": "Password must contain at least 6 characters"
    }
  },
  "statusCode": 400,
  "timestamp": "2026-04-08T00:00:00.000Z",
  "path": "/api/example",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

- `error.code`: mã ổn định để frontend xử lý bằng logic; không phụ thuộc nội dung message.
- `error.message`: mô tả lỗi an toàn cho client.
- `error.details`: tùy chọn, chứa thông tin bổ sung như lỗi validation theo từng field.
- `statusCode`: HTTP status code của response.
- `timestamp`: thời điểm phát sinh response theo ISO 8601 UTC.
- `path`: đường dẫn request gây lỗi.
- `requestId`: cùng giá trị với header `X-Request-Id` để đối chiếu log.

Không trả stack trace, câu SQL, cookie, token hoặc chi tiết lỗi nội bộ trong `message` và `details`.

## Các mã lỗi nền tảng

| HTTP status | `error.code` | Ý nghĩa |
| --- | --- | --- |
| `400` | `INVALID_JSON` | Request body chứa JSON không hợp lệ |
| `404` | `NOT_FOUND` | Không tìm thấy route |
| `413` | `PAYLOAD_TOO_LARGE` | Request body vượt giới hạn cho phép |
| `429` | `RATE_LIMITED` | Client gửi quá nhiều request |
| `500` | `INTERNAL_SERVER_ERROR` | Lỗi ngoài dự kiến trên backend |

Các module nghiệp vụ có thể bổ sung mã lỗi riêng, ví dụ `VALIDATION_ERROR` hoặc `COSTUME_UNAVAILABLE`, nhưng vẫn phải giữ nguyên error envelope trên.

## Quy ước phía frontend

1. Kiểm tra HTTP status và parse JSON.
2. Nếu `success` là `true`, đọc dữ liệu từ `data`.
3. Nếu `success` là `false`, xử lý theo `error.code`; chỉ dùng `error.message` để hiển thị.
4. Khi cần hỗ trợ kỹ thuật, ghi lại `requestId` từ body hoặc header `X-Request-Id`.

