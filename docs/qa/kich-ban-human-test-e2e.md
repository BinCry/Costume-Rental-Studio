# Kịch bản kiểm thử thủ công End-to-End trên Production Demo

- **Dự án:** Costume Rental Studio
- **Phiên bản tài liệu:** 1.1
- **Ngày cập nhật:** 04/11/2026
- **Trạng thái:** Hướng dẫn chạy trên production demo; kết quả thực tế cần được ghi trong phiếu chạy.

## 1. Mục tiêu và phạm vi

Tài liệu hướng dẫn kiểm tra các hành trình chính trên production demo: khách tìm trang phục và gửi yêu cầu; nhân viên xác nhận, giao và nhận trả; kho, nhân sự, CRM, chính sách và báo cáo.

Theo xác nhận của chủ dự án, production hiện là bản demo với dữ liệu mô phỏng. Tester được chạy các thao tác ghi trong kịch bản trên tài khoản và dữ liệu demo; không cần xin duyệt riêng cho từng thao tác. Mọi đơn, barcode, policy và hồ sơ dùng trong lượt chạy phải là dữ liệu TEST do điều phối cung cấp hoặc tạo trong phạm vi demo. Không dùng danh tính, email, số điện thoại hay dữ liệu thanh toán của khách thật.

Các bản ghi demo có thể còn lại sau khi test; hãy khép lượt chạy theo mục 11, không xóa audit/payment hoặc reset database. Tích hợp ngoài như email, Google, PayOS, SMS hoặc webhook có thể vẫn tác động dịch vụ thật: chỉ dùng hộp thư/tài khoản TEST và phương thức thanh toán mô phỏng hoặc sandbox; không tạo giao dịch tiền thật.

Luồng Ops Agent đang ở chế độ fixture/demo và API agent không thuộc phạm vi bàn giao hiện tại. Không tính kết quả trình diễn Ops Agent là bằng chứng E2E đã tích hợp.

### Phân loại kết quả

- **PASS:** Đã thao tác trên production demo qua API thật; UI và dữ liệu server trả đúng kết quả; có bằng chứng.
- **FAIL:** Tính năng tích hợp có thể chạy nhưng kết quả sai, gây ghi trùng, mất dữ liệu hoặc cho phép thao tác trái quyền.
- **BLOCKED:** Thiếu tài khoản/dữ liệu demo, endpoint chưa hỗ trợ hoặc cần tích hợp bên ngoài chưa có sandbox. Ghi rõ điều kiện còn thiếu; không tính là PASS.
- **UI ONLY:** Có thể kiểm tra giao diện bằng fixture, nhưng thao tác không ghi dữ liệu production. Không tính là E2E nghiệp vụ.

## 2. Điều kiện trước khi chạy

### 2A. Chuẩn bị production demo

- Xác nhận URL production demo, commit/build FE/BE đang chạy và health check; không chạy migration, seed hay reset thủ công.
- Dùng tài khoản Customer, Staff bán hàng, Staff kho và Admin TEST. Các account này phải có role/chi nhánh đã định trước; không dùng tài khoản cá nhân hoặc của chủ dự án.
- Chọn khách TEST, mẫu ảnh TEST, barcode demo, policy/voucher demo và khoảng thuê. Ghi trạng thái đầu vào để khép lại sau khi chạy.
- Có thể tạo/duyệt/giao/trả/block/điều chuyển và cập nhật policy hoặc ưu đãi TEST trong phạm vi bản demo. Gắn nhãn TEST nếu có trường phù hợp; không sửa dữ liệu thật nếu phát hiện có.
- Thanh toán/refund chỉ dùng cờ hoặc phương thức mô phỏng/sandbox. Không mở QR/link thu tiền thật, không bấm xác nhận giao dịch ngân hàng thật.
- OAuth/email chỉ dùng tài khoản và hộp thư TEST do nhóm kiểm soát. Nếu hệ thống sắp gửi thư/SMS/webhook ra ngoài nhóm test, dừng bước gửi và ghi BLOCKED cho tích hợp đó.
- Lưu mã đơn, barcode, policy/voucher đã đổi và trạng thái cuối. Khép dữ liệu theo mục 11; không xóa audit/payment và không chỉnh database trực tiếp.
- Dừng nếu xuất hiện dữ liệu nhận diện khách thật, giao dịch thật, quyền vượt phạm vi hoặc trạng thái ghi không rõ. Chụp bằng chứng đã che dữ liệu, báo người điều phối và không retry trước khi đối soát.

Người điều phối kiểm tra và ghi nhận các điều kiện sau trước khi bắt đầu:

1. FE/BE khỏe và đúng bản demo; ghi URL, commit/build, thời điểm, múi giờ và health check.
2. Đã xác nhận các tài khoản, barcode, policy và đơn cần thiết đều là dữ liệu TEST.
3. Có người điều phối liên lạc được để xử lý lỗi quyền hoặc trạng thái không rõ.
4. Có barcode demo chính và dự phòng; các barcode này không đại diện hàng của cửa hàng thật.
5. Đã ghi lại policy/giá/cọc/voucher ban đầu nếu ca test sẽ cập nhật rồi khôi phục.
6. Không đổi đồng hồ hệ thống. Với ca quá hạn, dùng đơn demo được chuẩn bị sẵn hoặc dữ liệu demo có kỳ thuê phù hợp.
7. Chuẩn bị nơi lưu ảnh, mã đơn, barcode, thời điểm và request/correlation ID; không lưu secret/token.

### 2B. Vai trò và tài khoản cần chuẩn bị

Mỗi người dùng một tài khoản cá nhân thử nghiệm do Studio kiểm soát; không chia sẻ mật khẩu. Điền email đã che bớt trong biên bản nội bộ, không ghi mật khẩu/token.

| Vai trò kiểm thử | Tài khoản/quyền cần có | Các ca chính | Giới hạn an toàn |
|---|---|---|---|
| Khách chưa đăng nhập | Trình duyệt riêng tư | E2E-03 | Chỉ xem dữ liệu công khai, không tạo hồ sơ thay khách |
| Khách hàng | Tài khoản Customer riêng, email/điện thoại Studio kiểm soát | E2E-01 đến E2E-04, E2E-08, E2E-11 | Chỉ xem đơn của chính tài khoản |
| Nhân viên bán hàng/xử lý đơn | Tài khoản staff với quyền thuê phù hợp và đúng chi nhánh | E2E-05 đến E2E-09, E2E-14 | Chỉ dùng đơn/barcode thử nghiệm |
| Nhân viên giao nhận/thanh toán | Quyền giao nhận và thanh toán theo role; dùng thanh toán/refund mô phỏng | E2E-07, E2E-11 đến E2E-13 | Không kết nối hoặc xác nhận giao dịch tiền thật |
| Nhân viên kho | Role kho và chi nhánh được gán | E2E-15, E2E-16 | Chỉ block/điều chuyển barcode TEST; khôi phục sau test |
| Nhân viên CRM | Quyền đọc hồ sơ/case tại chi nhánh | E2E-19 | Chỉ dùng hồ sơ khách TEST, không mở khách thật |
| Quản trị viên | Tài khoản admin riêng, MFA nếu hệ thống hỗ trợ | E2E-10, E2E-17, E2E-18, E2E-20, E2E-23 | Chỉ sửa bản ghi TEST; ghi lại giá trị cũ và khôi phục sau test |

Trong seed của dự án, các role code là **ADMIN**, **SALES_STAFF**, **INVENTORY_STAFF** và **CUSTOMER**. CRM không có role code riêng trong seed; dùng tài khoản chỉ khi role đó thực sự được cấp quyền CRM tại chi nhánh. SALES_STAFF có quyền thuê/giao nhận/thanh toán/CRM theo seed, INVENTORY_STAFF có quyền kho/điều chuyển, còn ADMIN có quyền toàn chuỗi. Xác nhận role và branch assignment của các tài khoản TEST trước khi bắt đầu.

Nếu tài khoản TEST thiếu quyền cần kiểm tra, ghi lại quyền thiếu và yêu cầu người quản trị cấu hình cho đúng account TEST; không dùng tài khoản chủ Studio thay cho nhân viên.

### 2C. Thứ tự chạy các luồng

1. **Khách online:** khách chưa đăng nhập xem catalog → đăng ký email/Google → chọn chi nhánh/size/kỳ thuê → gửi yêu cầu → xem đơn của chính mình.
2. **Nhân viên bán hàng:** duyệt yêu cầu → kiểm lịch/quyền → xác nhận và gán barcode → chuẩn bị → giao bằng phương thức mô phỏng → theo dõi đơn đang thuê.
3. **Trả và quyết toán:** nhận từng bộ → kiểm tình trạng/phụ kiện demo → quyết toán theo snapshot → kiểm tra refund mô phỏng.
4. **Tình huống đặc biệt:** dùng dữ liệu TEST cho khách trước trả trễ/đơn kế tiếp, xung đột hai nhân viên và policy; không tua đồng hồ hệ thống.
5. **Quầy và vận hành:** tạo đơn tại quầy → tra/block kho → điều chuyển và nhận một phần → CRM → role/branch access → báo cáo.
6. **Kiểm tra chéo:** chạy lại quyền với Customer, SALES_STAFF, INVENTORY_STAFF, CRM-authorized staff và ADMIN; kiểm tra mobile/keyboard; đối chiếu dữ liệu cuối và khép lượt test.

Để thực hiện hành trình thuê từ đầu đến cuối, dùng một đơn được tạo ở bước 1 và xuyên suốt bước 2–3; không tạo một loạt đơn rời rạc trùng dữ liệu. Ca độc lập cần đơn thứ hai thì tạo đơn TEST riêng.

### Hồ sơ chạy kiểm thử

| Trường | Giá trị điền khi chạy |
|---|---|
| Môi trường / URL |  |
| Commit FE / BE |  |
| Ngày giờ, múi giờ |  |
| Người chạy / người chứng kiến |  |
| Email khách do Studio kiểm soát |  |
| Tài khoản nhân viên và role/chi nhánh |  |
| Mã bộ trang phục / barcode chính và dự phòng |  |
| Khoảng thuê TEST |  |
| Policy version và giá trị giờ đệm |  |
| Phương thức thanh toán mô phỏng / sandbox |  |
| Thư mục bằng chứng |  |

Không ghi mật khẩu, token, thông tin thẻ/ngân hàng hoặc dữ liệu cá nhân của khách thật vào biên bản.

## 3. Dữ liệu kiểm thử cần chuẩn bị

Production demo dùng dữ liệu mô phỏng theo xác nhận của chủ dự án. Mọi thay đổi vẫn được lưu trong database demo; dùng nhãn TEST và khép lại theo mục 11.

- **Khách A:** tài khoản email mới, số điện thoại thử nghiệm duy nhất.
- **Khách B:** tài khoản thứ hai để thử quyền sở hữu đơn và lịch kế tiếp.
- **Trang phục X:** mẫu, size và barcode đang READY tại chi nhánh Quận 1; có ít nhất một bộ cùng biến thể làm phương án thay thế.
- **Trang phục Y:** mẫu/size khác để thử tìm kiếm và tạo đơn tại quầy.
- **Mẫu ảnh TEST:** một mẫu do Studio dành riêng cho kiểm tra ảnh, không có lịch thuê hoặc nội dung công khai cần giữ nguyên; dùng ảnh do Studio sở hữu và được duyệt để tải lên/thay/xóa.
- **Đơn A:** đơn demo đang thuê hoặc demo quá hạn để thử kịch bản chưa trả.
- **Đơn B:** đơn demo kế tiếp dùng cùng barcode để kiểm tra hệ thống chặn xung đột lịch.
- **Nhân viên:** tài khoản thuộc đúng chi nhánh và một tài khoản không được gán chi nhánh/không có quyền để kiểm tra từ chối.
- **Phiếu điều chuyển:** một phiếu có ít nhất hai bộ để thử nhận một phần và nhận hoàn tất.

Điền ID thực tế vào bảng theo dõi; không giả định mã fixture như BC-031 hay DC-001 tồn tại trên production demo. Điều phối chuẩn bị dữ liệu TEST hoặc hướng dẫn tạo bằng giao diện.

## 4. Quy tắc thực hiện và ghi nhận

1. Thực hiện theo thứ tự; mỗi ca ghi PASS, FAIL, BLOCKED hoặc UI ONLY.
2. Ghi trước và sau thao tác: trạng thái đơn, barcode, chi nhánh, số tiền thuê/cọc/phí/refund và trạng thái đối soát.
3. Với thao tác ghi, nhấn một lần rồi chờ kết quả. Chỉ thử gửi lại sau khi đã xác nhận trạng thái hiện tại để tránh tạo dữ liệu trùng.
4. Với lỗi phiên bản/xung đột, xác nhận UI tải lại dữ liệu hiện hành và yêu cầu người dùng chọn lại thao tác; không gửi lại payload cũ mù quáng.
5. Thử quyền bằng tài khoản đã được cấp quyền khác nhau. Ẩn nút trên UI chưa đủ: thao tác trực tiếp qua màn hình/API cũng phải bị từ chối và không làm thay đổi dữ liệu.
6. Khi phát hiện sai lệch tiền hoặc barcode, dừng ca liên quan; không tự sửa trực tiếp database. Ghi mã đơn, thời điểm, trạng thái trước/sau và báo người điều phối.

## 5. Kịch bản E2E khách hàng và tạo yêu cầu thuê

### E2E-01 — Đăng ký tài khoản khách bằng email

**Vai trò:** Khách A. **Điều kiện:** Email/OTP production đến hộp thư do Studio kiểm soát; nhân viên nhận email ngoài giờ kiểm thử đã được thông báo.

1. Mở trang đăng ký và nhập tên hiển thị, email, số điện thoại, mật khẩu hợp lệ.
2. Gửi đăng ký; lấy OTP từ hộp thư Studio kiểm soát và xác nhận. Kiểm tra email gửi đến đúng địa chỉ, không ai ngoài nhóm test nhận thông báo.
3. Đăng nhập bằng email/mật khẩu vừa tạo; mở hồ sơ tài khoản.
4. Đăng xuất, đăng nhập lại để kiểm tra phiên hoạt động.

**Mong đợi:** Tài khoản demo được xác minh; hồ sơ cơ bản hiển thị đúng; người dùng chỉ có quyền khách hàng, không xuất hiện menu vận hành/quản trị. Email đã dùng không tạo tài khoản trùng. Không tiết lộ OTP trong giao diện/log không phù hợp. Ghi lại email TEST để nhận biết hồ sơ kiểm thử.

### E2E-02 — Đăng nhập Google (nếu production demo đã cấu hình)

1. Chọn tiếp tục bằng Google và dùng tài khoản Google kiểm thử được cấp.
2. Hoàn tất OAuth, quay về đúng trang; tải lại trang và mở trang đơn của tôi.
3. Đăng xuất rồi đăng nhập lại bằng cùng tài khoản Google.

**Mong đợi:** Tài khoản được liên kết đúng, không tạo hồ sơ nhân viên hoặc cấp role quản trị. Không có callback lỗi, vòng lặp đăng nhập hay lộ token. Chỉ dùng Google account kiểm thử thuộc nhóm. Nếu OAuth production demo chưa cấu hình hoặc không thể dùng tài khoản TEST: **BLOCKED**, không thay bằng fixture.

### E2E-03 — Tìm trang phục và xem khả dụng

**Vai trò:** Khách A.

1. Mở bộ sưu tập; tìm theo tên/mẫu và lọc theo danh mục/size/chi nhánh nếu có.
2. Mở Trang phục X; chọn đúng size/biến thể, chi nhánh và kỳ nhận/trả.
3. Ghi lại giá thuê, tiền cọc, ngày/giờ nhận trả và thông tin khả dụng.
4. Kiểm tra kỳ bận bằng dữ liệu đơn TEST đã chuẩn bị; không tạo xung đột với khách thật. Sau đó chọn kỳ trống trong phạm vi dữ liệu demo.
5. Tải lại trang và kiểm tra dữ liệu vẫn khớp với lựa chọn.

**Mong đợi:** Biến thể, chi nhánh và khoảng ngày được giữ đúng xuyên suốt. Giá và khả dụng nhất quán với API. Bộ đang thuê, bị block, vệ sinh/sửa chữa hoặc không thuộc chi nhánh không được báo sẵn sàng. Không để khách suy ra số lượng hoặc barcode nội bộ không cần thiết.

### E2E-04 — Gửi yêu cầu thuê online

**Vai trò:** Khách A.

1. Từ Trang phục X trong catalog demo, bắt đầu đặt thuê; xác nhận biến thể, chi nhánh, kỳ nhận/trả, giá và cọc.
2. Xác nhận thông tin liên hệ; gửi yêu cầu một lần.
3. Mở đơn của tôi và ghi mã đơn, trạng thái, tổng tiền hiển thị.
4. Làm mới trang; đăng xuất/đăng nhập lại và mở lại đơn.
5. Mở cùng kỳ thuê trong cửa sổ thứ hai để kiểm tra trạng thái lịch, không gửi yêu cầu trùng.

**Mong đợi:** Đơn demo xuất hiện một lần, thuộc đúng khách và bắt đầu ở trạng thái chờ nhân viên duyệt/xác nhận. Gửi yêu cầu chờ **không đồng nghĩa đã xác nhận hoặc đã thu tiền**. Theo policy hiện hành, request pending chưa giữ barcode; nhân viên phải kiểm tra lại khả dụng lúc xác nhận. Nếu UI báo đã trả tiền/đã có bộ khi chưa có xác nhận máy chủ, FAIL.

## 6. Kịch bản nhân viên duyệt, gán bộ và giao nhận

### E2E-05 — Nhân viên xử lý hàng đợi, xác nhận và gán barcode

**Vai trò:** Nhân viên bán hàng tại chi nhánh của đơn.

1. Đăng nhập và mở danh sách đơn thuê; tìm mã đơn E2E-04.
2. Xác nhận khách TEST, chi nhánh, biến thể/size, khoảng thuê và giá/cọc snapshot.
3. Chọn một barcode READY thuộc dữ liệu demo; xem cảnh báo nếu barcode đã có lịch, bị block hoặc khác chi nhánh.
4. Xác nhận đơn; mở lại chi tiết và ghi trạng thái, barcode cùng lịch sử thao tác.
5. Mở đơn bằng tài khoản của chi nhánh khác để kiểm tra phạm vi dữ liệu.

**Mong đợi:** Chỉ nhân viên có quyền và đúng phạm vi chi nhánh mới xác nhận/gán. Barcode và kỳ thuê được lưu một lần; trạng thái đơn thay đổi sau phản hồi thành công của server. Người dùng khác chi nhánh không được thao tác trái quyền.

### E2E-06 — Xung đột gán bộ hoặc hai người cùng xử lý

**Vai trò:** Hai nhân viên kiểm thử; chỉ dùng đơn/barcode TEST.

1. Mở cùng đơn kiểm thử ở hai phiên/thiết bị.
2. Cả hai chọn cùng barcode; phiên thứ nhất xác nhận.
3. Ở phiên thứ hai, thử xác nhận dựa trên dữ liệu cũ.
4. Tải lại danh sách và chi tiết đơn.

**Mong đợi:** Chỉ một thao tác thành công. Phiên còn lại nhận thông báo xung đột có hướng xử lý, không tạo phân bổ thứ hai và không báo thành công giả. Dữ liệu mới sau tải lại thể hiện người thắng cuộc.

### E2E-07 — Thu tiền thuê và cọc khi giao đồ

**Vai trò:** Nhân viên TEST được quyền giao/ghi thanh toán mô phỏng; khách A. Chỉ dùng sandbox hoặc phương thức được cấu hình là mô phỏng.

1. Mở đơn đã xác nhận và vào bước giao đồ.
2. Kiểm đúng khách, barcode, phụ kiện, tình trạng trước khi giao.
3. Đối chiếu tiền thuê và tiền cọc thành hai khoản riêng với snapshot máy chủ.
4. Ghi nhận thanh toán demo bằng phương thức mô phỏng. Không tạo QR/link thanh toán thật và không tự xác nhận chuyển khoản thật đang chờ.
5. Thử chọn chuyển khoản còn chờ đối soát; xác nhận không thể hoàn tất giao đồ bằng khoản chưa xác nhận thành công.
6. Xác nhận giao đồ; quay về danh sách đang thuê và tra barcode.

**Mong đợi:** Không tính cọc là doanh thu. Không giao đồ khi khoản bắt buộc còn thiếu/chưa đối soát. Ghi nhận thời điểm, nhân viên, phương thức và số tiền mô phỏng; sau giao, đơn chuyển ACTIVE và barcode được ghi nhận đang ở khách. Không thu trùng khi tải lại hoặc nhấn lại.

### E2E-08 — Theo dõi đang thuê và thử gia hạn

**Vai trò:** Nhân viên/khách theo quyền.

1. Tra cứu theo mã barcode, khách hoặc đơn ở màn Đang thuê.
2. Đối chiếu hạn trả, chi nhánh nhận trả và tình trạng từng bộ.
3. Mở yêu cầu gia hạn (nếu UI cho phép) và chọn thời gian mới.
4. Nếu kết quả đang là bản nháp/chưa tích hợp, dừng trước khi xác nhận hay thu tiền.

**Mong đợi:** Màn hình phản ánh đúng barcode đang ở khách và hạn trả. Bản nháp gia hạn không tự sửa lịch, không tự thu thêm tiền và không xác nhận gia hạn. Nếu cần gia hạn thực tế nhưng endpoint/policy chưa hỗ trợ: ghi **BLOCKED**, không tính là PASS.

## 7. Kịch bản trả trễ và khách kế tiếp

### E2E-09 — Khách trước chưa trả khi khách kế tiếp đến nhận

**Vai trò:** Nhân viên quản lý đơn và khách B. **Điều kiện:** Đơn A và B đều là đơn TEST; cùng dùng barcode TEST với kỳ thuê nối tiếp. Dùng bản ghi demo quá hạn có sẵn hoặc tạo dữ liệu TEST phù hợp; không thay đổi đồng hồ hệ thống.

1. Xác nhận A vẫn giữ barcode và chưa có biên nhận trả.
2. Mở bảng việc/đơn B; ghi nhận cảnh báo liên quan A/B nếu được hỗ trợ.
3. Thử preflight/bàn giao B trên barcode đang thuộc allocation ACTIVE của A bằng luồng mô phỏng; chưa tạo thanh toán thật.
4. Xác nhận thao tác bị chặn; kiểm tra B vẫn chưa ACTIVE, chưa ghi bàn giao và không thu khoản mới vì barcode xung đột.
5. Nếu có barcode READY thay thế cùng biến thể/size, dùng luồng đổi/gán lại được quyền cho phép; kiểm tra lịch sử barcode cũ/mới và thử bàn giao lại B.
6. Nếu A trả bộ, ghi nhận từng item; khi bộ ở CLEANING/REPAIR/blocked, thử bàn giao B lần nữa.
7. Bàn giao B sau khi barcode thay thế hoặc barcode đã qua đủ trạng thái và được API xác nhận READY; người nhận là tài khoản TEST.

**Mong đợi:** A không tự bị coi là đã trả chỉ vì hết hạn; B không tự hủy hoặc tự chuyển ACTIVE. API chặn giao trên barcode vẫn ở A bằng conflict; không tạo giao dịch thanh toán trước khi xử lý conflict. Bộ CLEANING/REPAIR/blocked không được giao. Chỉ hoàn tất khi phương án mới được server lưu. Nếu thiếu đơn A/B, tạo các bản ghi TEST qua giao diện demo; không đổi đồng hồ hệ thống.

### E2E-10 — Kiểm tra cập nhật policy thời gian đệm

**Vai trò:** Quản trị viên.

1. Ghi lại phiên bản và giá trị hiện tại của policy TEST.
2. Chỉnh policy TEST theo giá trị kiểm thử; xác nhận chỉ tài khoản có quyền mới sửa được.
3. Tính lại báo giá demo và kiểm tra đơn mới/đơn đã tạo giữ đúng snapshot.
4. Khôi phục policy demo về giá trị ban đầu rồi xác nhận sau khi tải lại.

**Mong đợi:** UI hiển thị phiên bản/giá trị từ server, không tự giả định 12+12 nếu policy demo hiện tại khác. Đơn cũ giữ snapshot; báo giá mới dùng phiên bản vừa cập nhật. Sau ca, policy TEST trở về giá trị ban đầu.

## 8. Kịch bản nhận trả, kiểm tra, quyết toán và hoàn cọc

### E2E-11 — Trả một phần đơn có nhiều bộ

**Vai trò:** Nhân viên nhận trả. **Điều kiện:** Đơn có ít nhất hai bộ đã được dành riêng; khách và nhân viên đều do Studio kiểm soát.

1. Mở đơn nhiều bộ đang ACTIVE được tạo cho lượt kiểm thử.
2. Quét barcode của một bộ, chọn tình trạng/grade và kiểm phụ kiện.
3. Gửi nhận trả bộ đó; quay lại đơn.
4. Xác nhận bộ đã nhận có biên bản riêng; bộ chưa trả vẫn thuộc khách và đơn chưa hoàn tất.
5. Thử quét cùng barcode lần nữa.

**Mong đợi:** Ghi nhận một lần cho đúng bộ; quét lặp không tạo biên bản trùng. Các item được theo dõi riêng; đơn chưa chuyển hoàn tất khi còn item chưa nhận/trạng thái đánh giá chưa xong.

### E2E-12 — Trả thiếu/hỏng, chờ đánh giá rồi quyết toán

**Vai trò:** Nhân viên nhận trả và người có quyền quyết toán.

1. Chỉ dùng barcode TEST được dành riêng cho mô phỏng tình trạng thiếu/hỏng; không làm hỏng trang phục thật. Ghi rõ đây là dữ liệu mô phỏng và chụp bằng chứng trạng thái ban đầu.
2. Lưu biên bản; mở lại đơn bằng tài khoản được phân công đánh giá.
3. Kiểm tra phí bổ sung/cọc đang giữ/số dư theo snapshot máy chủ.
4. Thử luồng thu/refund mô phỏng nếu hệ thống hỗ trợ; không khởi tạo giao dịch qua provider thật.
5. Hoàn tất đánh giá theo policy demo hiện hành; không dùng ca này để áp phí hoặc khấu trừ lên khách thật.
6. Khôi phục tình trạng barcode TEST về trạng thái ban đầu sau khi xác minh các trạng thái chờ xử lý.

**Mong đợi:** Bộ cần kiểm tra không tự được đánh dấu READY; tiền cọc không tự biến thành doanh thu hay tự động bị trừ; phí phát sinh không được tự suy ra từ UI. Khi đánh giá chưa xong, thu phí/refund bị chặn theo quy tắc backend. Bản ghi mô phỏng không tạo ra khoản thu/refund bên ngoài.

### E2E-13 — Kiểm tra trạng thái hoàn cọc

**Vai trò:** Nhân viên có quyền đọc thanh toán/hoàn tiền.

1. Mở trang/khoản hoàn cọc của đơn đã quyết toán.
2. Ghi số tiền, trạng thái máy chủ, phương thức và thời điểm nếu được trả về.
3. Làm mới trang và xác nhận không có bản ghi refund mới chỉ do mở màn hình.
4. Nếu hệ thống có chế độ refund mô phỏng, tạo một refund demo và theo dõi đến trạng thái cuối; nếu chỉ gọi provider thật, dừng trước khi xác nhận và ghi BLOCKED cho bước tích hợp đó.

**Mong đợi:** UI hiển thị trạng thái backend và không tự tuyên bố “đã hoàn” khi chỉ mới yêu cầu/đang xử lý. Hệ thống không tạo refund trùng khi refresh/retry. Chỉ kiểm tra mô phỏng; không khởi tạo hoàn tiền thật.

## 9. Kịch bản tại quầy, kho, nhân sự và CRM

### E2E-14 — Tạo đơn tại quầy

**Vai trò:** Nhân viên bán hàng.

1. Mở Tạo tại quầy; tìm Khách B theo số điện thoại thử nghiệm.
2. Thử tạo khách mới bằng thông tin duy nhất; thử lại bằng cùng số để kiểm tra chặn trùng.
3. Chọn bộ/biến thể TEST, chi nhánh và ngày nhận/trả thuộc dữ liệu demo; kiểm báo giá và khả dụng.
4. Tạo yêu cầu chờ xử lý hoặc xác nhận/gán bộ theo quyền và luồng hiện hành.
5. Tải lại trang, tìm đơn và đối chiếu hồ sơ khách, barcode, giá/cọc.

**Mong đợi:** Không tạo khách/đơn trùng. Nhân viên chỉ nhìn thấy và ghi đơn trong phạm vi được giao. Tạo đơn tại quầy không tự thu tiền trước bước thu được quy định.

### E2E-15 — Tra cứu và chặn bộ trong kho

**Vai trò:** Nhân viên kho.

1. Tra barcode chính; kiểm mẫu, size, chi nhánh, trạng thái vận hành và lịch liên quan.
2. Đặt block có lý do trên barcode TEST và ghi nhận thời điểm; xác nhận bộ không còn khả dụng.
3. Thử gán bộ đang dành riêng/bị block vào đơn kiểm thử khác; xác nhận bị từ chối.
4. Gỡ block bằng tài khoản có quyền và lý do; xác nhận chỉ khả dụng nếu mọi điều kiện lịch/trạng thái đều đạt. Khôi phục trạng thái ban đầu của barcode TEST.

**Mong đợi:** Trạng thái vật lý và khả dụng theo kỳ thuê được thể hiện riêng. Block không xóa lịch sử/đơn cũ. Nhân viên không có quyền không thể block/gỡ block qua UI hoặc API.

### E2E-16 — Điều chuyển và nhận từng phần

**Vai trò:** Nhân viên kho ở hai chi nhánh. **Điều kiện:** Dùng hai barcode TEST ở chi nhánh gửi, không có booking/điều chuyển khác. Nếu chưa có, tạo/chuẩn bị dữ liệu TEST trong demo; chỉ BLOCKED khi API chưa hỗ trợ hoặc không thể tạo dữ liệu demo.

1. Tạo/duyệt phiếu điều chuyển hai barcode TEST từ Quận 1 sang Thủ Đức.
2. Ghi xuất từng bộ; mở phiếu ở chi nhánh nhận.
3. Nhận một trong hai barcode; giữ barcode còn lại chưa nhận.
4. Kiểm tra chi nhánh hiện tại của bộ đã nhận và chưa nhận; thử dùng bộ chưa nhận để tạo đơn tại chi nhánh đích.
5. Nhận bộ còn lại; kiểm tra phiếu hoàn tất và lịch sử hai barcode. Tạo phiếu chuyển về chi nhánh ban đầu nếu cần, rồi xác nhận trạng thái demo đã trở lại như ban đầu.

**Mong đợi:** Chi nhánh của từng bộ chỉ đổi sau khi ghi nhận nhận ở nơi đến. Phiếu nhận một phần vẫn thể hiện còn thiếu; không giao/đặt tại chi nhánh đích bằng bộ chưa nhận. Barcode có lịch thuê tương lai hoặc đang ở khách không được chuyển trái quy tắc.

### E2E-17 — Phân công nhân viên theo chi nhánh

**Vai trò:** Quản trị viên và nhân viên.

1. Mở Nhân viên; tìm nhân viên kiểm thử đã được tạo riêng theo tên/email, không dùng UUID nội bộ để tìm trong thao tác hàng ngày.
2. Gán role và chi nhánh TEST; lưu.
3. Đăng nhập bằng tài khoản nhân viên đó; mở các màn tương ứng ở chi nhánh được giao.
4. Thử đổi chi nhánh sang chi nhánh không được gán hoặc mở URL trực tiếp đến khu vực bị hạn chế.
5. Thu hồi phân công của tài khoản TEST sau khi xác minh; tải lại trang đã mở và thử một thao tác bị giới hạn quyền.

**Mong đợi:** Role có hiệu lực trong phạm vi chi nhánh đã gán; không lộ dữ liệu chi nhánh khác. Thu hồi quyền được backend thực thi khi ghi, kể cả khi phiên UI đang mở. Không được vô hiệu hóa quản trị viên cuối cùng.

### E2E-18 — Chỉnh quyền checkbox theo role

**Vai trò:** Quản trị viên.

1. Mở Vai trò; chỉ chọn role riêng dành cho tài khoản kiểm thử, tuyệt đối không sửa role đang gán cho nhân viên/cửa hàng.
2. Tick/bỏ quyền trên role TEST riêng; không thay đổi role dùng chung hoặc role đang gán cho nhân viên thật.
3. Với role riêng, lưu và tải lại để xác nhận thay đổi; ghi quyền trước/sau để khôi phục đúng sau test.
4. Đăng nhập bằng user kiểm thử thuộc role đó; thử hành động được cấp và hành động bị từ chối.
5. Khôi phục role và thu hồi user TEST sau khi xác minh; không đụng tới role quản trị hoặc role của nhân viên thật.

**Mong đợi:** Checkbox là cấu hình role được lưu, không phải trạng thái giả cục bộ. API từ chối thao tác mất quyền; không dựa riêng vào việc ẩn menu. Không thể cấp phạm vi rộng hơn cấu hình được phép hoặc xóa quyền cần để giữ quản trị viên cuối cùng.

### E2E-19 — Tra cứu hồ sơ và xử lý case CRM

**Vai trò:** Nhân viên CRM; khách thử nghiệm.

1. Tìm khách theo email/số thử nghiệm; mở hồ sơ, lịch sử đơn và tương tác.
2. Tạo một tương tác có nội dung kiểm thử, ghi đúng kênh và thời điểm.
3. Tạo case/ghi nhận chăm sóc nếu chức năng được backend hỗ trợ; gán nhân viên CRM trong cùng phạm vi chi nhánh.
4. Cập nhật trạng thái và mở lại case.
5. Thử truy cập cùng hồ sơ bằng nhân viên ngoài phạm vi quyền/chi nhánh.

**Mong đợi:** Lịch sử đúng khách, không hiển thị dữ liệu của người khác; case có người phụ trách và trạng thái lưu trên server. Nhân viên CRM không cần quyền quản trị nhân sự nếu chỉ xử lý case. Nếu thao tác vẫn là fixture hoặc endpoint chưa có: **UI ONLY/BLOCKED**.

### E2E-20 — Giá, chính sách và báo cáo

**Vai trò:** Quản trị viên.

1. Ghi lại giá/cọc của bản ghi TEST; nếu cần chỉnh, chỉ sửa cấu hình TEST đã dành riêng và ghi lại giá trị trước/sau.
2. Mở báo giá hoặc đơn TEST đã tạo trong luồng, kiểm tra snapshot và ảnh hưởng của cấu hình mới; không áp cấu hình lên mẫu/đơn thật.
3. Mở báo cáo ở phạm vi test account/chi nhánh được phép và đối chiếu các khoản phát sinh.
4. Đối chiếu tiền thuê, tiền cọc, khoản thu đã đối soát, phí bổ sung và refund theo nguồn server.

**Mong đợi:** Đơn giữ đúng snapshot giá/version đã tạo; cọc đang giữ và chuyển khoản chờ đối soát không được tính là doanh thu/đã thu; refund lỗi hoặc đang chờ không được tính là đã hoàn. Số báo cáo khớp dữ liệu server và phạm vi chi nhánh. Khôi phục cấu hình TEST sau khi kiểm tra.

### E2E-23 — Quản lý thư viện ảnh sản phẩm

**Vai trò:** Quản trị viên hoặc nhân viên được cấp `catalog:manage`. **Điều kiện:** Có mẫu ảnh TEST đã lưu và ảnh do Studio sở hữu, được phép sử dụng; thao tác chỉ tác động mẫu TEST.

1. Mở **Quản trị → Danh mục → Mẫu, biến thể & giá**, chọn mẫu ảnh TEST và đợi thư viện ảnh tải xong.
2. Chọn ảnh JPEG/PNG/WebP; kiểm tra preview, nhập mô tả thay thế và bấm **Thêm ảnh**. Theo dõi tiến độ, chờ xác nhận hoàn tất rồi tải lại thư viện.
3. Đặt ảnh mới làm ảnh đại diện; kiểm tra vị trí đầu thư viện và thứ tự ảnh ở danh mục công khai.
4. Sửa mô tả ảnh và xác nhận nội dung mới được lưu.
5. Chọn một ảnh thử nghiệm, tải ảnh thay thế và xác nhận ảnh mới xuất hiện trước khi ảnh cũ bị gỡ. Nếu thao tác báo lỗi, tải lại thư viện trước khi thử lại.
6. Xóa ảnh thử nghiệm bằng hộp thoại xác nhận; tải lại và kiểm tra ảnh đã gỡ khỏi danh sách.
7. Đăng nhập bằng tài khoản chỉ có quyền đọc catalog: ảnh vẫn xem được nhưng thao tác thêm, thay, sắp xếp, sửa mô tả và xóa phải bị ẩn/vô hiệu hóa. Nếu có tài khoản không quyền, xác nhận API từ chối ghi.
8. Chỉ thử định dạng sai, vượt dung lượng hoặc vượt số ảnh trên mẫu TEST; xác nhận thông báo hướng dẫn phục hồi và không tạo bản ghi ảnh dở dang có thể dùng công khai.

**Mong đợi:** Mọi ảnh được tải qua API presign và lưu bằng API catalog; trình duyệt không nhận S3 secret. Ảnh mới dùng đúng mẫu, hiển thị đúng alt text và thứ tự. Thay ảnh giữ ảnh cũ đến khi ảnh mới được lưu. Nếu xóa object tạm thời thất bại, trạng thái được kiểm tra lại sau khi outbox chạy. Không xóa ảnh hoặc sửa hình của mẫu đang có khách thuê.

## 10. Khả năng phục hồi, responsive và accessibility

### E2E-21 — Lỗi mạng và xung đột phiên bản

1. Dùng tài khoản kiểm thử, ngắt mạng trước một thao tác đọc (ví dụ tải danh sách); quan sát lỗi rồi nối lại và tải lại.
2. Không chủ động ngắt mạng sau khi gửi đơn, payment, refund, giao/nhận trả, block hoặc điều chuyển.
3. Với bất kỳ lần gửi có kết quả không rõ, kiểm tra đơn/payment/barcode TEST trên production demo trước khi retry.
4. Thử xung đột version trên hồ sơ/đơn TEST không có khoản thanh toán thật đang chờ; nếu chưa có bản ghi cô lập, tạo qua giao diện demo.

**Mong đợi:** UI nêu lỗi và cách khôi phục; không tự báo thành công, không tạo bản ghi trùng, không ghi vào trạng thái cũ. Người dùng được yêu cầu tải lại/đối chiếu trước khi thử lại.

### E2E-22 — Kiểm tra mobile và bàn phím

1. Chạy các bước tìm sản phẩm, đặt thuê, xem đơn, nhận trả và tra barcode ở màn hình rộng máy tính và viewport điện thoại khoảng 390px.
2. Dùng Tab/Shift+Tab/Enter/Space để thao tác form và hành động chính; kiểm focus khi mở/đóng dialog.
3. Thử zoom 200%, thông báo lỗi, bảng dài, trạng thái rỗng và loading.

**Mong đợi:** Không che nút chính/giá/chi nhánh; không có cuộn ngang toàn trang ngoài thành phần có chủ đích; label và lỗi gắn đúng trường; focus nhìn thấy được; thông báo trạng thái đọc được và thao tác không phụ thuộc chuột.

## 11. Dọn dữ liệu thử nghiệm và kết thúc lượt chạy

1. Ghi mã khách, đơn, barcode, phiếu điều chuyển, role TEST và giao dịch mô phỏng vào biên bản.
2. Hoàn tất hoặc hủy đơn TEST theo quy trình demo; bảo đảm không còn payment/refund mô phỏng ở trạng thái không rõ. Không tạo giao dịch tiền thật.
3. Gỡ block TEST; hoàn tất phiếu chuyển và khôi phục vị trí/trạng thái ban đầu trong dữ liệu demo.
4. Khôi phục policy/giá/role TEST về giá trị ban đầu và thu hồi phân công TEST; không xóa audit/payment hoặc reset database. Đánh dấu hồ sơ TEST nếu hệ thống có trường phù hợp.
5. Đối chiếu trạng thái barcode TEST và xác nhận không còn giao dịch mô phỏng đang chờ.
6. Lưu bằng chứng ở nơi nội bộ được phép, rồi báo người vận hành và chủ Studio rằng lượt chạy đã kết thúc.

## 12. Phiếu kết quả

| Mã ca | Kết quả | Mã đơn/barcode/ID liên quan | Bằng chứng | Lỗi/ghi chú | Người xử lý |
|---|---|---|---|---|---|
| E2E-01 đến E2E-04 |  |  |  |  |  |
| E2E-05 đến E2E-08 |  |  |  |  |  |
| E2E-09 đến E2E-10 |  |  |  |  |  |
| E2E-11 đến E2E-13 |  |  |  |  |  |
| E2E-14 đến E2E-20 |  |  |  |  |  |
| E2E-21 đến E2E-22 |  |  |  |  |  |
| E2E-23 |  |  |  |  |  |

### Mức độ lỗi

- **P0 — Dừng nghiệm thu:** mất/ghi sai tiền, lộ dữ liệu hoặc vượt quyền, giao trùng một barcode, sai dữ liệu khách, ghi thành công giả.
- **P1 — Chặn luồng chính:** khách/nhân viên không thể hoàn tất thuê, giao/trả, xử lý xung đột hoặc phục hồi thao tác.
- **P2 — Lỗi có cách làm thay thế:** nội dung, bố cục hoặc thao tác phụ gây cản trở nhưng không làm sai giao dịch.
- **P3 — Cải thiện:** tinh chỉnh không chặn nghiệp vụ.

**Tiêu chí kết thúc:** Không có lỗi P0/P1 chưa xử lý; mọi ca có kết quả rõ ràng; mọi BLOCKED/UI ONLY có người phụ trách và điều kiện tiếp tục; người điều phối xác nhận dữ liệu TEST và trạng thái tài sản demo đã được khép lại. Báo cáo phải nêu rõ nếu ca BLOCKED khiến chưa thể gọi lượt chạy là full E2E. Lượt kiểm thử này không thay thế diễn tập migration hoặc xác nhận policy nghiệp vụ còn mở.

## 13. Giới hạn và quyết định còn mở

- Các luồng ghi nghiệp vụ được chạy trên production demo bằng hồ sơ TEST. Chỉ dùng dữ liệu demo có sẵn để mô phỏng trả trễ/xung đột; không tua đồng hồ hoặc tạo fault injection ảnh hưởng dịch vụ.
- Local không cấu hình API dùng fixture trong bộ nhớ. Fixture reset khi tải lại và không chứng minh dữ liệu đã lưu server; không dùng fixture làm bằng chứng kiểm thử production.
- Ops Agent không được nghiệm thu ở đây vì API chưa nằm trong phạm vi bàn giao.
- Phương thức/thời hạn hoàn cọc, phí hủy/no-show và một số chính sách tính ngày thuê cần được chủ dự án chốt. Không thu/hoàn tiền thật nếu thiếu quyết định và phê duyệt tài chính cụ thể.
- Gia hạn, xử lý thông báo tự động cho khách kế tiếp và một số thao tác CRM có thể chưa có API/UI hoàn chỉnh. Không đánh dấu PASS chỉ vì giao diện cho phép xem bản nháp.
- Email, Google OAuth, PayOS/chuyển khoản và webhook có thể gọi dịch vụ bên ngoài. Chỉ dùng tài khoản/hộp thư TEST; dùng sandbox cho payment. Nếu thao tác sẽ gửi thư ra ngoài nhóm test hoặc tạo giao dịch tiền thật, dừng bước đó và ghi BLOCKED cho riêng tích hợp ngoài.

## Tài liệu liên quan

- [Hướng dẫn demo UI và trạng thái fixture](../ui/demo-guide.md)
- [Phân tích nghiệp vụ và các trường hợp ngoại lệ](../business/business-analysis.md)
- [Policy trả trễ, bộ kế tiếp và ca RT-01–RT-12](../business/chinh-sach-tra-tre-va-don-thue-ke-tiep.md)
- [Báo cáo đối chiếu UI với 40 tình huống nghiệp vụ](../reports/business-ui-coverage.md)
- [Biên bản bàn giao web và các cổng sẵn sàng phát hành](../bao-cao-ban-giao-web.md)
