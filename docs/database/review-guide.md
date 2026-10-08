# Database Review Guide

## 1. Thứ tự review

1. Nghiệp vụ và state machine trong [`business-rules.md`](../business/business-rules.md).
2. Bảng và quan hệ trong [`schema.dbml`](schema.dbml).
3. Field, enum, nullability và index trong `schema.prisma`.
4. Constraint thực thi trong [`constraints.md`](constraints.md).
5. SQL cuối cùng trong migration.
6. Chạy migration trên PostgreSQL rỗng và test rule quan trọng.

## 2. Checklist theo nhóm

### Identity

- User dùng chung cho customer/employee; dữ liệu riêng nằm ở `customers` hoặc `employees`.
- Nhân viên provision trước ở `PENDING`, chỉ active sau khi liên kết Google đã xác minh.
- Quyền đi qua role; không có user permission override.
- Role theo chi nhánh không được tạo trùng khi `branch_id` null.

### Catalog và inventory

- Model, variant và unit không bị trộn trách nhiệm.
- Variant chứa giá toàn chuỗi; order item giữ snapshot.
- Mỗi unit có barcode duy nhất và đúng một chi nhánh hiện tại.
- Chỉ unit `READY` được phân bổ.
- Media tham chiếu đúng một model hoặc variant.
- Phụ kiện chuẩn và phụ kiện snapshot đã được chuẩn hóa thành bảng riêng.

### Rental

- `planned_start_at < planned_due_at`.
- Một dòng item tương ứng một unit, không có quantity.
- Unit có lịch active không chồng nhau.
- Pickup/return được lưu trực tiếp trên order và item.
- Promotion tối đa một cái trên order và có snapshot.
- Order giữ policy version đã áp dụng.

### Finance

- Payment amount dương và idempotency key unique.
- Payment thành công có `paid_at`.
- Refund chỉ trỏ tới payment thành công.
- Tổng refund hoàn tất không vượt payment nguồn.
- Webhook provider/event unique và không xử lý hai lần.

### CRM

- Customer profile không lặp email/phone từ `users`.
- Timeline và case history append-only.
- Actor/ngữ cảnh bị xóa thì lịch sử vẫn còn qua `SET NULL`.

## 3. Test migration bắt buộc

```bash
prisma validate
prisma generate
prisma migrate deploy
prisma migrate status
```

Kết quả cuối phải là:

```text
Database schema is up to date!
```

## 4. Test constraint tối thiểu

- Chèn tiền âm phải thất bại.
- Chèn order có thời gian đảo ngược phải thất bại.
- Media có cả model và variant hoặc không có cả hai phải thất bại.
- Transfer cùng nguồn/đích phải thất bại.
- Hai policy có thời gian chồng nhau phải thất bại.
- Hai rental item cùng unit và khoảng active chồng nhau phải thất bại.
- Xóa parent sở hữu child phải cascade đúng phạm vi.
- Xóa actor tùy chọn phải set null.
- Xóa order/payment đang có giao dịch phụ thuộc phải bị restrict.

## 5. Quy tắc migration production

- Tạo migration bằng `migrate dev --create-only` trên môi trường development.
- Review SQL trước khi apply.
- Production chỉ chạy `prisma migrate deploy`.
- Không chỉnh migration đã chạy; tạo migration mới.
- Backup và có phương án rollback ứng dụng trước thay đổi phá vỡ tương thích.
- API trong Coolify dùng Internal Database URL; không cần public PostgreSQL.
- Nếu chạy migration từ local, chỉ mở public port tạm thời và đóng ngay sau khi hoàn tất.

