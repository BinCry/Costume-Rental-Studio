# Yêu cầu bàn giao cho đội AI Agent

**Ngày cập nhật:** 18/10/2026

**Phạm vi:** hoàn thiện dịch vụ Ops Agent để khớp giao diện production của Costume Rental Studio.
**Đối tượng:** đội phát triển AI Agent/RAG/tool và đội Studio API phụ trách hợp đồng tích hợp.

Kế hoạch sản phẩm và thứ tự triển khai: [`ke-hoach-phat-trien-ops-agent.md`](ke-hoach-phat-trien-ops-agent.md). Phạm vi chỉ có Costume Rental Studio và các chi nhánh của Studio; tên đề tài rộng hơn không đồng nghĩa hệ thống đang phục vụ nhiều doanh nghiệp.

## 1. Mục tiêu sản phẩm đã chốt

Ops Agent là trợ lý cho nhân viên studio: trả lời quy trình dựa trên tài liệu được duyệt, tra cứu dữ liệu vận hành hiện thời và hỗ trợ một số thao tác qua Studio API. Agent không thay nhân viên quyết định ngoại lệ, không tự đặt chính sách và không ghi thẳng vào cơ sở dữ liệu.

**Trạng thái thực thi hiện tại:** đường hỏi đáp/tra cứu và tool đọc đã có hợp đồng; 11 tool ghi mới được khai báo, đang bị Studio API chặn toàn bộ bằng `AGENT_WRITE_TOOLS_NOT_READY`. Các mô tả thao tác ghi dưới đây là yêu cầu cho giai đoạn tiếp theo, không phải khả năng đã phát hành.

Ở production, nhân viên dùng bốn khu vực: **Bàn làm việc**, **Hỏi trợ lý**, **Tra cứu hướng dẫn** và **Yêu cầu hiện tại**. Hàng đợi, checklist, số liệu và danh mục tài liệu giả lập chỉ dành cho demo. Tài liệu đối chiếu giao diện/API: [`doi-chieu-ui-ops-agent-va-api.md`](doi-chieu-ui-ops-agent-va-api.md).

## 2. Hợp đồng tích hợp hiện có

Studio API là cổng duy nhất giữa trình duyệt, Agent và nghiệp vụ. Các endpoint mà giao diện gọi:

- `POST /api/v1/agent/messages`: tạo yêu cầu hoặc gửi tiếp nội dung vào hồ sơ hiện tại bằng `caseId`.
- `GET /api/v1/agent/cases/{caseId}`: tải lại hồ sơ của nhân viên đang đăng nhập.
- Các endpoint `confirm`, `reject`, `approve`, `cancel` trong nhóm `/api/v1/agent/...`: nhận quyết định nhân viên và chuyển tiếp tới AI runtime sau khi Studio API kiểm tra điều kiện truy cập chung. Hợp đồng duyệt gắn với đúng hành động và kiểm tra trạng thái nghiệp vụ cuối chưa hoàn chỉnh; các route này không chứng minh tool ghi đã an toàn.
- `POST /api/v1/knowledge/answer`: hỏi hướng dẫn, trả câu trả lời, mức đủ căn cứ và nguồn trích dẫn.

Mọi route `/api/v1/agent/*` chỉ dành cho tài khoản đang hoạt động, hồ sơ nhân viên đang làm việc và có ít nhất một vai trò ADMIN/STAFF đang hoạt động ở chi nhánh còn hiệu lực (hoặc vai trò toàn hệ thống). Khách hàng không được truy cập hồ sơ Ops Agent. Sau khi qua điều kiện tài khoản, API còn yêu cầu quyền tri thức nội bộ: nhân viên cần `knowledge.read.branch` tại chi nhánh được phân công; quản trị viên toàn hệ thống dùng `knowledge.read.all`. Giao diện hiển thị đường vào Ops Agent cho cả ADMIN và STAFF khi có quyền tri thức phù hợp; quyền luôn được API kiểm tra lại khi gọi, không chỉ dựa vào việc thấy menu.

### Luồng tài khoản vào Ops Agent

1. **Khách hàng:** đăng nhập hoặc tạo tài khoản như khách hàng, được chuyển tới khu khách hàng. Không thấy Ops Agent trong menu; truy cập trực tiếp cũng bị chặn ở giao diện và API.
2. **Nhân viên:** quản trị viên tạo hồ sơ bằng email Google chính chủ của nhân viên, để trạng thái làm việc là đang hoạt động, rồi gán vai trò và chi nhánh có quyền `knowledge.read.branch`. Tài khoản đăng nhập chờ kích hoạt sẽ được liên kết và kích hoạt khi nhân viên đăng nhập Google bằng đúng email đã khai báo. Chỉ khi tài khoản, trạng thái làm việc, vai trò và quyền đều còn hiệu lực thì menu mới cho vào Ops Agent. Nếu nhân viên dùng email khác, hồ sơ sẽ không được liên kết với tài khoản đó; quản trị viên cần sửa email hồ sơ hoặc phân công/quyền cho đúng tài khoản.
3. **Quản trị viên:** đăng nhập vào khu quản trị như hiện tại. Tài khoản đang hoạt động với quyền `knowledge.read.all` sẽ thấy đường vào Ops Agent trong menu quản trị. Vai trò ADMIN không tự thay thế quyền tri thức và API vẫn kiểm tra lại quyền.
4. **Đổi chi nhánh:** lựa chọn chi nhánh làm việc trong chân menu là bối cảnh thao tác của giao diện. Nó không tự cấp thêm quyền; Studio API đối chiếu quyền và phạm vi phân công trên từng yêu cầu.
5. **Bản demo:** khi chạy bằng fixture, màn hình chỉ mô phỏng trải nghiệm và không gửi yêu cầu tới dịch vụ Agent hay ghi dữ liệu thật. Trên production, truy cập phụ thuộc vào tài khoản, vai trò, phân công và quyền nêu trên.

Agent phải trả đúng `AgentCaseResult` mà Studio API kiểm tra trong [`agent.schema.ts`](../../apps/api/src/modules/agent/agent.schema.ts): `caseId`, `state`, `message`, `evidence`, `completed` và các trường trạng thái tùy chọn. Ý nghĩa cần giữ:

Studio API chỉ chuyển tiếp projection dành cho nhân viên. `goal` chỉ giữ `summary`/`status`; `handoff` chỉ giữ `nextAction`/`sideEffects`. `stepsUsed`, `tokensUsed`, `terminationReason`, `runStatus`, kế hoạch/constraints nội bộ và danh sách tool đã chạy bị loại khỏi response trình duyệt. Không dựa vào các trường này để dựng UI hay quyết định nghiệp vụ.

- `pendingInput`: Agent cần nhân viên bổ sung thông tin. Khi nhân viên trả lời, tiếp tục cùng hồ sơ; không âm thầm tạo hồ sơ mới.
- `pendingConfirmation`: thao tác cần nhân viên xác nhận. Tóm tắt phải nói rõ đối tượng và thay đổi sắp thực hiện.
- `pendingApproval`: thao tác cần quyền cao hơn. Chỉ cho tiếp tục sau quyết định qua luồng duyệt; không giả lập kết quả duyệt ở Agent.
- `handoff`: không thể xử lý an toàn; nêu bước tiếp theo và tác động đã xảy ra nếu có.
- `completed`: đánh dấu hoàn tất khi yêu cầu đã có kết quả cuối; không dùng thay cho “đang chạy”, chờ xác nhận hoặc chờ duyệt.

### Gọi tool nghiệp vụ

Agent gọi callback nội bộ `POST /api/v1/internal/agent-tools/execute`, không gọi trực tiếp API nghiệp vụ hay database. Hợp đồng `agent-tools/v1` được khai báo trong [`agent-tools.schema.ts`](../../apps/api/src/modules/agent-tools/agent-tools.schema.ts), danh sách cho phép trong [`agent-tools.registry.ts`](../../apps/api/src/modules/agent-tools/agent-tools.registry.ts), cách kiểm tra quyền và gọi service trong [`agent-tools.service.ts`](../../apps/api/src/modules/agent-tools/agent-tools.service.ts).

Mỗi lần gọi phải gửi đúng service key qua `X-AI-Service-Key`, danh tính nhân viên qua `X-Actor-Id`, mã tương quan qua `X-Request-Id`, phiên bản hợp đồng `X-Agent-Tools-Contract: agent-tools/v1` và payload có `caseId`, `toolCallId`, `toolName`, `arguments`, `idempotencyKey`. Với thao tác cập nhật có kiểm tra phiên bản, gửi `expectedVersion`; với thao tác cần duyệt, `approvalId` hiện có trong schema nhưng Studio API chưa ràng buộc mã này với hồ sơ, lời gọi, tên tool, đối số và phiên bản bản ghi. Không tự tạo URL, HTTP method, câu SQL hoặc tên tool ngoài allowlist.

Route `POST /authorize-approval` hiện chỉ kiểm tra quyền chung của actor đối với các chi nhánh được gửi lên; kết quả `allowed` **không phải** một phê duyệt gắn với hành động cụ thể và không được dùng làm căn cứ chạy tool ghi. Tool ghi hiện bị Studio API chặn ở service layer, kể cả khi cấu hình feature flag bị bật.

Studio API chỉ gửi một tập trường vận hành đã cho phép trong kết quả các công cụ lịch bộ đồ và điều chuyển. Kết quả giữ mã đơn vị/trang phục, chi nhánh, trạng thái, thời gian và phiên bản cần cho tác vụ; không gửi thông tin liên hệ/địa chỉ chi nhánh, khóa người dùng nhân viên, ảnh đại diện, lý do hoặc ghi chú dạng văn bản tự do, hay giá vốn/giá danh mục không liên quan. Kết quả thanh toán cũng không trả khóa idempotency; khi đối soát, Agent dùng khóa đã gửi trong yêu cầu ban đầu cùng công cụ tra cứu theo khóa. Đội AI không được giả định các trường Prisma bị loại khỏi projection sẽ có mặt trong payload.

Kết quả tool có nguồn `studio-api`, thời điểm quan sát, mã request và thông tin quyền. Giữ nguyên kết quả lỗi nghiệp vụ `not_found`, `forbidden`, `validation_error`, `version_conflict` và `business_conflict`; không diễn giải lỗi thành thành công. Chỉ `ORDER_VERSION_CONFLICT`, `TRANSFER_VERSION_CONFLICT` và `UNIT_BLOCK_VERSION_CONFLICT` là `version_conflict`; 409 do quy tắc nghiệp vụ/đồ đang bận là `business_conflict`.

Trường `idempotencyKey` hiện bắt buộc trong payload, nhưng Studio API mới dùng để chống trùng cho `create_payment_checkout` và `request_refund`. Các thao tác ghi lịch, đơn thuê và điều chuyển chưa lưu/đối soát khóa này. Không retry tự động bất kỳ thao tác ghi nào khi timeout; với thao tác chưa có tra cứu theo khóa, cần người vận hành xác minh trạng thái trước khi thử lại.

### Nhóm tool đã đăng ký trong allowlist

**Tra cứu (10 tool):**

- Đơn thuê và tình trạng đơn: `get_rental_order`, `find_rental_orders`.
- Khả dụng trang phục theo kỳ thuê: `check_availability`.
- Lịch/chặn bộ trang phục: `get_unit_schedule`, `get_unit_block`.
- Điều chuyển: `get_stock_transfer`.
- Thanh toán và hoàn tiền: `get_payment_summary`, `get_payment`, `get_payment_by_idempotency_key`, `get_refund_by_idempotency_key`.

**Thao tác ghi (11 tool, hiện bị chặn ở service layer):**

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
- Chỉ với thanh toán/hoàn tiền, `idempotencyKey` được API hiện tại dùng để chống tạo trùng; nếu response mất hoặc timeout, tra cứu bằng `get_payment_by_idempotency_key` hoặc `get_refund_by_idempotency_key` trước khi thử lại.
- Danh sách `find_rental_orders` gửi sang mô hình chỉ gồm dữ liệu vận hành cần thiết; không dùng email/số điện thoại, ghi chú khách, tham chiếu thanh toán, URL bằng chứng hoặc mã người dùng.
- Nếu API trả `business_conflict`, nêu đúng quy tắc hoặc tài nguyên đang bận; không yêu cầu nhân viên tải lại để xử lý như lỗi phiên bản. Với `version_conflict`, đọc lại phiên bản hiện tại trước khi đề nghị xác nhận lại.
- Không bật các cờ ghi cho tới khi xác nhận/duyệt được ràng buộc bền vững với đúng hồ sơ, tool, đối số, phạm vi chi nhánh và phiên bản bản ghi; riêng `approvalId` hiện chưa có liên kết này ở Studio API.
- Các cờ `AGENT_SCHEDULING_WRITE_ENABLED`, `AGENT_RENTAL_WRITE_ENABLED`, `AGENT_TRANSFER_WRITE_ENABLED` và `AGENT_FINANCIAL_WRITE_ENABLED` mặc định `false`. Studio API hiện chặn mọi tool ghi ở service layer với `AGENT_WRITE_TOOLS_NOT_READY`, kể cả khi biến môi trường bị bật nhầm. Không xóa guard để “thử” trên staging/production. Chỉ gỡ chặn sau khi các hợp đồng xác nhận, duyệt và đối soát được triển khai, kiểm thử liên dịch vụ, và chủ sản phẩm cho phép bật theo từng nhóm.
- Hợp đồng preview/duyệt cần một bản xem trước bất biến gắn với đúng hồ sơ và tool call: mã/tên đối tượng đích, chi nhánh và phạm vi ảnh hưởng, khoản tiền nếu có, thao tác sẽ xảy ra, giá trị trước/sau, phiên bản dữ liệu, nội dung lý do, thời hạn và danh tính người xác nhận/duyệt. API phải từ chối nếu đối số, phạm vi, phiên bản hoặc người thực thi khác preview đã xác nhận; không chấp nhận approval chỉ vì actor có quyền chung.
- Chốt phạm vi chi nhánh cho hội thoại Ops Agent: hiện `POST /agent/messages` không nhận chi nhánh đang chọn; các công cụ tra cứu hoạt động theo mọi chi nhánh mà actor có quyền. Chủ sản phẩm cần chọn rõ: mọi tra cứu mặc định theo quyền trên toàn bộ chi nhánh được phân công, hay case phải gắn với một chi nhánh được chọn và mọi tool bị giới hạn theo chi nhánh đó. Không suy ra chi nhánh chỉ từ lời nhắn hoặc `X-Actor-Id`; cho tới khi chốt, UI/API không được hứa rằng case hoặc kết quả đã được giới hạn theo chi nhánh làm việc.
- Hợp đồng citation cần danh tính nguồn có thể truy xuất ổn định (ID tài liệu, phiên bản, đoạn/anchor), trạng thái duyệt và quyền truy cập tại thời điểm trả lời. Studio API hiện chỉ xác nhận các trường metadata/citation không rỗng; chưa thể phát hiện citation giả hoặc nguồn đã bị thu hồi.
- Tool trả dữ liệu đã giới hạn cho mô hình; không tìm cách lấy email, số điện thoại, ghi chú riêng, URL bằng chứng hoặc bí mật không thuộc payload được phép. Không ghi service key, token hay nội dung nhạy cảm vào log/prompt.

## 4. Tiêu chí nghiệm thu cho đội AI

Danh sách nghiệm thu được chia theo khả năng đọc hiện tại và phần ghi chỉ áp dụng sau khi hoàn thành hợp đồng an toàn. Mọi kiểm tra phải chạy trên môi trường tích hợp, không dùng fixture:

1. Nhân viên hỏi về chính sách đang hiệu lực; Agent trả lời có trích dẫn đúng nguồn và không tự đóng đinh giá trị cấu hình 12+12.
2. Câu hỏi không có tài liệu phù hợp trả `insufficient_context`; UI cho thấy chưa đủ căn cứ và không nhận câu trả lời suy đoán như hướng dẫn chính thức.
3. Nhân viên tra cứu đơn, khả dụng theo ngày, lịch bộ đồ, điều chuyển và quyết toán; Agent dùng đúng tool đọc, diễn đạt dữ liệu hiện thời và chỉ đưa bằng chứng API trả về.
4. **Nghiệm thu tương lai sau khi mở từng nhóm ghi:** nhân viên yêu cầu gia hạn, đổi bộ, chặn lịch, hủy đơn, tạo/duyệt điều chuyển, tạo thanh toán hoặc yêu cầu hoàn tiền; Agent hỏi phần còn thiếu, hiển thị preview tác động, chờ xác nhận/duyệt được ràng buộc với hành động rồi mới báo kết quả đã được Studio API xác minh. Hiện tại các yêu cầu này phải trả trạng thái chưa thể thực thi, không mô phỏng thành công.
5. Khách hàng và nhân viên đã nghỉ/khóa bị từ chối route Ops Agent; nhân viên hợp lệ chỉ được tra cứu tri thức theo quyền chi nhánh. Sai chi nhánh, tool bị tắt, xung đột nghiệp vụ, dữ liệu đổi phiên bản hoặc đối tượng không tồn tại đều nhận kết quả đúng loại; không có side effect ngoài dự kiến.
6. Gửi tiếp vào hồ sơ hiện tại, tải lại trang và tiếp tục được cùng hồ sơ; không lộ UUID cho nhân viên.
7. Thử gọi tool ngoài allowlist, thiếu `idempotencyKey`, thiếu `expectedVersion` bắt buộc hoặc callback sai service key bị từ chối. Kiểm tra `business_conflict` không bị phân loại thành `version_conflict`.
8. **Nghiệm thu tương lai cho tool ghi:** timeout không gây retry tự động. Đối soát bằng idempotency chỉ với thanh toán/hoàn tiền theo hợp đồng hiện có; thao tác ghi còn lại phải được xác minh thủ công tới khi API hỗ trợ tra cứu và chống trùng bền vững.

## 5. Phần chưa thuộc phạm vi triển khai hiện tại

Các mục sau cần API/quyết định sản phẩm trước khi làm UI hoặc cam kết lịch phát hành:

- Hàng đợi hồ sơ toàn nhóm, lọc theo chi nhánh/trạng thái và phân công hồ sơ cho nhân viên.
- Lịch sử đầy đủ các message của hồ sơ và tìm lại hồ sơ cũ.
- Nhật ký kiểm toán hiển thị cho quản lý (ai làm gì, lúc nào, kết quả và căn cứ quyền).
- Quản lý tài liệu tri thức: danh sách, tải lên, phiên bản, duyệt, lập chỉ mục, vô hiệu hóa và lịch sử xử lý.
- Tìm tài liệu thuần không sinh câu trả lời.
- Tra cứu kết quả tạo hồ sơ mới theo request ID khi mất response; hiện UI không retry tạo mới ngầm.
- Cơ chế idempotency bền vững hoặc tra cứu kết quả cho lần tạo hồ sơ Agent đầu tiên sau khi mất response.
- Ràng buộc duyệt một lần từ `approvalId` tới `caseId`, `toolCallId`, tool, đối số, phạm vi và phiên bản; cho tới khi có, giữ mọi cờ thao tác ghi ở `false`.
- Bản preview thao tác có cấu trúc và bất biến, gồm đối tượng/chi nhánh, ảnh hưởng, số tiền, giá trị trước-sau, phiên bản, xác nhận của nhân viên và quyết định của người duyệt. Cần chốt quy tắc phân tách người tạo/xác nhận/duyệt cho từng nhóm thao tác.
- Quyết định phạm vi chi nhánh của case: theo mọi chi nhánh actor được cấp quyền hay gắn cố định với chi nhánh đang chọn. Hiện API không nhận branch context ở message/case và tra cứu có thể thấy mọi chi nhánh được cấp quyền; mọi giới hạn theo chi nhánh hiện chỉ đến từ quyền nghiệp vụ của từng tool.
- Idempotency bền vững hoặc API đối soát kết quả cho các tool ghi lịch, đơn thuê và điều chuyển; khóa đang có trong schema chưa được lưu/kiểm tra cho các thao tác này.
- Citation có thể truy xuất và xác minh phiên bản/trạng thái duyệt/quyền nguồn; trường metadata không rỗng hiện chưa đủ để xác nhận nguồn có thật.
- API health/capability để hiển thị sức khỏe runtime chính xác.

Không bổ sung các năng lực này bằng dữ liệu demo hoặc lời hứa trong hội thoại. Khi có API, cập nhật hợp đồng, quyền, trạng thái lỗi và tiêu chí nghiệm thu trước; sau đó mới nối màn hình phù hợp.

## 6. Phân công ranh giới

- **Đội AI Agent:** runtime, quản lý hồ sơ/hội thoại, RAG và trích dẫn, chọn tool trong allowlist, làm rõ thông tin, xác nhận/duyệt, xử lý timeout/xung đột và kiểm thử các tiêu chí mục 4.
- **Đội Studio API:** duy trì route facade, tool registry/schema, kiểm tra quyền/chi nhánh, kết quả nghiệp vụ và feature flags; bổ sung API còn thiếu chỉ sau khi được chốt.
- **Đội Web:** hiển thị trạng thái và nguồn trả về theo hợp đồng; không gọi callback nội bộ, không hiển thị chức năng thiếu API như đã sẵn sàng.

Không đổi Prisma schema, chính sách nghiệp vụ hoặc quyền chỉ để Agent dễ gọi. Mọi thay đổi hợp đồng phải cập nhật tài liệu này, kiểm thử contract và kiểm tra cả API lẫn UI.
