# Yêu cầu bàn giao cho đội AI Agent

**Ngày cập nhật:** 17/10/2026

**Phạm vi:** hoàn thiện dịch vụ Ops Agent để khớp giao diện production của Costume Rental Studio.
**Đối tượng:** đội phát triển AI Agent/RAG/tool và đội Studio API phụ trách hợp đồng tích hợp.

## 1. Mục tiêu sản phẩm đã chốt

Ops Agent là trợ lý cho nhân viên studio: trả lời quy trình dựa trên tài liệu được duyệt, tra cứu dữ liệu vận hành hiện thời và hỗ trợ một số thao tác qua Studio API. Agent không thay nhân viên quyết định ngoại lệ, không tự đặt chính sách và không ghi thẳng vào cơ sở dữ liệu.

Ở production, nhân viên dùng bốn khu vực: **Bàn làm việc**, **Hỏi trợ lý**, **Tra cứu hướng dẫn** và **Yêu cầu hiện tại**. Hàng đợi, checklist, số liệu và danh mục tài liệu giả lập chỉ dành cho demo. Tài liệu đối chiếu giao diện/API: [`doi-chieu-ui-ops-agent-va-api.md`](doi-chieu-ui-ops-agent-va-api.md).

## 2. Hợp đồng tích hợp hiện có

Studio API là cổng duy nhất giữa trình duyệt, Agent và nghiệp vụ. Các endpoint mà giao diện gọi:

- `POST /api/v1/agent/messages`: tạo yêu cầu hoặc gửi tiếp nội dung vào hồ sơ hiện tại bằng `caseId`.
- `GET /api/v1/agent/cases/{caseId}`: tải lại hồ sơ của nhân viên đang đăng nhập.
- Các endpoint `confirm`, `reject`, `approve`, `cancel` trong nhóm `/api/v1/agent/...`: xử lý quyết định nhân viên; Studio API kiểm tra quyền và trạng thái.
- `POST /api/v1/knowledge/answer`: hỏi hướng dẫn, trả câu trả lời, mức đủ căn cứ và nguồn trích dẫn.

Agent phải trả đúng `AgentCaseResult` mà Studio API kiểm tra trong [`agent.schema.ts`](../../apps/api/src/modules/agent/agent.schema.ts): `caseId`, `state`, `message`, `evidence`, `completed` và các trường trạng thái tùy chọn. Ý nghĩa cần giữ:

- `pendingInput`: Agent cần nhân viên bổ sung thông tin. Khi nhân viên trả lời, tiếp tục cùng hồ sơ; không âm thầm tạo hồ sơ mới.
- `pendingConfirmation`: thao tác cần nhân viên xác nhận. Tóm tắt phải nói rõ đối tượng và thay đổi sắp thực hiện.
- `pendingApproval`: thao tác cần quyền cao hơn. Chỉ cho tiếp tục sau quyết định qua luồng duyệt; không giả lập kết quả duyệt ở Agent.
- `handoff`: không thể xử lý an toàn; nêu bước tiếp theo và tác động đã xảy ra nếu có.
- `completed`: đánh dấu hoàn tất khi yêu cầu đã có kết quả cuối; không dùng thay cho “đang chạy”, chờ xác nhận hoặc chờ duyệt.

### Gọi tool nghiệp vụ

Agent gọi callback nội bộ `POST /api/v1/internal/agent-tools/execute`, không gọi trực tiếp API nghiệp vụ hay database. Hợp đồng `agent-tools/v1` được khai báo trong [`agent-tools.schema.ts`](../../apps/api/src/modules/agent-tools/agent-tools.schema.ts), danh sách cho phép trong [`agent-tools.registry.ts`](../../apps/api/src/modules/agent-tools/agent-tools.registry.ts), cách kiểm tra quyền và gọi service trong [`agent-tools.service.ts`](../../apps/api/src/modules/agent-tools/agent-tools.service.ts).

Mỗi lần gọi phải gửi đúng service key qua `X-AI-Service-Key`, danh tính nhân viên qua `X-Actor-Id`, mã tương quan qua `X-Request-Id`, phiên bản hợp đồng `X-Agent-Tools-Contract: agent-tools/v1` và payload có `caseId`, `toolCallId`, `toolName`, `arguments`, `idempotencyKey`. Với thao tác cập nhật có kiểm tra phiên bản, gửi `expectedVersion`; với thao tác cần duyệt, truyền `approvalId` theo hợp đồng. Không tự tạo URL, HTTP method, câu SQL hoặc tên tool ngoài allowlist.

Kết quả tool có nguồn `studio-api`, thời điểm quan sát, mã request và thông tin quyền. Giữ nguyên kết quả lỗi nghiệp vụ như `not_found`, `forbidden`, `validation_error` và `version_conflict`; không diễn giải lỗi thành thành công. Không retry mù thao tác ghi khi timeout. Dùng khóa idempotency và tool đọc đối soát phù hợp trước khi đề nghị nhân viên thử lại.

### Nhóm tool đang được Studio API cho phép

**Tra cứu (10 tool):**

- Đơn thuê và tình trạng đơn: `get_rental_order`, `find_rental_orders`.
- Khả dụng trang phục theo kỳ thuê: `check_availability`.
- Lịch/chặn bộ trang phục: `get_unit_schedule`, `get_unit_block`.
- Điều chuyển: `get_stock_transfer`.
- Thanh toán và hoàn tiền: `get_payment_summary`, `get_payment`, `get_payment_by_idempotency_key`, `get_refund_by_idempotency_key`.

**Thao tác ghi (11 tool):**

- Lịch và tình trạng bộ đồ: `create_unit_block`, `update_unit_block`, `cancel_unit_block`.
- Đơn thuê: `extend_rental_order`, `reallocate_rental_item`, `cancel_rental_order`.
- Điều chuyển: `create_stock_transfer`, `approve_stock_transfer`, `reject_stock_transfer`.
- Tài chính: `create_payment_checkout`, `request_refund`.

Đây là tool nội bộ, không phải 21 màn hình/API cho trình duyệt. Nhân viên bắt đầu trong **Hỏi trợ lý**; trạng thái, bằng chứng và quyết định chờ xử lý nằm trong **Yêu cầu hiện tại**. Nếu đội AI bổ sung API công khai có nghiệp vụ độc lập chưa được hai khu vực này thể hiện, ghi rõ luồng, quyền và đề xuất màn hình trong tài liệu trước khi bật cho nhân viên. Nếu giao diện cần dữ liệu/hành động nhưng API chưa có, ghi vào mục “Đang chờ API/quyết định”; không dựng fixture giả.

## 3. Nội dung đội AI cần hoàn thiện

### A. Luồng hội thoại và hồ sơ

1. Tạo hồ sơ mới và tiếp tục hồ sơ với cùng `caseId`; lưu trạng thái đủ để `GET /cases/{caseId}` khôi phục yêu cầu đang xử lý.
2. Xử lý câu hỏi bổ sung (`pendingInput`), xác nhận, từ chối, duyệt, từ chối duyệt và hủy hồ sơ theo trạng thái hiện tại. Quyết định thao tác phải đi qua endpoint Studio API tương ứng.
3. Trả `message` thân thiện cho nhân viên, `evidence` có nguồn rõ, và `completed`/trạng thái chờ chính xác. Không đưa `stepsUsed`, token, lý do kết thúc nội bộ hay UUID vào lời trả lời thường ngày.
4. Khi có xung đột dữ liệu, thiếu quyền, hết hạn xác nhận, dịch vụ lỗi hoặc kết quả không chắc chắn, giữ nguyên trạng thái chưa hoàn tất và hướng nhân viên đến bước phục hồi; không tự lặp thao tác ghi.

### B. Tri thức và RAG

`POST /api/v1/knowledge/answer` nhận `query` và `topK` (1–6, mặc định 5), trả `outcome` là `answered` hoặc `insufficient_context`, nội dung trả lời, danh sách `sources` và cờ `provisional`. Mỗi nguồn có `documentId`, `heading`, `citation`, `domain`, `status`, `businessAuthority`.

- Chỉ dùng tài liệu phù hợp với nhóm đối tượng trong `X-Knowledge-Audiences`; với Ops Agent là tri thức nhân viên nội bộ và tài liệu dùng chung.
- Câu trả lời nghiệp vụ phải dẫn nguồn. Nếu không có đủ căn cứ, trả `insufficient_context`, nêu rõ chưa xác minh được và không bịa câu trả lời.
- Phân biệt policy đã duyệt với hướng dẫn tham khảo; không trình bày nội dung `provisional` như chính sách chính thức.
- Chính sách khoảng đệm trả trễ/đơn kế tiếp đã thống nhất **12 giờ + 12 giờ nhưng là cấu hình có thể đổi**. Không hard-code giá trị này vào prompt, RAG hay tool; luôn đọc chính sách đang có hiệu lực hoặc kết quả Studio API. Khi nguồn hiệu lực chưa xác định, yêu cầu người phụ trách xác minh.
- Không tự kết luận phí phạt, khả dụng, tiền cọc cần giữ/hoàn hoặc quyền nhân viên từ văn bản rời rạc nếu nghiệp vụ/API đã có kết quả làm nguồn chuẩn.

### C. An toàn khi dùng tool

- Bắt đầu bằng tool đọc để xác minh đơn, bộ đồ, chi nhánh, kỳ thuê, thanh toán hoặc phiên bản hiện tại trước khi đề xuất ghi.
- Hỏi lại khi thiếu thông tin bắt buộc; chỉ tạo thao tác ghi khi dữ liệu đầu vào đã rõ và nhân viên đã xác nhận đúng nội dung.
- Tuân theo quyền, phạm vi chi nhánh và feature flag do Studio API kiểm tra. Không tự suy quyền từ chức danh hoặc lời nhắn của người dùng.
- Với thao tác cập nhật có `expectedVersion`, lấy phiên bản mới nhất trước khi ghi. Nếu backend trả `version_conflict`, tải lại và yêu cầu nhân viên xác nhận lại nội dung đã thay đổi.
- Với thanh toán/hoàn tiền, dùng `idempotencyKey`; nếu response mất hoặc timeout, tra cứu bằng `get_payment_by_idempotency_key` hoặc `get_refund_by_idempotency_key` trước khi thử lại.
- Tool trả dữ liệu đã giới hạn cho mô hình; không tìm cách lấy email, số điện thoại, ghi chú riêng, URL bằng chứng hoặc bí mật không thuộc payload được phép. Không ghi service key, token hay nội dung nhạy cảm vào log/prompt.

## 4. Tiêu chí nghiệm thu cho đội AI

Hoàn thành phần hiện tại khi các kiểm tra sau chạy được trên môi trường tích hợp, không cần fixture:

1. Nhân viên hỏi về chính sách đang hiệu lực; Agent trả lời có trích dẫn đúng nguồn và không tự đóng đinh giá trị cấu hình 12+12.
2. Câu hỏi không có tài liệu phù hợp trả `insufficient_context`; UI cho thấy chưa đủ căn cứ và không nhận câu trả lời suy đoán như hướng dẫn chính thức.
3. Nhân viên tra cứu đơn, khả dụng theo ngày, lịch bộ đồ, điều chuyển và quyết toán; Agent dùng đúng tool đọc, diễn đạt dữ liệu hiện thời và chỉ đưa bằng chứng API trả về.
4. Nhân viên yêu cầu gia hạn, đổi bộ, chặn lịch, hủy đơn, tạo/duyệt điều chuyển, tạo thanh toán hoặc yêu cầu hoàn tiền; Agent hỏi phần còn thiếu, tóm tắt tác động, chờ xác nhận/duyệt đúng trạng thái rồi mới báo kết quả.
5. Người không đủ quyền, sai chi nhánh, tool bị tắt, dữ liệu đổi phiên bản hoặc đối tượng không tồn tại đều nhận kết quả lỗi đúng loại; không có side effect ngoài dự kiến.
6. Gửi tiếp vào hồ sơ hiện tại, tải lại trang và tiếp tục được cùng hồ sơ; không lộ UUID cho nhân viên.
7. Thử gọi tool ngoài allowlist, thiếu `idempotencyKey`, thiếu `expectedVersion` bắt buộc hoặc callback sai service key bị từ chối.
8. Timeout khi thao tác ghi không gây retry tự động; đối soát theo khóa idempotency trước khi đưa ra hướng dẫn thử lại.

## 5. Phần chưa thuộc phạm vi triển khai hiện tại

Các mục sau cần API/quyết định sản phẩm trước khi làm UI hoặc cam kết lịch phát hành:

- Hàng đợi hồ sơ toàn nhóm, lọc theo chi nhánh/trạng thái và phân công hồ sơ cho nhân viên.
- Lịch sử đầy đủ các message của hồ sơ và tìm lại hồ sơ cũ.
- Nhật ký kiểm toán hiển thị cho quản lý (ai làm gì, lúc nào, kết quả và căn cứ quyền).
- Quản lý tài liệu tri thức: danh sách, tải lên, phiên bản, duyệt, lập chỉ mục, vô hiệu hóa và lịch sử xử lý.
- Tìm tài liệu thuần không sinh câu trả lời.
- Tra cứu kết quả tạo hồ sơ mới theo request ID khi mất response; hiện UI không retry tạo mới ngầm.
- API health/capability để hiển thị sức khỏe runtime chính xác.

Không bổ sung các năng lực này bằng dữ liệu demo hoặc lời hứa trong hội thoại. Khi có API, cập nhật hợp đồng, quyền, trạng thái lỗi và tiêu chí nghiệm thu trước; sau đó mới nối màn hình phù hợp.

## 6. Phân công ranh giới

- **Đội AI Agent:** runtime, quản lý hồ sơ/hội thoại, RAG và trích dẫn, chọn tool trong allowlist, làm rõ thông tin, xác nhận/duyệt, xử lý timeout/xung đột và kiểm thử các tiêu chí mục 4.
- **Đội Studio API:** duy trì route facade, tool registry/schema, kiểm tra quyền/chi nhánh, kết quả nghiệp vụ và feature flags; bổ sung API còn thiếu chỉ sau khi được chốt.
- **Đội Web:** hiển thị trạng thái và nguồn trả về theo hợp đồng; không gọi callback nội bộ, không hiển thị chức năng thiếu API như đã sẵn sàng.

Không đổi Prisma schema, chính sách nghiệp vụ hoặc quyền chỉ để Agent dễ gọi. Mọi thay đổi hợp đồng phải cập nhật tài liệu này, kiểm thử contract và kiểm tra cả API lẫn UI.
