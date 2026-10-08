# Tài liệu hệ thống Costume Rental Studio

## Nguồn chuẩn

Khi có khác biệt giữa các tài liệu, dùng thứ tự ưu tiên sau:

1. `apps/api/prisma/migrations/*/migration.sql`: cấu trúc PostgreSQL thực thi.
2. `apps/api/prisma/schema.prisma`: mô hình Prisma và quan hệ ứng dụng.
3. [`database/schema.dbml`](database/schema.dbml): ERD dùng để trao đổi và hiển thị.
4. [`database/constraints.md`](database/constraints.md): constraint PostgreSQL và rule liên bảng.
5. [`business/business-rules.md`](business/business-rules.md): nghiệp vụ đã chốt.

Một rule trong `business-rules.md` có thể là quyết định đã chốt nhưng chưa được code. Khi đánh giá mức độ hoàn thành phải đối chiếu thêm schema, API và test.

## Cấu trúc thư mục

```text
docs/
├── business/     # Nghiệp vụ chính thức và phân tích ngoại lệ
├── database/     # ERD, tóm tắt, constraints và checklist review
├── api/          # Hợp đồng và flow API theo module
├── ui/           # Kế hoạch, quy chuẩn, đánh giá UX và hướng dẫn demo
├── reports/      # Báo cáo QA, kiểm toán và đối chiếu
├── operations/   # CI/CD và vận hành
├── journals/     # Nhật ký kỹ thuật theo thời gian
└── archive/      # Tài liệu cũ chỉ dùng tham khảo
```

## Tài liệu hiện hành

### Nghiệp vụ

| Tài liệu | Mục đích |
| --- | --- |
| [`business/business-rules.md`](business/business-rules.md) | Nguồn nghiệp vụ hiện hành và state machine đã chốt |
| [`business/business-analysis.md`](business/business-analysis.md) | Phân tích ngoại lệ, edge case và kịch bản nghiệm thu |

### Database

| Tài liệu | Mục đích |
| --- | --- |
| [`database/schema.dbml`](database/schema.dbml) | ERD đầy đủ gồm 33 bảng |
| [`database/schema-summary.md`](database/schema-summary.md) | Tóm tắt nhóm bảng và trách nhiệm |
| [`database/constraints.md`](database/constraints.md) | `CHECK`, FK, `ON DELETE`, unique và exclusion constraint |
| [`database/review-guide.md`](database/review-guide.md) | Checklist review schema, migration và dữ liệu |

### API và vận hành

| Tài liệu | Mục đích |
| --- | --- |
| [`api/auth/registration.md`](api/auth/registration.md) | Đăng ký khách và claim Customer bằng OTP |
| [`api/auth/session.md`](api/auth/session.md) | Login, refresh token và current user |
| [`api/auth/google-oauth.md`](api/auth/google-oauth.md) | Google OAuth và liên kết/kích hoạt tài khoản |
| [`api/auth/email-change.md`](api/auth/email-change.md) | Đổi email có OTP và thu hồi phiên |
| [`api/customers/create-counter-customer.md`](api/customers/create-counter-customer.md) | Admin/Staff tạo Customer tại quầy |
| [`api/catalog/delete-catalog.md`](api/catalog/delete-catalog.md) | Hợp đồng hard delete có guard cho category, model, variant và phụ kiện |
| [`operations/ci-cd.md`](operations/ci-cd.md) | CI, Docker, Coolify và migration production |

### UI và báo cáo

| Tài liệu | Mục đích |
| --- | --- |
| [`ui/design-implementation-plan.md`](ui/design-implementation-plan.md) | Kế hoạch và thứ tự triển khai giao diện |
| [`ui/design-standards.md`](ui/design-standards.md) | Quy chuẩn hình ảnh, trạng thái và màn hình lõi |
| [`ui/demo-guide.md`](ui/demo-guide.md) | Route, fixture và kịch bản trình diễn 18 màn hình |
| [`ui/core-flow-ux-review.md`](ui/core-flow-ux-review.md) | Đánh giá và tối ưu 10 hành trình chính |
| [`reports/ui-ux-final-audit.md`](reports/ui-ux-final-audit.md) | Nghiệm thu UI/UX giai đoạn fixture |
| [`reports/responsive-accessibility-qa.md`](reports/responsive-accessibility-qa.md) | QA responsive và accessibility |
| [`reports/business-ui-coverage.md`](reports/business-ui-coverage.md) | Đối chiếu UI với tình huống nghiệp vụ |

## Archive và chính sách xóa

- [`archive/historical-business-analysis.md`](archive/historical-business-analysis.md): bản BA/OOAD cũ, có thiết kế không còn khớp nguồn hiện hành.
- [`archive/core-ui-prototype-guide.md`](archive/core-ui-prototype-guide.md): hướng dẫn prototype 5 màn hình, đã được `ui/demo-guide.md` thay thế.
- [`archive/comprehensive-business-review.docx`](archive/comprehensive-business-review.docx): bản Word cũ của báo cáo phân tích; giữ để đối chiếu nguồn.

Không dùng file trong `archive/` để viết migration hoặc API. Có thể xóa ba file này khỏi repository sau khi nhóm xác nhận không còn nhu cầu nộp bản Word hoặc đối chiếu lịch sử.
