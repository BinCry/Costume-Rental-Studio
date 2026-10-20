# Danh sách kiểm tra sẵn sàng production

- **Dự án:** Costume Rental Studio
- **Ngày lập/cập nhật:** 18/10/2026
- **Baseline mã nguồn:** `375fd896e1ff9e4868c91f0674e3b213c7a680c8`
- **Commit đã kiểm thử gần nhất:** `d59fc3c9ce3b06f4431f16e54c605c97784debed` trên nhánh `codex-production-readiness`.
- **CI gần nhất đã xác minh:** GitHub Actions run [#223](https://github.com/BinCry/Costume-Rental-Studio/actions/runs/39056615606) thành công trên commit `d59fc3c9ce3b06f4431f16e54c605c97784debed`; lint, 338 API tests (17 skipped), typecheck, build API/Web, migration, PostgreSQL concurrency, 46 FE tests đều đạt.
- **Phạm vi:** Frontend, API/backend, bảo mật và kiểm thử nghiệm thu. Tài liệu không thay đổi nghiệp vụ, schema hoặc cấu hình môi trường thật.

## Trạng thái phát hành

**Chưa xác nhận production-ready.** Các kiểm tra CI trên nhánh sửa lỗi đều đạt. Vẫn cần nghiệm thu end-to-end trên staging, kiểm tra giao diện trên thiết bị thực, chốt các quyết định/hợp đồng được ghi trong checklist và xác minh triển khai/giám sát trước khi phát hành.

Trạng thái dùng trong checklist:

- **Chưa xác minh:** Chưa đối chiếu với baseline hiện tại.
- **Đã sửa, CI xanh:** Đã có thay đổi mã/test và workflow CI của nhánh này thành công.
- **Đã có trên baseline, CI xanh:** Cơ chế hiện diện trước nhánh sửa lỗi và workflow CI hồi quy thành công.
- **Đã kiểm thử:** Có kết quả kiểm thử cụ thể trên checkout này.
- **Cần hợp đồng AI Agent:** Chưa thể hoàn tất an toàn nếu không có thay đổi hợp đồng liên dịch vụ; không tự phát minh endpoint/schema.
- **Cần quyết định nghiệp vụ:** Cần chốt với chủ sản phẩm trước khi khẳng định luồng đáp ứng yêu cầu vận hành.
- **Staging cần nghiệm thu:** Chỉ có thể xác nhận bằng backend/dịch vụ và tài khoản staging.

## 1. Lỗi cần xử lý trước khi phát hành

| Mã     | Ưu tiên | Lớp                     | Việc cần hoàn tất                                                                                                                                                     | Tiêu chí chấp nhận                                                                                                                                                                                                                               | Trạng thái                                       |
| ------ | ------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| P0-01  | P0      | FE + BE                 | Luồng tạo đơn tại quầy phải dùng đúng `variantId` khi kiểm tra khả dụng; quyền availability phải tương thích quyền quản lý/xác nhận đơn theo chi nhánh và toàn chuỗi. | UI gửi `variantId`; màn quầy yêu cầu quyền `rentals.manage.*`; quyền xác nhận đơn riêng không mở khả năng tạo đơn; API từ chối sai chi nhánh. Có regression test cho quyền availability.                                                         | Đã sửa, CI xanh                                  |
| P1-01  | P1      | FE                      | Đơn nhiều trang phục phải tải khả dụng và dữ liệu gán bộ cho mọi dòng hàng.                                                                                           | Mỗi biến thể được tra availability; mỗi mã bộ ghép với đúng dòng hàng; sai số lượng theo biến thể chặn xác nhận. Có test adapter cho đơn nhiều biến thể.                                                                                         | Đã sửa, CI xanh                                  |
| P1-02  | P1      | FE                      | Trang đơn khách hiển thị đầy đủ trang phục và số tiền theo trạng thái thực.                                                                                           | Tất cả dòng hàng được đọc; trạng thái “Đã thu đủ” không mang màu cảnh báo.                                                                                                                                                                       | Đã sửa, CI xanh                                  |
| P1-03  | P1      | FE                      | Chỉ hiển thị đúng số ô tải ảnh bằng chứng tại giao đồ/nhận trả.                                                                                                       | Mỗi dòng/bộ đủ điều kiện có một ô bằng chứng, nhãn truy cập được và không lặp đôi trong cùng thao tác.                                                                                                                                           | Đã sửa, CI xanh                                  |
| P1-04  | P1      | FE + BE                 | Gia hạn/đổi biến thể phải phản ánh đúng khả năng API.                                                                                                                 | Gia hạn gọi endpoint hiện có với phiên bản, hạn mới và lý do; dùng timestamp API; API kiểm tra chính sách/lịch. Đổi biến thể ở API mode chỉ đọc cho đến khi UI có thể xác nhận bộ thay thế và chênh lệch giá/cọc an toàn; không có form giả lưu. | Đã sửa, CI xanh; cần xác nhận staging            |
| P1-05  | P1      | FE                      | Menu mobile phải có hành vi drawer nhất quán và truy cập được.                                                                                                        | Drawer giữ vòng Tab/Escape, khóa cuộn, vô hiệu hóa nền; focus trở lại nút mở sau khi bỏ `inert`; trạng thái tải/lỗi/không được gán chi nhánh phân biệt rõ.                                                                                       | Đã sửa, CI xanh; UX mobile cần QA                |
| OPS-01 | P1      | FE + BE + QA            | Xác minh API mode của Ops Agent trong bản build staging và phân định phần còn lấy từ fixture.                                                                         | Bản release dùng `VITE_OPS_AGENT_MODE=api`; case/chat/knowledge dùng adapter API; queue không giả lập dữ liệu thật; checklist/catalogue tĩnh ghi rõ preview; smoke test với tài khoản nhân viên.                                                 | Đã nối API và ẩn fixture; staging cần nghiệm thu |
| OPS-02 | P1      | AI Agent + BE + FE + QA | Cung cấp hàng đợi công việc vận hành trực tiếp để nhân viên ưu tiên và mở đúng hồ sơ từ Ops.                                                                          | API trả danh sách có phân trang, quyền/chi nhánh, lọc trạng thái và ưu tiên; UI có loading/empty/error/retry và liên kết sang hồ sơ Studio; tuyệt đối không dùng queue fixture trong API mode.                                                   | Cần hợp đồng API Agent                           |
| SEC-01 | P1      | BE + QA                 | Giữ giới hạn staff-only cho các route Ops Agent.                                                                                                                      | Tài khoản khách bị từ chối; nhân viên cần đăng nhập và vai trò còn hiệu lực; test route bao phủ cho phép/từ chối. Đã có middleware trên baseline, regression CI thành công.                                                                      | Đã có trên baseline, CI xanh                     |
| SEC-02 | P1      | BE + QA                 | Giảm thiểu dữ liệu khách gửi sang LLM/tool context.                                                                                                                   | Projection tìm đơn không đưa PII, ghi chú riêng, ảnh bằng chứng hoặc chi tiết thanh toán không liên quan vào tool context; test xác nhận field nhạy cảm bị loại. Đã có projection trên baseline, regression CI thành công.                       | Đã có trên baseline, CI xanh                     |

## 2. Hoàn thiện độ tin cậy FE/API

| Mã     | Ưu tiên | Lớp/chủ trách nhiệm      | Việc cần hoàn tất                                                                                               | Tiêu chí chấp nhận                                                                                                                                                                                                                                                                                                  | Trạng thái                                                  |
| ------ | ------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| P2-01  | P2      | FE                       | Nội dung xác nhận hủy/từ chối và thông báo tiền phải khớp với chế độ API/fixture.                               | API mode xác nhận thao tác thật, yêu cầu lý do và nói rõ không tự hoàn tiền; fixture mode chỉ thay đổi bản xem trước trong phiên.                                                                                                                                                                                   | Đã sửa, CI xanh                                             |
| P2-02  | P2      | FE                       | Ảnh/media vừa tải có thể không cập nhật vì model cũ trong state cục bộ ghi đè dữ liệu vừa tải lại.              | Sau tải ảnh, state model cũ được xóa và danh sách được tải lại để hiện media mới.                                                                                                                                                                                                                                   | Đã sửa, CI xanh                                             |
| P2-03  | P2      | FE                       | Cô lập state Ops Agent theo tài khoản/chi nhánh và xóa trạng thái cũ khi ngữ cảnh thay đổi.                     | Khóa case theo tài khoản + chi nhánh; chuyển ngữ cảnh không tải case của người khác; timeout vẫn cần hợp đồng idempotency/đối soát ở SEC-04.                                                                                                                                                                        | Đã sửa phần cô lập, CI xanh; đối soát cần hợp đồng AI Agent |
| P2-05  | P2      | FE                       | Empty state production không nhắc đến công cụ demo.                                                             | API empty state chỉ hướng dẫn làm mới/lọc hoặc báo API chưa cung cấp dữ liệu; không gắn nhãn dữ liệu thật cho fixture.                                                                                                                                                                                              | Đã sửa, CI xanh                                             |
| SEC-03 | P1      | BE + AI Agent            | Ràng buộc phê duyệt với đúng case, toolCallId, tool, args, branch và expectedVersion; không chỉ kiểm tra quyền. | Hai tool đã phát hành bắt buộc `confirmationId`, hash và frozen action snapshot; Studio khớp tool/args/version/read-back, branch/RBAC và flag. Vẫn cần durable authorization ledger dùng một lần gắn confirmation/approval với actor và kết quả thực thi.                                                           | Hoàn thành một phần cho Case 1/2                            |
| SEC-04 | P1      | BE + FE + AI Agent       | Đối soát mọi thao tác ghi Ops Agent khi timeout, không gửi lại mù.                                              | Overdue follow-up và các luồng tài chính có idempotency/read-back riêng; reallocation và các tool ghi chưa phát hành vẫn cần ledger bền vững hoặc API tra cứu kết quả. Giữ các tool ngoài allowlist phát hành ở trạng thái fail-closed.                                                                             | Hoàn thành một phần; còn ledger tổng quát                   |
| API-01 | P2      | BE + FE + QA             | Phân loại lỗi nghiệp vụ và xung đột phiên bản chính xác.                                                        | FE chỉ yêu cầu tải lại khi là version conflict thực; 403/validation/network lỗi có nội dung và phục hồi tương ứng. Baseline đã có mã lỗi riêng, regression CI thành công.                                                                                                                                           | Đã có trên baseline, CI xanh                                |
| API-02 | P2      | BE + QA                  | Knowledge Agent không được trả trạng thái “đã trả lời” nếu nội dung hoặc citation thiếu.                        | Câu trả lời rỗng/nguồn thiếu metadata hoặc citation trống phải hạ thành `insufficient_context`; có regression test.                                                                                                                                                                                                 | Đã sửa, CI xanh                                             |
| BIZ-01 | P1      | Sản phẩm + BE + QA       | Chốt cách thông báo/đồng ý phí gia hạn trước khi cập nhật hạn thuê.                                             | Endpoint hiện có kiểm tra lịch/chính sách và cập nhật phí trong cùng thao tác, nhưng không có API báo giá không ghi dữ liệu trước đó. Nếu khách phải duyệt số tiền chính xác, cần quyết định và bổ sung hợp đồng báo giá trước khi bật gia hạn production; hiện UI cảnh báo phí được cập nhật theo kết quả máy chủ. | Cần quyết định nghiệp vụ                                    |
| SEC-05 | P1      | AI Agent + BE + QA       | Xác minh citation trỏ tới tài liệu tồn tại, đúng phiên bản và đã được duyệt.                                    | API hiện chỉ kiểm tra metadata/citation không rỗng; hợp đồng nguồn cần ID/phiên bản truy xuất được và trạng thái phê duyệt để đối chiếu.                                                                                                                                                                            | Cần hợp đồng AI Agent                                       |
| SEC-06 | P1      | AI Agent + BE + FE + QA  | Màn hình duyệt phải cho người có quyền xem chính xác thao tác sẽ chạy.                                          | Hợp đồng trả bản xem trước bất biến gồm đối tượng, chi nhánh, số tiền/tác động, giá trị trước–sau và phiên bản; backend chỉ chấp nhận duyệt đúng bản xem trước đó.                                                                                                                                                  | Cần hợp đồng AI Agent                                       |
| BIZ-02 | P2      | Sản phẩm + AI Agent + BE | Chốt phạm vi chi nhánh cho câu hỏi tra cứu Ops Agent.                                                           | Quyết định nhân viên tìm trong chi nhánh đang chọn hay toàn bộ chi nhánh được cấp quyền; nếu theo chi nhánh, truyền và kiểm tra phạm vi ở backend, không dựa vào state giao diện.                                                                                                                                   | Cần quyết định nghiệp vụ                                    |

## 3. Accessibility, giao diện và phân phối

| Mã    | Ưu tiên | Lớp/chủ trách nhiệm | Việc cần hoàn tất                                                                                      | Tiêu chí chấp nhận                                                                                                                                                                                                        | Trạng thái                 |
| ----- | ------- | ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| P3-01 | P3      | FE                  | Hộp thoại có ID tiêu đề duy nhất và quản lý cuộn/focus đúng.                                           | ID tiêu đề dùng `useId`; khóa cuộn nền; focus được quản lý khi mở/đóng. Cần kiểm tra bàn phím trên trình duyệt.                                                                                                           | Đã sửa, CI xanh; UX cần QA |
| P3-02 | P3      | FE                  | Bảng có sắp xếp thông báo `aria-sort`.                                                                 | Trình đọc màn hình biết cột đang sắp xếp và chiều sắp xếp.                                                                                                                                                                | Đã sửa, CI xanh            |
| P3-03 | P3      | FE + DevOps         | Nginx thiết lập cache riêng cho `index.html` và asset có fingerprint.                                  | HTML không bị cache lâu gây dùng bundle cũ; asset fingerprint có thể cache bất biến.                                                                                                                                      | Đã sửa, CI xanh            |
| CI-01 | P1      | DevOps + QA         | Web publish có thể chỉ publish image khi webhook Coolify thiếu và hiện chưa có post-deploy smoke test. | Báo cáo CI được hiểu đúng là build/publish; trước khi xác nhận release phải kiểm tra deployment thực trên Coolify, `/healthz`, FE gọi API đúng host và các luồng smoke. Không kết luận deploy thành công chỉ từ job xanh. | Staging cần nghiệm thu     |
| UX-01 | P2      | FE + QA             | Kiểm tra menu và các thao tác chạm trên viewport nhỏ, landscape và vùng safe-area.                     | Kiểm thử tại 320/360/375 px, landscape, nội dung tên dài; không tràn ngang, mất nút hoặc bị overlay che.                                                                                                                  | Chưa xác minh              |
| UX-02 | P2      | FE + QA             | Kiểm tra bàn phím và trình đọc màn hình cho menu, dialog, form và bảng.                                | Tab/Shift+Tab/Escape theo thứ tự dễ hiểu; focus nhìn thấy; labels và trạng thái được thông báo; không chỉ dựa vào màu.                                                                                                    | Chưa xác minh              |

## 4. Kịch bản QA đầu-cuối

Chỉ chạy trên staging với tài khoản nhân viên/khách riêng và dữ liệu giả lập. Không dùng dữ liệu khách thật và không thực hiện giao dịch tài chính thật.

### Luồng thuê và thanh toán

- [ ] Khách lọc trang phục theo chi nhánh/ngày thuê, mở chi tiết và gửi yêu cầu thuê.
- [ ] Nhân viên duyệt yêu cầu, xác nhận từng bộ/biến thể; thử xung đột bộ đã được đơn khác giữ.
- [ ] Nhân viên tạo đơn tại quầy với một và nhiều biến thể; xác nhận kiểm tra khả dụng và phân quyền.
- [ ] Giao đồ: thu tiền thuê/cọc, ghi nhận bằng chứng và kiểm tra tổng tiền/trạng thái.
- [ ] Đang thuê: xem hạn trả và trạng thái đơn; gia hạn gửi phiên bản/hạn/lý do, máy chủ kiểm tra lịch/chính sách; ghi lại phí mới và xác nhận khách đã được thông báo. Đổi size ở API mode hiện chỉ đọc cho tới khi có bộ thay thế và chênh lệch giá/cọc để xác nhận.
- [ ] Trả một phần, ghi nhận hư hỏng/thiếu đồ, quyết toán và hoàn phần cọc còn lại; thử lỗi mạng và tải lại trước khi retry.
- [ ] Khách mở “Đơn của tôi” và thấy đủ tất cả trang phục, khoản đã thu/còn thiếu và trạng thái nhất quán.

### Kho, nhân sự và quyền

- [ ] Tra cứu bộ theo barcode; chặn bộ để vệ sinh/sửa chữa; điều chuyển nguồn → duyệt → xuất → nhận tại đích.
- [ ] Tạo nhân viên, gán vai trò theo chi nhánh, đổi chi nhánh làm việc, khóa/mở tài khoản và xác minh menu/quyền.
- [ ] Kiểm tra ít nhất một thao tác được phép và một thao tác bị từ chối cho từng nhóm quyền quản lý/xác nhận/thu ngân.

### CRM và chăm sóc khách hàng

- [ ] Nhân viên có quyền CRM mở/tạo case gắn đúng khách hàng/đơn thuê, cập nhật và phân công người xử lý theo chi nhánh; lịch sử và tương tác được lưu.
- [ ] Thử trạng thái chuyển không hợp lệ, người nhận ngoài chi nhánh và thiếu quyền; API từ chối rõ ràng, không làm sai liên kết khách hàng/đơn.

### Ops Agent và bảo mật

- [ ] Khách gọi route Ops Agent bị từ chối; nhân viên được phân quyền gọi được.
- [ ] Tra cứu đơn bằng dữ liệu giả; kiểm tra payload/ngữ cảnh LLM không có PII và dữ liệu thanh toán không liên quan.
- [ ] Knowledge trả lời có nguồn; truy vấn thiếu căn cứ không được báo đã trả lời.
- [ ] Tạo case, tải lại trang, đổi chi nhánh/tài khoản, phục hồi lỗi; xác nhận case không lẫn giữa tài khoản.
- [ ] Kiểm tra xác nhận/từ chối/phê duyệt/hủy; thao tác không gửi trùng khi timeout và hành động được duyệt không thể bị thay đổi.
- [ ] Trước khi duyệt, đối chiếu bản xem trước có cấu trúc (đối tượng, chi nhánh, số tiền/tác động, giá trị trước–sau, phiên bản); thử approval thiếu, hết hạn, sửa payload và gửi lại để backend từ chối.
- [ ] Kiểm thử phạm vi tìm đơn của Ops theo quyết định sản phẩm (chi nhánh đang chọn hoặc toàn bộ chi nhánh được cấp quyền); không chấp nhận lọc chỉ ở giao diện.

- [ ] CI hiện chạy lint/test/typecheck/build nhưng chưa có browser E2E cho màn Ops Agent và một số luồng tương tác; thực hiện human E2E staging theo vai trò, ghi lại bằng chứng trước khi bật release.

### Release gate

- [x] FE/API typecheck, lint, tests, migration, PostgreSQL concurrency và build đều đạt GitHub Actions run #223 trên commit `d59fc3c9ce3b06f4431f16e54c605c97784debed`.
- [ ] Migration không đổi nếu không có yêu cầu nghiệp vụ đã được xác nhận; nếu buộc phải có migration, review tính tương thích và kế hoạch rollback riêng.
- [ ] E2E staging ở trên đạt trên trình duyệt desktop và thiết bị mobile; ghi lại commit, môi trường, vai trò và kết quả.
- [ ] Xác minh log không chứa token, mật khẩu, email/số điện thoại hoặc thông tin thanh toán nhạy cảm.
- [ ] Xác minh health check FE/BE, cấu hình API mode, Google OAuth, storage và Ops Agent bằng cấu hình staging; không suy luận từ build thành công.

**Lưu ý phí gia hạn:** trước khi bật luồng gia hạn cho khách thật, chủ sản phẩm cần xác nhận có chấp nhận cách hiện tại (máy chủ áp chính sách, UI báo phí được cập nhật sau khi xác nhận) hay bắt buộc xem báo giá chính xác trước. Nếu cần báo giá trước thì phải có hợp đồng báo giá không ghi dữ liệu và kiểm thử riêng.

## 5. Giới hạn hiện tại

Danh sách đối chiếu từ baseline `375fd896e1ff9e4868c91f0674e3b213c7a680c8`. CI run #223 xác nhận code hiện tại trên nhánh PR; CI xanh không xác nhận runtime staging/production. Các ô staging, responsive/accessibility thủ công, hợp đồng AI Agent và quyết định chính sách gia hạn vẫn phải hoàn tất trước khi chốt phát hành.
