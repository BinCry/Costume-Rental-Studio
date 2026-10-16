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

## Chờ Agent/API bổ sung

| Nhu cầu | API còn thiếu | Trạng thái UI hiện tại |
|---|---|---|
| Duyệt hàng đợi hồ sơ của nhiều nhân viên | `GET /agent/cases` có phân trang, lọc trạng thái và phạm vi chi nhánh | Chưa mở hàng đợi nhóm trong production; mỗi nhân viên chỉ xem yêu cầu hiện tại của phiên mình. |
| Mở lại nội dung hội thoại | API đọc các message theo hồ sơ | Yêu cầu hiện tại hiển thị kết quả gần nhất; không gọi đó là lịch sử hội thoại. |
| Nhật ký hoạt động và audit | API sự kiện có actor, hành động, nguồn, thời gian, kết quả, quyền và phân trang | Nhật ký không xuất hiện trong điều hướng production cho tới khi có API và quyền truy cập tương ứng. |
| Liệt kê và quản lý nguồn tri thức | API danh sách tài liệu, metadata/version, tải lên, ingestion/index, trạng thái duyệt và lịch sử | Production chỉ có tra cứu hướng dẫn bằng `knowledge/answer`; không hiển thị danh mục fixture hoặc chức năng quản lý giả. |
| Tìm tài liệu không cần sinh câu trả lời | Endpoint tìm kiếm trả đoạn trích và score/citation | Chưa có màn tìm kiếm thuần; hiện có thể hỏi hướng dẫn và xem các nguồn mà API trả về. |
| Khôi phục một lần tạo hồ sơ mới khi mất response | Idempotency key hoặc API tra cứu theo request ID | Không retry ngầm. Nếu lỗi tạo mới có kết quả chưa rõ, nhân viên cần đối chiếu trước khi gửi yêu cầu mới. |
| Trạng thái runtime trên UI | Endpoint health/capability được API Studio proxy cho actor | Giao diện không khẳng định runtime đang khỏe chỉ vì build ở chế độ API; từng thao tác hiển thị trạng thái thực tế. |

Các endpoint `agent-tools` là giao tiếp nội bộ giữa Agent runtime và Studio API. Trình duyệt không được gọi chúng trực tiếp. UI chỉ đưa ra yêu cầu qua route Agent công khai và hiển thị bằng chứng/kết quả backend trả về.

## Cấu hình và kiểm thử

- Local mặc định dùng `VITE_OPS_AGENT_MODE=fixture`.
- Workflow build web production đặt `VITE_OPS_AGENT_MODE=api` cùng `VITE_API_URL`.
- Không đặt `AI_INTERNAL_API_KEY` trong web env, Docker build args hoặc nội dung trình duyệt.
- Unit tests kiểm tra path, method, body và bearer session cho API adapter. Lint, typecheck, test và build của web chạy qua workflow trước khi phát hành.
