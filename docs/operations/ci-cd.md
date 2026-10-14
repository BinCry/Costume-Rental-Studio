# CI/CD và database migration

## Luồng hiện tại

```text
Pull request / push branch
→ CI: lint, typecheck, test, Prisma validate/generate

Push hoặc merge vào main

API:
→ CI: lint, typecheck, test, build và kiểm tra migration trên PostgreSQL tạm
→ build, push Docker image API
→ trigger Coolify deploy
→ container API chạy migration còn thiếu trước khi khởi động server

Web:
→ typecheck, build
→ build, push Docker image Web
→ trigger Coolify deploy
```

## Port và network

| Resource | Port nội bộ | Truy cập public |
|---|---:|---|
| API | `4000` | Domain HTTPS qua Coolify (`443`) |
| Web development | `5173` | Chỉ dùng local |
| PostgreSQL | `5432` | Private trong Coolify network |
| PostgreSQL public tạm | ví dụ `15432` | Chỉ khi cần migration/debug từ local |

## Environment production

API trong Coolify phải dùng Internal Database URL:

```env
NODE_ENV=production
PORT=4000
WEB_URL=https://<web-domain>
DATABASE_URL=postgresql://<user>:<password>@<database-container>:5432/<database>?schema=public
```

Không commit URL chứa mật khẩu vào Git.

## Migration

Development:

```bash
prisma migrate dev --name <name> --create-only
```

Production:

```bash
# Chỉ dùng khi cần chạy migration thủ công trong một đợt bảo trì có kiểm soát.
prisma migrate deploy
```

Image API hiện chạy `prisma migrate deploy` trong lệnh khởi động, trước khi chạy `node dist/server.js`. Vì vậy, khi Coolify thay container bằng image mới, container sẽ áp dụng migration còn thiếu rồi mới mở API. Nếu migration lỗi, lệnh khởi động dừng và container mới không thể báo healthy.

Workflow `api-publish.yml` không chạy migration trên database production trực tiếp: nó kiểm thử toàn bộ migration trên PostgreSQL tạm trong CI, build/push image rồi gọi Coolify. Migration production được chạy bởi entrypoint của image API. Không chạy đồng thời migration thủ công và deploy API. Khi migration backfill dừng do xung đột lịch, hãy xử lý các đơn được nêu trong log rồi deploy lại theo quy trình có kiểm soát.

Quy tắc này cũng áp dụng cho migration `20261011020000_global_payment_permissions`: khi migration còn thiếu, startup API sẽ áp dụng trước khi server nhận traffic. Sau deploy, xác minh API health/readiness và quyền thực tế của vai trò trước khi thao tác thanh toán toàn chuỗi.

Không dùng `prisma migrate dev` hoặc `prisma db push` trên production.

## Database vận hành

- Giữ PostgreSQL private; chỉ API cùng Coolify destination dùng Internal URL.
- Persistent volume giúp dữ liệu tồn tại qua restart/redeploy nhưng không thay thế backup.
- Cấu hình scheduled backup và định kỳ thử restore.
- Nếu mở public port tạm thời, giới hạn source IP ở cloud firewall và xóa rule sau khi dùng.
