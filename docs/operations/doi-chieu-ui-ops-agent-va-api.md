# Đối chiếu màn Cảnh báo Ops Agent với API

**Ngày đối chiếu:** 21/10/2026
**Phạm vi:** FE Costume Rental Studio, Studio API và hợp đồng Agent đã có trong `main`. Đây là mô tả code hiện tại, không khẳng định đã deploy.

Tài liệu thiết kế và luồng vận hành: [`../agent/operations-agent-lifecycle.md`](../agent/operations-agent-lifecycle.md). Yêu cầu cho đội AI Agent: [`yeu-cau-hoan-thien-ai-agent.md`](yeu-cau-hoan-thien-ai-agent.md).

## Luồng trên giao diện

Production có hai tab: **Cảnh báo** để xử lý finding theo chi nhánh và **Trợ lý chat** để hỏi quy trình/tình huống. Hàng đợi lấy dữ liệu trực tiếp từ API, phân trang và không dùng fixture.

Màn Cảnh báo cung cấp:

- Danh sách theo chi nhánh, mức độ, trạng thái, người nhận và hạn xử lý; có tìm kiếm theo loại finding, mã đơn và mã bộ.
- Chi tiết nguyên nhân, bằng chứng, thời điểm quan sát và các đơn/bộ liên quan. API chỉ trả mã nghiệp vụ khi actor có quyền đọc rentals/inventory tại chi nhánh.
- Phương án Agent đề xuất, so sánh thời gian/chi phí/rủi ro và ghi “Chưa có dữ liệu” nếu API chưa trả số đo.
- Thanh tiến độ sáu bước ánh xạ từ trạng thái case: phát hiện, đánh giá rủi ro, giả lập, đề xuất, xác nhận/thực thi, theo dõi.
- Khi case ở `MONITORING` và màn hình đang mở, UI đọc lại case mỗi 30 giây; nếu API trả `FAILED` hoặc phân tích `STALE`, giao diện yêu cầu phân tích lại.
- Nhận/trả case, phân tích, từ chối/xác nhận, duyệt theo quyền và xác nhận thực thi qua hộp thoại cuối.
- Trạng thái mới, đang xử lý, chờ xác nhận/duyệt, đang theo dõi, thành công, cần phân tích lại hoặc bàn giao.
- Khi phiên bản dữ liệu thay đổi, UI tải lại trạng thái và yêu cầu phân tích/xác nhận mới. Nếu mất kết nối khiến kết quả chưa rõ, UI khóa thao tác tiếp tới khi đã đối soát trạng thái.

## API được dùng

| Route | Mục đích |
| --- | --- |
| `GET /api/v1/agent/cases?branchId=...` | Lấy hàng đợi có phân trang, lọc trạng thái/quyền sở hữu; bắt buộc có chi nhánh. |
| `GET /api/v1/agent/cases/{caseId}` | Tải chi tiết và trạng thái mới nhất của case thuộc phạm vi được cấp. |
| `POST /api/v1/agent/cases/{caseId}/claim` / `release` | Nhận hoặc trả case, kèm `expectedVersion`. |
| `POST /api/v1/agent/cases/{caseId}/analyze` | Tạo phân tích mới cho case đã nhận; phụ thuộc feature flag và dữ liệu Agent. |
| `POST /api/v1/agent/cases/{caseId}/confirmations` | Đóng băng phương án readiness cùng `analysisId` và `expectedVersion`. |
| `POST /api/v1/agent/cases/{caseId}/overdue-follow-ups/confirmations` | Gửi dữ liệu có cấu trúc của lần liên hệ quá hạn đã diễn ra. |
| `POST /api/v1/agent/cases/{caseId}/confirmations/{confirmationId}/confirm` / `reject` | Xác nhận hoặc từ chối thao tác đang chờ. |
| `POST /api/v1/agent/approvals/{approvalId}/approve` / `reject` | Duyệt hoặc từ chối yêu cầu cần quyền cao. |
| `POST /api/v1/agent/messages` | Gửi tin nhắn trong tab Trợ lý chat. |

Danh sách case yêu cầu quyền `agents.read` ở phạm vi chi nhánh hoặc toàn hệ thống; thao tác thay đổi yêu cầu `agents.manage`. Migration `20261021100000_ops_agent_role_permissions` cấp quyền `ALL` cho role `ADMIN`, quyền theo chi nhánh cho `SALES_STAFF` và `INVENTORY_STAFF`, kể cả database đã tồn tại trước khi Ops Agent được thêm. API container chạy `prisma migrate deploy` trước khi khởi động. Chi tiết case và chat còn yêu cầu tài khoản nhân viên đang hoạt động cùng quyền chi nhánh phù hợp. Studio API và Agent cùng kiểm tra quyền; FE chỉ phản ánh quyền qua response.

## Sáu loại cảnh báo

| Finding | Nhãn trên UI |
| --- | --- |
| `PREVIOUS_RENTAL_NOT_RETURNED` | Đơn trước chưa trả |
| `ALLOCATED_UNIT_NOT_READY` | Bộ chưa sẵn sàng |
| `ORDER_PREPARATION_DELAYED` | Chuẩn bị có nguy cơ trễ |
| `RENTAL_RETURN_OVERDUE` | Đơn thuê quá hạn |
| `OPERATIONAL_CAPACITY_SHORTFALL` | Thiếu năng lực xử lý |
| `UNIT_SCHEDULE_CONFLICT` | Trùng lịch bộ trang phục |

FE chỉ hiện sáu loại này trong hàng đợi. UUID của người nhận case được chuyển thành `ownership` ở Studio API và không trả ra trình duyệt. Các UUID nội bộ khác không được hiển thị thành nội dung người dùng.

`OPERATIONAL_CAPACITY_SHORTFALL` hiện so sánh số phút công còn lại của các unit block với khung năng lực đã khai báo. Đây chưa phải cảnh báo thiếu nhân sự theo ca/kỹ năng; dữ liệu ca làm chưa được nối vào API. FE giải thích giới hạn này ngay trong chi tiết case.

Phân tích có thể trả thêm `riskLevel`, `riskScore` (0–100), `estimatedDelayMinutes`, `reasons`, `ruleVersion` và `evaluatedAt`. Các trường đều tùy chọn; FE chỉ hiển thị giá trị API thực trả. Điểm/mức rủi ro là đánh giá theo dữ liệu hiện tại, không phải xác suất đã hiệu chuẩn. Chưa có dữ liệu lịch sử, nhãn kết quả và kiểm định để hiển thị xác suất giao trễ.

## Ranh giới thao tác

- Gợi ý là mô phỏng. Chỉ bật chuẩn bị thực thi khi Agent trả rõ phương án khả thi và executable; thao tác ghi vẫn cần confirmation, snapshot/version hợp lệ, RBAC và kiểm tra nghiệp vụ hiện hành.
- FE hiển thị các phương án Agent trả về để so sánh; endpoint phân tích chưa nhận tham số cho nhân viên tự dựng một kịch bản tùy chỉnh. Vì vậy đổi chi nhánh, đổi mẫu hoặc ưu tiên vệ sinh chỉ được trình bày khi Agent thực sự trả phương án tương ứng.
- Thời gian, chi phí hoặc rủi ro bị thiếu thì giữ nguyên “Chưa có dữ liệu”; FE không ước lượng thay Agent.
- Luồng ghi Agent hiện được Studio API phát hành cho đổi unit trong đơn sau xác nhận và ghi nhận lần theo dõi quá hạn sau xác nhận. Tạo task vận hành, giữ unit hoặc chuyển kho chưa được mở để thực thi qua Agent; các tool tương ứng đang fail-closed. Phương án ngoài phạm vi chỉ được hiển thị tham khảo và không được coi là đã thực hiện.
- Case trả quá hạn có form ghi nhận kênh, kết quả, thời điểm liên hệ và lịch hẹn nếu cần. Form không gửi tin cho khách, không gia hạn đơn và không tính phí. CRM follow-up chỉ được ghi sau bước xác nhận.
- Các case capacity hoặc chuẩn bị trễ có thể chỉ đưa khuyến nghị không executable; khi đó nhân viên cần xử lý hoặc bàn giao thủ công.
- Unit/order liên quan được tra cứu ở Studio API theo ID finding và giới hạn ở chi nhánh cùng quyền đọc nghiệp vụ. Response chỉ chứa mã, trạng thái và thời gian cần cho quyết định; không kèm thông tin khách hàng.

## Phần còn chờ hoàn thiện

| Hạng mục | Trạng thái / điều kiện tiếp theo |
| --- | --- |
| Xác suất dự đoán có kiểm định | Chưa có. Trước mắt chỉ hiển thị mức/điểm rủi ro và độ trễ ước tính nếu API có trả; cần dữ liệu gắn nhãn, baseline và đánh giá trước khi gọi là xác suất. |
| Giả lập kịch bản do nhân viên tự chọn | Chưa có request contract cho tham số chi nhánh, mẫu hoặc ưu tiên vệ sinh. API cần nhận scenario, đánh giá constraint và trả snapshot kết quả chỉ đọc. |
| Thiếu nhân sự theo ca | Chưa có dữ liệu ca/kỹ năng; finding hiện tại chỉ phản ánh phút công đã khai báo cho workload block. |
| Tạo task, giữ unit và chuyển kho bởi Agent | Tool schema/service nền tảng có một phần, nhưng các write này chưa được phát hành qua confirmation + read-back; hiện fail-closed. Cần hoàn thiện approval, idempotency và xác minh kết quả trước khi mở UI hành động. |
| Theo dõi case dài hạn | FE đối soát định kỳ khi case đang mở trên màn hình. Theo dõi nền liên tục sau khi rời trang vẫn cần scheduler/event ở Agent. |
| Hội thoại có ngữ cảnh bền vững | Cần `conversationId/threadId` riêng với `caseId` và API đọc transcript theo actor/chi nhánh. Transcript hiện tại của tab chat chưa được coi là lịch sử đã lưu. |
| Health/capability runtime | Cần endpoint Studio proxy để cho biết Agent/tri thức đang sẵn sàng; bật cấu hình FE không chứng minh runtime khỏe. |
| Thông báo theo role/chi nhánh | Chưa có notification production; hàng đợi vẫn là nơi tra cứu trạng thái case. |

## Xác minh

Đã có kiểm thử route/service cho queue, phân quyền, projection mã nghiệp vụ và action versioned. Trước khi merge cần chạy API test/typecheck/lint, FE typecheck/lint/build. Deploy và E2E trên Coolify chỉ được xác nhận sau khi CI/CD và môi trường production chạy thành công.
