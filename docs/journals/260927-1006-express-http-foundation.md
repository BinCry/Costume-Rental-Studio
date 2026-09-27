---
date: 2026-09-27
session: express-http-foundation
---

# Journal: 2026-09-27 — Express HTTP Foundation

## Bối cảnh

Backend đã có dependency nhưng chưa có source chạy được. Mục tiêu phiên này là dựng nền HTTP tối thiểu cho Express 5 + TypeScript, chưa triển khai database, authentication hay nghiệp vụ thuê trang phục.

## Thay đổi chính

- Chuẩn hóa package root và `@costume/api`, bổ sung script dành riêng cho API và build ESM kèm source map.
- Thêm cấu hình môi trường được kiểm tra bằng Zod, Pino logger, Express app tách khỏi server listener và graceful shutdown cho `SIGINT`/`SIGTERM`.
- Thiết lập Helmet, CORS theo `WEB_URL`, JSON body tối đa 1 MB, rate limit cho `/api/v1`, health check và error contract JSON thống nhất.
- Thêm Supertest cho health check, security headers, CORS, 404, rate limit, JSON sai cú pháp và payload quá lớn.

## Suy ngẫm

Việc tách `app.ts` và `server.ts` giúp kiểm thử HTTP không cần mở cổng thật. Phạm vi được giữ nhỏ, đủ chắc để làm nền cho module database tiếp theo mà chưa tạo sớm các module nghiệp vụ rỗng.

## Quyết định

| Quyết định | Lý do | Tác động |
|---|---|---|
| Đặt rate limiter trước JSON body parser trên `/api/v1` | Chặn request vượt ngưỡng trước khi tốn tài nguyên parse body | Giảm chi phí xử lý và hạn chế abuse tốt hơn |
| Ánh xạ lỗi parser thành phản hồi an toàn | Không trả raw body, stack trace hoặc chi tiết nội bộ cho client | JSON lỗi sai cú pháp và payload quá lớn có contract ổn định |
| Redact `authorization`, `cookie`, `set-cookie` và `err.body` trong Pino | Tránh token, session và dữ liệu request nhạy cảm lọt vào log | Log vẫn hữu ích nhưng an toàn hơn |
| Chỉ rate-limit `/api/v1` | `/health` cần phản ánh tình trạng process ổn định cho monitoring | Health check không bị khóa bởi traffic API |

## Kết quả kiểm chứng

- TypeScript typecheck: thành công, exit code 0.
- Vitest: 1 file, 6 test đều pass.
- Production build: thành công, tạo `dist/server.js` và `dist/server.js.map`.
- Bản build chạy tại cổng 4000; `GET /health` trả HTTP 200 đúng contract.
- `SIGINT` ghi log shutdown/stopped và không còn listener.
- Các script root `dev:api`, `build:api`, `test:api` điều khiển đúng workspace backend.

## Tiếp theo

- Thiết lập PostgreSQL và Prisma, sau đó bổ sung health/readiness check có kiểm tra kết nối database.
