---
date: 2026-09-27
session: api-response-contract
---

# Journal: 2026-09-27 — Chuẩn hóa API response contract

## Context

Backend Express cần một định dạng JSON thống nhất để frontend xử lý thành công, lỗi validation và lỗi hệ thống theo cùng một quy ước.

## What Happened

- Chuẩn hóa success envelope gồm `success`, `data`, `message` và error envelope gồm `error`, `statusCode`, `timestamp`, `path`, `requestId`.
- Tạo `AppError` để biểu diễn lỗi nghiệp vụ có mã, HTTP status và `details` tùy chọn.
- Mỗi request được gán UUID, trả qua header `X-Request-Id` và error body để đối chiếu log.
- Error path dùng `baseUrl + path`: giữ mount path nhưng loại query string, tránh phản chiếu dữ liệu nhạy cảm.
- Error middleware kiểm tra `headersSent` và chuyển tiếp lỗi cho Express khi response đã bắt đầu gửi.
- Ghi contract sử dụng cho frontend tại `docs/api-response-contract.md`.
- Xác minh thành công: `8/8` test pass, typecheck pass và production build pass.

## Reflection

Chuẩn hóa contract ở giai đoạn nền tảng giúp frontend không phải xử lý nhiều dạng response. Request correlation và việc loại query string cải thiện khả năng điều tra lỗi mà không làm lộ dữ liệu không cần thiết.

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Dùng envelope thống nhất | Client có một cách đọc mọi JSON response | Giảm logic phân nhánh ở frontend |
| Dùng `AppError` cho lỗi dự kiến | Tách lỗi nghiệp vụ khỏi lỗi ngoài dự kiến | Dễ mở rộng validation và module nghiệp vụ |
| Sinh UUID và trả `X-Request-Id` | Liên kết response với request log | Hỗ trợ debug và vận hành |
| Path không chứa query string | Tránh phản chiếu token hoặc dữ liệu nhạy cảm | Error response an toàn hơn |
| Forward khi `headersSent` | Tuân theo vòng đời error handling của Express | Tránh gửi response lần hai |

## Next Steps

- Dùng `sendSuccess` và `AppError` nhất quán khi thêm các API nghiệp vụ.
- Bổ sung mapping lỗi validation Zod khi triển khai request schema.
- Giữ test contract làm regression suite khi kết nối frontend.
