# Audit hành trình khách thuê — 18/11/2026

**Phạm vi:** khách mới và khách quay lại của Costume Rental Studio trên điện thoại và desktop. Từ tìm trang phục đến chọn lịch, báo giá, gửi yêu cầu, thanh toán và theo dõi. Không đánh giá màn nhân viên, quản trị hoặc Ops Agent trong đợt này.

**Cách kiểm:** đối chiếu luồng trong mã `CatalogPage.tsx`, `CustomerFeatures.tsx`, `BookingPage.tsx`, `StudioApp.tsx`, `api/client.ts`, API public/rentals/payments và ảnh người dùng cung cấp. Phiên Edge debugger chưa kết nối được, nên mọi nhận định về số lần bấm, vị trí trên màn hình và trải nghiệm production hiện là **giả thuyết cần kiểm trực quan**, không phải kết quả E2E. Các lỗi hợp đồng dữ liệu dưới đây được xác minh bằng mã.

## Hành trình mục tiêu

```text
Khám phá / tìm kiếm → Chọn mẫu, size, chi nhánh và lịch → Thấy khả dụng và giá dự kiến
→ Điền hoặc xác nhận liên hệ → Gửi yêu cầu → Studio xác nhận
→ Thanh toán tiền thuê/cọc khi đến hạn → Nhận đồ → Trả đồ → Theo dõi quyết toán cọc
```

**Nguyên tắc sản phẩm:** khách chỉ cần nhập dữ liệu khi dữ liệu đó làm thay đổi lựa chọn hoặc đơn; một thông tin chỉ nhập một lần; giá, cọc, khả dụng và việc cần làm hiện cạnh hành động tương ứng. Từ “còn bộ” không đồng nghĩa với “đã giữ bộ”. Phiếu tạm tính trước xác nhận không được gọi là hóa đơn.

Tham chiếu thực tế: [Baymard — bộ lọc và danh sách sản phẩm](https://baymard.com/research-articles/current-state-product-list-and-filtering), [Baymard — nút chọn size](https://baymard.com/research-articles/use-buttons-for-size-selection), [Baymard — lỗi biểu mẫu tại trường](https://baymard.com/research-articles/inline-form-validation), [Baymard — tài khoản trong checkout](https://baymard.com/research-articles/make-guest-checkout-prominent), [Nuuly — lọc đồ có sẵn và nhiều size](https://www.nuuly.com/rent/help/faqs-how-it-works). Đây là mẫu tham khảo về cách giảm thao tác và bộc lộ thông tin; Studio thuê theo lịch và phải chờ xác nhận bộ vật lý nên không sao chép cơ chế subscription/checkout của họ.

## Vấn đề và cách xử lý

| ID / ưu tiên | Tình huống khách gặp | Hiện trạng đã kiểm trong mã | Cách xử lý đề xuất và điều kiện đạt |
| --- | --- | --- | --- |
| K01 · P0 | Khách chưa có tài khoản muốn biết tổng tiền trước khi quyết định | Trước sửa, `StudioApp` bảo vệ toàn trang `/dat-thue`; `POST /rentals/quotes` yêu cầu xác thực và `customerUserId`. Catalog chỉ hiện giá từ/ngày. | **Đã code:** mở chặng chọn bộ/lịch cho khách chưa đăng nhập; `POST /public/rental-estimate` dùng chung hàm giá/chính sách/khả dụng, không áp dụng ưu đãi cá nhân, không giữ bộ. Chỉ yêu cầu đăng nhập khi gửi; sau đăng nhập phải tính lại quote. Cần kiểm production và mức tải của endpoint công khai. |
| K02 · P0 | Khách nhập tên hoặc số khác hồ sơ ở chặng cuối | Trước sửa, form cho sửa `name`, `phone` nhưng payload tạo đơn chỉ gửi `customerUserId`; liên hệ vừa nhập bị bỏ. | **Đã code:** đơn có `contactName`/`contactPhone` riêng; FE gửi cùng yêu cầu, BE chuẩn hóa số và lưu snapshot, staff/khách đọc snapshot thay vì hồ sơ hiện tại. Đơn cũ fallback về hồ sơ vì migration thêm cột nullable. Cần xác minh migration và đọc lại đơn trên production sau khi đổi hồ sơ. |
| K03 · P0 | Khách chọn lịch trên catalog có nhiều mẫu/size | Trước sửa, FE gọi API một lần cho mỗi biến thể, tối đa 5 request đồng thời trên toàn catalog, chung hạn mức `/api/v1`. | **Đã code:** endpoint batch tối đa 50 biến thể, kiểm chung chi nhánh/chính sách; FE chỉ kiểm mẫu đang lọc và debounce 350 ms. Còn cần phân trang/lazy khi catalog rất lớn, đo request thật và kiểm trường hợp 429. |
| K04 · P0 | Thuê 2 bộ cùng mẫu nhưng khác size | Booking đã hỗ trợ nhiều dòng `{costumeId, variant, quantity}` và API nhận nhiều item. Trước sửa, dòng mới tự chọn biến thể đầu. | **Đã code:** dòng thêm từ danh mục phải chọn size/màu; biến thể từ trang chi tiết được giữ; báo giá và phiếu tạm tính hiển thị từng dòng. Cần kiểm thật hai size trong một đơn và dòng hết bộ. |
| K05 · P1 | Mẫu vừa hết bộ hoặc lịch vừa đổi | Trang chi tiết kiểm khả dụng; quote kiểm lại. Tạo đơn dùng lại lựa chọn nhưng quote tham chiếu chỉ nằm trong bộ nhớ FE, đơn được API tính lại. | **Đã code một phần:** tính lại quote trước gửi; nếu hết bộ hoặc tiền/chính sách đổi thì trở về chặng báo giá, giữ liên hệ và cho sửa size, mẫu, chi nhánh, ngày. Biến động số bộ còn lại nhưng vẫn đủ thì không chặn. **Còn thiếu:** API có thể đổi giữa lần quote và tạo đơn; cần đối chiếu giá ở giao dịch tạo đơn hoặc trả về thay đổi để FE xác nhận lại. Cần nghiệm thu cạnh tranh trên production. |
| K06 · P1 | Khách tìm mẫu theo nhu cầu và muốn so sánh nhanh | Catalog có lọc loại/size/màu, tìm tên và xem nhanh; trước sửa không có sắp xếp và mobile giấu tìm kiếm trong bộ lọc. | **Đã code một phần:** tìm kiếm luôn hiển thị, thêm sắp xếp giá tăng/giảm và tên, lưu lọc/sort trong URL. **Còn thiếu:** tinh gọn nội dung thẻ, kiểm mobile thực tế và cân nhắc bỏ xem nhanh nếu không giảm thao tác. |
| K07 · P1 | Khách chuyển catalog → chi tiết → đặt thuê → quay lại | Trước sửa, detail xóa `pickup`/`returnAt` khỏi URL sau khi đọc và lưu khoảng thuê trong session theo mẫu; booking về catalog làm mất bộ lọc. | **Đã code một phần:** detail giữ size/chi nhánh/lịch trong URL và chuyển bộ lọc sang booking; nút về danh mục từ booking giữ lọc/sắp xếp/lịch hiện tại. **Còn thiếu:** kiểm back/forward/mobile Safari, link tab mới và nháp checkout quá hạn trên production. |
| K08 · P1 | Khách muốn xem quote nhưng chưa có hoặc voucher sai | Trước sửa, chặng đầu có cả nút tải quote và nút “Xem báo giá”; mã ưu đãi là phần phụ. | **Đã bỏ nút tải quote trùng khi chưa có giá**, giữ CTA “Xem báo giá”; khi đã có giá vẫn cho cập nhật. Còn cần kiểm voucher sai, quote hết hạn và lỗi API trong hành trình thật. |
| K09 · P1 | Khách cần biết khi nào trả tiền và đang nợ bao nhiêu | Chặng hai hiển thị tổng dự kiến khi nhận; chi tiết đơn có thanh toán payOS/cọc sau xác nhận. | Trước gửi: một dòng “Tổng dự kiến” và tách thuê/cọc; sau xác nhận: “Cần thanh toán” theo mục và thời hạn, chỉ hiện nút trả tiền khi API cho phép. Khi pending gateway: hiện link tiếp tục hoặc tải lại trạng thái, không tạo khoản trùng. |
| K10 · P1 | Khách đóng trang giữa chừng, đăng nhập hoặc Google callback | Draft từng chỉ lưu 15 phút khi chủ động bấm đăng nhập từ booking; route từng chặn khách trước booking. | **Đã code một phần:** nháp giữ 24 giờ và không bị xóa ngay sau khi quay lại; quote được tính lại trước gửi. **Còn thiếu:** khi nháp quá hạn cần giữ lựa chọn và yêu cầu tính lại quote; cần kiểm callback lỗi và điều hướng về checkout. |
| K11 · P1 | Nhấn Gửi hai lần hoặc mạng mất phản hồi | FE có cờ `submittingRef` chống bấm lặp; chưa có idempotency key ở hợp đồng tạo đơn. | Backend nhận idempotency key cho tạo yêu cầu, FE lưu key của lần gửi đang chờ. Khi timeout, tra trạng thái trước khi cho thử lại. Không tạo hai đơn vì một cú nhấn. |
| K12 · P1 | Sau khi gửi, khách muốn biết tiếp theo làm gì | Trang thành công có mã và nút Theo dõi. Đơn chỉ được giữ sau xác nhận của Studio. | Màn thành công ghi “Chờ Studio xác nhận”, mã đơn sao chép được, giờ nhận/trả, đường tới Đơn của tôi. Không hứa giữ bộ/thu tiền khi vẫn pending. |
| K13 · P1 | Studio từ chối, khách hủy, no-show hoặc hoàn cọc | Màn Đơn của tôi có trạng thái và dòng thanh toán; cần kiểm production về thứ tự thông tin. | Mỗi trạng thái có một câu “Việc bạn cần làm” hoặc “Không cần thao tác”; từ chối nêu lý do khi API trả; hủy nêu hiệu lực/phí trước xác nhận; hoàn cọc nêu số tiền, trạng thái, thời gian. Lịch sử kỹ thuật để trong phần mở rộng. |
| K14 · P2 | Khách sử dụng điện thoại hoặc công cụ hỗ trợ | Chưa kiểm trực quan ở 375/768 px do Edge debugger không kết nối. | Kiểm 320/375/390/768/1366 px, zoom 200%, bàn phím; không tràn ngang, không CTA bị che bởi bàn phím, vùng chạm tối thiểu 44 px, lỗi ở cạnh trường và focus đúng nơi cần sửa. |

## Ma trận ca sử dụng cần phủ

| Giai đoạn | Ca bình thường | Ca biên/lỗi phải có đường thoát |
| --- | --- | --- |
| Tìm mẫu | tìm tên, lọc loại/size/màu, sắp xếp, mở chi tiết | 0 kết quả, thiếu ảnh, tên dài, lọc nhiều điều kiện, quay lại từ chi tiết, mở URL chia sẻ |
| Chọn lịch | một chi nhánh, lịch hợp lệ, size còn bộ | ngày quá khứ, trả trước nhận, sát giờ nhận, một size hết nhưng size khác còn, kiểm tra khả dụng lỗi/429, khách đổi ngày nhiều lần |
| Giỏ/yêu cầu | một bộ; nhiều bộ khác mẫu; cùng mẫu khác size; nhiều số lượng | quá 50 bộ, xóa dòng cuối, đổi biến thể làm quote hết hiệu lực, một dòng thiếu capacity, bộ inactive giữa chừng |
| Báo giá | thuê + cọc + ưu đãi hợp lệ | khách chưa đăng nhập, voucher hết hạn/không đủ điều kiện, policy đổi, giá/availability đổi, quote hết hạn, mất mạng, không hiển thị 0 đ thay lỗi |
| Xác thực/liên hệ | khách cũ, khách mới, hồ sơ có/thiếu số | callback thất bại, phiên hết hạn, quay lại checkout, số liên hệ khác hồ sơ, nhập sai phone, nhập dài, submit lặp |
| Gửi và theo dõi | pending → confirmed → paid → pickup → return → refund | rejected, cancelled, no-show, thanh toán pending/failed/expired, trả trễ, phí phát sinh, hoàn cọc một phần, không mở được link thanh toán |

## Luồng ưu tiên triển khai

1. **Đúng dữ liệu trước:** K02 đã có snapshot liên hệ theo đơn; sau deploy kiểm số trong đơn vẫn cố định khi hồ sơ thay đổi. K04 size nhiều dòng và K05 quote/đơn thay đổi cần kiểm production.
2. **Cho khách quyết định trước khi đăng nhập:** K01/K03 đã code endpoint công khai và batch availability; sau deploy đo tải và chốt rate limit riêng theo tuyến nếu cần.
3. **Rút thao tác:** K06–K10. Giữ đúng hai chặng đã chốt: **(1) bộ + lịch + giá dự kiến, (2) liên hệ + phiếu tạm tính + gửi**. Mỗi chặng một CTA chính; chỉ hiển thị giải thích khi ảnh hưởng quyết định.
4. **Sau gửi:** K11–K13. Nút thanh toán chỉ xuất hiện đúng trạng thái; việc tiếp theo đứng trước lịch sử và chi tiết kế toán.

## Tiêu chí nghiệm thu bằng người dùng

- Khách chưa đăng nhập có thể tìm mẫu, chọn size/lịch và xem **báo giá máy chủ**; đăng nhập chỉ ở lúc gửi yêu cầu. Nếu triển khai guest booking sau này, phải quyết định riêng hợp đồng và chống spam.
- Thuê hai size trong một yêu cầu không nhập lại cùng dữ liệu; mã, size, số bộ, giá và cọc đọc lại từ đơn khớp lựa chọn đã xác nhận.
- Một lần đổi lịch không tạo request theo từng biến thể của toàn catalog. 429 hiển thị cách chờ/thử lại, không bị diễn giải thành hết hàng.
- Thử các ca trong ma trận ở cả desktop/mobile; đo số thao tác từ mẫu → quote → gửi, tỷ lệ quay lại sửa lựa chọn và tỷ lệ lỗi quote/submit. Chỉ đánh dấu “đã nghiệm thu” sau kiểm trên production với DOM/network hoặc kiểm trực quan được người dùng cho phép.

**Trạng thái:** K01–K04 và K08 đã sửa code bước đầu; các ca còn lại là backlog có điều kiện nghiệm thu. Chưa thay thế kết quả kiểm production. Theo dõi tiến độ sửa mã ở [audit toàn web](audit-tinh-gon-toan-web-2026-11-17.md).
