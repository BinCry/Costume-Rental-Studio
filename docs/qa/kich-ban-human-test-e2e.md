# Kịch bản kiểm thử thủ công End-to-End trên Production

- **Dự án:** Costume Rental Studio
- **Phiên bản tài liệu:** 1.0
- **Ngày lập:** 15/10/2026
- **Trạng thái:** Kịch bản chuẩn bị cho production có kiểm soát; chưa được chạy và chưa phải biên bản nghiệm thu.

## 1. Mục tiêu và phạm vi

Tài liệu hướng dẫn người kiểm thử đi qua các hành trình chính trên website production: khách tìm trang phục, gửi yêu cầu thuê, nhân viên xác nhận và giao đồ, nhận trả, kiểm tra, quyết toán và chăm sóc khách hàng. Kịch bản cũng kiểm tra quyền theo vai trò/chi nhánh, tạo đơn tại quầy, kho, điều chuyển, chính sách và báo cáo.

Đây là kiểm thử trên **production đang phục vụ cửa hàng**, vì vậy mọi thay đổi ghi vào hệ thống là dữ liệu thật và có thể ảnh hưởng khách/nhân viên. Chỉ người được chủ dự án ủy quyền mới chạy; phải có khung giờ, chi nhánh, mặt hàng, nhân sự hỗ trợ và phương án dừng đã thống nhất. Dùng hồ sơ khách và tài khoản kiểm thử do Studio kiểm soát; không dùng danh tính khách thật, không dùng dữ liệu giả mạo khách khác và không xóa lịch sử/audit sau khi chạy.

Không bắt đầu ca ghi dữ liệu cho đến khi mục 2A “Cổng an toàn production” được đánh dấu đạt. Không thực hiện thanh toán/hoàn tiền thật, thay đổi giá/policy live, khóa hàng đang bán, điều chuyển hàng thật hoặc tạo tình huống khách trả trễ có thể ảnh hưởng đơn thật nếu chưa có phê duyệt cụ thể của chủ Studio và quản lý chi nhánh. Nếu các điều kiện không thể đáp ứng, chỉ chạy các ca đọc dữ liệu và đánh dấu các ca ghi là BLOCKED; không gọi kết quả đó là full E2E.

Luồng Ops Agent đang ở chế độ fixture/demo và API agent không thuộc phạm vi bàn giao hiện tại. Không tính kết quả trình diễn Ops Agent là bằng chứng E2E đã tích hợp.

### Phân loại kết quả

- **PASS:** Đã thao tác trên production bằng dữ liệu kiểm thử được phê duyệt; API và UI trả đúng kết quả; có bằng chứng ghi nhận.
- **FAIL:** Tính năng tích hợp có thể chạy nhưng kết quả sai, gây ghi trùng, mất dữ liệu hoặc cho phép thao tác trái quyền.
- **BLOCKED:** Không thể chạy vì thiếu tài khoản, phê duyệt, cấu hình production, chính sách đã duyệt hoặc tích hợp bên ngoài. Ghi rõ người cần xử lý; không tính là PASS.
- **UI ONLY:** Có thể kiểm tra giao diện bằng fixture, nhưng thao tác không ghi dữ liệu production. Không tính là E2E nghiệp vụ.

## 2. Điều kiện trước khi chạy

### 2A. Cổng an toàn production — phải đạt trước mọi thao tác ghi

- Chủ Studio hoặc người được ủy quyền chấp thuận bằng văn bản phạm vi, thời gian và người chạy; quản lý chi nhánh xác nhận các mặt hàng được phép dùng.
- Xác nhận đúng URL production và commit/build FE/BE đang phục vụ; có người vận hành trực để theo dõi lỗi API, thanh toán và tồn kho.
- Chọn thời điểm ít giao dịch; báo nhân viên tại chi nhánh; lập danh sách mã khách/đơn/barcode thử nghiệm để họ không nhầm với giao dịch thật.
- Dành riêng một bộ thử nghiệm tại một chi nhánh cho cả cửa sổ kiểm thử. Xác nhận bộ đó không có lịch thuê, điều chuyển hoặc sửa chữa khác; chặn việc bán/giao cho khách thật trong khung giờ kiểm thử. Nếu không thể dành riêng bộ và thời gian, không tạo đơn online/counter hoặc thử block/transfer trên hàng đang kinh doanh.
- Để thử gửi đơn online, phải có cách chắc chắn ngăn khách ngoài nhóm test đặt đúng bộ/kỳ trong lúc chạy (ví dụ mặt hàng test được Studio kiểm soát hoặc tạm đóng đúng kỳ bằng chức năng có sẵn). Nếu không thể cô lập lịch khỏi khách thật, chỉ xem catalog/khả dụng; đánh dấu tạo đơn online BLOCKED và chạy phần ghi trên staging.
- Dùng tài khoản khách và nhân viên do Studio kiểm soát. Gắn nhãn TEST trong tên/ghi chú nếu hệ thống có trường phù hợp; không đưa thông tin giả vào hồ sơ khách thật.
- Có kế hoạch khép lại đơn, xử lý tiền thật, trả bộ về trạng thái đúng và giữ dấu vết audit. Không xóa trực tiếp database, không xóa payment/refund/audit và không tự sửa số dư.
- Nếu không có cơ chế thanh toán sandbox trên production, chủ Studio và người phụ trách tài chính phải chấp thuận rõ số tiền tối đa, cách thu, cách hoàn/đối soát và người thực hiện. Không chạy PayOS/chuyển khoản hoặc hoàn cọc thật chỉ để “thử xem”.
- Không đổi policy, giá, role đang dùng, trạng thái chi nhánh, giờ mở cửa hoặc cấu hình bảo mật live trong lượt kiểm thử. Ca cần kiểm tra quyền ghi chỉ dùng role/user thử nghiệm riêng đã được phê duyệt; nếu không có, kiểm tra đọc và đánh dấu phần ghi BLOCKED.
- Chốt điều kiện dừng: dừng ngay nếu nhìn thấy dữ liệu khách khác, tiền/giá không khớp, unit thật bị giữ sai, thao tác vượt chi nhánh/quyền, trùng thanh toán hoặc có trạng thái không rõ. Gọi người vận hành; không retry thao tác ghi khi chưa đối soát trạng thái.

Người điều phối kiểm tra và ghi nhận các điều kiện sau trước khi bắt đầu:

1. Frontend và backend production đang khỏe; ghi URL, commit/build, thời điểm, vùng/múi giờ và health check vào biên bản. Không tiết lộ secret/token.
2. Xác nhận bản production đã chạy migration theo quy trình phát hành. Không chạy seed/reset/migration thủ công để chuẩn bị test.
3. Có người chịu trách nhiệm vận hành, quản lý chi nhánh và người phụ trách tài chính (nếu test tiền) đang liên lạc được.
4. Dành riêng một bộ trang phục READY và một bộ thay thế cùng mẫu/size ở đúng chi nhánh; nếu chạy trả một phần đơn nhiều bộ thì cần thêm ít nhất một bộ cùng đơn. Quản lý chi nhánh xác nhận toàn bộ không vướng lịch khách thật.
5. Chuẩn bị tài khoản cho các vai trò ở bảng mục 2B; không dùng tài khoản admin của chủ Studio cho thao tác thông thường.
6. Ghi nhận policy hiện hành: cách tính ngày thuê, giờ đệm trả trễ, thời gian vệ sinh/chuẩn bị, giá/cọc, phí bổ sung, hủy/no-show và cách hoàn cọc. Không thay đổi để phục vụ bài test.
7. Chọn khung giờ. Không tua đồng hồ production và không cố tình giữ hàng quá hạn nếu có khả năng ảnh hưởng khách thật. Ca cần sự kiện đến hạn tự nhiên có thể phải BLOCKED/chờ đúng ngày giờ.
8. Chuẩn bị nơi lưu ảnh chụp màn hình, mã đơn, barcode, thời điểm, request/correlation ID (nếu có), người chạy và người chứng kiến.

### 2B. Vai trò và tài khoản cần chuẩn bị

Mỗi người dùng một tài khoản cá nhân thử nghiệm do Studio kiểm soát; không chia sẻ mật khẩu. Điền email đã che bớt trong biên bản nội bộ, không ghi mật khẩu/token.

| Vai trò kiểm thử | Tài khoản/quyền cần có | Các ca chính | Giới hạn an toàn |
|---|---|---|---|
| Khách chưa đăng nhập | Trình duyệt riêng tư | E2E-03 | Chỉ xem dữ liệu công khai, không tạo hồ sơ thay khách |
| Khách hàng | Tài khoản Customer riêng, email/điện thoại Studio kiểm soát | E2E-01 đến E2E-04, E2E-08, E2E-11 | Chỉ xem đơn của chính tài khoản |
| Nhân viên bán hàng/xử lý đơn | Tài khoản staff với quyền thuê phù hợp và đúng chi nhánh | E2E-05 đến E2E-09, E2E-14 | Chỉ dùng đơn/barcode thử nghiệm |
| Nhân viên giao nhận/thanh toán | Quyền giao nhận và thanh toán theo thực tế role; nếu dùng tiền thật cần người tài chính chứng kiến | E2E-07, E2E-11 đến E2E-13 | Không giả xác nhận chuyển khoản; không tự tạo refund |
| Nhân viên kho | Role kho và chi nhánh được gán | E2E-15, E2E-16 | Chỉ block/điều chuyển bộ đã dành riêng và có phê duyệt |
| Nhân viên CRM | Quyền đọc hồ sơ/case tại chi nhánh | E2E-19 | Chỉ dùng hồ sơ khách TEST, không mở khách thật |
| Quản trị viên | Tài khoản admin riêng, MFA nếu hệ thống hỗ trợ | E2E-10, E2E-17, E2E-18, E2E-20, E2E-23 | Không đổi policy/role/giá live đang phục vụ khách; thao tác ghi chỉ bằng tài khoản/role thử nghiệm đã duyệt |

Trong seed của dự án, các role code là **ADMIN**, **SALES_STAFF**, **INVENTORY_STAFF** và **CUSTOMER**. CRM không có role code riêng trong seed; dùng tài khoản chỉ khi role đó thực sự được cấp quyền CRM tại chi nhánh. SALES_STAFF có quyền thuê/giao nhận/thanh toán/CRM theo seed, INVENTORY_STAFF có quyền kho/điều chuyển, còn ADMIN có quyền toàn chuỗi. Production có thể khác seed, vì vậy quản trị viên phải kiểm tra role, permission và branch assignment đang hiệu lực trước khi test.

Nếu một tài khoản cần quyền chưa tồn tại, không cấp tạm quyền cho tài khoản chủ Studio để “cho chạy được”. Ghi BLOCKED và yêu cầu chủ dự án/quản trị thiết lập tài khoản/role thử nghiệm riêng theo quy trình.

### 2C. Thứ tự chạy các luồng

1. **Khách online:** khách chưa đăng nhập xem catalog → đăng ký email/Google → chọn chi nhánh/size/kỳ thuê → gửi yêu cầu → xem đơn của chính mình.
2. **Nhân viên bán hàng:** duyệt yêu cầu → kiểm lịch/quyền → xác nhận và gán barcode → chuẩn bị → giao đồ → thu tiền thuê/cọc chỉ khi được phê duyệt → theo dõi đơn đang thuê.
3. **Trả và quyết toán:** nhận từng bộ → kiểm tình trạng/phụ kiện → chờ đánh giá nếu có vấn đề → quyết toán theo snapshot → xem trạng thái refund; không tạo refund live nếu chưa duyệt.
4. **Tình huống đặc biệt:** khách trước trả trễ/đơn kế tiếp, xung đột hai nhân viên và policy; production chỉ chạy nếu thời gian đến tự nhiên, unit dành riêng và quản lý chi nhánh cho phép.
5. **Quầy và vận hành:** tạo đơn tại quầy → tra/block kho → điều chuyển và nhận một phần → CRM → role/branch access → báo cáo.
6. **Kiểm tra chéo:** chạy lại quyền với Customer, SALES_STAFF, INVENTORY_STAFF, CRM-authorized staff và ADMIN; kiểm tra mobile/keyboard; đối chiếu dữ liệu cuối và khép lượt test.

Để thực hiện hành trình thuê thật từ đầu đến cuối, dùng một đơn được tạo ở bước 1 và xuyên suốt bước 2–3; không tạo một loạt đơn rời rạc trùng dữ liệu. Ca độc lập cần đơn thứ hai chỉ chạy khi bộ dự phòng đã được dành riêng.

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
| Khoảng thuê test được quản lý chi nhánh duyệt |  |
| Policy version và giá trị giờ đệm |  |
| Phương thức thanh toán / phê duyệt nếu phát sinh tiền thật |  |
| Thư mục bằng chứng |  |

Không ghi mật khẩu, token, thông tin thẻ/ngân hàng hoặc dữ liệu cá nhân của khách thật vào biên bản.

## 3. Dữ liệu kiểm thử cần chuẩn bị

Chỉ dùng tài khoản do Studio kiểm soát và bộ trang phục được quản lý chi nhánh dành riêng trong khung giờ kiểm thử. Dữ liệu và giao dịch vẫn được ghi vào production; nhãn TEST không biến chúng thành dữ liệu giả lập.

- **Khách A:** tài khoản email mới, số điện thoại thử nghiệm duy nhất.
- **Khách B:** tài khoản thứ hai để thử quyền sở hữu đơn và lịch kế tiếp.
- **Trang phục X:** mẫu, size và barcode đang READY tại chi nhánh Quận 1; có ít nhất một bộ cùng biến thể làm phương án thay thế.
- **Trang phục Y:** mẫu/size khác để thử tìm kiếm và tạo đơn tại quầy.
- **Mẫu ảnh TEST:** một mẫu do Studio dành riêng cho kiểm tra ảnh, không có lịch thuê hoặc nội dung công khai cần giữ nguyên; dùng ảnh do Studio sở hữu và được duyệt để tải lên/thay/xóa.
- **Đơn A:** kỳ thuê sớm hơn; chỉ dùng cho kịch bản trả trễ nếu sự kiện đến hạn tự nhiên trong thời gian thử và không gây ảnh hưởng khách thật.
- **Đơn B:** kỳ thuê kế tiếp; chỉ tạo nếu bộ đã được dành riêng cho lượt kiểm thử và không có khách thật bị ảnh hưởng. Tình huống trả trễ chỉ được kiểm tra khi mốc thời gian đến tự nhiên và quản lý chi nhánh tiếp tục cho phép.
- **Nhân viên:** tài khoản thuộc đúng chi nhánh và một tài khoản không được gán chi nhánh/không có quyền để kiểm tra từ chối.
- **Phiếu điều chuyển:** một phiếu có ít nhất hai bộ để thử nhận một phần và nhận hoàn tất.

Điền ID thực tế vào bảng theo dõi; không giả định mã fixture như BC-031 hay DC-001 tồn tại trên production. Ghi rõ mã nào đã được dành riêng và ai phê duyệt.

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

**Mong đợi:** Tài khoản production được xác minh; hồ sơ cơ bản hiển thị đúng; người dùng chỉ có quyền khách hàng, không xuất hiện menu vận hành/quản trị. Email đã dùng không tạo tài khoản trùng. Không tiết lộ OTP trong giao diện/log không phù hợp. Ghi lại email test để quản trị biết đây là hồ sơ kiểm thử.

### E2E-02 — Đăng nhập Google (nếu production đã cấu hình)

1. Chọn tiếp tục bằng Google và dùng tài khoản Google kiểm thử được cấp.
2. Hoàn tất OAuth, quay về đúng trang; tải lại trang và mở trang đơn của tôi.
3. Đăng xuất rồi đăng nhập lại bằng cùng tài khoản Google.

**Mong đợi:** Tài khoản được liên kết đúng, không tạo hồ sơ nhân viên hoặc cấp role quản trị. Không có callback lỗi, vòng lặp đăng nhập hay lộ token. Chỉ dùng Google account kiểm thử thuộc Studio. Nếu không có tài khoản được ủy quyền hoặc OAuth production chưa cấu hình: **BLOCKED**, không thay bằng fixture.

### E2E-03 — Tìm trang phục và xem khả dụng

**Vai trò:** Khách A.

1. Mở bộ sưu tập; tìm theo tên/mẫu và lọc theo danh mục/size/chi nhánh nếu có.
2. Mở Trang phục X; chọn đúng size/biến thể, chi nhánh và kỳ nhận/trả.
3. Ghi lại giá thuê, tiền cọc, ngày/giờ nhận trả và thông tin khả dụng.
4. Chỉ kiểm tra kỳ đã bận bằng cách tra cứu lịch hiện có ở chế độ xem. Không tạo đơn cạnh tranh hoặc chiếm lịch khách thật; sau đó chọn kỳ trống đã được quản lý chi nhánh dành riêng.
5. Tải lại trang và kiểm tra dữ liệu vẫn khớp với lựa chọn.

**Mong đợi:** Biến thể, chi nhánh và khoảng ngày được giữ đúng xuyên suốt. Giá và khả dụng nhất quán với API. Bộ đang thuê, bị block, vệ sinh/sửa chữa hoặc không thuộc chi nhánh không được báo sẵn sàng cho kỳ thử. Không để khách suy ra số lượng hoặc barcode nội bộ không cần thiết. Chỉ kiểm tra khả dụng với kỳ/bộ đã được duyệt; không gửi đơn cạnh tranh vào lịch khách thật.

### E2E-04 — Gửi yêu cầu thuê online

**Vai trò:** Khách A.

1. Từ Trang phục X đã được quản lý chi nhánh dành riêng, bắt đầu đặt thuê; xác nhận biến thể, chi nhánh, kỳ nhận/trả, giá và cọc.
2. Xác nhận thông tin liên hệ; gửi yêu cầu một lần.
3. Mở đơn của tôi và ghi mã đơn, trạng thái, tổng tiền hiển thị.
4. Làm mới trang; đăng xuất/đăng nhập lại và mở lại đơn.
5. Mở cùng kỳ thuê trong cửa sổ thứ hai để kiểm tra trạng thái lịch, không gửi yêu cầu trùng.

**Mong đợi:** Đơn production xuất hiện một lần, thuộc đúng khách và bắt đầu ở trạng thái chờ nhân viên duyệt/xác nhận. Gửi yêu cầu chờ **không đồng nghĩa đã xác nhận hoặc đã thu tiền**. Theo policy hiện hành, request pending chưa giữ barcode; nhân viên phải kiểm tra lại khả dụng lúc xác nhận. Nếu UI báo đã trả tiền/đã có bộ khi chưa có xác nhận máy chủ, FAIL. Nếu đơn đặt vào lịch ảnh hưởng khách thật, dừng ngay và báo quản lý.

## 6. Kịch bản nhân viên duyệt, gán bộ và giao nhận

### E2E-05 — Nhân viên xử lý hàng đợi, xác nhận và gán barcode

**Vai trò:** Nhân viên bán hàng tại chi nhánh của đơn.

1. Đăng nhập và mở danh sách đơn thuê; tìm mã đơn E2E-04.
2. Xác nhận khách TEST, chi nhánh, biến thể/size, khoảng thuê và giá/cọc snapshot.
3. Chọn một barcode READY phù hợp; xem cảnh báo nếu barcode đã có lịch, bị block hoặc khác chi nhánh.
4. Xác nhận đơn; mở lại chi tiết và ghi trạng thái, barcode cùng lịch sử thao tác.
5. Mở đơn bằng tài khoản của chi nhánh khác để kiểm tra phạm vi dữ liệu.

**Mong đợi:** Chỉ nhân viên có quyền và đúng phạm vi chi nhánh mới xác nhận/gán. Barcode và kỳ thuê được lưu một lần; trạng thái đơn thay đổi sau phản hồi thành công của server. Người dùng khác chi nhánh không được thao tác trái quyền.

### E2E-06 — Xung đột gán bộ hoặc hai người cùng xử lý

**Vai trò:** Hai nhân viên kiểm thử; chỉ dùng đơn/barcode đã dành riêng và có phê duyệt.

1. Mở cùng đơn kiểm thử ở hai phiên/thiết bị.
2. Cả hai chọn cùng barcode; phiên thứ nhất xác nhận.
3. Ở phiên thứ hai, thử xác nhận dựa trên dữ liệu cũ.
4. Tải lại danh sách và chi tiết đơn.

**Mong đợi:** Chỉ một thao tác thành công. Phiên còn lại nhận thông báo xung đột có hướng xử lý, không tạo phân bổ thứ hai và không báo thành công giả. Dữ liệu mới sau tải lại thể hiện người thắng cuộc.

### E2E-07 — Thu tiền thuê và cọc khi giao đồ

**Vai trò:** Nhân viên được quyền giao và thu tiền; khách A. **Cổng bổ sung:** Người phụ trách tài chính phê duyệt cách thu và mức tiền tối đa; tiền mặt/chuyển khoản production là tiền thật.

1. Mở đơn đã xác nhận và vào bước giao đồ.
2. Kiểm đúng khách, barcode, phụ kiện, tình trạng trước khi giao.
3. Đối chiếu tiền thuê và tiền cọc thành hai khoản riêng với snapshot máy chủ.
4. Chỉ nếu đã được phê duyệt, ghi nhận khoản tiền thật theo phương thức được phép và đối soát bằng chứng. Không tự xác nhận chuyển khoản đang chờ.
5. Thử chọn chuyển khoản còn chờ đối soát; xác nhận không thể hoàn tất giao đồ bằng khoản chưa xác nhận thành công.
6. Xác nhận giao đồ; quay về danh sách đang thuê và tra barcode.

**Mong đợi:** Không tính cọc là doanh thu. Không giao đồ khi khoản bắt buộc còn thiếu/chưa đối soát. Ghi nhận thời điểm, nhân viên, phương thức và số tiền; sau giao, đơn chuyển ACTIVE và barcode được ghi nhận đang ở khách. Không thu trùng khi tải lại hoặc nhấn lại. Nếu không được phép thu tiền thật thì dừng trước bước ghi thanh toán, đánh dấu phần thanh toán/giao đồ là BLOCKED; không giả xác nhận thu.

### E2E-08 — Theo dõi đang thuê và thử gia hạn

**Vai trò:** Nhân viên/khách theo quyền.

1. Tra cứu theo mã barcode, khách hoặc đơn ở màn Đang thuê.
2. Đối chiếu hạn trả, chi nhánh nhận trả và tình trạng từng bộ.
3. Mở yêu cầu gia hạn (nếu UI cho phép) và chọn thời gian mới.
4. Nếu kết quả đang là bản nháp/chưa tích hợp, dừng trước khi xác nhận hay thu tiền.

**Mong đợi:** Màn hình phản ánh đúng barcode đang ở khách và hạn trả. Bản nháp gia hạn không tự sửa lịch, không tự thu thêm tiền và không xác nhận gia hạn. Nếu cần gia hạn thực tế nhưng endpoint/policy chưa hỗ trợ: ghi **BLOCKED**, không tính là PASS.

## 7. Kịch bản trả trễ và khách kế tiếp

### E2E-09 — Khách trước chưa trả khi khách kế tiếp đến nhận

**Vai trò:** Nhân viên quản lý đơn và khách B. **Điều kiện:** Bộ đã được dành riêng; đơn A đang ACTIVE và đơn B đã được xác nhận cùng barcode nhưng có kỳ thuê sau khoảng đệm. Chỉ thực hiện nếu thời điểm B đến nhận xảy ra tự nhiên trong cửa sổ kiểm thử và quản lý chi nhánh xác nhận không ảnh hưởng khách khác. Không tua đồng hồ, sửa database hoặc cố ý giữ đồ quá hạn khi có thể ảnh hưởng người thuê thật.

1. Ngay trước giờ nhận thật của B, xác nhận A vẫn giữ barcode và chưa có biên nhận trả.
2. Mở bảng việc/đơn B; ghi nhận cảnh báo liên quan A/B nếu được hỗ trợ.
3. Chỉ khi quản lý chi nhánh xác nhận không có khách thật bị tác động, thử preflight/bàn giao B trên barcode đang thuộc allocation ACTIVE của A. Dừng trước mọi khoản thu mới.
4. Xác nhận thao tác bị chặn; kiểm tra B vẫn chưa ACTIVE, chưa ghi bàn giao và không thu khoản mới vì barcode xung đột.
5. Nếu có barcode READY thay thế cùng biến thể/size, dùng luồng đổi/gán lại được quyền cho phép; kiểm tra lịch sử barcode cũ/mới và thử bàn giao lại B.
6. Nếu A trả bộ, ghi nhận từng item; khi bộ ở CLEANING/REPAIR/blocked, thử bàn giao B lần nữa.
7. Chỉ thử bàn giao B sau khi barcode thay thế hoặc barcode đã qua đủ trạng thái và được API xác nhận READY; người nhận là tài khoản kiểm thử và quy trình giao được quản lý chi nhánh giám sát.

**Mong đợi:** A không tự bị coi là đã trả chỉ vì hết hạn; B không tự hủy hoặc tự chuyển ACTIVE. API chặn giao trên barcode vẫn ở A bằng conflict; không tạo payment/giao dịch giao đồ mới trước khi xử lý conflict. Bộ CLEANING/REPAIR/blocked không được giao. Chỉ hoàn tất khi có phương án hợp lệ và trạng thái mới được server lưu. Nếu không có tình huống tự nhiên an toàn trong cửa sổ kiểm thử, ghi **BLOCKED — cần kiểm tra ở staging**. Nếu đã vào tình huống và hệ thống không chặn đúng, ghi **FAIL**, dừng luồng và gọi người vận hành; không tự đổi policy hay bồi hoàn cho khách.

### E2E-10 — Kiểm tra policy thời gian đệm ở chế độ chỉ đọc

**Vai trò:** Quản trị viên.

1. Mở policy hiện tại ở chế độ xem; ghi version và các giá trị đang áp dụng.
2. Đối chiếu baseline 12 giờ + 12 giờ nếu đó là giá trị đang được Studio phê duyệt.
3. Mở màn chỉnh policy nhưng không lưu; xác nhận chỉ tài khoản có quyền mới thấy và có thể sửa biểu mẫu.
4. Đóng màn mà không lưu; tra báo giá hiện tại và một đơn cũ, xác nhận không có thay đổi.

**Mong đợi:** UI hiển thị version/giá trị từ server, không tự giả định 12+12 nếu policy hiện hành khác. Đơn cũ và báo giá không đổi vì chỉ mở màn hình. **Không lưu policy/giá mới trên production để thử.** Kiểm thử tác động khi thay policy và version lịch sử phải chạy ở staging; production chỉ kiểm tra đọc và quyền mở màn. Nếu không thấy version/giá trị hoặc người không quyền vẫn chỉnh được, ghi lỗi; không lưu để xác minh.

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

1. Chỉ chạy luồng đánh giá hư hỏng nếu bộ test đã thực sự hư hỏng/thiếu phụ kiện và quản lý đã ghi nhận bằng chứng; không làm hỏng đồ hoặc khai sai tình trạng để tạo ca test. Nếu không có lỗi thực tế, ghi BLOCKED và không tạo biên bản sai.
2. Lưu biên bản; mở lại đơn bằng tài khoản được phân công đánh giá.
3. Kiểm tra phí bổ sung/cọc đang giữ/số dư theo snapshot máy chủ.
4. Trước khi đánh giá xong, chỉ kiểm tra UI thể hiện thao tác thu/refund đang bị khóa; không gọi yêu cầu tạo refund thật để thử guard trên production.
5. Chỉ hoàn tất đánh giá khi người phụ trách tài chính/chủ Studio đã phê duyệt quy tắc và người chịu trách nhiệm. Không khẳng định khách kiểm thử phải bồi thường nếu chưa có policy.
6. Chỉ ghi nhận phí/thu thêm/khấu trừ cọc nếu đã có phê duyệt cụ thể, mức tối đa và cách hoàn tất khoản tiền; đây là tiền và chứng từ thật.

**Mong đợi:** Bộ cần kiểm tra không tự được đánh dấu READY; tiền cọc không tự biến thành doanh thu hay tự động bị trừ; phí phát sinh không được tự suy ra từ UI. Khi đánh giá chưa xong, thu phí/refund bị chặn theo quy tắc backend. Chỉ hoàn tất kết quả tài chính đã được phê duyệt; nếu không có quyết định phí/cọc phù hợp, dừng sau bước đánh giá và đánh dấu phần tài chính BLOCKED.

### E2E-13 — Kiểm tra trạng thái hoàn cọc

**Vai trò:** Nhân viên có quyền đọc thanh toán/hoàn tiền.

1. Mở trang/khoản hoàn cọc của đơn đã quyết toán.
2. Ghi số tiền, trạng thái máy chủ, phương thức và thời điểm nếu được trả về.
3. Làm mới trang và xác nhận không có bản ghi refund mới chỉ do mở màn hình.
4. Chỉ tạo refund thật nếu có phê duyệt bằng văn bản về người nhận, số tiền, phương thức, thời hạn và người đối soát. Nếu chưa có, không bấm tạo/hoàn; ghi BLOCKED.

**Mong đợi:** UI hiển thị trạng thái backend và không tự tuyên bố “đã hoàn” khi chỉ mới yêu cầu/đang xử lý. Hệ thống không tạo refund trùng khi refresh/retry. Phương thức và SLA hoàn cọc vẫn là quyết định cần chốt; nếu chưa có phê duyệt cách hoàn tiền thật thì chỉ kiểm tra đọc, phần tạo refund là **BLOCKED**.

## 9. Kịch bản tại quầy, kho, nhân sự và CRM

### E2E-14 — Tạo đơn tại quầy

**Vai trò:** Nhân viên bán hàng.

1. Mở Tạo tại quầy; tìm Khách B theo số điện thoại thử nghiệm.
2. Thử tạo khách mới bằng thông tin duy nhất; thử lại bằng cùng số để kiểm tra chặn trùng.
3. Chọn bộ kiểm thử đã dành riêng, size, chi nhánh và ngày nhận/trả đã được duyệt; kiểm báo giá và khả dụng.
4. Tạo yêu cầu chờ xử lý hoặc xác nhận/gán bộ theo quyền và luồng hiện hành.
5. Tải lại trang, tìm đơn và đối chiếu hồ sơ khách, barcode, giá/cọc.

**Mong đợi:** Không tạo khách/đơn trùng. Nhân viên chỉ nhìn thấy và ghi đơn trong phạm vi được giao. Tạo đơn tại quầy không tự thu tiền trước bước thu được quy định.

### E2E-15 — Tra cứu và chặn bộ trong kho

**Vai trò:** Nhân viên kho.

1. Tra barcode chính; kiểm mẫu, size, chi nhánh, trạng thái vận hành và lịch liên quan.
2. Chỉ khi quản lý chi nhánh đã dành riêng barcode này, đặt block có lý do và ghi nhận thời điểm; xác nhận bộ không còn khả dụng.
3. Thử gán bộ đang dành riêng/bị block vào đơn kiểm thử khác; xác nhận bị từ chối.
4. Gỡ block bằng tài khoản có quyền và lý do; xác nhận chỉ khả dụng nếu mọi điều kiện lịch/trạng thái đều đạt. Xác nhận lại với quản lý chi nhánh trước khi trả bộ vào khai thác.

**Mong đợi:** Trạng thái vật lý và khả dụng theo kỳ thuê được thể hiện riêng. Block không xóa lịch sử/đơn cũ. Nhân viên không có quyền không thể block/gỡ block qua UI hoặc API.

### E2E-16 — Điều chuyển và nhận từng phần

**Vai trò:** Nhân viên kho ở hai chi nhánh. **Điều kiện:** Có hai barcode vật lý đã được dành riêng ở chi nhánh gửi, không có booking/điều chuyển khác; quản lý hai chi nhánh đồng ý và sắp xếp người nhận. Nếu không có thể hoàn trả về đúng điểm xuất, đánh dấu BLOCKED.

1. Chỉ với hai barcode được quản lý chi nhánh cho phép, tạo/duyệt phiếu điều chuyển từ Quận 1 sang Thủ Đức.
2. Ghi xuất từng bộ; mở phiếu ở chi nhánh nhận.
3. Nhận một trong hai barcode; giữ barcode còn lại chưa nhận.
4. Kiểm tra chi nhánh hiện tại của bộ đã nhận và chưa nhận; thử dùng bộ chưa nhận để tạo đơn tại chi nhánh đích.
5. Nhận bộ còn lại; kiểm tra phiếu hoàn tất và lịch sử hai barcode. Tạo phiếu chuyển về chi nhánh ban đầu nếu cần, và chỉ đóng lượt test sau khi quản lý xác nhận vị trí vật lý/tồn kho đúng.

**Mong đợi:** Chi nhánh của từng bộ chỉ đổi sau khi ghi nhận nhận ở nơi đến. Phiếu nhận một phần vẫn thể hiện còn thiếu; không giao/đặt tại chi nhánh đích bằng bộ chưa nhận. Barcode có lịch thuê tương lai hoặc đang ở khách không được chuyển trái quy tắc.

### E2E-17 — Phân công nhân viên theo chi nhánh

**Vai trò:** Quản trị viên và nhân viên.

1. Mở Nhân viên; tìm nhân viên kiểm thử đã được tạo riêng theo tên/email, không dùng UUID nội bộ để tìm trong thao tác hàng ngày.
2. Gán role và chi nhánh; lưu.
3. Đăng nhập bằng tài khoản nhân viên đó; mở các màn tương ứng ở chi nhánh được giao.
4. Thử đổi chi nhánh sang chi nhánh không được gán hoặc mở URL trực tiếp đến khu vực bị hạn chế.
5. Thu hồi phân công của tài khoản thử nghiệm theo quy trình đã duyệt; tải lại trang đã mở và thử một thao tác chỉ đọc/ghi không gây side effect.

**Mong đợi:** Role có hiệu lực trong phạm vi chi nhánh đã gán; không lộ dữ liệu chi nhánh khác. Thu hồi quyền được backend thực thi khi ghi, kể cả khi phiên UI đang mở. Không được vô hiệu hóa quản trị viên cuối cùng.

### E2E-18 — Chỉnh quyền checkbox theo role

**Vai trò:** Quản trị viên.

1. Mở Vai trò; chỉ chọn role riêng dành cho tài khoản kiểm thử, tuyệt đối không sửa role đang gán cho nhân viên/cửa hàng.
2. Nếu đã được phê duyệt, tick/bỏ quyền trên role kiểm thử; nếu role dùng chung hoặc không thể cô lập, không lưu và đánh dấu phần chỉnh sửa BLOCKED.
3. Với role riêng, lưu và tải lại để xác nhận thay đổi; ghi quyền trước/sau để khôi phục đúng sau test.
4. Đăng nhập bằng user kiểm thử thuộc role đó; thử hành động được cấp và hành động bị từ chối.
5. Thu hồi user/role kiểm thử theo quy trình đã duyệt; không đụng tới role quản trị hoặc role của nhân viên thật.

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

1. Chỉ đọc giá/cọc đang áp dụng cho bộ kiểm thử đã dành riêng; không sửa giá production.
2. Mở báo giá hoặc đơn test đã được tạo trong luồng, kiểm tra snapshot; không tạo đơn mới ngoài các bước đã được phê duyệt.
3. Mở báo cáo ở phạm vi test account/chi nhánh được phép và đối chiếu các khoản phát sinh.
4. Đối chiếu tiền thuê, tiền cọc, khoản thu đã đối soát, phí bổ sung và refund theo nguồn server.

**Mong đợi:** Đơn giữ đúng snapshot giá/version đã tạo; cọc đang giữ và chuyển khoản chờ đối soát không được tính là doanh thu/đã thu; refund lỗi hoặc đang chờ không được tính là đã hoàn. Số báo cáo khớp dữ liệu server và phạm vi chi nhánh. Thử nghiệm ghi giá/policy mới chỉ ở staging, không trong production.

### E2E-23 — Quản lý thư viện ảnh sản phẩm

**Vai trò:** Quản trị viên hoặc nhân viên được cấp `catalog:manage`. **Điều kiện:** Có mẫu ảnh TEST đã lưu, ảnh được Studio cho phép sử dụng, người quản lý duyệt thao tác ghi production và xác nhận ảnh thử nghiệm không làm sai lệch catalog đang phục vụ khách.

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
3. Với bất kỳ lần gửi có kết quả không rõ, kiểm tra đơn/payment/barcode trên production và hỏi người vận hành trước khi retry.
4. Chỉ thử xung đột version trên hồ sơ/đơn test đã được dành riêng và không có tiền đang chờ; nếu không có bản ghi cô lập, đánh dấu BLOCKED.

**Mong đợi:** UI nêu lỗi và cách khôi phục; không tự báo thành công, không tạo bản ghi trùng, không ghi vào trạng thái cũ. Người dùng được yêu cầu tải lại/đối chiếu trước khi thử lại.

### E2E-22 — Kiểm tra mobile và bàn phím

1. Chạy các bước tìm sản phẩm, đặt thuê, xem đơn, nhận trả và tra barcode ở màn hình rộng máy tính và viewport điện thoại khoảng 390px.
2. Dùng Tab/Shift+Tab/Enter/Space để thao tác form và hành động chính; kiểm focus khi mở/đóng dialog.
3. Thử zoom 200%, thông báo lỗi, bảng dài, trạng thái rỗng và loading.

**Mong đợi:** Không che nút chính/giá/chi nhánh; không có cuộn ngang toàn trang ngoài thành phần có chủ đích; label và lỗi gắn đúng trường; focus nhìn thấy được; thông báo trạng thái đọc được và thao tác không phụ thuộc chuột.

## 11. Dọn dữ liệu thử nghiệm và kết thúc lượt chạy

1. Ghi mã khách, đơn, barcode, phiếu điều chuyển, role thử nghiệm và mọi giao dịch thật vào biên bản.
2. Hoàn tất đơn test theo đúng quy trình production đã được duyệt; xử lý tiền mặt/chuyển khoản/refund qua người phụ trách tài chính. Không để payment/refund ở trạng thái không rõ.
3. Gỡ block thử nghiệm; hoàn thành phiếu chuyển và đưa đồ về đúng chi nhánh/trạng thái sau khi nhân viên kho kiểm tra vật lý. Không sửa policy/giá live để “khôi phục”.
4. Thu hồi role/phân công thử nghiệm đã tạo riêng nếu việc thu hồi được phê duyệt; không xóa tài khoản, đơn, payment, audit hoặc hồ sơ tài chính. Đánh dấu hồ sơ TEST nếu hệ thống có trường phù hợp.
5. Quản lý chi nhánh xác nhận lại barcode có thể khai thác hay cần vệ sinh/sửa; người vận hành xác nhận không còn giao dịch đang chờ.
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

**Tiêu chí kết thúc:** Không có lỗi P0/P1 chưa xử lý; mọi ca có kết quả rõ ràng; mọi BLOCKED/UI ONLY có người phụ trách và điều kiện tiếp tục; quản lý xác nhận không còn ảnh hưởng lên hàng, đơn hoặc tiền thật. Báo cáo phải nêu rõ nếu ca BLOCKED khiến chưa thể gọi lượt chạy là full E2E. Kiểm thử production không thay thế staging, diễn tập migration hoặc xác nhận policy còn mở.

## 13. Giới hạn và quyết định còn mở

- Các ca đọc và luồng canary an toàn có thể chạy trên production. Tác động policy/giá, fault injection, kiểm thử trả trễ cần tua thời gian và các tình huống tài chính rủi ro phải chạy ở staging.
- Local không cấu hình API dùng fixture trong bộ nhớ. Fixture reset khi tải lại và không chứng minh dữ liệu đã lưu server; không dùng fixture làm bằng chứng kiểm thử production.
- Ops Agent không được nghiệm thu ở đây vì API chưa nằm trong phạm vi bàn giao.
- Phương thức/thời hạn hoàn cọc, phí hủy/no-show và một số chính sách tính ngày thuê cần được chủ dự án chốt. Không thu/hoàn tiền thật nếu thiếu quyết định và phê duyệt tài chính cụ thể.
- Gia hạn, xử lý thông báo tự động cho khách kế tiếp và một số thao tác CRM có thể chưa có API/UI hoàn chỉnh. Không đánh dấu PASS chỉ vì giao diện cho phép xem bản nháp.
- Email, Google OAuth, PayOS/chuyển khoản, lưu ảnh và webhook trên production có thể gửi thư hoặc ghi giao dịch thật. Chỉ dùng tài khoản Studio kiểm soát; bước tiền thật cần được người phụ trách tài chính duyệt và đối soát.

## Tài liệu liên quan

- [Hướng dẫn demo UI và trạng thái fixture](../ui/demo-guide.md)
- [Phân tích nghiệp vụ và các trường hợp ngoại lệ](../business/business-analysis.md)
- [Policy trả trễ, bộ kế tiếp và ca RT-01–RT-12](../business/chinh-sach-tra-tre-va-don-thue-ke-tiep.md)
- [Báo cáo đối chiếu UI với 40 tình huống nghiệp vụ](../reports/business-ui-coverage.md)
- [Biên bản bàn giao web và các cổng sẵn sàng phát hành](../bao-cao-ban-giao-web.md)
