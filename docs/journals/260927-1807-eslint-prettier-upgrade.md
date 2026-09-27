---
date: 2026-09-27
session: eslint-prettier-upgrade
---

# Journal: 2026-09-27 — Nâng cấp ESLint và Prettier

## Context

Nâng cấu hình code quality từ lint cú pháp cơ bản lên kiểm tra TypeScript có type information, đồng thời xử lý các xung đột format và giữ test API độc lập với `.env` cục bộ.

## What Happened

- Đồng bộ TypeScript `6.0.3` tại root, API và web; bỏ phương án TS7/alias TS6 trước đó.
- ESLint dùng `recommendedTypeChecked`, `stylisticTypeChecked` và `parserOptions.projectService` cho cả hai app.
- Thêm `eslint-config-prettier` ở cuối chuỗi config để tắt các ESLint rule xung đột với Prettier.
- Khai báo `apps/web/src/index.css` qua `tailwindStylesheet` để plugin Prettier nhận đúng cấu hình Tailwind v4.
- Loại `apps/api/src/generated`, `.agents`, Prisma migrations và output build/coverage khỏi lint hoặc format cơ học.
- Test API tự gán `DATABASE_URL` trước dynamic import, không còn phụ thuộc vào `.env` hay database thật.

## Reflection

Typed linting phát hiện được nhiều lỗi hơn lint cú pháp nhưng yêu cầu mọi file lint phải thuộc TypeScript project hợp lệ. `projectService` giảm cấu hình lặp và phù hợp với cấu trúc nhiều `tsconfig` của monorepo. Đồng bộ compiler cũng đơn giản hơn việc duy trì alias chỉ dành cho parser.

## Decisions Made

| Decision | Rationale | Impact |
| --- | --- | --- |
| Dùng TypeScript `6.0.3` thống nhất | Tương thích ổn định với `typescript-eslint` | Root, API và web dùng cùng compiler |
| Bật typed + stylistic lint | Kiểm tra lỗi cần type information và chuẩn hóa code | Lint chặt hơn, dựa trên TypeScript project |
| Thêm `eslint-config-prettier` | Phân tách trách nhiệm lint và format | Tránh rule format mâu thuẫn |
| Ignore code sinh tự động và agent metadata | Không sửa nội dung không do ứng dụng duy trì trực tiếp | Lint/format tập trung vào source có chủ đích |
| Cố định `DATABASE_URL` trong test | Test HTTP chưa cần kết nối database | Test chạy hermetic, không đọc `.env` máy phát triển |

## Validation

- `pnpm lint`: pass.
- `pnpm format:check`: pass.
- `pnpm typecheck`: pass cho API và web.
- `pnpm test`: pass; API có 2 files và 8 tests, web chưa có test script.
- `pnpm build`: pass; API tạo ESM bundle + source map, web build bằng Vite.
- Chạy test với `DOTENV_CONFIG_PATH` trỏ tới file không tồn tại: pass 8/8.
- TypeScript resolve tại root, API và web: `6.0.3`.

## Next Steps

- Giữ generated Prisma client ngoài lint/format sau mỗi lần `prisma generate`.
- Đưa cùng chuỗi lint, format check, typecheck, test và build vào CI khi thiết lập pipeline.
