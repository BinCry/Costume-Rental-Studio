# Kế hoạch phát triển Ops Agent cho Costume Rental Studio

**Người soạn:** BinCry <bincry2006@gmail.com>

**Ngày đối chiếu mã nguồn:** 18/10/2026

**Mốc đối chiếu:** Studio `main` tại `b0733a8724acb0baf963f394e73663eb88b7fc78`; AI Agent `main` tại [`18bbc70374f4296bf602390dd198bc8013b2bcc4`](https://github.com/BinCry/Costume-Rental-Ops-Agent/commit/18bbc70374f4296bf602390dd198bc8013b2bcc4).

**Trạng thái:** kế hoạch triển khai đề xuất sau [khảo sát thực tế 18/10/2026](khao-sat-hien-trang-ops-agent-2026-10-18.md); các quyết định ở mục 8 chưa được phê duyệt.

## 1. Mục tiêu và ranh giới sản phẩm

Ops Agent hỗ trợ nhân viên và quản trị viên **của Costume Rental Studio** xử lý công việc cho thuê trang phục qua nhiều chi nhánh: đọc tình trạng hiện tại, giải thích chính sách có nguồn, nhận diện việc cần làm, chuẩn bị phương án và chuyển quyết định có tác động cho người có quyền. Giá trị cần đo là thời gian tìm thông tin, thời gian xử lý đơn, số lần chuyển qua lại giữa màn hình, chất lượng bàn giao ca và khả năng truy vết quyết định.

Tên đề tài “Nền tảng AI Agent tự động hóa vận hành doanh nghiệp thương mại điện tử vừa và nhỏ” mô tả **bối cảnh áp dụng**: Studio là một doanh nghiệp nhỏ có kênh nhận yêu cầu thuê trực tuyến. Phạm vi phiên bản này chỉ có **một doanh nghiệp, nhiều chi nhánh**. Kế hoạch không bao gồm nhiều tenant, kết nối cửa hàng bên ngoài, bán hàng, giỏ hàng, giao vận hoặc tự động ra quyết định tài chính. Nếu đề tài cần chứng minh dùng được cho doanh nghiệp khác, đó là thay đổi phạm vi phải được phân tích và phê duyệt riêng.

Nguồn chuẩn nghiệp vụ và quyền vẫn là Studio API và [`business-rules.md`](../business/business-rules.md). Agent không ghi trực tiếp **cơ sở dữ liệu nghiệp vụ Studio**, không suy ra chính sách từ hội thoại và không thay người có quyền phê duyệt ngoại lệ. AI runtime có database riêng để lưu hội thoại, case và chỉ mục tri thức. Giá ngày thuê, cọc, quy tắc 12+12 giờ và các khoản phát sinh phải đọc từ cấu hình/chính sách có hiệu lực, không đóng cứng trong prompt.

## 2. Hiện trạng đã xác minh

| Năng lực | Trạng thái ngày 18/10/2026 | Bằng chứng mã nguồn | Giới hạn cần xử lý |
| --- | --- | --- | --- |
| Giao diện Ops | Có bốn khu production: Bàn làm việc, Hỏi trợ lý, Tra cứu hướng dẫn, Yêu cầu hiện tại; tài khoản nhân viên/quản trị cần quyền tri thức | [`OpsAgentPage.tsx`](../../apps/web/src/pages/OpsAgentPage.tsx), [`StudioApp.tsx`](../../apps/web/src/app/StudioApp.tsx) | Chưa có hàng đợi nhóm, lịch sử tìm kiếm, màn audit hay quản lý nguồn thực |
| Hồ sơ và hội thoại | Studio API chuyển tiếp tạo/tiếp tục/đọc một hồ sơ tới AI runtime | [`agent.route.ts`](../../apps/api/src/modules/agent/agent.route.ts), [`agent.service.ts`](../../apps/api/src/modules/agent/agent.service.ts) | Chưa có danh sách hồ sơ, idempotency bền cho lần tạo đầu, job bất đồng bộ hoặc stream |
| Tra cứu hướng dẫn | API chuyển tiếp câu trả lời và kiểm tra cấu trúc metadata nguồn | [`knowledge.route.ts`](../../apps/api/src/modules/knowledge/knowledge.route.ts), [`knowledge.service.ts`](../../apps/api/src/modules/knowledge/knowledge.service.ts) | Chưa xác minh được citation trỏ tới đúng phiên bản tài liệu đã duyệt và còn hiệu lực |
| Tool đọc | 10 tool trong allowlist, qua Studio API và kiểm tra quyền | [`agent-tools.registry.ts`](../../apps/api/src/modules/agent-tools/agent-tools.registry.ts), [`agent-tools.service.ts`](../../apps/api/src/modules/agent-tools/agent-tools.service.ts) | Chưa phủ đủ timeline đơn, việc sắp đến hạn, phí/công nợ, CRM, policy đang áp dụng |
| Tool ghi | 11 tên tool đã khai báo | [`agent-tools.registry.ts`](../../apps/api/src/modules/agent-tools/agent-tools.registry.ts), [`agent-tools.service.ts`](../../apps/api/src/modules/agent-tools/agent-tools.service.ts) | **Tất cả bị chặn bởi `AGENT_WRITE_TOOLS_NOT_READY`**, kể cả khi bật cờ môi trường; chưa phải tính năng vận hành |
| Phê duyệt, chống trùng | Có route quyết định và trường `approvalId`/`idempotencyKey` trong hợp đồng | [`agent.route.ts`](../../apps/api/src/modules/agent/agent.route.ts), [`agent-tools.schema.ts`](../../apps/api/src/modules/agent-tools/agent-tools.schema.ts) | Quyền duyệt mới được kiểm tra chung, chưa gắn bền với một preview/hành động; chống trùng bền mới có ở checkout/hoàn tiền |
| Nghiệp vụ gốc | Đơn, bộ đồ, thanh toán, trả đồ, điều chuyển, CRM, chính sách và báo cáo đã có module riêng | [`schema.prisma`](../../apps/api/prisma/schema.prisma), [`business-rules.md`](../business/business-rules.md) | Ops phải gọi và diễn giải các module này, không tạo hệ nghiệp vụ thứ hai |
| AI Agent riêng | Repo AI `main` đã có FastAPI, LangGraph, case store PostgreSQL, tool client allowlist, RAG/pgvector, migration và tests | [AI README](https://github.com/BinCry/Costume-Rental-Ops-Agent/blob/18bbc70374f4296bf602390dd198bc8013b2bcc4/README.md), [runtime](https://github.com/BinCry/Costume-Rental-Ops-Agent/tree/18bbc70374f4296bf602390dd198bc8013b2bcc4/app/agent_tools), [knowledge](https://github.com/BinCry/Costume-Rental-Ops-Agent/tree/18bbc70374f4296bf602390dd198bc8013b2bcc4/app/knowledge) | Có mã chạy thực, nhưng tình trạng dữ liệu/nguồn ở môi trường triển khai chưa đạt readiness |
| Triển khai hiện tại | Studio API `/health/ready` 200; AI `/health` 200 nhưng AI `/health/ready` **503 `DATABASE_UNAVAILABLE`**; Coolify ghi cả ứng dụng và AI DB là `Running` | [Khảo sát runtime](khao-sat-hien-trang-ops-agent-2026-10-18.md) | Chưa thể nghiệm thu Agent/RAG liên dịch vụ. Healthcheck Coolify đang kiểm `/health`, không phát hiện thiếu kết nối AI DB |

Khảo sát này kết hợp mã nguồn, GitHub Actions, giao diện production có phiên sẵn và HTTP health công khai. Chưa chạy hội thoại có xác thực, RAG có citation hoặc thao tác nghiệp vụ end-to-end; các tín hiệu liveness/CI không chứng minh năng lực đó. Repo AI checkout cũ trên máy khác mốc GitHub `main` và có thay đổi chưa commit, nên kế hoạch dùng commit remote đã publish làm baseline.

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

Mức 1 đã có đường triển khai trong mã, nhưng **AI readiness 503 đang chặn nghiệm thu runtime**. Mức 2 cần thêm dữ liệu vận hành, nguồn đáng tin cậy và trigger/hàng đợi thật. Mức 3–5 là **đề xuất tương lai**, chưa thể bật chỉ bằng sửa prompt hoặc cờ môi trường.

## 5. Kiến trúc trách nhiệm đề xuất

```text
Nhân viên/Quản trị (Web)
  → Studio API (xác thực, quyền, chi nhánh, case façade)
    → AI runtime (hiểu yêu cầu, lập bước, tổng hợp câu trả lời; lưu case/hội thoại hiện tại)
      → callback tool allowlist của Studio API
        → service nghiệp vụ hiện có → PostgreSQL

Tài liệu được duyệt → quy trình nạp/phiên bản/thu hồi → chỉ mục tri thức → câu trả lời có nguồn
Sự kiện nghiệp vụ → bộ tạo việc Ops → hàng đợi theo quyền/chi nhánh → nhân viên xử lý
```

- **Studio API** là cửa ngõ xác thực của Web, kiểm tra quyền ở mỗi lần đọc/ghi và bảo vệ quy tắc đơn/kho/tiền. Hiện tại bối cảnh chi nhánh được chọn ở Web chưa đi vào `POST /agent/messages`; phạm vi case và mọi tool phải được ràng buộc, kiểm lại tại Studio API trước khi nói rằng Agent làm việc theo chi nhánh.
- **AI runtime** hiện đã có bảng case, message, step, tool call và evidence trong database riêng; nó sở hữu hội thoại và chọn tool trong allowlist. Giữ các bảng này cho trạng thái thực thi/hội thoại. **Đề xuất:** Studio sở hữu việc vận hành có thời hạn, phân công và trạng thái gắn đơn/kho/CRM; lưu liên kết `studioWorkItemId` ↔ `agentCaseId` rõ ràng, không sao chép hai hàng đợi độc lập. Chốt contract trước khi thêm schema.
- **Nguồn tri thức** có chủ sở hữu, phạm vi chi nhánh/đối tượng đọc, phiên bản, ngày hiệu lực, trạng thái duyệt, đoạn trích ổn định và dấu thu hồi. Bản trả lời gắn đúng phiên bản đã dùng.
- **Hàng đợi** nên lấy từ sự kiện/trạng thái nghiệp vụ Studio, có khóa chống tạo trùng cho cùng sự kiện, không dựa vào LLM đoán việc. LLM chỉ tóm tắt/ưu tiên có thể giải thích; thứ tự khẩn cấp và hạn xử lý do quy tắc có thể kiểm tra quyết định.
- **Theo dõi** nối một `requestId`/`caseId` xuyên Web → Studio API → runtime → callback → service nghiệp vụ; log chỉ giữ metadata tối thiểu, che dữ liệu cá nhân, không ghi prompt/token/secret nguyên văn theo mặc định. Bỏ trường văn bản tự do `refund.reason` khỏi projection trả cho Agent hoặc rút gọn theo danh mục lý do đã duyệt.
- **Lỗi và phục hồi:** nếu mất phản hồi sau một thao tác có thể đã ghi, trạng thái là “cần đối soát”; không gửi lại tự động. Chỉ báo “đã hoàn tất” sau khi Studio API xác minh kết quả nghiệp vụ.

## 6. Lộ trình triển khai có phụ thuộc

Mốc dưới đây là **lịch đề xuất**, giả định nhóm có người phụ trách sản phẩm/nghiệp vụ, Studio BE, AI BE, FE, QA và quyền cấu hình staging/Coolify. Đây chưa phải cam kết phát hành. Nếu lỗi kết nối AI DB hoặc quyết định ở mục 8 kéo dài, dịch các mốc phụ thuộc; không rút ngắn cổng nghiệm thu. Chỉ làm thay đổi production sau khi có kế hoạch rollback và bằng chứng staging tương ứng.

| Chặng và mốc đề xuất | Phụ thuộc | Đầu ra kiểm được, chủ trì | Điều kiện ra chặng |
| --- | --- | --- | --- |
| **G0 — Khôi phục nền tảng, 19–23/10/2026** | Quyền vận hành AI/Coolify | AI BE + vận hành xác định lỗi `DATABASE_UNAVAILABLE`, khôi phục kết nối, kiểm migration/ingestion, cấu hình healthcheck `/health/ready`; ghi image SHA/digest và rollback. QA chụp kết quả. | AI và Studio `/health/ready` đều 200 sau restart/deploy; truy vấn tri thức thử nghiệm có dữ liệu và log đã che secret. Nếu chưa đạt, dừng các luồng Agent phụ thuộc DB. |
| **G1 — Hợp đồng và an toàn đọc, 26/10–06/11/2026** | G0; quyết định Q-01, Q-04, Q-06 | Product + Studio BE + AI chốt schema request/response/error/version, phạm vi case theo chi nhánh, ma trận role × branch × tool, chủ nguồn policy và thời hạn lưu; bỏ projection `refund.reason` tự do. QA có contract tests hai repo. | Chuyển chi nhánh và gửi case đều bị kiểm ở server; dữ liệu sai quyền bị từ chối; source/citation có phiên bản và hạn hiệu lực; không lộ dữ liệu tự do không cần thiết. Tool ghi vẫn bị chặn. |
| **G2 — Hỗ trợ đọc cho 7 hành trình, 09–20/11/2026** | G1; dữ liệu staging giả lập | Studio BE + AI mở rộng tool đọc và bộ đánh giá tình huống; FE mở bản ghi nguồn, hiển thị không đủ căn cứ/lỗi; QA chạy trình duyệt → Studio → AI → tool với nhân viên một/nhiều chi nhánh và admin. | Mỗi hành trình ở mục 3 có câu hỏi, dữ liệu gốc, trạng thái thiếu nguồn/xung đột và bằng chứng E2E; không có side effect; câu chính sách không có citation hợp lệ không được khẳng định. |
| **G3 — Hàng đợi và hồ sơ vận hành, 23/11–04/12/2026** | G1; G2 cho hành trình cần hiển thị | Studio BE sở hữu work item phát sinh từ sự kiện/trạng thái nghiệp vụ và liên kết AI case; AI BE hỗ trợ tìm/tiếp tục case; FE xây danh sách, lọc, phân công, lịch sử, audit. QA kiểm chống trùng và phục hồi mất phản hồi. | Hàng đợi khớp bản ghi nguồn, phân trang theo quyền/chi nhánh, tạo case đầu có khóa chống trùng; không có fixture trong production; người dùng tìm lại được tác vụ/case sau lỗi mạng. |
| **G4 — Mô phỏng hành động có duyệt, 07–18/12/2026** | G2, G3; quyết định Q-02, Q-03, Q-05 | Studio BE + AI BE làm preview gắn dữ liệu/phiên bản/người duyệt, idempotency và read-back; FE trình bày trước/sau; QA fault injection trên staging. Chưa thực thi ghi trong production. | Thay actor/chi nhánh/đối số/phiên bản làm preview hết hiệu lực; approval dùng một lần; retry không tạo hai tác động; trường hợp timeout được đối soát. |
| **G5 — Quyết định mở ghi, sau 18/12/2026** | G4 đạt; owner chấp thuận từng nhóm | Product + vận hành ra quyết định Go/No-go theo nhóm, rollout staging → nhóm người dùng nhỏ → production, có kill switch, theo dõi và rollback. Nhóm tài chính chỉ xem xét sau đối soát riêng. | Bằng chứng QA, duyệt nghiệp vụ, giám sát, runbook và kết quả người dùng thật đầy đủ. Không mặc định mở tất cả 11 tool. |
| **G6 — Tối ưu theo số đo, sau G3/G5** | Baseline và quan sát đủ tin cậy | Product + AI/FE/BE giảm thời gian tìm và xử lý, độ trễ, chi phí, việc bị bỏ sót; xem xét tự động ít rủi ro riêng từng trường hợp. | So với baseline không tăng lỗi quyền, tiền, ghi trùng hoặc bỏ sót; mỗi tự động hóa có policy/giới hạn riêng. |

**Đường găng:** AI DB ready → contract chi nhánh và nguồn → E2E tra cứu → sự kiện/hàng đợi → preview/approval → quyết định mở ghi. G2 và thiết kế G3 có thể làm song song sau G1; G4 không chạy trước khi cả hai có bằng chứng. **Thứ tự xem xét nhóm ghi ở G5:** lịch/chặn bộ → điều chuyển → đơn thuê → thanh toán/hoàn tiền. Thứ tự này chưa phải quyết định bật và có thể đổi sau đánh giá rủi ro.

### Backlog có thể giao việc

| Mã / ưu tiên | Việc cụ thể và repo | Chủ trì | Phụ thuộc / bằng chứng hoàn tất |
| --- | --- | --- | --- |
| OPS-00 / P0 | Sửa AI DB readiness, kiểm migration + ingestion, post-deploy smoke và pin image SHA/digest; repo AI + Coolify | AI BE, vận hành | `/health/ready` 200 ổn định sau deploy; log/cấu hình không lộ secret; có cách rollback |
| OPS-01 / P0 | Chốt chi nhánh của case, gửi branch context qua Web → Studio → AI, kiểm lại tại tool; hai repo | Product, Studio BE, AI BE | Ma trận role × branch: một chi nhánh, nhiều chi nhánh, admin, branch không được cấp |
| OPS-02 / P1 | Lập catalogue 7 hành trình, mở tool đọc thiếu và deep link bản ghi; Studio API/Web + AI | Studio BE, AI BE, FE | Contract versioned + test E2E mỗi hành trình ở staging; trạng thái loading/empty/error/conflict |
| OPS-03 / P1 | Duyệt nguồn policy, nạp/thu hồi phiên bản, kiểm citation và ca thiếu nguồn; repo AI + Studio | Nghiệp vụ, AI BE | Có owner, hiệu lực, phạm vi, trích dẫn kiểm lại được và bộ đánh giá QA |
| OPS-04 / P1 | Thiết kế Studio work item/event, liên kết AI case, tìm/lọc/nhận việc/lịch sử/audit; Web giữ bản nháp qua refresh nhưng không tự gửi lại sau timeout; hai repo + Web | Studio BE, AI BE, FE | Không sinh việc trùng, mất response có thể tra cứu lại, UI không hiển thị dữ liệu mẫu |
| OPS-05 / P1 | Làm contract tests, dữ liệu staging và smoke theo SHA; CI cả hai repo | QA, Studio BE, AI BE | Test quyền/xung đột/timeout/citation, browser → API → AI → tool → nguồn; lưu bằng chứng build/deploy |
| OPS-06 / P1 | Giảm dữ liệu gửi mô hình, đặc biệt `refund.reason`, quy định retention/trace và quyền xem case; Studio API + AI | Studio BE, AI BE, Product | Test che PII và dữ liệu tự do; quyền xem/audit theo vai trò; log không chứa nội dung nhạy cảm |
| OPS-07 / P2 | Preview, approval, idempotency, đối soát/kill switch cho từng tool ghi; Studio API + AI + Web | Studio BE, AI BE, FE | Fault injection và review nghiệp vụ; guard ghi vẫn giữ đến Go/No-go từng nhóm |
| OPS-08 / P2 | Dashboard SLO/chất lượng và runbook hỗ trợ, promotion/rollback staging → production | Vận hành, QA, Product | Đo baseline, cảnh báo và diễn tập sự cố; release record có image digest, migration và người phê duyệt |

**Việc 48 giờ đầu sau khi nhận kế hoạch:** (1) vận hành và AI BE chụp log/kết nối AI DB có che bí mật, xác nhận nguyên nhân 503; (2) Studio BE/AI BE ký bảng contract hiện tại và điểm khác biệt, đặc biệt branch context; (3) QA chuẩn bị bộ dữ liệu staging và kiểm liveness khác readiness; (4) Product quyết định Q-01, Q-04 và người chịu trách nhiệm nguồn. Chưa thử ghi production để “xác nhận” lỗi.

## 7. Cổng nghiệm thu và an toàn phát hành

1. **Phân quyền:** có test tự động cho từng vai trò, trạng thái nhân viên, quyền và chi nhánh; truy cập chéo chi nhánh bị từ chối ở Studio API, kể cả khi UI gửi dữ liệu sai.
2. **Tool:** mọi tên ngoài allowlist bị từ chối; tool ghi tiếp tục trả `AGENT_WRITE_TOOLS_NOT_READY` và không đổi database cho đến khi nhóm đó vượt G4/G5. Không mở cờ để vượt guard.
3. **Tri thức:** citation phải truy xuất được tài liệu, phiên bản, đoạn, trạng thái duyệt, đối tượng đọc và hiệu lực tại lúc trả lời. Nếu thiếu, mâu thuẫn hoặc đã thu hồi thì Agent từ chối kết luận chính sách. Không khẳng định đủ căn cứ chỉ vì chuỗi citation không rỗng.
4. **Ghi dữ liệu:** preview gắn `caseId`, `toolCallId`, tool, đối số chuẩn hóa/hash, đối tượng, chi nhánh, phiên bản, actor, thời hạn và đúng người duyệt. Mỗi quyết định dùng một lần. Cùng khóa và cùng payload trả cùng kết quả; cùng khóa khác payload trả xung đột. Thử lỗi sau commit/trước response phải cho đúng một tác động và có đường đối soát.
5. **Hành trình thật:** kiểm tra từ trình duyệt qua Studio API, AI runtime, callback, service nghiệp vụ và dữ liệu cuối trên staging bằng dữ liệu giả lập. Bao gồm đơn chờ, giao/thu cọc, trả một phần/hư hỏng, quá hạn, xung đột lịch và điều chuyển.
6. **Quan sát và khôi phục:** tìm được một tác vụ theo mã tương quan, thấy actor/chi nhánh/tool/kết quả mà không lộ bí mật; có cảnh báo lỗi, công tắc tắt theo nhóm ghi và hướng dẫn đối soát thủ công.
7. **Đánh giá chất lượng:** tạo bộ câu hỏi tình huống Studio có đáp án từ nghiệp vụ và ca thiếu căn cứ/prompt injection. Đặt ngưỡng theo số đo ban đầu trước khi chốt release; không dùng tỷ lệ đẹp nhưng chưa có bộ đo. Không chấp nhận lỗi nghiêm trọng về quyền, tiền hoặc ghi trùng.
8. **Vận hành:** `/health/ready` của cả Studio và AI phải đạt trên image đúng SHA/digest sau deploy; kiểm migration, ingestion và một smoke test có xác thực. Chỉ `Running` hoặc `/health` 200 không đủ để mở Agent. Có người trực, cảnh báo và đường rollback.
9. **UX phục hồi:** sau timeout tạo case đầu, người dùng thấy trạng thái cần đối soát, tìm lại bằng khóa yêu cầu và giữ bản nháp sau refresh mà không tự gửi lại. Kiểm loading/empty/error/conflict, thao tác bàn phím và viewport 320/360/390px trên giao diện thật.

## 8. Quyết định cần chủ sản phẩm chốt

| Mã | Câu hỏi cần quyết định | Đề xuất để bắt đầu thiết kế | Hậu quả nếu chưa chốt |
| --- | --- | --- | --- |
| Q-01 | Case theo chi nhánh nào? | Gắn một chi nhánh được chọn khi tạo case; đổi chi nhánh tạo case khác; tra cứu toàn chuỗi là quyền riêng | Không thể cam kết hàng đợi và tool được giới hạn đúng chi nhánh |
| Q-02 | Ai tạo, nhận, xác nhận và duyệt việc? | Nhân viên chỉ nhận/xác nhận việc trong phân công; quản lý duyệt hành động rủi ro theo quyền chi nhánh; tách người tạo và duyệt nơi cần | Không thể hoàn thiện approval và phân công |
| Q-03 | Nhóm ghi nào được phép mở đầu tiên? | Bắt đầu xem xét lịch/chặn bộ sau G4; tài chính sau cùng | Không thể lên rollout hoặc UX preview cụ thể |
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
| Đường AI public bị gọi trực tiếp hoặc image mutable làm lệch bản được kiểm thử | Rà soát xác thực/tường lửa của mọi route AI, chỉ cho Studio API gọi các route nội bộ; pin image theo digest và kiểm readiness sau deploy |

**Điều kiện dừng:** phát hiện truy cập vượt chi nhánh, citation không xác minh được nhưng vẫn kết luận chính sách, tiền/kho bị ghi trùng, kết quả “thành công” không khớp bản ghi nguồn hoặc audit không truy vết được. Tắt nhóm ghi liên quan, giữ nguyên dữ liệu để đối soát, chuyển việc cho người vận hành; không dùng Agent thử ghi lại.

Trước G6 cần đo nền: thời gian từ đơn chờ tới xác nhận, thời gian tìm chính sách, tỷ lệ case cần chuyển người, tỷ lệ câu có nguồn hợp lệ, tỷ lệ thao tác không rõ kết quả, số xung đột lịch được phát hiện trước ngày nhận, thời gian xử lý quá hạn và lỗi quyền/ghi trùng. Mục tiêu số phải chốt sau khi có dữ liệu thật; tài liệu này không giả định mức cải thiện.

## 10. Tài liệu liên quan và cơ sở tham khảo

- Hợp đồng hiện có, danh sách tool, RAG và phần còn chờ: [`yeu-cau-hoan-thien-ai-agent.md`](yeu-cau-hoan-thien-ai-agent.md).
- UI production so với API: [`doi-chieu-ui-ops-agent-va-api.md`](doi-chieu-ui-ops-agent-va-api.md).
- Quy tắc nghiệp vụ: [`business-rules.md`](../business/business-rules.md).
- [OWASP LLM06:2025 Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/): tham khảo nguyên tắc giới hạn tool/quyền và duyệt hành động có tác động; các kiểm soát cụ thể ở trên là thiết kế đề xuất cho Studio, chưa phải chứng nhận tuân thủ.
- [NIST AI RMF — Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf): tham khảo cách quản trị rủi ro và đánh giá vòng đời; không tuyên bố hệ thống đã đạt chuẩn.
- [OpenTelemetry Semantic Conventions for GenAI](https://opentelemetry.io/docs/specs/semconv/gen-ai/): tham khảo khi thiết kế mã tương quan/trace; cần lọc nội dung nhạy cảm trước khi ghi telemetry.
