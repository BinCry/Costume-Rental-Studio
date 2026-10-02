# Tài liệu hệ thống Costume Rental Studio

## Nguồn chuẩn

Khi có khác biệt giữa các tài liệu, dùng thứ tự ưu tiên sau:

1. `apps/api/prisma/migrations/*/migration.sql`: cấu trúc PostgreSQL thực thi.
2. `apps/api/prisma/schema.prisma`: mô hình Prisma và quan hệ ứng dụng.
3. `docs/database-schema.dbml`: ERD dùng để trao đổi và hiển thị.
4. `docs/database-constraints.md`: constraint PostgreSQL và rule liên bảng.
5. `docs/business-rules.md`: nghiệp vụ đã chốt.

## Danh sách tài liệu hiện hành

| Tài liệu | Mục đích |
|---|---|
| `database-schema.dbml` | ERD đầy đủ gồm 32 bảng |
| `database-schema-summary.md` | Tóm tắt các nhóm bảng và trách nhiệm |
| `database-constraints.md` | `CHECK`, FK, `ON DELETE`, unique và exclusion constraint |
| `database-review-guide.md` | Checklist review schema, migration và dữ liệu |
| `business-rules.md` | Actor, flow thuê, kho, thanh toán và CRM đã chốt |
| `Kế hoạch thiết kế và triển khai giao diện.md` | Hiện trạng code, các điểm cần chốt, sơ đồ màn hình, luồng UX và thứ tự làm UI |
| `ci-cd.md` | CI, publish Docker image, deploy Coolify và migration production |

File `Phân tích nghiệp vụ và thiết kế hệ thống studio cho thuê trang phục.md` là tài liệu phân tích lịch sử. Một số phương án trong đó đã được rút gọn và không còn phản ánh schema cuối cùng; không dùng file đó làm nguồn để viết migration hoặc API.
