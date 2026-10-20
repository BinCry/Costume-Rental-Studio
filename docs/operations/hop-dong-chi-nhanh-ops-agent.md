# Hợp đồng chi nhánh của Ops Agent

**Người cập nhật:** BinCry <bincry2006@gmail.com>

**Ngày:** 18/10/2026
**Trạng thái:** mã nguồn đã chuẩn bị; chưa áp dụng migration hoặc phát hành production.

## Phạm vi

Một case Ops Agent gắn với **một chi nhánh đang chọn** từ khi tạo cho đến khi kết thúc. Đổi chi nhánh tạo case khác. Studio API là nguồn xác thực tài khoản, chi nhánh, trạng thái nhân viên và quyền hiện hành. AI runtime chỉ nhận chi nhánh đã được Studio kiểm tra; model và dữ liệu tool không có quyền tự đổi chi nhánh.

## Hợp đồng Web → Studio → AI

| Bước                    | Dữ liệu bắt buộc                                                                                                        | Kiểm tra                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web tạo/tiếp tục case   | `POST /api/v1/agent/messages`: `message`, `branchId` UUID, `caseId` UUID nếu tiếp tục                                   | Studio xác thực nhân viên, chi nhánh `ACTIVE` và `knowledge.read` tại chi nhánh trước khi gọi AI.                                                      |
| Web đọc/ra quyết định   | GET case, POST confirm/reject/cancel/approve/reject: `X-Branch-Id` UUID                                                 | Studio kiểm lại quyền tại mỗi lần gọi. Web lưu case và bản nháp theo `actorId + branchId`; timeout không tự gửi lại.                                   |
| Studio gọi AI           | Cùng body message; tất cả request có `X-Case-Branch-Id` UUID, service key và actor context                              | AI so body `branchId` với header; case đang có phải thuộc đúng actor và branch. Trường hợp sai hoặc case cũ không có branch trả 404, không tự gán lại. |
| AI gọi Studio tool      | `X-Agent-Tools-Contract: agent-tools/v2`, `X-Case-Branch-Id` UUID cùng service key, actor, request ID và tool allowlist | Studio kiểm lại chi nhánh `ACTIVE`, quyền actor và branch của tài nguyên. Dữ liệu chi nhánh khác không được đưa vào ngữ cảnh model.                    |
| AI xác minh quyền duyệt | `/api/v1/internal/agent-tools/authorize-approval` cùng header contract và branch                                        | Branch case phải nằm trong danh sách branch của quyết định; người duyệt phải có quyền tại từng branch liên quan.                                       |

Với điều chuyển giữa hai chi nhánh, case được phép đọc phiếu nếu branch case là **một trong hai đầu** và actor có quyền tương ứng. Projection chỉ trả mã phiếu, trạng thái, phiên bản và vai trò `FROM`/`TO` của branch case; không đưa thông tin riêng của chi nhánh còn lại hoặc khách hàng vào model. Tool ghi điều chuyển vẫn bị chặn bởi `AGENT_WRITE_TOOLS_NOT_READY`; chỉ `reallocate_rental_item` và `record_overdue_follow_up` đã được phát hành theo confirmation snapshot, và Studio vẫn kiểm tra lại branch của tài nguyên trước khi ghi.

## Dữ liệu và lỗi cần giữ nguyên ý nghĩa

- `INVALID_AGENT_BRANCH`/`FORBIDDEN` từ Studio: chi nhánh không hoạt động hoặc actor không còn quyền; Web yêu cầu chọn chi nhánh hợp lệ, không tiếp tục gửi case cũ.
- `AGENT_CASE_NOT_FOUND`: case thuộc actor/branch khác hoặc case lịch sử không có branch; không tiết lộ case của người khác.
- `AI_SERVICE_TIMEOUT` khi gửi lần đầu: không tự gửi lại vì có thể case đã được tạo. Giữ bản nháp và báo cần đối soát; tính năng tìm lại case theo khóa yêu cầu là việc còn phải làm ở OPS-10.
- `AGENT_WRITE_TOOLS_NOT_READY`: tool ghi đó chưa thuộc allowlist phát hành; không diễn giải là thao tác đã thực hiện và không mở chỉ bằng cấu hình. Hai tool đã phát hành vẫn cần đủ confirmation snapshot hợp lệ, quyền, branch và feature flag.
- `refund.reason` là văn bản tự do; projection tool không chuyển trường này cho model.

## Cổng phát hành

1. Đối chiếu cả hai repo ở cùng commit, kiểm `agent-tools/v2` tại AI client và Studio callback. Không phát hành một bên trước rồi để hai phiên bản chạy lệch.
2. **Trước khi chạy mã AI mới**, áp dụng `sql/006_agent_case_branch_scope.sql` bằng quy trình migration có kiểm checksum của repo AI. Migration thêm cột `agent_cases.branch_id` nullable và chỉ mục; không sửa hoặc suy đoán chi nhánh cho case cũ. Case cũ sẽ không thể tiếp tục; cần ghi nhận và hỗ trợ nhân viên tạo case mới.
3. Chạy test Studio API/Web và AI, rồi kiểm E2E theo nhân viên một chi nhánh, nhiều chi nhánh, admin, mất quyền giữa phiên, case chéo chi nhánh, transfer hai đầu và chi nhánh thứ ba.
4. Chỉ phát hành sau khi có bản sao lưu, kế hoạch rollback, kiểm migration, cấu hình dịch vụ và smoke test có xác thực trên môi trường mục tiêu. Công việc hạ tầng này đang hoãn theo yêu cầu chủ dự án; tài liệu và mã hiện tại **chưa phải bằng chứng production đạt**.

## Phần còn lại của kế hoạch

Hợp đồng này xử lý OPS-01 và một phần OPS-06. Bảy hành trình đọc, nguồn policy có phiên bản, tìm lại case đầu sau timeout, hàng đợi việc thật và E2E production vẫn theo [kế hoạch phát triển](ke-hoach-phat-trien-ops-agent.md).
