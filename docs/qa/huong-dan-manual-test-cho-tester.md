# Hướng dẫn kiểm thử thủ công cho Tester

- **Sản phẩm:** Costume Rental Studio
- **Ngày cập nhật:** 04/11/2026
- **Đối tượng:** Tester, người điều phối và người nghiệm thu
- **Phạm vi:** Website khách hàng, khu nhân viên, khu quản trị, thử đồ ảo và các luồng Studio đã kết nối API
- **Ngoài phạm vi nghiệm thu:** API Ops Agent. Màn Ops Agent có thể dùng fixture/demo; không dùng kết quả ở đó để kết luận nghiệp vụ đã chạy trên server.

## 1. Mục tiêu và môi trường

Tài liệu này hướng dẫn Tester kiểm tra trực tiếp trên **production demo của Costume Rental Studio**: giao diện chạy trên Coolify, kết nối API và database demo. Có thể chạy các luồng ghi bằng dữ liệu TEST do điều phối chuẩn bị hoặc tạo qua giao diện trong phạm vi demo. Không dùng server local hoặc fixture làm bằng chứng nghiệm thu API.

Production demo có thể ghi dữ liệu lâu dài; không mặc định hệ thống tự reset. Chỉ sử dụng dữ liệu TEST và khép lại theo mục 7. Payment provider, email, SMS và OAuth có thể kết nối dịch vụ thật: không khởi tạo giao dịch tiền thật hoặc gửi thông báo tới người ngoài nhóm test. Nếu luồng cần dịch vụ ngoài mà chưa có sandbox, đánh dấu riêng phần tích hợp đó là BLOCKED; tiếp tục các phần demo an toàn.

## 2. Thông tin phải nhận trước khi test

Người điều phối cần cung cấp:

- URL production demo và commit/build FE/BE đang chạy.
- Commit/build FE và BE đang chạy; thời điểm kiểm thử và múi giờ.
- Tài khoản riêng cho Customer, Staff bán hàng, Staff kho và Admin; chi nhánh được phân công cho từng nhân viên.
- Khách TEST, mẫu trang phục, size/màu, barcode, chi nhánh và kỳ thuê đã cô lập.
- Voucher thử nghiệm hợp lệ và không hợp lệ; không tự dùng mã của khách thật.
- Phương thức thanh toán/refund mô phỏng được phép dùng. Không dùng PayOS/chuyển khoản thật.
- Người liên hệ nếu có lỗi làm sai dữ liệu demo, tiền mô phỏng, quyền hoặc trạng thái hàng.

Không ghi mật khẩu, OTP, token, thông tin thanh toán hoặc dữ liệu khách thật vào báo cáo. Mỗi vai trò nên dùng một profile trình duyệt riêng để tránh nhầm phiên.

### Điều kiện dữ liệu

- Có ít nhất một mẫu đang kinh doanh, có ảnh và từ hai biến thể/size để kiểm tra chọn lựa.
- Có barcode READY thuộc dữ liệu demo; nếu thử đổi bộ/điều chuyển, dùng barcode TEST khác hoặc tạo dữ liệu demo phù hợp.
- Đơn và khách TEST do Studio kiểm soát; không dùng thông tin khách thật.
- Với thao tác ghi, phải có phương án kết thúc: khép đơn TEST, trả barcode về đúng nơi/trạng thái, khôi phục cấu hình TEST và thu hồi quyền thử nghiệm khi cần.

Điều phối có thể cung cấp trước các bản ghi TEST cần thiết. Nếu thiếu, Tester được tạo dữ liệu TEST qua giao diện production demo; không dùng hoặc sửa dữ liệu có nhãn/ý nghĩa khách thật. Thiếu sandbox bên ngoài thì chỉ chặn bước tích hợp đó, không chặn toàn bộ ca demo.

## 3. Cách chạy và quy tắc an toàn

1. Kiểm tra môi trường, tên tài khoản, vai trò và chi nhánh trước mỗi nhóm test.
2. Chạy theo mã ca; ghi trạng thái trước/sau cùng mã đơn hoặc barcode liên quan.
3. Nhấn nút ghi một lần rồi chờ. Nếu kết quả không rõ, tải lại và tra cứu bản ghi trước khi thử lại.
4. Không gửi lại giao dịch chưa đối soát, không chỉnh database trực tiếp.
5. Thử quyền bằng đúng tài khoản được cấp; thao tác trái quyền phải bị từ chối an toàn.
6. Phân biệt lỗi sản phẩm với tính năng chưa có API hoặc ca không được phép chạy.

### Kết quả mỗi ca

- **PASS:** Đạt mong đợi trên production demo qua API thật và có bằng chứng.
- **FAIL:** Kết quả sai, giao diện cản trở, ghi trùng, lộ dữ liệu hoặc vượt quyền.
- **BLOCKED:** Thiếu tài khoản/dữ liệu demo hoặc cần dịch vụ bên ngoài chưa có sandbox.
- **UI ONLY:** Chỉ quan sát giao diện fixture/demo; chưa chứng minh dữ liệu đã lưu trên server.
- **N/A:** Không thuộc phạm vi phiên này; phải ghi lý do.

BLOCKED, UI ONLY và N/A không được tính là PASS.

## 4. Danh sách luồng kiểm thử

### A. Đăng ký, đăng nhập và phân luồng tài khoản

#### AUTH-01 — Đăng ký Customer bằng email

1. Mở Tạo tài khoản; nhập tên, email, số điện thoại và mật khẩu tài khoản TEST.
2. Gửi đăng ký; xác minh email/OTP nếu môi trường yêu cầu.
3. Đăng nhập, tải lại, mở Tài khoản, đăng xuất rồi đăng nhập lại.

**Mong đợi:** Lỗi gắn đúng trường; email trùng không tạo tài khoản thứ hai; tài khoản chỉ có quyền Customer và vào đúng khu. Không lộ OTP trên URL hay thông báo công khai.

#### AUTH-02 — Đăng nhập sai, quên mật khẩu và giới hạn đăng nhập

1. Thử email chưa đăng ký, mật khẩu sai và biểu mẫu thiếu trường.
2. Mở Quên mật khẩu, hoàn tất trên email TEST nếu được cấu hình.
3. Nếu hệ thống giới hạn yêu cầu, kiểm tra thông báo chờ/thử lại; không gửi lặp liên tục.

**Mong đợi:** Người dùng hiểu bước tiếp theo; không chỉ thấy mã kỹ thuật như RATE_LIMITED; không tiết lộ thông tin tài khoản không cần thiết. Nếu kiểm tra rate limit, chỉ dùng tài khoản TEST và số lần thử đã thống nhất; dừng khi màn hình báo thời gian chờ.

#### AUTH-03 — Google OAuth (nếu đã cấu hình)

1. Đăng nhập bằng Google TEST được cấp.
2. Kiểm tra callback, trang đích, tải lại và đăng xuất.

**Mong đợi:** Vào đúng portal theo role được server xác minh; không tự cấp quyền Staff/Admin. Nếu OAuth chưa cấu hình hoặc thiếu tài khoản kiểm thử, đánh dấu BLOCKED.

#### AUTH-04 — Phân tách Customer, Staff và Admin

1. Lần lượt dùng từng tài khoản riêng.
2. Kiểm tra menu, trang mặc định, đăng xuất và URL trực tiếp tới portal khác.
3. Sau đăng xuất, dùng Back và tải lại trang riêng tư.

**Mong đợi:** Customer vào khu Customer, Staff vào khu vận hành, Admin vào khu quản trị. Đăng xuất kết thúc phiên; backend từ chối quyền sai kể cả khi nhập URL trực tiếp.

### B. Catalog, bộ lọc ngày, voucher và đặt thuê

#### CUST-01 — Tìm kiếm và xem trang phục

1. Mở Khám phá; tìm theo tên và lọc danh mục/size/màu/chi nhánh nếu có.
2. Mở chi tiết; đổi biến thể và kiểm tra ảnh, trạng thái, giá, cọc.
3. Tải lại và xác nhận lựa chọn vẫn khớp mẫu.

**Mong đợi:** Từ khóa và bộ lọc trả đúng; ảnh lỗi có fallback; không trộn biến thể/giá/chi nhánh; không lộ UUID hoặc barcode nội bộ cho Customer.

#### CUST-02 — Chọn chi nhánh và thời gian thuê

1. Chọn chi nhánh, ngày nhận và ngày trả hợp lệ.
2. Đổi ngày nhận, ngày trả, chi nhánh và biến thể để xác nhận báo giá/khả dụng cập nhật.
3. Thử ngày sai hoặc khoảng ngày không hợp lệ.

**Mong đợi:** Ngày hiển thị theo thứ tự ngày/tháng/năm (dd/mm/yyyy); lỗi chỉ rõ trường; không dùng lại báo giá cũ sau khi lựa chọn đổi. Xem khả dụng không có nghĩa là bộ đã được giữ.

#### CUST-03 — Voucher trong báo giá

1. Nhập voucher TEST hợp lệ rồi yêu cầu tính lại báo giá.
2. Kiểm tra giảm giá, tiền thuê, tiền cọc và tổng tiền.
3. Thử mã sai/hết hạn/chưa có hiệu lực/không đạt mức tối thiểu; đổi lựa chọn sau khi áp dụng.

**Mong đợi:** Chỉ mã hợp lệ được áp dụng; tiền cọc không bị giảm nhầm; báo giá tính lại khi dữ liệu thay đổi; lỗi mã không làm mất thông tin đơn. Không dùng voucher đang chạy cho khách thật.

#### CUST-04 — Tạo yêu cầu thuê online

1. Chọn mẫu, biến thể, chi nhánh, kỳ thuê và số lượng thuộc dữ liệu TEST.
2. Kiểm tra liên hệ và báo giá snapshot; gửi một lần.
3. Mở Đơn của tôi, tải lại rồi mở lại chi tiết.

**Mong đợi:** Đơn xuất hiện đúng một lần, thuộc đúng Customer và ở trạng thái chờ xử lý. Yêu cầu gửi đi chưa đồng nghĩa đã xác nhận, giữ barcode hoặc thu tiền.

#### CUST-05 — Đơn của tôi và quyền riêng tư

1. Mở danh sách/chi tiết đơn của Customer TEST.
2. Dùng Customer khác thử mở liên kết đơn đó.
3. Sửa thông tin liên hệ và kiểm tra sau khi tải lại.

**Mong đợi:** Chỉ chủ đơn được xem; không lộ dữ liệu người khác; thông tin lưu đúng tài khoản.

#### CUST-06 — Thử đồ ảo

1. Mở Thử đồ ảo từ menu.
2. Cho phép camera hoặc chọn ảnh theo luồng được cung cấp; đổi trang phục và thử lại.
3. Từ chối quyền camera hoặc dùng thiết bị không có camera.

**Mong đợi:** Có hướng dẫn xin quyền hoặc cách thay thế; trang phục tải được; lỗi không làm treo trang; ảnh Tester không bị công khai/lưu ngoài mong đợi. Ghi thiết bị và trình duyệt.

### C. Nhân viên và luồng đơn thuê

#### STAFF-01 — Danh sách đơn, tìm kiếm và bộ lọc

1. Đăng nhập Staff đúng chi nhánh; mở Đơn thuê.
2. Tìm đơn TEST theo mã/khách/barcode, đổi trạng thái và tải lại.
3. Mở chi tiết, kiểm tra trạng thái, kỳ thuê, biến thể và chi nhánh.

**Mong đợi:** Chỉ thấy dữ liệu trong phạm vi được cấp; loading, rỗng, lỗi và thử lại đều rõ; kết quả bộ lọc khớp điều kiện.

#### STAFF-02 — Duyệt yêu cầu và gán bộ

1. Mở yêu cầu CUST-04; xác nhận khách, chi nhánh, biến thể, thời gian và snapshot giá.
2. Chọn barcode READY dành riêng rồi xác nhận.
3. Mở lại đơn và bảng việc.

**Mong đợi:** Chỉ người có quyền đúng chi nhánh được xác nhận; bộ không READY, sai chi nhánh, đã thuê, bị block hoặc vướng lịch không được gán. Chỉ báo thành công sau phản hồi máy chủ.

#### STAFF-03 — Xung đột và gửi lặp

1. Mở cùng đơn ở hai phiên Staff kiểm thử.
2. Phiên A xác nhận; phiên B thử thao tác với dữ liệu cũ.
3. Kiểm tra danh sách, barcode và lịch sử.

**Mong đợi:** Chỉ một thao tác thành công; phiên còn lại được yêu cầu tải lại; không tạo phân bổ, payment hay đơn trùng.

#### STAFF-04 — Tạo đơn tại quầy

1. Mở Tạo tại quầy; chọn khách TEST hoặc tạo khách TEST theo quyền.
2. Chọn biến thể, chi nhánh, kỳ thuê và voucher nếu luồng hỗ trợ.
3. Kiểm tra báo giá, gửi đơn và mở lại đơn.

**Mong đợi:** Trường bắt buộc/khả dụng được kiểm tra; tổng tiền đúng; chỉ dùng dữ liệu TEST; Staff thiếu quyền bị từ chối.

#### STAFF-05 — Giao đồ và thanh toán

1. Mở đơn TEST đã xác nhận; kiểm tra khách, barcode, phụ kiện và tình trạng đồ.
2. Đối chiếu riêng tiền thuê, cọc, giảm giá và trạng thái thanh toán.
3. Dùng phương thức thanh toán mô phỏng dành cho demo. Không mở hoặc xác nhận giao dịch PayOS/chuyển khoản bằng tiền thật.

**Mong đợi:** Cọc không tính là doanh thu; không giao khi khoản bắt buộc chưa xác nhận; không xác nhận chuyển khoản đang chờ; không thu/giao lặp khi tải lại.

#### STAFF-06 — Đang thuê, trả đồ và quyết toán

1. Tra đơn đang thuê theo mã đơn/barcode; đối chiếu hạn trả và người đang giữ.
2. Nhận từng bộ trong đơn nhiều bộ; kiểm tra tình trạng và phụ kiện.
3. Xem luồng thiếu/hỏng, chờ đánh giá, phụ phí và cọc còn lại.
4. Dùng luồng thu thêm/hoàn cọc mô phỏng nếu có; nếu nút gọi provider thật thì dừng trước xác nhận và ghi BLOCKED cho phần tích hợp ngoài.

**Mong đợi:** Mỗi bộ có trạng thái riêng; trả một bộ không đóng đơn khi còn bộ khác; đồ CLEANING/REPAIR không được giao; UI không báo refund thành công khi server chưa xác nhận.

#### STAFF-07 — Trả trễ và đơn kế tiếp

Chạy trên đơn/barcode demo được điều phối cung cấp. Có thể dùng đơn demo quá hạn và tạo xung đột lịch trong phạm vi demo; không thay đổi đồng hồ hệ thống hoặc dùng tài khoản/dữ liệu khách thật.

**Mong đợi:** Đơn trước vẫn ghi nhận đang giữ đồ đến khi nhận trả; đơn sau không giao được cùng barcode chưa READY; cảnh báo không tự đổi lịch hay thu tiền.

### D. Kho, danh mục, quản trị và báo cáo

#### INV-01 — Tra cứu và trạng thái bộ

1. Mở Kho; tìm barcode TEST.
2. Kiểm tra chi nhánh, trạng thái, lịch và lịch sử.
3. Dùng barcode TEST để thử block/unblock vệ sinh/sửa chữa rồi khôi phục trạng thái ban đầu.

**Mong đợi:** Barcode không lộ ở khu Customer; block có lý do; bộ bị block không được gán giao.

#### INV-02 — Điều chuyển chi nhánh

1. Dùng barcode TEST; tạo phiếu giữa hai chi nhánh.
2. Kiểm tra duyệt, ghi xuất, nhận một phần và nhận đủ.
3. Tra vị trí từng barcode và lịch sử phiếu.

**Mong đợi:** Vị trí chỉ đổi sau khi chi nhánh nhận xác nhận; bộ chưa nhận không dùng được ở nơi đến; không chuyển bộ đang thuê/vướng đơn khác.

#### ADMIN-01 — Danh mục và ảnh

1. Mở Quản trị → Danh mục; chọn mẫu TEST và chỉnh nội dung thử nghiệm.
2. Qua luồng ảnh chính thức, thêm ảnh do Studio sở hữu, đặt ảnh đại diện, đổi thứ tự; chỉ xóa ảnh TEST.
3. Dùng tài khoản chỉ xem để xác nhận thao tác ghi bị chặn.

**Mong đợi:** Ảnh gắn đúng mẫu và vẫn đúng sau khi tải lại; tiến độ/lỗi rõ; không lộ khóa S3; quyền ghi được máy chủ kiểm tra.

#### ADMIN-02 — Nhân viên, vai trò và chi nhánh

1. Tìm nhân viên TEST; gán vai trò ở chi nhánh thử nghiệm và lưu.
2. Đăng nhập tài khoản đó để kiểm tra portal, menu và thao tác được phép.
3. Thử mở màn/hành động không có quyền hoặc chi nhánh chưa được gán.

**Mong đợi:** Quyền theo vai trò và chi nhánh; không cần lộ UUID; thay đổi còn sau tải lại; Staff không vượt quyền bằng URL. Không sửa role của nhân viên thật.

#### ADMIN-03 — Voucher/ưu đãi

1. Tạo ưu đãi TEST có thời hạn, mức giảm, đơn tối thiểu và giới hạn; không sửa ưu đãi đang phục vụ khách thật.
2. Kiểm tra mã trong báo giá; sửa hoặc tắt ưu đãi và tính lại.
3. Dùng tài khoản thiếu quyền để thử truy cập.

**Mong đợi:** Máy chủ kiểm tra thời hạn/giới hạn; mã tắt hoặc hết hạn không được dùng; không sửa ưu đãi phục vụ khách thật.

#### ADMIN-04 — Chính sách và báo cáo

1. Ghi lại policy TEST hiện tại; chỉnh trên policy TEST, kiểm tra báo giá/đơn mẫu, sau đó khôi phục giá trị ban đầu.
2. Mở báo cáo theo chi nhánh/khoảng ngày; kiểm tra định dạng dd/mm/yyyy, áp dụng bộ lọc, lỗi và trạng thái rỗng.
3. Đối chiếu số liệu với các đơn TEST đã tạo trong lượt chạy.

**Mong đợi:** Báo cáo đúng chi nhánh và khoảng ngày; cọc đang giữ không cộng vào doanh thu; tài khoản một chi nhánh không xem số liệu toàn chuỗi.

### E. Giao diện, thiết bị và phục hồi lỗi

#### UX-01 — Desktop và mobile

Chạy tối thiểu một luồng Customer và một luồng Staff/Admin trên desktop, sau đó lặp ở viewport 390 px và 320 px.

- Không tràn ngang toàn trang, cắt mất nút hoặc để menu che vùng thao tác.
- Chữ, nhãn, lỗi và trạng thái không chồng nhau; nội dung dài xuống dòng hợp lý.
- Ngày hiển thị dd/mm/yyyy; date picker mở được và ngày chọn khớp ngày hiển thị.
- Kiểm tra bàn phím điện thoại, vùng chạm, zoom 200% và landscape nếu thiết bị hỗ trợ.

#### UX-02 — Bàn phím và trạng thái giao diện

1. Dùng Tab/Shift+Tab/Enter/Space để mở menu, nhập form, mở/đóng dialog và gửi thao tác.
2. Quan sát focus, label, lỗi, loading, empty, success và retry.
3. Thử session hết hạn theo luồng tự nhiên; không sửa cookie/token.

**Mong đợi:** Focus theo thứ tự đọc; nút đăng xuất không bị mất; lỗi nêu cách khắc phục; trạng thái pending không báo thành công.

#### UX-03 — Lỗi mạng và phục hồi

Có thể mô phỏng mất mạng bằng bản ghi demo; sau thao tác ghi, kiểm tra trạng thái trên server trước khi gửi lại. Không dùng dịch vụ thanh toán hoặc thông báo thật để tạo lỗi.

**Mong đợi:** Lỗi dễ hiểu; sau tải lại xác định được thao tác đã ghi hay chưa trước khi gửi lại.

## 5. Kiểm tra quyền nhanh

| Tài khoản | Được phép | Phải bị từ chối |
|---|---|---|
| Chưa đăng nhập | Danh mục công khai, đăng nhập/đăng ký | Đơn cá nhân, vận hành, quản trị |
| Customer | Hồ sơ và đơn của mình, đặt thuê | Đơn người khác, màn Staff/Admin |
| Staff bán hàng | Đơn, giao nhận, khách theo quyền/chi nhánh | Quản trị vai trò/chính sách hoặc chi nhánh ngoài phạm vi |
| Staff kho | Barcode, kho, điều chuyển theo quyền/chi nhánh | Dữ liệu khách không cần thiết, quản trị toàn chuỗi |
| Admin | Màn quản trị theo role | Không được bỏ qua guard giao dịch, trạng thái server hay bước xác nhận tiền |

Ẩn nút trên giao diện chưa đủ để PASS: URL trực tiếp và thao tác bị cấm phải bị server từ chối, không làm đổi dữ liệu.

## 6. Ghi nhận lỗi

Mỗi lỗi cần có: mã lỗi; tiêu đề ngắn; môi trường/URL; commit/build; ngày giờ và múi giờ; role/chi nhánh (che email nếu cần); thiết bị, trình duyệt, viewport; mã ca; điều kiện trước; các bước tái hiện; kết quả mong đợi/thực tế; tần suất; mã đơn/barcode/request ID; ảnh/video đã che dữ liệu nhạy cảm; mức độ và người theo dõi.

Không chụp/gửi mật khẩu, OTP, token, thông tin thẻ/ngân hàng hoặc dữ liệu khách không liên quan.

### Mức độ ưu tiên

- **P0 — Dừng kiểm thử:** lộ dữ liệu, vượt quyền, ghi/thu tiền sai, giao trùng barcode, mất dữ liệu hoặc báo thành công giả.
- **P1 — Chặn luồng chính:** không thể vào đúng portal, đặt thuê, xử lý đơn, giao/trả hoặc phục hồi an toàn.
- **P2 — Cản trở:** lỗi bố cục, nội dung, thông báo hoặc thao tác có cách làm thay thế.
- **P3 — Cải thiện:** tinh chỉnh nhỏ, không chặn nghiệp vụ.

Với P0/P1, dừng nhóm test liên quan, không thử lại thao tác ghi và báo người điều phối ngay.

## 7. Phiếu tổng kết phiên test

| Mã ca | PASS / FAIL / BLOCKED / UI ONLY / N/A | Mã đơn/barcode | Bằng chứng | Lỗi | Người theo dõi |
|---|---|---|---|---|---|
| AUTH-01–04 | | | | | |
| CUST-01–06 | | | | | |
| STAFF-01–07 | | | | | |
| INV-01–02 | | | | | |
| ADMIN-01–04 | | | | | |
| UX-01–03 | | | | | |

- **Kết luận phiên:** Đạt / Chưa đạt / Chưa đủ điều kiện nghiệm thu
- **P0/P1 còn mở:**
- **Ca BLOCKED/UI ONLY/N/A và lý do:**
- **Ảnh hưởng dữ liệu/tiền/hàng và cách khép lại:**
- **Người điều phối xác nhận kết thúc:**

Chỉ kết luận đạt khi các ca trong phạm vi đã PASS, không còn P0/P1, dữ liệu test được khép lại an toàn và ca bị chặn có lý do. Build xanh hoặc giao diện hiện đúng không tự chứng minh API đã lưu đúng.

## 8. Tài liệu chi tiết

- [Kịch bản E2E production demo và quy trình khép lại dữ liệu TEST](kich-ban-human-test-e2e.md)
- [Nghiệp vụ và quy tắc đơn thuê](../business/business-rules.md)
- [Đối chiếu UI với tình huống nghiệp vụ](../reports/business-ui-coverage.md)
- [Quản lý ảnh sản phẩm](../operations/quan-ly-anh-san-pham.md)
- [Demo UI và giới hạn fixture](../ui/demo-guide.md)
