# Case 6 — Unit Schedule Conflict

## Mục tiêu

Case 6 phát hiện hai đơn chưa kết thúc cùng giữ một `CostumeUnit` trong các khoảng `occupiedFrom`–`occupiedUntil` giao nhau. Đây là lớp đối soát dữ liệu để phát hiện dữ liệu legacy/import hoặc race condition; các API xác nhận, đổi unit và gia hạn vẫn phải chặn xung đột đồng bộ.

## Luồng xử lý

1. Studio worker quét các allocation `CONFIRMED`/`ACTIVE` của đơn còn hiệu lực và so sánh các khoảng đã được bảo vệ bằng buffer.
2. Mỗi cặp order/unit/window chỉ có một finding `UNIT_SCHEDULE_CONFLICT/v1`. Đơn có thời điểm bắt đầu sau là `primary`; đơn còn lại là `affected`.
3. Nhân viên cùng branch claim case và bấm Analyze. Live context được đọc lại, không chứa PII, đồng thời tìm unit cùng variant còn trống trong đúng khoảng thuê của primary order.
4. Nếu primary item còn `CONFIRMED` và có unit thay thế, Agent đề xuất `REALLOCATE_SAME_BRANCH`.
5. Nhân viên chuẩn bị rồi duyệt confirmation. Snapshot đóng băng `orderId`, `orderItemId`, `unitId`, `expectedVersion` và payload hash.
6. Agent gọi `reallocate_rental_item` đúng snapshot, sau đó đọc lại order. Studio guard vẫn kiểm tra permission, branch, version và availability.
7. Nếu primary order đã `ACTIVE` hoặc không có unit cùng variant, Agent không tạo write action; case được handoff để nhân viên xử lý thủ công.

## Điều kiện vận hành

Case 6 dùng cùng các cờ readiness hiện có, không thêm biến môi trường mới:

```ini
BACKGROUND_WORKER_ENABLED=true
AGENT_READINESS_DETECTION_ENABLED=true
AGENT_READINESS_ANALYSIS_ENABLED=true
AGENT_READINESS_EXECUTION_ENABLED=true
AGENT_RENTAL_WRITE_ENABLED=true
```

Studio API và AI Agent phải chạy migration trước khi bật detection:

```powershell
# Studio API
pnpm --filter @costume/api db:migrate:deploy

# AI Agent
uv run python scripts/migrate_knowledge.py
```

## Tiêu chí test production

- Tạo hai bản ghi test cùng unit với protected interval giao nhau; worker tự tạo đúng một Case 6.
- Lặp nhiều tick không sinh case trùng.
- Actor ngoài branch không đọc, claim, analyze hay execute case được.
- Claim → analyze cho ra replacement cùng variant; confirmation → execute đổi đúng một lần; read-back không còn xung đột.
- Không có replacement hoặc primary đã `ACTIVE` trả handoff, không gọi write tool.
- Sau khi sửa overlap, finding được resolve; cleanup xóa toàn bộ fixture ở Studio DB và AI DB.
