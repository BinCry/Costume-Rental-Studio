# Khảo sát hiện trạng Ops Agent trước triển khai

**Người khảo sát:** BinCry <bincry2006@gmail.com>

**Thời điểm:** 18/10/2026 (Asia/Saigon)

**Phạm vi:** Costume Rental Studio, Studio API/Web, repo AI Agent riêng, GitHub Actions và các tín hiệu đọc được từ môi trường Coolify. Không thử ghi dữ liệu production, không đọc secret hoặc dữ liệu khách hàng.

**Mốc mã nguồn:** Studio `main` [`b0733a8`](https://github.com/BinCry/Costume-Rental-Studio/commit/b0733a8724acb0baf963f394e73663eb88b7fc78); AI Agent `main` [`18bbc70`](https://github.com/BinCry/Costume-Rental-Ops-Agent/commit/18bbc70374f4296bf602390dd198bc8013b2bcc4). Bản AI checkout cũ trên máy không cùng mốc này và có thay đổi chưa commit, nên không dùng làm bằng chứng về bản đã triển khai.

## 1. Cách đọc kết quả

- **Đã kiểm chứng trên mã:** có route, guard hoặc test trong đúng commit; không suy ra môi trường chạy đã hoạt động.
- **Đã kiểm chứng khi chạy:** có phản hồi HTTP hoặc trạng thái triển khai tại thời điểm khảo sát; không suy ra toàn bộ hành trình người dùng đã đạt.
- **Chưa kiểm chứng:** thiếu quyền truy cập/test data hoặc chưa chạy qua hành trình liên dịch vụ; ghi thành việc cần thực hiện trước khi mở tính năng.

## 2. Ma trận hiện trạng

| Thành phần | Bằng chứng đã kiểm chứng | Kết luận và giới hạn |
| --- | --- | --- |
| Studio Web | Workflow [publish Web](../../.github/workflows/web-publish.yml) build với `VITE_OPS_AGENT_MODE=api`; lần publish tại [`ba64189`](https://github.com/BinCry/Costume-Rental-Studio/actions/runs/39066164722) thành công. Trang công khai `https://studio.bincrydev.id.vn` tải được; phiên đăng nhập sẵn có mở được `/van-hanh/ops-agent` và hiện bốn khu vực API mode, cùng thông báo hàng đợi chưa có API. | Đã xác minh shell Ops có phiên hợp lệ, chưa gửi câu hỏi hay chạy hành trình Agent. Chưa có test ma trận vai trò hoặc chi nhánh trên runtime. |
| Studio API | [`agent.route.ts`](../../apps/api/src/modules/agent/agent.route.ts), [`knowledge.route.ts`](../../apps/api/src/modules/knowledge/knowledge.route.ts) có façade cho Agent/tri thức; workflow [publish API](https://github.com/BinCry/Costume-Rental-Studio/actions/runs/39066164701) thành công. `GET https://studio.api.bincrydev.id.vn/health` trả 200; `/health/ready` trả 200, `database: connected`. | API và database Studio sẵn sàng tại thời điểm kiểm tra. Health này **không** kiểm tra AI runtime hoặc kho tri thức AI. |
| Tool Studio | [`agent-tools.registry.ts`](../../apps/api/src/modules/agent-tools/agent-tools.registry.ts) đăng ký 10 tool đọc và 11 tool ghi. [`agent-tools.service.ts`](../../apps/api/src/modules/agent-tools/agent-tools.service.ts) chặn mọi tool ghi bằng `AGENT_WRITE_TOOLS_NOT_READY`. | Có đường tra cứu theo quyền; không có quyền ghi qua Agent trong bản hiện tại, bất kể cấu hình cờ. Chưa kiểm thử trực tiếp tool bằng tài khoản thật trong khảo sát này. |
| AI Agent repo | [`README`](https://github.com/BinCry/Costume-Rental-Ops-Agent/blob/18bbc70374f4296bf602390dd198bc8013b2bcc4/README.md), [`app/main.py`](https://github.com/BinCry/Costume-Rental-Ops-Agent/blob/18bbc70374f4296bf602390dd198bc8013b2bcc4/app/main.py), thư mục `app/agent_tools`, `app/knowledge`, migration và tests xác nhận FastAPI, runtime LangGraph, case store PostgreSQL, tool client allowlist, RAG/pgvector và test đơn vị đã được viết. | Không còn là prototype FE-only như bản local cũ. Mã có runtime thực, nhưng chưa thể coi nghiệp vụ end-to-end hoạt động chỉ từ sự tồn tại của code. |
| AI CI/CD | [Run publish `18bbc70`](https://github.com/BinCry/Costume-Rental-Ops-Agent/actions/runs/38988272047) thành công ở các bước lint, typecheck, knowledge validation, pytest, build image và gọi deploy webhook. Coolify báo ứng dụng AI `Running`, lần triển khai gần nhất thành công. | Pipeline chứng minh image được xây và container khởi chạy. Nó không có cổng kiểm tra `/health/ready` sau deploy; image production đang dùng tag `staging` có thể thay đổi. |
| AI liveness/readiness | `GET https://ai.studio.api.bincrydev.id.vn/health` trả **200**; `GET .../health/ready` trả **503 `DATABASE_UNAVAILABLE`**. Coolify cấu hình healthcheck vào `/health`, còn database AI hiển thị `Running`. [`ping_database()`](https://github.com/BinCry/Costume-Rental-Ops-Agent/blob/18bbc70374f4296bf602390dd198bc8013b2bcc4/app/knowledge/repository.py) thực hiện `SELECT 1` và trả `false` khi lỗi kết nối. | **Chặn triển khai hiện tại:** AI process sống nhưng không kết nối được database AI. Chưa xác định nguyên nhân gốc (URL, DNS/mạng, xác thực, giới hạn kết nối hoặc DB). Trạng thái “Running” không thay cho readiness. |
| AI API contract | Public OpenAPI của AI liệt kê `/knowledge/search`, `/knowledge/answer`, `/agent/messages`, case/confirmation/approval/cancel. [`routes.py`](https://github.com/BinCry/Costume-Rental-Ops-Agent/blob/18bbc70374f4296bf602390dd198bc8013b2bcc4/app/agent_tools/routes.py) dùng service key cho route nội bộ. | Hình dạng route tương ứng với façade Studio. Chưa kiểm tra request/response thật có xác thực và nhánh lỗi/timeout giữa hai dịch vụ. |
| RAG/policy | [`knowledge-base`](https://github.com/BinCry/Costume-Rental-Ops-Agent/tree/18bbc70374f4296bf602390dd198bc8013b2bcc4/knowledge-base) có tài liệu; [`knowledge/service.py`](https://github.com/BinCry/Costume-Rental-Ops-Agent/blob/18bbc70374f4296bf602390dd198bc8013b2bcc4/app/knowledge/service.py) phân biệt nguồn approved/business authority và trả `insufficient_context` khi thiếu căn cứ. | Có guard ở code. Chưa xác nhận migration/ingestion, số bản ghi, phiên bản nguồn thực tế hay citation đầu ra vì readiness AI đang 503. |
| Hàng đợi/audit | UI hiện có bốn khu production; Studio API chỉ tạo/đọc một case và quyết định trên case. AI database có bảng case/message/step/tool/evidence trong [`sql/002_agent_cases.sql`](https://github.com/BinCry/Costume-Rental-Ops-Agent/blob/18bbc70374f4296bf602390dd198bc8013b2bcc4/sql/002_agent_cases.sql). | Có dữ liệu nền cho case ở AI, nhưng chưa có API hàng đợi nhóm, tìm/lọc case, phân công hoặc audit quản lý hoàn chỉnh trên Studio Web. |
| Phục hồi giao diện | Mã Web có trạng thái “cần đối soát” sau timeout, khóa gửi trùng và tách case trong `sessionStorage` theo người dùng/chi nhánh. Bản nháp câu hỏi chỉ nằm trong state bộ nhớ; reload có thể làm mất nội dung đang soạn. | Cần giữ bản nháp an toàn sau refresh và cung cấp đường tra lại case theo khóa yêu cầu; không tự gửi lại khi chưa rõ lần đầu có tạo case hay không. Chưa QA trực tiếp ở màn hình nhỏ. |

Các trạng thái HTTP trên là **ảnh chụp thời điểm khảo sát**, có thể thay đổi sau deploy. Cần ghi timestamp, SHA và kết quả mới khi chạy lại trước nghiệm thu.

## 3. Vấn đề cần xử lý theo ưu tiên

| Mức | Vấn đề và bằng chứng | Việc xác minh/khắc phục kế tiếp |
| --- | --- | --- |
| **P0** | AI `/health/ready` trả 503 trong khi Coolify dùng `/health` 200 để coi container khỏe. | Kiểm tra cấu hình kết nối AI DB và log đã che secret; xác minh `SELECT 1`, migration, ingestion; đổi cổng deploy sang readiness có kiểm tra được. Không bật hành trình Agent khi chưa đạt. |
| **P1** | UI chọn chi nhánh nhưng `POST /agent/messages` chưa gửi bối cảnh chi nhánh; tool có thể đọc mọi chi nhánh actor được quyền. | Chủ sản phẩm chốt phạm vi case; contract API nhận/kiểm tra branch; thêm ma trận test đa chi nhánh. |
| **P1** | Studio API chặn tool ghi nhưng AI runtime đã có luồng đề xuất/confirmation/approval; một số tài liệu hoặc UI dễ gây hiểu rằng có thể thực thi. | Giữ guard; hiển thị trạng thái chưa hỗ trợ nhất quán; trước khi mở ghi phải ràng buộc preview/action/approval và idempotency phía Studio API. |
| **P1** | Projection của `get_refund_by_idempotency_key` còn trả `refund.reason` tự do từ [`agent-tools.service.ts`](../../apps/api/src/modules/agent-tools/agent-tools.service.ts). | Loại/giới hạn văn bản tự do trước khi đưa cho mô hình, có test dữ liệu nhạy cảm. |
| **P1** | Studio chỉ kiểm metadata citation; nguồn thực tế, phiên bản, hiệu lực, phạm vi và thu hồi chưa được Studio xác minh độc lập. | Chốt source registry/owner và kiểm chứng citation đầu-cuối bằng bộ chính sách có phiên bản. |
| **P1** | CI xanh nhưng không có bằng chứng E2E trình duyệt → Studio → AI → tool → database; AI DB readiness hiện thất bại. | Tạo staging với dữ liệu giả lập, contract tests hai repo và post-deploy smoke theo SHA/image digest. |
| **P1** | Sau timeout khi tạo case đầu, Web lưu trạng thái cần đối soát nhưng bản nháp chưa tồn tại qua refresh. | Thiết kế khôi phục bản nháp và tìm case bằng khóa yêu cầu; test mất response sau khi server đã ghi, tuyệt đối không tự gửi lại. |
| **P2** | Thiếu hàng đợi, lịch sử, phân công, audit, quản lý nguồn và health/capability trên UI production. | Bổ sung contract/API trước, sau đó mới mở màn dùng dữ liệu thật; không đưa fixture lên production. |
| **P2** | Topology công khai và tag image `staging` tại môi trường gọi là production chưa thể hiện quy trình promotion/rollback chắc chắn. | Rà soát đường truy cập service/db, pin image theo SHA/digest, phân tách staging-production và runbook rollback. Không công bố URL hoặc credential database. |

## 4. Những kiểm tra chưa chạy

- Đăng nhập với nhân viên một chi nhánh, nhiều chi nhánh và admin để chạy luồng Ops thật; khảo sát mới xác minh một phiên hợp lệ mở được shell, chưa có bằng chứng cho 7 hành trình nghiệp vụ.
- Gửi câu hỏi RAG và kiểm tra citation tại runtime sau khi AI DB sẵn sàng; chưa đo chất lượng câu trả lời.
- Kiểm tra tool callback có quyền, timeout, xung đột phiên bản, idempotency và read-back với dữ liệu staging; **không** thử ghi trên production.
- Xác minh nguyên nhân cụ thể của `DATABASE_UNAVAILABLE`; liveness và trạng thái database trong Coolify chưa đủ để kết luận.
- Đo SLO, độ trễ, chi phí mô hình và khối lượng việc ca thực; chưa có baseline để hứa hiệu quả định lượng.
- Kiểm thử các trạng thái loading/empty/error/conflict và khả năng dùng bàn phím, focus, bố cục tại 320/360/390px trên trình duyệt production; mã có hỗ trợ nhưng chưa có bằng chứng thử end-to-end.

Kế hoạch xử lý và cổng nghiệm thu nằm trong [`ke-hoach-phat-trien-ops-agent.md`](ke-hoach-phat-trien-ops-agent.md). Tài liệu này ghi nhận bằng chứng, không tự động phê duyệt chính sách, quyền ghi hay thay đổi production.
