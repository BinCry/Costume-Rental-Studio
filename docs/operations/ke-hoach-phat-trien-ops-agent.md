# Kế hoạch phát triển Ops Agent cho Costume Rental Studio

**Người soạn:** BinCry <bincry2006@gmail.com>

**Ngày đối chiếu mã nguồn:** 18/10/2026

**Mốc đối chiếu:** `main` tại `ba64189764b0bdc53047720e011a349cb9dcde07`

**Trạng thái:** kế hoạch đề xuất; các quyết định ở mục 8 chưa được phê duyệt.

## 1. Mục tiêu và ranh giới sản phẩm

Ops Agent hỗ trợ nhân viên và quản trị viên **của Costume Rental Studio** xử lý công việc cho thuê trang phục qua nhiều chi nhánh: đọc tình trạng hiện tại, giải thích chính sách có nguồn, nhận diện việc cần làm, chuẩn bị phương án và chuyển quyết định có tác động cho người có quyền. Giá trị cần đo là thời gian tìm thông tin, thời gian xử lý đơn, số lần chuyển qua lại giữa màn hình, chất lượng bàn giao ca và khả năng truy vết quyết định.

Tên đề tài “Nền tảng AI Agent tự động hóa vận hành doanh nghiệp thương mại điện tử vừa và nhỏ” mô tả **bối cảnh áp dụng**: Studio là một doanh nghiệp nhỏ có kênh nhận yêu cầu thuê trực tuyến. Phạm vi phiên bản này chỉ có **một doanh nghiệp, nhiều chi nhánh**. Kế hoạch không bao gồm nhiều tenant, kết nối cửa hàng bên ngoài, bán hàng, giỏ hàng, giao vận hoặc tự động ra quyết định tài chính. Nếu đề tài cần chứng minh dùng được cho doanh nghiệp khác, đó là thay đổi phạm vi phải được phân tích và phê duyệt riêng.

Nguồn chuẩn nghiệp vụ và quyền vẫn là Studio API và [`business-rules.md`](../business/business-rules.md). Agent không ghi trực tiếp cơ sở dữ liệu, không suy ra chính sách từ hội thoại và không thay người có quyền phê duyệt ngoại lệ. Giá ngày thuê, cọc, quy tắc 12+12 giờ và các khoản phát sinh phải đọc từ cấu hình/chính sách có hiệu lực, không đóng cứng trong prompt.

## 2. Hiện trạng đã xác minh từ repository

| Năng lực | Trạng thái ngày 18/10/2026 | Bằng chứng mã nguồn | Giới hạn cần xử lý |
| --- | --- | --- | --- |
| Giao diện Ops | Có bốn khu production: Bàn làm việc, Hỏi trợ lý, Tra cứu hướng dẫn, Yêu cầu hiện tại; tài khoản nhân viên/quản trị cần quyền tri thức | [`OpsAgentPage.tsx`](../../apps/web/src/pages/OpsAgentPage.tsx), [`StudioApp.tsx`](../../apps/web/src/app/StudioApp.tsx) | Chưa có hàng đợi nhóm, lịch sử tìm kiếm, màn audit hay quản lý nguồn thực |
| Hồ sơ và hội thoại | Studio API chuyển tiếp tạo/tiếp tục/đọc một hồ sơ tới AI runtime | [`agent.route.ts`](../../apps/api/src/modules/agent/agent.route.ts), [`agent.service.ts`](../../apps/api/src/modules/agent/agent.service.ts) | Chưa có danh sách hồ sơ, idempotency bền cho lần tạo đầu, job bất đồng bộ hoặc stream |
| Tra cứu hướng dẫn | API chuyển tiếp câu trả lời và kiểm tra cấu trúc metadata nguồn | [`knowledge.route.ts`](../../apps/api/src/modules/knowledge/knowledge.route.ts), [`knowledge.service.ts`](../../apps/api/src/modules/knowledge/knowledge.service.ts) | Chưa xác minh được citation trỏ tới đúng phiên bản tài liệu đã duyệt và còn hiệu lực |
| Tool đọc | 10 tool trong allowlist, qua Studio API và kiểm tra quyền | [`agent-tools.registry.ts`](../../apps/api/src/modules/agent-tools/agent-tools.registry.ts), [`agent-tools.service.ts`](../../apps/api/src/modules/agent-tools/agent-tools.service.ts) | Chưa phủ đủ timeline đơn, việc sắp đến hạn, phí/công nợ, CRM, policy đang áp dụng |
| Tool ghi | 11 tên tool đã khai báo | [`agent-tools.registry.ts`](../../apps/api/src/modules/agent-tools/agent-tools.registry.ts), [`agent-tools.service.ts`](../../apps/api/src/modules/agent-tools/agent-tools.service.ts) | **Tất cả bị chặn bởi `AGENT_WRITE_TOOLS_NOT_READY`**, kể cả khi bật cờ môi trường; chưa phải tính năng vận hành |
| Phê duyệt, chống trùng | Có route quyết định và trường `approvalId`/`idempotencyKey` trong hợp đồng | [`agent.route.ts`](../../apps/api/src/modules/agent/agent.route.ts), [`agent-tools.schema.ts`](../../apps/api/src/modules/agent-tools/agent-tools.schema.ts) | Quyền duyệt mới được kiểm tra chung, chưa gắn bền với một preview/hành động; chống trùng bền mới có ở checkout/hoàn tiền |
| Nghiệp vụ gốc | Đơn, bộ đồ, thanh toán, trả đồ, điều chuyển, CRM, chính sách và báo cáo đã có module riêng | [`schema.prisma`](../../apps/api/prisma/schema.prisma), [`business-rules.md`](../business/business-rules.md) | Ops phải gọi và diễn giải các module này, không tạo hệ nghiệp vụ thứ hai |

Đây là **đánh giá mã nguồn tĩnh**. Chưa xác nhận AI runtime, dữ liệu tri thức và toàn bộ hành trình trên môi trường tích hợp đang hoạt động. Việc một route hoặc tên tool tồn tại không chứng minh luồng đã sẵn sàng cho production.

## 3. Các hành trình Ops cần phục vụ

| Ưu tiên | Tình huống ở Studio | Agent cần làm trước | Quyết định/tác động thuộc về |
| --- | --- | --- | --- |
| P0 | Yêu cầu thuê chờ duyệt; kiểm tra lịch và chọn bộ cụ thể | Tổng hợp đơn, kỳ thuê, chi nhánh, bộ còn khả dụng và xung đột; mở đúng đơn gốc | Nhân viên xác nhận, phân bộ trong luồng đơn hiện có |
| P0 | Khách đã đặt trước nhưng đơn trước trả muộn | Phát hiện rủi ro theo lịch, khoảng đệm và trạng thái đơn; đề xuất bộ thay thế/cách liên hệ có căn cứ | Nhân viên xử lý ngoại lệ; chính sách và đơn gốc quyết định khả dụng/phí |
| P0 | Giao đồ, thu tiền thuê và cọc | Kiểm tra các khoản phải thu, tình trạng thanh toán và bước giao còn thiếu; nhắc tránh thu trùng | Thu tiền/giao đồ theo quyền và API thanh toán, bàn giao |
| P0 | Đang thuê, sắp trả, quá hạn | Đưa việc cần theo dõi, mốc thời gian, liên hệ/đối chiếu và trạng thái đơn | Nhân viên xử lý; không tự gia hạn hay kết luận phí |
| P0 | Trả một phần, hư hỏng, quyết toán và hoàn cọc | Gom bằng chứng kiểm tra, các khoản đã thu, tiền còn phải thu/hoàn và điểm cần duyệt | Nhân viên/quản lý quyết toán; phương thức hoàn vẫn là quyết định sản phẩm đang mở |
| P1 | Tra cứu/chặn bộ, điều chuyển chi nhánh | Chỉ ra vị trí, lịch, trạng thái, phiên bản và xung đột; mở màn kho/điều chuyển | Nhân viên có quyền thực hiện trên module gốc |
| P1 | Khiếu nại, yêu cầu hỗ trợ khách hàng | Tóm tắt dòng thời gian đơn và trường hợp CRM, đề xuất bước tiếp theo không lộ dữ liệu vượt quyền | Nhân viên phụ trách CRM |

Nguyên tắc UX: hàng đợi có việc thật mới được hiện trong production; mỗi thẻ việc có trạng thái, chi nhánh, hạn xử lý, lý do ưu tiên và đường mở bản ghi nguồn. Cùng một thao tác không bị nhập lại ở Ops rồi nhập lại ở màn đơn/kho/CRM. Không trình bày gợi ý của Agent như quyết định đã thực thi.

## 4. Mức tự động hóa dự kiến

1. **Đọc và giải thích:** tra cứu dữ liệu có quyền, trả lời chính sách có citation; thiếu căn cứ thì nói chưa đủ.
2. **Đề xuất:** ghép dữ liệu, đánh dấu rủi ro, tạo checklist/bản xem trước; không thay đổi nghiệp vụ.
3. **Nhân viên xác nhận:** chỉ thực thi tool ghi sau preview bất biến, xác nhận đúng người và kiểm tra lại quyền/phiên bản tại Studio API.
4. **Quản lý phê duyệt:** áp dụng cho thao tác có ngưỡng tiền/rủi ro hoặc quyền cao; người duyệt và người tạo được phân tách theo chính sách từng hành động.
5. **Tự động có giới hạn:** chỉ xem xét cho việc ít rủi ro đã có quy tắc, hạn mức, tần suất, đối soát, cảnh báo và công tắc tắt riêng. Chưa có hành động nào được mặc định vào mức này.

Hiện trạng cho phép khảo sát mức 1; mức 2 cần thêm dữ liệu và chất lượng nguồn. Mức 3–5 là **đề xuất tương lai**, chưa thể bật chỉ bằng sửa prompt hoặc cờ môi trường.

## 5. Kiến trúc trách nhiệm đề xuất

```text
Nhân viên/Quản trị (Web)
  → Studio API (xác thực, quyền, chi nhánh, case façade)
    → AI runtime (hiểu yêu cầu, lập bước, tổng hợp câu trả lời)
      → callback tool allowlist của Studio API
        → service nghiệp vụ hiện có → PostgreSQL

Tài liệu được duyệt → quy trình nạp/phiên bản/thu hồi → chỉ mục tri thức → câu trả lời có nguồn
Sự kiện nghiệp vụ → bộ tạo việc Ops → hàng đợi theo quyền/chi nhánh → nhân viên xử lý
```

- **Studio API** quyết định quyền ở mỗi lần đọc/ghi, giới hạn chi nhánh, tính hợp lệ phiên bản, quy tắc đơn/kho/tiền và kết quả cuối. Dịch vụ AI không giữ khóa database hay gọi HTTP nghiệp vụ tùy ý.
- **AI runtime** sở hữu phiên hội thoại và việc chọn tool trong allowlist. Cần chốt ai sở hữu bản ghi case/hàng đợi và sự kiện trước khi thiết kế schema; không mặc định lưu hai bản độc lập rồi đồng bộ mơ hồ.
- **Nguồn tri thức** có chủ sở hữu, phạm vi chi nhánh/đối tượng đọc, phiên bản, ngày hiệu lực, trạng thái duyệt, đoạn trích ổn định và dấu thu hồi. Bản trả lời gắn đúng phiên bản đã dùng.
- **Hàng đợi** nên lấy từ sự kiện/trạng thái nghiệp vụ Studio, có khóa chống tạo trùng cho cùng sự kiện, không dựa vào LLM đoán việc. LLM chỉ tóm tắt/ưu tiên có thể giải thích; thứ tự khẩn cấp và hạn xử lý do quy tắc có thể kiểm tra quyết định.
- **Theo dõi** nối một `requestId`/`caseId` xuyên Web → Studio API → runtime → callback → service nghiệp vụ; log chỉ giữ metadata tối thiểu, che dữ liệu cá nhân, không ghi prompt/token/secret nguyên văn theo mặc định.
- **Lỗi và phục hồi:** nếu mất phản hồi sau một thao tác có thể đã ghi, trạng thái là “cần đối soát”; không gửi lại tự động. Chỉ báo “đã hoàn tất” sau khi Studio API xác minh kết quả nghiệp vụ.

## 6. Lộ trình triển khai có phụ thuộc

Không gán ngày hoàn thành khi chưa có năng lực đội, môi trường tích hợp và các quyết định mục 8. Mỗi chặng tạo một bản có thể nghiệm thu; chỉ chuyển chặng khi cổng chất lượng của chặng trước đạt.

| Chặng | Phụ thuộc | Đầu ra có thể bàn giao | Chủ trì / phối hợp | Điều kiện ra chặng |
| --- | --- | --- | --- | --- |
| **P0 — Hợp đồng và phạm vi** | Kế hoạch này được duyệt | Sơ đồ quyền theo vai trò/chi nhánh/tool; quyết định case thuộc chi nhánh nào; schema case, nguồn, event, preview; danh sách dữ liệu nhạy cảm và chính sách lưu | Product + Studio BE / AI, FE, QA | Contract có version và ví dụ lỗi; review quyền cho mọi hành động; tool ghi vẫn bị chặn |
| **P1 — Tra cứu đáng tin cậy** | P0 | Tool đọc cho 7 hành trình ở mục 3; nguồn policy có phiên bản/hiệu lực; bộ đánh giá câu trả lời; deep link sang màn nghiệp vụ | Studio BE + AI / QA, FE | Sai chi nhánh/quyền bị từ chối; câu không có nguồn trả “chưa đủ căn cứ”; không có side effect |
| **P2 — Việc và hồ sơ thực** | P0, sự kiện nghiệp vụ | API hàng đợi phân trang/lọc/nhận việc; tìm lại case, lịch sử và audit; idempotency tạo case lần đầu; UI chỉ dùng API thật | Studio BE + AI + FE / QA | Gửi mất phản hồi có thể tra cứu; hàng đợi khớp trạng thái nguồn; không có việc mẫu trong production |
| **P3 — Chuẩn bị hành động an toàn** | P1, P2 | Preview bất biến, đối chiếu trước/sau, xác nhận/duyệt một lần gắn đúng action, idempotency và API đối soát; trước mắt ở chế độ mô phỏng không ghi | Studio BE + AI / FE, QA, Product | Đổi đối số/chi nhánh/phiên bản/người duyệt làm preview vô hiệu; retry không gây ghi trùng; qua E2E xung đột/lỗi |
| **P4 — Mở ghi từng nhóm** | P3, phê duyệt của chủ sản phẩm | Bật nhóm tool đã qua gate trên staging rồi production theo thứ tự rủi ro; giám sát, công tắc tắt và runbook | Product + Studio BE / AI, FE, QA, vận hành | Chỉ nhóm đã được chấp thuận được bật; có bằng chứng đối soát, rollback và test luồng người thật |
| **P5 — Tối ưu vận hành** | P2–P4 và dữ liệu đo thực | Cải thiện ưu tiên, phân công, chất lượng gợi ý, tốc độ, chi phí; cân nhắc việc tự động ít rủi ro | Product + AI / Studio BE, FE, QA | So với số đo ban đầu, không tăng lỗi an toàn hay bỏ sót việc; mỗi tự động hóa có policy riêng |

**Thứ tự nhóm ghi để đánh giá ở P4:** lịch/chặn bộ → điều chuyển → đơn thuê → thanh toán/hoàn tiền. Đây là thứ tự **xem xét**, không phải cam kết bật; nhóm tài chính cần đối soát và duyệt chặt nhất. Có thể hoán đổi nếu dữ liệu kiểm thử cho thấy rủi ro khác.

### Danh sách công việc gần nhất cho nhóm

| Mã | Việc cụ thể | Đầu ra cần xem lại | Phụ thuộc |
| --- | --- | --- | --- |
| OPS-01 | Chốt case gắn chi nhánh đang chọn hay mọi chi nhánh được cấp quyền | Quyết định và ma trận test role × branch | Product |
| OPS-02 | Lập catalogue 7 hành trình: dữ liệu đọc, màn nguồn, quyền, trạng thái lỗi | Contract tool/API và dữ liệu mẫu đã ẩn thông tin cá nhân | OPS-01 |
| OPS-03 | Chốt nguồn policy, người duyệt, phiên bản, hiệu lực và thu hồi | Mẫu citation kiểm chứng được; quy trình cập nhật policy | Product + nghiệp vụ |
| OPS-04 | Thiết kế case/hàng đợi/lịch sử/audit và khôi phục lần tạo đầu | Contract + mô hình lưu + sự kiện đối soát | OPS-01 |
| OPS-05 | Xây bộ kịch bản đánh giá và dữ liệu staging giả lập | Test đúng/sai quyền, xung đột, thiếu nguồn, mất phản hồi | OPS-02, OPS-03 |
| OPS-06 | Thiết kế preview/approval/idempotency cho từng tool ghi, chưa bật | Threat model, contract, test fault injection | OPS-01, OPS-04 |

## 7. Cổng nghiệm thu và an toàn phát hành

1. **Phân quyền:** có test tự động cho từng vai trò, trạng thái nhân viên, quyền và chi nhánh; truy cập chéo chi nhánh bị từ chối ở Studio API, kể cả khi UI gửi dữ liệu sai.
2. **Tool:** mọi tên ngoài allowlist bị từ chối; tool ghi tiếp tục trả `AGENT_WRITE_TOOLS_NOT_READY` và không đổi database cho đến khi nhóm đó vượt P3/P4. Không mở cờ để vượt guard.
3. **Tri thức:** citation phải truy xuất được tài liệu, phiên bản, đoạn, trạng thái duyệt, đối tượng đọc và hiệu lực tại lúc trả lời. Nếu thiếu, mâu thuẫn hoặc đã thu hồi thì Agent từ chối kết luận chính sách. Không khẳng định đủ căn cứ chỉ vì chuỗi citation không rỗng.
4. **Ghi dữ liệu:** preview gắn `caseId`, `toolCallId`, tool, đối số chuẩn hóa/hash, đối tượng, chi nhánh, phiên bản, actor, thời hạn và đúng người duyệt. Mỗi quyết định dùng một lần. Cùng khóa và cùng payload trả cùng kết quả; cùng khóa khác payload trả xung đột. Thử lỗi sau commit/trước response phải cho đúng một tác động và có đường đối soát.
5. **Hành trình thật:** kiểm tra từ trình duyệt qua Studio API, AI runtime, callback, service nghiệp vụ và dữ liệu cuối trên staging bằng dữ liệu giả lập. Bao gồm đơn chờ, giao/thu cọc, trả một phần/hư hỏng, quá hạn, xung đột lịch và điều chuyển.
6. **Quan sát và khôi phục:** tìm được một tác vụ theo mã tương quan, thấy actor/chi nhánh/tool/kết quả mà không lộ bí mật; có cảnh báo lỗi, công tắc tắt theo nhóm ghi và hướng dẫn đối soát thủ công.
7. **Đánh giá chất lượng:** tạo bộ câu hỏi tình huống Studio có đáp án từ nghiệp vụ và ca thiếu căn cứ/prompt injection. Đặt ngưỡng theo số đo ban đầu trước khi chốt release; không dùng tỷ lệ đẹp nhưng chưa có bộ đo. Không chấp nhận lỗi nghiêm trọng về quyền, tiền hoặc ghi trùng.

## 8. Quyết định cần chủ sản phẩm chốt

| Mã | Câu hỏi cần quyết định | Đề xuất để bắt đầu thiết kế | Hậu quả nếu chưa chốt |
| --- | --- | --- | --- |
| Q-01 | Case theo chi nhánh nào? | Gắn một chi nhánh được chọn khi tạo case; đổi chi nhánh tạo case khác; tra cứu toàn chuỗi là quyền riêng | Không thể cam kết hàng đợi và tool được giới hạn đúng chi nhánh |
| Q-02 | Ai tạo, nhận, xác nhận và duyệt việc? | Nhân viên chỉ nhận/xác nhận việc trong phân công; quản lý duyệt hành động rủi ro theo quyền chi nhánh; tách người tạo và duyệt nơi cần | Không thể hoàn thiện approval và phân công |
| Q-03 | Nhóm ghi nào được phép mở đầu tiên? | Bắt đầu từ lịch/chặn bộ sau P3; tài chính sau cùng | Không thể lên rollout hoặc UX preview cụ thể |
| Q-04 | Chính sách nào là nguồn chính thức của Agent? | Chỉ tài liệu được chủ nghiệp vụ duyệt, có phiên bản/hiệu lực/chi nhánh; API nghiệp vụ thắng khi tính tiền/khả dụng | Agent có thể viện dẫn policy cũ hoặc trái kết quả hệ thống |
| Q-05 | Hoàn cọc được chi trả và đối soát ra sao? | Trước mắt Agent chỉ hiển thị trạng thái và bước cần chốt, không hứa đã hoàn tiền | Không được tự động hóa yêu cầu hoàn tiền |
| Q-06 | Giữ hội thoại, bằng chứng và log trong bao lâu? | Chốt thời hạn, quyền xem/xóa và dữ liệu được phép gửi tới AI trước khi lưu lịch sử | Rủi ro riêng tư, không thể thiết kế audit/retention |
| Q-07 | Ai vận hành runtime, đánh giá mô hình và xử lý sự cố? | Chỉ định owner sản phẩm, AI, API và trực vận hành; chốt SLO/giới hạn chi phí từ số đo | Không có tiêu chuẩn ổn định hay đường rollback |

Đề xuất trong cột ba **chưa phải chính sách đã chốt**. Ghi quyết định vào [`business-rules.md`](../business/business-rules.md) hoặc tài liệu API tương ứng trước khi triển khai phụ thuộc.

## 9. Rủi ro, điều kiện dừng và số đo

| Rủi ro | Cách kiểm soát bắt buộc |
| --- | --- |
| Agent tự ý làm vượt quyền hoặc bị nội dung khách/tài liệu dẫn lệnh | Tool tối thiểu, allowlist và phân quyền tại Studio API; văn bản lấy về chỉ là dữ liệu, không là lệnh |
| Nguồn chính sách sai/cũ | Duyệt, phiên bản, hiệu lực, citation kiểm chứng và cơ chế thu hồi; trả “chưa đủ căn cứ” khi thiếu |
| Ghi trùng hoặc báo thành công khi chưa rõ kết quả | Idempotency bền, tra cứu/đối soát theo khóa, fault injection và trạng thái cần xác minh |
| Việc Ops lệch trạng thái đơn/kho | Sự kiện có khóa chống trùng, đối chiếu định kỳ với bản ghi nguồn và hiển thị thời điểm cập nhật |
| Lộ dữ liệu khách/nhân viên qua model/log | Giới hạn trường trả về, che dữ liệu cá nhân, không ghi secret/prompt nguyên văn, kiểm thử truy cập theo quyền |

**Điều kiện dừng:** phát hiện truy cập vượt chi nhánh, citation không xác minh được nhưng vẫn kết luận chính sách, tiền/kho bị ghi trùng, kết quả “thành công” không khớp bản ghi nguồn hoặc audit không truy vết được. Tắt nhóm ghi liên quan, giữ nguyên dữ liệu để đối soát, chuyển việc cho người vận hành; không dùng Agent thử ghi lại.

Trước P5 cần đo nền: thời gian từ đơn chờ tới xác nhận, thời gian tìm chính sách, tỷ lệ case cần chuyển người, tỷ lệ câu có nguồn hợp lệ, tỷ lệ thao tác không rõ kết quả, số xung đột lịch được phát hiện trước ngày nhận, thời gian xử lý quá hạn và lỗi quyền/ghi trùng. Mục tiêu số phải chốt sau khi có dữ liệu thật; tài liệu này không giả định mức cải thiện.

## 10. Tài liệu liên quan và cơ sở tham khảo

- Hợp đồng hiện có, danh sách tool, RAG và phần còn chờ: [`yeu-cau-hoan-thien-ai-agent.md`](yeu-cau-hoan-thien-ai-agent.md).
- UI production so với API: [`doi-chieu-ui-ops-agent-va-api.md`](doi-chieu-ui-ops-agent-va-api.md).
- Quy tắc nghiệp vụ: [`business-rules.md`](../business/business-rules.md).
- [OWASP LLM06:2025 Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/): tham khảo nguyên tắc giới hạn tool/quyền và duyệt hành động có tác động; các kiểm soát cụ thể ở trên là thiết kế đề xuất cho Studio, chưa phải chứng nhận tuân thủ.
- [NIST AI RMF — Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf): tham khảo cách quản trị rủi ro và đánh giá vòng đời; không tuyên bố hệ thống đã đạt chuẩn.
- [OpenTelemetry Semantic Conventions for GenAI](https://opentelemetry.io/docs/specs/semconv/gen-ai/): tham khảo khi thiết kế mã tương quan/trace; cần lọc nội dung nhạy cảm trước khi ghi telemetry.
