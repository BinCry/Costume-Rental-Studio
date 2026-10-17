# Đối chiếu UI Ops Agent và API

**Ngày đối chiếu:** 17/10/2026
**Phạm vi:** giao diện Ops Agent trong Costume Rental Studio và các route Agent/Knowledge công khai trên Studio API.

Yêu cầu triển khai cụ thể cho đội AI Agent, gồm hợp đồng tool, RAG, ranh giới quyền và tiêu chí nghiệm thu: [`yeu-cau-hoan-thien-ai-agent.md`](yeu-cau-hoan-thien-ai-agent.md).
Lộ trình và điều kiện mở từng mức tự động hóa: [`ke-hoach-phat-trien-ops-agent.md`](ke-hoach-phat-trien-ops-agent.md).

## API đã có màn hình

| API | Màn hình trong UI | Cách dùng |
|---|---|---|
| `POST /api/v1/agent/messages` | Hỏi Agent | Tạo hồ sơ mới hoặc gửi câu hỏi tiếp theo cho hồ sơ đang mở. Câu trả lời hiển thị nguồn tài liệu/dữ liệu nghiệp vụ nếu API trả về. |
| `GET /api/v1/agent/cases/{caseId}` | Hồ sơ Agent | Tải lại trạng thái hồ sơ đang mở của tài khoản đăng nhập. Mã hồ sơ chỉ giữ trong `sessionStorage`, không hiển thị UUID. |
| `POST /api/v1/agent/cases/{caseId}/confirmations/{confirmationId}/confirm` | Hồ sơ Agent | Xác nhận yêu cầu đang chờ; thao tác đi qua hộp thoại xác nhận và API kiểm tra quyền. |
| `POST /api/v1/agent/cases/{caseId}/confirmations/{confirmationId}/reject` | Hồ sơ Agent | Từ chối yêu cầu đang chờ. |
| `POST /api/v1/agent/approvals/{approvalId}/approve` | Hồ sơ Agent | Chuyển tiếp quyết định duyệt sau kiểm tra điều kiện truy cập chung. Studio API chưa ràng buộc `approvalId` với đúng preview/tool/đối số/phiên bản; mọi tool ghi vẫn bị chặn. |
| `POST /api/v1/agent/approvals/{approvalId}/reject` | Hồ sơ Agent | Từ chối thao tác cần quyền cao. |
| `POST /api/v1/agent/cases/{caseId}/cancel` | Hồ sơ Agent | Hủy hồ sơ Agent còn hoạt động; giao diện nêu rõ thao tác đã hoàn tất trước đó không bị hoàn tác. |
| `POST /api/v1/knowledge/answer` | Tra cứu tri thức | Gửi câu hỏi, hiển thị câu trả lời, tình trạng đủ căn cứ và trích dẫn do API trả về. |

Các route `/agent/*` chỉ nhận tài khoản nhân viên đang làm việc, có vai trò ADMIN/STAFF đang hoạt động và quyền tra cứu tri thức nội bộ phù hợp với phạm vi chi nhánh. Khách hàng bị từ chối ngay tại Studio API. `/knowledge/answer` vẫn giữ luồng khách/guest riêng; nhân viên cần `knowledge.read.branch` ở chi nhánh được phân công hoặc `knowledge.read.all` cho quyền toàn hệ thống. Giao diện không tự suy quyền để quyết định kết quả.

Các route xác nhận/duyệt ở bảng trên là **hợp đồng chuyển tiếp trạng thái hồ sơ**, chưa phải bằng chứng thao tác ghi được phép. Studio API còn chặn 11 tool ghi bằng `AGENT_WRITE_TOOLS_NOT_READY`.

Khi lỗi mạng hoặc máy chủ khiến kết quả gửi chưa rõ, UI giữ câu hỏi, khóa gửi lại và lưu dấu chờ đối soát theo tài khoản trong phiên trình duyệt. Nếu đã có mã hồ sơ, nhân viên có thể tải lại hồ sơ. Nếu chưa nhận mã, cần người phụ trách đối soát trước; chỉ sau khi xác nhận bên ngoài mới được mở khóa gửi yêu cầu khác. API tra cứu/idempotency cho lần tạo hồ sơ đầu vẫn là phần đội AI cần bổ sung.

## Quy ước trải nghiệm khi chạy production

- Chế độ production chỉ hiển thị Bàn làm việc, Hỏi trợ lý, Tra cứu hướng dẫn và Yêu cầu hiện tại. Các mục này dẫn tới hành động hoặc trạng thái mà nhân viên có thể sử dụng ngay.
- Hàng đợi, checklist, danh mục nguồn mẫu và nhật ký fixture chỉ xuất hiện trong bản demo. Chúng không nằm trong điều hướng production và không được dùng làm số liệu của ca làm việc.
- Nhân viên nhìn thấy trạng thái và căn cứ nghiệp vụ cần để quyết định. Tên route, thuật ngữ nội bộ như RAG/tool, mã UUID và cấu hình API không xuất hiện trong luồng thường ngày.
- Khi chưa đủ nguồn, màn tra cứu đưa nhân viên sang hỏi trợ lý hoặc nhắc đối chiếu với người phụ trách. Khi chưa rõ kết quả gửi, UI giữ câu hỏi và hướng dẫn kiểm tra yêu cầu trước khi gửi lại.
- Trạng thái kết nối được thể hiện theo từng thao tác. Bật cấu hình API không được xem là bằng chứng rằng Agent hay kho tri thức đang hoạt động.

## Nội dung vẫn dùng fixture

- Tổng quan số việc, hàng đợi, nhóm ưu tiên và các tình huống lỗi/xung đột trong chế độ demo.
- Bốn checklist quy trình minh họa và danh mục nguồn mẫu trong chế độ demo.

Các trang fixture bị ẩn khỏi điều hướng khi build production. Mã đơn trong fixture không được đưa vào câu hỏi gửi Agent, và nút mở đơn mẫu bị khóa để không điều hướng sang đơn thật.

## Đang chờ API hoặc quyết định sản phẩm

Các mục dưới đây chưa thuộc phạm vi màn hình production hiện tại. Không dựng bằng fixture. Xem [`yeu-cau-hoan-thien-ai-agent.md`](yeu-cau-hoan-thien-ai-agent.md) để biết tiêu chí hiện tại của đội AI và ranh giới các phần chờ.

| Nhu cầu | API còn thiếu | Trạng thái UI hiện tại |
|---|---|---|
| Duyệt hàng đợi hồ sơ của nhiều nhân viên | `GET /agent/cases` có phân trang, lọc trạng thái và phạm vi chi nhánh | Chưa mở hàng đợi nhóm trong production; mỗi nhân viên chỉ xem yêu cầu hiện tại của phiên mình. |
| Mở lại nội dung hội thoại | API đọc các message theo hồ sơ | Yêu cầu hiện tại hiển thị kết quả gần nhất; không gọi đó là lịch sử hội thoại. |
| Nhật ký hoạt động và audit | API sự kiện có actor, hành động, nguồn, thời gian, kết quả, quyền và phân trang | Nhật ký không xuất hiện trong điều hướng production cho tới khi có API và quyền truy cập tương ứng. |
| Liệt kê và quản lý nguồn tri thức | API danh sách tài liệu, metadata/version, tải lên, ingestion/index, trạng thái duyệt và lịch sử | Production chỉ có tra cứu hướng dẫn bằng `knowledge/answer`; không hiển thị danh mục fixture hoặc chức năng quản lý giả. |
| Tìm tài liệu không cần sinh câu trả lời | Endpoint tìm kiếm trả đoạn trích và score/citation | Chưa có màn tìm kiếm thuần; hiện có thể hỏi hướng dẫn và xem các nguồn mà API trả về. |
| Khôi phục một lần tạo hồ sơ mới khi mất response | Idempotency key hoặc API tra cứu theo request ID, có bảo đảm lưu bền và truy vấn theo actor | UI khóa gửi lại và giữ dấu chờ theo tài khoản trong tab. Nếu chưa có mã hồ sơ, nhân viên phải đối soát với người phụ trách rồi mới chủ động mở khóa. |
| Trạng thái runtime trên UI | Endpoint health/capability được API Studio proxy cho actor | Giao diện không khẳng định runtime đang khỏe chỉ vì build ở chế độ API; từng thao tác hiển thị trạng thái thực tế. |

Các endpoint `agent-tools` là giao tiếp nội bộ giữa Agent runtime và Studio API. Trình duyệt không được gọi chúng trực tiếp. UI chỉ đưa ra yêu cầu qua route Agent công khai và hiển thị bằng chứng/kết quả backend trả về.

## Cấu hình và kiểm thử

- Local mặc định dùng `VITE_OPS_AGENT_MODE=fixture`.
- Workflow build web production đặt `VITE_OPS_AGENT_MODE=api` cùng `VITE_API_URL`.
- Không đặt `AI_INTERNAL_API_KEY` trong web env, Docker build args hoặc nội dung trình duyệt.
- Unit tests kiểm tra path, method, body và bearer session cho API adapter. Lint, typecheck, test và build của web chạy qua workflow trước khi phát hành.
