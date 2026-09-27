---
date: 2026-09-27
session: code-quality-tooling
---

# Journal: 2026-09-27 — Chuẩn hóa chất lượng code cho monorepo

## Context

Thiết lập một lớp kiểm soát chất lượng thống nhất cho React/Vite và Express trong pnpm workspace trước khi phát triển database và nghiệp vụ.

## What Happened

- Đặt ESLint, Prettier, Husky và lint-staged tại root vì chúng phục vụ toàn repository.
- Tạo cấu hình ESLint nền ở root; API bổ sung môi trường Node, web bổ sung browser globals cùng quy tắc React Hooks và React Refresh.
- Giữ TypeScript 7 cho API, TypeScript 6 cho web. Root dùng alias `typescript: npm:@typescript/typescript6` để `typescript-eslint` phân tích mã nguồn bằng phiên bản tương thích mà không thay compiler của API.
- Prettier dùng một cấu hình chung và plugin Tailwind CSS để sắp xếp utility classes.
- `pre-commit` chỉ chạy ESLint/Prettier trên file staged; `pre-push` chạy typecheck toàn workspace và test API.
- Xóa import `App.css` cũ khỏi `App.tsx` vì file mẫu Vite không còn tồn tại.

## Reflection

Cấu hình tập trung giúp lệnh và hook nhất quán nhưng vẫn giữ được quy tắc riêng cho Node và React. Điểm cần chú ý nhất là TypeScript 7 của API chưa phù hợp để ESLint parser dùng trực tiếp; alias TypeScript 6 ở root tách vai trò lint khỏi compiler và tránh phải hạ phiên bản API.

## Decisions Made

| Decision | Rationale | Impact |
| --- | --- | --- |
| Tooling chung đặt tại root | Áp dụng cho toàn monorepo và tránh cài trùng | Có một điểm cấu hình, một lockfile và các script chung |
| ESLint theo từng app | Node và browser cần globals/plugin khác nhau | API và web nhận đúng rule theo môi trường |
| Dùng TypeScript 6 alias cho ESLint | Bảo đảm tương thích với `typescript-eslint` trong khi API vẫn dùng TS7 | API chạy `tsc 7.0.2`; web chạy `tsc 6.0.3` |
| Hook nhẹ ở pre-commit, kiểm tra rộng ở pre-push | Giữ commit nhanh nhưng vẫn chặn lỗi type/test trước khi đẩy code | File staged được tự sửa; push phải qua typecheck và test API |

## Validation

- Kiểm tra peer dependencies: pass, không có vấn đề.
- `pnpm lint`: pass cho API và web.
- `pnpm format:check`: pass.
- `pnpm typecheck`: pass cho API và web.
- `pnpm test:api`: pass 2 test files, 8 tests.
- `pnpm build`: pass cho API và web.
- Husky `pre-commit`: pass khi không có file staged.
- Husky `pre-push`: pass, gồm typecheck và 8 API tests.

## Next Steps

- Dùng `pnpm lint`, `pnpm format:check` và `pnpm typecheck` trong CI khi thiết lập pipeline.
- Bắt đầu PostgreSQL + Prisma sau khi chốt cấu hình code quality.
