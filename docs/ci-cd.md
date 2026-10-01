# CI/CD và database migration

## Luồng hiện tại

```text
Pull request / push branch
→ CI: lint, typecheck, test, Prisma validate/generate

Push hoặc merge vào main
→ CI
→ build Docker image API
→ push Docker Hub
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
prisma migrate deploy
```

`migrate deploy` phải chạy trước khi phiên bản API cần schema mới nhận traffic. Coolify pre-deployment command có thể bị bỏ qua ở lần deploy đầu; initial migration cần được chạy chủ động. Docker image hoặc migration job phải chứa Prisma CLI, schema và thư mục migrations.

Không dùng `prisma migrate dev` hoặc `prisma db push` trên production.

## Database vận hành

- Giữ PostgreSQL private; chỉ API cùng Coolify destination dùng Internal URL.
- Persistent volume giúp dữ liệu tồn tại qua restart/redeploy nhưng không thay thế backup.
- Cấu hình scheduled backup và định kỳ thử restore.
- Nếu mở public port tạm thời, giới hạn source IP ở cloud firewall và xóa rule sau khi dùng.
