# Kế hoạch kiểm thử web trên Docker local

**Ngày lập:** 19/11/2026 · **Trạng thái:** kế hoạch, chưa chạy bộ E2E mới · **Mốc khảo sát:** `main@6090301`
**Mục tiêu:** xác minh hành trình khách hàng, nhân viên và quản trị trên **web → API → PostgreSQL/S3 local**, đồng thời bắt lỗi bố cục, quyền, trạng thái, dữ liệu và phục hồi lỗi trước khi dùng bản demo.

## 1. Hiện trạng và ranh giới kiểm thử

- [Môi trường Docker local](../../local-test/README.md) đã có web `http://localhost:5180`, API `http://localhost:4180`, PostgreSQL và S3 riêng; 10 tài khoản mẫu, 2 chi nhánh, 6 mẫu/12 biến thể, 24 unit, 11 đơn, 5 khoản thanh toán và 3 case CRM. Seed có 6 **ảnh minh họa**, không phải ảnh sản phẩm thật.
- Playwright hiện đặt URL mặc định `127.0.0.1:4173` và tự chạy Vite nếu không có `E2E_BASE_URL`. Muốn kiểm Docker phải đặt `E2E_BASE_URL=http://localhost:5180`. Cấu hình dùng **Edge** (`channel: msedge`), không dùng tab Edge cá nhân đã đăng nhập.
- Các spec hiện có trong `apps/web/e2e/` chủ yếu dùng `page.route` để giả lập API. Chúng có giá trị cho UI, thông báo lỗi và responsive, **chưa chứng minh hành trình ghi dữ liệu qua BE**. `production-customer-journey.spec.ts` chủ yếu là đọc catalog và mở chặng báo giá.
- Local không chạy Ops Agent/AI service, không có API key AI. URL Ops cũ phải bị ẩn/không truy cập được; không đưa hành vi Agent vào tiêu chí đạt của đợt này.
- Không cấu hình Google OAuth, email OTP và payOS trong stack local. Kiểm form, điều hướng và thông báo bằng mock; luồng OAuth/OTP/thanh toán payOS thật ghi `BLOCKED — thiếu sandbox`, không ghi `PASS`. Thanh toán tiền mặt/chuyển khoản và trạng thái payment đã seed có thể kiểm với API local.
- Try-on có thể kiểm route, upload trang phục và bố cục. Nhận diện camera cần thiết bị/quyền camera thật nên là kiểm thủ công riêng; không diễn giải việc mở dialog thành camera đã hoạt động.

## 2. Requirement phải chốt trước khi chạy

| ID | Yêu cầu/nguồn hiện có | Điều kiện đạt cần đối chiếu trên UI **và** API | Trạng thái chốt |
| --- | --- | --- | --- |
| R01 | Khách xem catalog, lọc, chọn size và lịch | Khách chưa đăng nhập xem được mẫu/ảnh/giá; lọc đúng biến thể, không báo “còn bộ” khi chưa kiểm ngày; ngày trả sau ngày nhận; thiếu ảnh có fallback | Có thể kiểm theo mã hiện tại |
| R02 | Checkout **2 chặng** đã chốt | Chặng 1 chọn nhiều dòng, size/số lượng/chi nhánh/lịch và xem **giá dự kiến**; chặng 2 nhập/xác nhận liên hệ, xem phiếu tạm tính và gửi. Không gọi giá dự kiến là hóa đơn đã phát hành | Có thể kiểm theo mã hiện tại |
| R03 | Một yêu cầu có nhiều bộ, kể cả cùng mẫu khác size | Mỗi dòng giữ đúng variant, số lượng, giá, cọc; API và trang chi tiết đơn khớp; một dòng thiếu capacity không biến thành “hết hàng” cho các dòng khác | Cần fixture đơn mới |
| R04 | Giá, voucher và thay đổi dữ liệu | Mã hợp lệ/không hợp lệ có phản hồi rõ; giá hoặc policy đổi trước khi gửi thì yêu cầu xem lại, không gửi theo giá cũ; quote lỗi/429 không hiển thị thành 0 đ | Cần fixture lỗi/đổi giá |
| R05 | Tạo đơn và chống gửi trùng | Bấm gửi một lần tạo một mã; bấm lại hoặc mất phản hồi phải tra kết quả trước khi tạo mới; khách chỉ xem đơn của mình; trạng thái sau gửi giải thích bước tiếp theo | Cần dữ liệu riêng cho mỗi run |
| R06 | Tài khoản và phân quyền | Admin vào `/quan-tri`, staff vào `/van-hanh`, customer vào khu khách; menu và API cùng chặn quyền ngoài role/chi nhánh; logout xóa phiên, reload/refresh không ló menu sai | Có tài khoản seed; cần test API 403 |
| R07 | Nhân viên xử lý đơn | Xác nhận/từ chối, gán unit, chuẩn bị, giao, nhận trả theo trạng thái hợp lệ; xung đột lịch và hai người cùng thao tác không gán trùng; mã đơn/unit đọc được ở mỗi bước | Cần fixture/khóa bước chạy tuần tự |
| R08 | Kho và điều chuyển | Danh sách theo chi nhánh, block/unblock unit, điều chuyển/nhận từng phần; lịch unit và khả dụng cập nhật sau thao tác; staff khác chi nhánh không ghi trái quyền | Cần fixture độc lập |
| R09 | Thanh toán/hoàn cọc local | Khoản thuê/cọc/phí/hoàn đối chiếu giữa màn đơn và API; không hiện nút thanh toán khi sai trạng thái; giao dịch tiền mặt/chuyển khoản theo quyền. payOS thật ngoài phạm vi | Phần local có thể kiểm; payOS `BLOCKED` |
| R10 | Quản trị | Danh mục/ảnh S3, nhân viên/vai trò/chi nhánh, chính sách/ưu đãi, báo cáo và CRM hiển thị dữ liệu đúng; chỉnh sửa test chỉ tác động bản ghi test; lỗi validation ở gần trường | Cần fixture và khôi phục dữ liệu |
| R11 | Responsive và thao tác | Ở 320/375/390/768/1024/1440 px: không tràn ngang, chữ không chồng/cắt, CTA không bị che; menu mobile mở được và logout nằm trong menu; sidebar desktop phủ chiều cao; nhóm một mục là link; cột danh sách/chi tiết cuộn hợp lý | Kiểm tự động + duyệt trực quan |
| R12 | Phục hồi lỗi và accessibility | 401/403/429/5xx/mất mạng có câu dễ hiểu và bước tiếp theo; dữ liệu form còn khi thử lại; bàn phím, nhãn, focus và thông báo lỗi đọc được; ngày hiển thị `dd/mm/yyyy` khi là ngày cho người dùng | Mock lỗi + E2E local |

**Quyết định áp dụng cho đợt local:** R01–R12 là baseline kiểm thử của mã hiện tại; không mở rộng nghiệp vụ mới khi đang chạy test. Nếu kết quả thực tế trái requirement, ghi lỗi và xác nhận quy tắc với chủ sản phẩm trước khi sửa. Các tích hợp bên ngoài ở mục 1 không được dùng để chặn việc kiểm phần local.

## 3. Cổng vào: chỉ bắt đầu E2E ghi dữ liệu khi đủ

| Checklist | Cách xác nhận | Nếu thiếu |
| --- | --- | --- |
| [ ] Chủ sản phẩm/QA chốt R01–R12 và các tích hợp bị loại khỏi local | Lưu quyết định cùng run ID; tiền, trạng thái, quyền đối chiếu quy tắc BE hiện hành | Chỉ làm discovery, chưa kết luận PASS/FAIL nghiệp vụ còn tranh cãi |
| [ ] Cùng một commit FE/BE, ghi SHA và thời điểm chạy | `git rev-parse HEAD`; Docker build lại từ checkout đó | `BLOCKED — không rõ baseline` |
| [ ] Docker `db`, `api`, `web`, `s3` đang chạy; `migrate`, `seed`, `s3-init` kết thúc mã 0 | `./local-test/start.ps1 status`; `/health/ready` là `ready`; web trả 200 | Sửa môi trường trước, không chẩn đoán là lỗi sản phẩm |
| [ ] Truy cập chỉ vào `localhost:5180/4180/59000`; không dùng URL Coolify/production | Kiểm baseURL, network và biến môi trường test | Dừng run nếu request rời local ngoài tích hợp đã duyệt |
| [ ] Có tài khoản cho Admin, sales Q1/Q3, inventory Q1/Q3, ít nhất 2 customer; role/branch đúng | Login và `/auth/me`; mật khẩu đọc từ `local-test/.env`, không ghi vào log/trace | Bổ sung fixture/role trước |
| [ ] Dữ liệu đầu vào được chụp lại: mã mẫu/variant, unit, đơn, voucher, policy, thanh toán và trạng thái | Manifest fixture của run; dùng `ORD-DEMO-*`, `WELCOME10`, `EVENT200K` để kiểm đọc; tạo bản ghi riêng cho ca ghi | Không dùng ID bịa hoặc ca đã bị run trước làm đổi trạng thái |
| [ ] Có cách tạo lại baseline dữ liệu | **Cần bổ sung** lệnh reset an toàn chỉ xóa volume của project `costume-local-test`, rồi migrate/seed/S3-init; hoặc project Compose mới cho mỗi run | Chưa chạy suite stateful lặp lại/parallel |
| [ ] PostgreSQL integration test dùng database **khác** DB demo | `DATABASE_TEST_URL` trỏ DB riêng đã migrate; không trỏ `DATABASE_URL` hoặc `costume_local_test` | Không chạy `test:postgres`; các test này có thao tác ghi/khôi phục fixture |
| [ ] Đồng hồ và lịch test hợp lệ | Dùng ngày tương lai tính từ thời điểm chạy; timezone `Asia/Ho_Chi_Minh`; không hardcode ngày cũ trong ca ghi | Sửa fixture ngày, không đổi đồng hồ máy |
| [ ] Browser runner và artifact sẵn sàng | Playwright Edge cài được; trace/screenshot khi lỗi lưu trong `test-results`; bổ sung ignore cho artifact trước khi chạy | Chỉ chạy unit/API cho đến khi runner sẵn sàng |
| [ ] Phạm vi external được đánh dấu | Google/OTP/payOS/camera/AI theo mục 1; không dùng tiền thật hoặc tài khoản thật | Ca tương ứng `BLOCKED`/`N/A`, không giả PASS |

`seed-once` hiện **giữ dữ liệu khi chạy lại `up`**. Vì vậy chạy lại `up` không đưa DB về baseline. Lệnh reset có guard và manifest fixture là việc phải làm ở chặng đầu của automation live.

## 4. Ma trận automation cần xây và chạy

| Ưu tiên / mã | Luồng và dữ liệu | Kiểm tự động phải chứng minh | Loại |
| --- | --- | --- | --- |
| P0 · L-01 | Stack/seed/S3 | Health, số record tối thiểu, 6 ảnh demo tải 200, ảnh staging không đọc công khai | API/infrastructure, đã có smoke S3 một phần |
| P0 · A-01 | Guest → customer → staff → admin | Login/logout/refresh, URL mặc định, menu theo role, API 403 ngoài quyền, chi nhánh Q1/Q3 | Playwright + API thật |
| P0 · C-01 | Catalog → detail → chặng 1 | Tìm/lọc/size/lịch/khả dụng, 1 và 2 dòng khác size, quote server, voucher hợp lệ/sai | Playwright + API thật |
| P0 · C-02 | Chặng 2 → đơn của tôi | Snapshot liên hệ, gửi một lần, mã đơn, line item/giá/cọc đúng, tải lại trang, không đọc đơn khách khác | Playwright + DB/API đối chiếu |
| P0 · C-03 | Quote/order đổi giữa hai bước | `QUOTE_CHANGED`, hết capacity, submit lặp/mất phản hồi; giữ input và yêu cầu xác nhận lại | Fixture gây đổi dữ liệu + Playwright |
| P0 · S-01 | Staff Q1 xử lý đơn vừa tạo | Xác nhận, gán unit, chuẩn bị/giao/trả; chuyển trạng thái đúng và API không gán trùng | Playwright + API thật, tuần tự |
| P0 · M-01 | Admin catalog ảnh | Presign → POST S3 → tạo media → URL ảnh 200 → xóa; file sai định dạng báo ở input | API thật + UI; `local-test/check-upload.mjs` đã smoke API/S3 |
| P1 · S-02 | Staff Q3/kho và xung đột | Khác chi nhánh không ghi được; block unit/điều chuyển/nhận; hai thao tác tranh cùng unit chỉ một thành công | API integration + UI |
| P1 · P-01 | Payment/settlement | Seed PENDING/FAILED/SUCCEEDED; tiền mặt/chuyển khoản local; refund và số dư khớp, không nhân đôi | API thật + UI; payOS `BLOCKED` |
| P1 · M-02 | Admin cấu hình và báo cáo | Policy, voucher, nhân viên/role, CRM, report; dữ liệu sau lưu khớp API, khôi phục fixture | Playwright + API thật |
| P1 · U-01 | Responsive tất cả portal | Vùng nhìn 320–1440; không tràn/cắt chữ; menu/sidebar/bảng/cuộn hai cột, CTA; bàn phím và focus | Playwright geometry + duyệt ảnh lỗi |
| P1 · U-02 | Lỗi mạng/quyền/rate limit | 401/403/429/500/offline hiện thông báo và hành động tiếp; không mất draft, không gửi trùng | Playwright mock lỗi **riêng**, không tính là live E2E |
| P2 · T-01 | Try-on | Route và upload dialog dùng được, không lệch header/logo; camera nhận diện kiểm thủ công có thiết bị | Playwright UI + manual |
| P2 · O-01 | Ops Agent đã tắt | Không có mục menu; URL cũ hiển thị không tồn tại | Playwright UI hiện có |

### Checklist thực thi theo lượt

- [ ] **Nền tảng:** L-01; ghi SHA, health, seed, S3, browser runner và manifest fixture.
- [ ] **Khách chưa đăng nhập:** catalog, bộ lọc, trang chi tiết, ảnh, kỳ thuê, quote không cần tài khoản (R01–R02).
- [ ] **Khách đã đăng nhập:** nhiều size, voucher, liên hệ, gửi đơn, chống trùng và Đơn của tôi (C-01–C-03).
- [ ] **Quyền:** customer/staff/admin và Q1/Q3; kiểm cả menu lẫn API 403 (A-01).
- [ ] **Nhân viên bán hàng:** xác nhận, gán unit, chuẩn bị, giao, nhận trả, quầy và xung đột (S-01–S-02).
- [ ] **Nhân viên kho:** block, điều chuyển, nhận từng phần và cập nhật khả dụng (S-02).
- [ ] **Thanh toán local:** tiền mặt/chuyển khoản, phí, cọc, quyết toán và hoàn (P-01).
- [ ] **Quản trị:** ảnh/catalog, policy, voucher, role, chi nhánh, CRM và báo cáo (M-01–M-02).
- [ ] **UI/UX:** mobile/desktop, bảng/cuộn/sidebar, ngày, lỗi, focus, keyboard (U-01–U-02).
- [ ] **Try-on và Ops đã tắt:** kiểm đúng phạm vi đã nêu, không ghi camera/AI là PASS (T-01, O-01).
- [ ] **Khép run:** đối chiếu DB, dọn bản ghi test, lưu bằng chứng và phân loại mọi ca chưa chạy.

## 5. Thứ tự triển khai và lệnh chạy

1. **Khóa fixture và cách reset.** Thêm reset chỉ cho project local, tạo manifest run ID và builder cho đơn/variant/unit riêng; ca ghi chạy tuần tự hoặc có fixture độc lập. Không dùng `ORD-DEMO-*` làm đối tượng thay đổi lâu dài.
2. **Tách bộ test.** Giữ spec dùng `page.route` trong nhóm `ui-mocked`; thêm nhóm `local-live` chỉ gọi API local. Cấu hình live dùng `E2E_BASE_URL=http://localhost:5180`, `workers: 1` cho hành trình dùng chung dữ liệu; suite mock có thể chạy song song. Không để mock âm thầm che request của suite live.
3. **Chạy cổng kỹ thuật:** typecheck/lint/unit FE+BE, smoke S3; API PostgreSQL integration chỉ chạy sau khi có `DATABASE_TEST_URL` riêng và migration cho DB đó. Ghi commit và kết quả. Không đổi requirement vì một test cũ bám text/fixture đã lỗi thời; cập nhật test theo R01–R12.
4. **Chạy live theo chuỗi:** guest/customer → staff → kho/payment local → admin; mỗi bước ghi ID tạo mới và đối chiếu API/DB. Tách lỗi mạng/429/5xx thành suite mock để tránh làm hỏng dữ liệu run.
5. **Kiểm giao diện:** viewport và keyboard ở từng portal; trace/screenshot khi lỗi, duyệt trực quan các chỗ bảng, sidebar, modal, form, ngày và lỗi; camera thật làm manual.
6. **Khép run:** xóa bản ghi test hoặc reset project local, tổng hợp PASS/FAIL/BLOCKED/N/A và link bằng chứng. Chỉ sau đó xét đưa test ổn định vào CI.

Lệnh có thể dùng **sau khi cổng vào đạt**:

```powershell
.\local-test\start.ps1 up
node .\local-test\check-upload.mjs
pnpm typecheck
pnpm --filter @costume/web test
pnpm --filter @costume/api test
$env:E2E_BASE_URL = 'http://localhost:5180'
pnpm --filter @costume/web test:e2e
```

Lệnh Playwright cuối hiện chạy **các spec cũ**, gồm mock và ca đọc; đây là bước rà baseline, **không phải chứng nhận full live E2E**. Chưa chạy toàn bộ lệnh trên khi lập tài liệu này.

## 6. Cách ghi kết quả và cổng ra

Mỗi ca ghi: `run ID · commit · mã requirement · role/branch · fixture/ID · bước tái hiện · kỳ vọng · thực tế · HTTP/console · trace/screenshot · mức độ · người xử lý`. Không lưu mật khẩu, token, cookie hay dữ liệu khách thật vào artifact.

- **PASS:** UI, API và dữ liệu sau thao tác cùng khớp requirement; ca mock chỉ được ghi `UI ONLY`.
- **FAIL:** khác requirement hoặc sai tiền/quyền/đơn/unit; lỗi có bằng chứng và bước tái hiện.
- **BLOCKED:** thiếu fixture, runner hoặc tích hợp; ghi điều kiện cần mở khóa. **N/A:** nằm ngoài phạm vi local đã nêu.
- **Đạt để demo local:** tất cả P0 trong phạm vi local PASS, không còn P0/P1 chưa xử lý hoặc chưa có quyết định chấp nhận; mọi lỗi giao diện tràn/cắt ở viewport đã chọn được ghi và xử lý; không có 5xx/console error ngoài ca cố ý bơm lỗi; dữ liệu/ảnh test được dọn. Không lấy tỷ lệ pass của suite mock thay cho tiêu chí này.

Tài liệu ca thủ công chi tiết: [hướng dẫn tester](huong-dan-manual-test-cho-tester.md) và [kịch bản E2E nghiệp vụ](kich-ban-human-test-e2e.md).
