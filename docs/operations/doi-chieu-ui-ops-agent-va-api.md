# Đối chiếu UI Ops Agent và API

**Ngày đối chiếu:** 17/10/2026
**Phạm vi:** giao diện Ops Agent trong Costume Rental Studio và các route Agent/Knowledge công khai trên Studio API.

## API đã có màn hình

| API | Màn hình trong UI | Cách dùng |
|---|---|---|
| `POST /api/v1/agent/messages` | Hỏi Agent | Tạo hồ sơ mới hoặc gửi câu hỏi tiếp theo cho hồ sơ đang mở. Câu trả lời hiển thị nguồn tài liệu/dữ liệu nghiệp vụ nếu API trả về. |
| `GET /api/v1/agent/cases/{caseId}` | Hồ sơ Agent | Tải lại trạng thái hồ sơ đang mở của tài khoản đăng nhập. Mã hồ sơ chỉ giữ trong `sessionStorage`, không hiển thị UUID. |
| `POST /api/v1/agent/cases/{caseId}/confirmations/{confirmationId}/confirm` | Hồ sơ Agent | Xác nhận yêu cầu đang chờ; thao tác đi qua hộp thoại xác nhận và API kiểm tra quyền. |
| `POST /api/v1/agent/cases/{caseId}/confirmations/{confirmationId}/reject` | Hồ sơ Agent | Từ chối yêu cầu đang chờ. |
| `POST /api/v1/agent/approvals/{approvalId}/approve` | Hồ sơ Agent | Duyệt thao tác cần quyền cao. API kiểm tra quyền và đọc lại kết quả nghiệp vụ. |
| `POST /api/v1/agent/approvals/{approvalId}/reject` | Hồ sơ Agent | Từ chối thao tác cần quyền cao. |
| `POST /api/v1/agent/cases/{caseId}/cancel` | Hồ sơ Agent | Hủy hồ sơ Agent còn hoạt động; giao diện nêu rõ thao tác đã hoàn tất trước đó không bị hoàn tác. |
| `POST /api/v1/knowledge/answer` | Tra cứu tri thức | Gửi câu hỏi, hiển thị câu trả lời, tình trạng đủ căn cứ và trích dẫn do API trả về. |

API Agent yêu cầu phiên Studio đăng nhập. Cấp quyền và phạm vi dữ liệu do backend kiểm tra theo actor; giao diện không tự suy quyền để quyết định kết quả. Nếu một thao tác trả lỗi hoặc hết thời gian chờ, UI yêu cầu tải lại trạng thái hồ sơ trước khi thử tiếp.

## Nội dung vẫn dùng fixture

- Tổng quan số việc, hàng đợi, nhóm ưu tiên và các tình huống lỗi/xung đột.
- Bốn checklist quy trình minh họa.
- Danh mục nguồn mẫu trong chế độ fixture.

Khi bật API, hàng đợi và checklist tiếp tục được gắn nhãn fixture. Mã đơn trong fixture không được đưa vào câu hỏi gửi Agent, và nút mở đơn mẫu bị khóa để không điều hướng sang đơn thật.

## Chờ Agent/API bổ sung

| Nhu cầu | API còn thiếu | Trạng thái UI hiện tại |
|---|---|---|
| Duyệt hàng đợi hồ sơ của nhiều nhân viên | `GET /agent/cases` có phân trang, lọc trạng thái và phạm vi chi nhánh | Không giả lập hàng đợi Agent; giao diện chỉ đọc hồ sơ hiện tại của người dùng. |
| Mở lại nội dung hội thoại | API đọc các message theo hồ sơ | Tin nhắn chỉ còn trong state của tab; sau khi tải lại chỉ có trạng thái/kết quả mới nhất từ `GET case`. |
| Nhật ký hoạt động và audit | API sự kiện có actor, hành động, nguồn, thời gian, kết quả, quyền và phân trang | Tab Nhật ký nêu rõ chưa có API; không tạo sự kiện mẫu. |
| Liệt kê và quản lý nguồn tri thức | API danh sách tài liệu, metadata/version, tải lên, ingestion/index, trạng thái duyệt và lịch sử | Chế độ API chỉ có màn hình hỏi đáp. Không hiển thị danh mục fixture như nguồn thật. |
| Tìm tài liệu không cần sinh câu trả lời | Endpoint tìm kiếm trả đoạn trích và score/citation | Dùng endpoint `knowledge/answer` hiện có; chưa có màn hình tìm kiếm thuần. |
| Khôi phục một lần tạo hồ sơ mới khi mất response | Idempotency key hoặc API tra cứu theo request ID | Không retry ngầm. Nếu lỗi tạo mới có kết quả chưa rõ, nhân viên cần đối chiếu trước khi gửi yêu cầu mới. |
| Trạng thái runtime trên UI | Endpoint health/capability được API Studio proxy cho actor | Giao diện không khẳng định runtime đang khỏe chỉ vì build ở chế độ API; từng thao tác hiển thị trạng thái thực tế. |

Các endpoint `agent-tools` là giao tiếp nội bộ giữa Agent runtime và Studio API. Trình duyệt không được gọi chúng trực tiếp. UI chỉ đưa ra yêu cầu qua route Agent công khai và hiển thị bằng chứng/kết quả backend trả về.

## Cấu hình và kiểm thử

- Local mặc định dùng `VITE_OPS_AGENT_MODE=fixture`.
- Workflow build web production đặt `VITE_OPS_AGENT_MODE=api` cùng `VITE_API_URL`.
- Không đặt `AI_INTERNAL_API_KEY` trong web env, Docker build args hoặc nội dung trình duyệt.
- Unit tests kiểm tra path, method, body và bearer session cho API adapter. Lint, typecheck, test và build của web chạy qua workflow trước khi phát hành.
