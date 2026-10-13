# Chính sách trả trễ và bảo vệ đơn thuê kế tiếp

**Trạng thái:** Đề xuất nghiệp vụ; chưa phải quy tắc đã được chủ dự án chốt.
**Ngày rà soát:** 14/10/2026
**Phạm vi:** Thuê tại quầy hoặc gửi yêu cầu online; nhận và trả cùng chi nhánh; theo dõi từng bộ trang phục bằng mã riêng.

## 1. Mục tiêu và kết luận

Một lịch trả là thời hạn khách phải trả, không phải bằng chứng rằng bộ trang phục đã quay về studio. Vì vậy hệ thống phải quản lý riêng lịch đã hứa với khách và tình trạng thực tế của từng bộ.

Chính sách đề xuất:

1. Lịch thử đồ không giữ hàng. Chỉ một đơn được studio xác nhận mới tạo cam kết giữ bộ.
2. Đơn `PENDING_CONFIRMATION` chưa giữ bộ; giao diện phải nói rõ khách đang gửi yêu cầu, chưa có lịch thuê được bảo đảm.
3. Khi xác nhận, bộ được giữ cho đúng mẫu/size/chi nhánh trong thời gian thuê và khoảng chuẩn bị sau giờ trả.
4. Nếu khách thuê ở giữa trả trễ, đơn kế tiếp vẫn giữ nguyên lịch xác nhận. Bộ còn ở khách không được bàn giao, không được đổi trạng thái thành sẵn sàng và không tự động dời lịch khách sau.
5. Trước khi giao, hệ thống phải kiểm tra lại mã bộ đang được giao, kể cả khi đơn đã xác nhận từ trước.
6. Khi không còn bộ phù hợp, nhân viên xử lý theo luồng ngoại lệ: bộ thay thế, điều chuyển kịp thời, hoặc thỏa thuận lịch/mẫu/hủy với khách.

Không có thời gian đệm nào loại bỏ hoàn toàn rủi ro khách trả trễ. Thời gian đệm giảm nguy cơ; kiểm tra tại lúc giao và quy trình cứu đơn bảo vệ khách đã được xác nhận.

## 2. Kết quả tra cứu hệ thống cho thuê

Đối chiếu tài liệu hướng dẫn chính thức của Booqable cho thấy các mẫu thực tiễn sau:

- Buffer sau đơn có thể dành cho chuẩn bị, vệ sinh/bảo trì hoặc dự phòng khách trả trễ. Một ngày buffer được tính là 24 giờ theo lịch, bao gồm cuối tuần/ngày nghỉ; buffer không làm tăng giá thuê.
- Đơn nháp/yêu cầu chưa phải là đơn giữ hàng. Khi đơn được đặt chỗ, sản phẩm mới bị khóa khỏi lịch thuê khác.
- Với hàng có mã riêng, hướng dẫn quy trình khuyên chỉ gán đúng món vật lý gần lúc nhận nếu vận hành cho phép; món trả phải được ghi nhận đã về trước khi đưa cho đơn sau.

Đây là ví dụ từ một sản phẩm thương mại, không phải quy định pháp luật hay chuẩn bắt buộc. Studio cần chọn thời lượng theo cách làm sạch trang phục, giờ mở cửa và dữ liệu trả trễ thực tế.

Nguồn:

- [Booqable: cấu hình buffer và cách tính theo giờ lịch](https://help.booqable.com/en/articles/90053-how-to-adjust-product-settings)
- [Booqable: trạng thái đơn, giữ hàng, nhận/trả và gán món có mã](https://help.booqable.com/en/articles/3845244-the-booqable-order-workflow)
- [Booqable: hiển thị khả dụng hoặc nhận yêu cầu chưa giữ hàng](https://help.booqable.com/en/articles/9127272-how-to-enable-a-wishlist-on-your-online-store-and-accept-order-requests)

## 3. Thuật ngữ

| Thuật ngữ | Ý nghĩa trong policy |
| --- | --- |
| Lịch thử đồ | Hẹn khách đến xem/thử mẫu; không tự tạo reservation và không khóa một mã bộ. |
| Yêu cầu thuê | Đơn đang chờ nhân viên kiểm tra; theo rule hiện hành, chưa giữ bộ. |
| Đơn xác nhận | Đơn studio đã chấp nhận; từng dòng thuê được phân bổ cho một bộ vật lý. |
| Giờ trả hẹn | `plannedDueAt`; thời hạn đã thông báo trên đơn. Không tự thay đổi khi khách lấy đồ muộn. |
| Thời gian đệm khả dụng | Khoảng bảo vệ giữa giờ trả hẹn của một đơn và giờ bắt đầu đơn tiếp theo trên cùng bộ. |
| Bộ đang ở khách | Dòng phân bổ còn `ACTIVE` hoặc đơn thuê còn `ACTIVE`; giờ trả hẹn đã qua cũng không làm bộ tự sẵn sàng. |
| Đơn có nguy cơ thiếu bộ | Đơn xác nhận kế tiếp cần đúng bộ đó nhưng bộ chưa được trả, chưa sẵn sàng hoặc thời gian chuẩn bị không đủ. |

## 4. Chính sách theo từng giai đoạn

| Giai đoạn | Giữ bộ? | Quy tắc |
| --- | --- | --- |
| Khách chỉ đến thử | Không | Có thể ghi lịch hẹn thử; phải tách khỏi lịch thuê và tồn kho. |
| Khách gửi yêu cầu online | Chưa | Hiển thị “Đang chờ studio xác nhận — chưa giữ trang phục”. Khi nhân viên xử lý, phải kiểm tra khả dụng mới nhất. |
| Nhân viên xác nhận đơn | Có | Khóa một bộ đúng variant/size/chi nhánh và ngăn đơn khác dùng bộ đó trong khoảng được bảo vệ. |
| Khách đang thuê | Có | Dòng phân bổ đang hoạt động chiếm bộ vật lý. Quá giờ trả thì bộ vẫn không khả dụng cho tới khi thực nhận. |
| Studio nhận lại | Chưa cho thuê ngay | Ghi giờ nhận thực tế, kiểm tra, vệ sinh/sửa chữa; chỉ sau khi bộ đạt `READY` mới được giao lại. |
| Khách xin gia hạn | Chưa tự gia hạn | Nhân viên kiểm tra toàn bộ lịch kế tiếp và báo phí trước khi xác nhận. Nếu xung đột, từ chối gia hạn mã bộ đó. |

Quy tắc đơn chờ xác nhận chưa giữ hàng đã có trong `business-rules.md`; tài liệu này làm rõ cách áp dụng cho lịch thử và tình huống giữa hai đơn.

## 5. Cách tính khả dụng

### 5.1 Khoảng lịch

Mỗi đơn i có khoảng thuê khách nhìn thấy `[pickup_i, due_i)` và một khoảng đệm `turnaroundBuffer_i` sau giờ trả hẹn. Hai đơn cùng một mã bộ chỉ được xếp liên tiếp nếu:

```text
due_sớm_hơn + turnaroundBuffer_sớm_hơn <= pickup_muộn_hơn
```

Buffer dùng cho tính khả dụng; không cộng vào số ngày tính tiền và không thay đổi `plannedDueAt` trên hợp đồng/đơn.

Đề xuất cấu hình một giá trị tổng `turnaroundBufferMinutes` theo variant hoặc nhóm trang phục. Giá trị này phải bao gồm thời gian studio cần để kiểm tra/chuẩn bị và phần dự phòng trả trễ mà chủ studio chấp nhận. Không tự cộng thêm `cleaningBufferMinutes` nếu giá trị turnaround đã bao gồm công đoạn đó.

Trong source hiện tại, `cleaningBufferMinutes` là thời lượng block vệ sinh bắt đầu từ lúc thực tế nhận trả. Không nên âm thầm đổi ý nghĩa trường này thành buffer dự phòng trả trễ. Nếu dùng một cấu hình chung, cần ghi rõ đó là tổng khoảng cách tối thiểu giữa hai đơn; nếu tách cấu hình thì hiển thị thành phần và quy tắc cộng rõ ràng.

### 5.2 Bộ trước chưa được trả

Nếu dòng thuê trước còn allocation `ACTIVE` hoặc đơn trước còn `ACTIVE`, xem bộ là đang ở khách, kể cả khi `plannedDueAt` đã qua. Không được chỉ so sánh `occupiedUntil` với ngày yêu cầu mới rồi kết luận là trống.

Đơn sau đã xác nhận vẫn giữ lời hứa với khách. Nếu bộ của đơn đó bị người thuê trước giữ quá hạn, hệ thống phải báo nguy cơ và yêu cầu xử lý bộ thay thế; không âm thầm giải phóng hay giao trùng barcode.

### 5.3 Tình trạng vật lý

Sau khi nhận trả, khả dụng thực tế phụ thuộc trạng thái bộ:

```text
Đang ở khách → Nhận trả/kiểm tra → Vệ sinh hoặc sửa chữa → READY
```

Ngày hết buffer dự kiến không tự chuyển bộ sang `READY`. Nếu vệ sinh kéo dài, có hư hỏng, thiếu phụ kiện hoặc block khác còn mở, bộ tiếp tục không khả dụng.

### 5.4 Giá trị khởi điểm để thử nghiệm

Đề xuất pilot: khoảng đệm tối thiểu **24 giờ liên tục** giữa giờ trả hẹn và đơn kế tiếp cho trang phục thông thường; nhóm cần xử lý lâu hơn phải có giá trị riêng. Đây là giả định khởi điểm, không phải quyết định cuối.

Trong pilot, ghi nhận theo variant: số lần trả trễ, thời lượng trễ, thời gian từ lúc nhận trả tới `READY`, và số đơn kế tiếp bị ảnh hưởng. Sau khi có dữ liệu, chủ studio điều chỉnh buffer. Cần chốt rõ buffer tính theo giờ liên tục hay giờ làm việc của chi nhánh.

**Không dùng `lateGraceMinutes` làm buffer tồn kho.** Ân hạn là quy tắc xác định phí trễ; buffer là quy tắc xếp lịch. Hai cấu hình có mục đích khác nhau.

## 6. Quy trình cảnh báo và xử lý

### 6.1 Trước hạn trả

- Hệ thống tìm đơn thuê kế tiếp đã xác nhận trên cùng mã bộ.
- Nếu giờ nhận tiếp theo nằm trong khoảng cần cảnh giác, tạo tác vụ gắn cả đơn đang thuê và đơn bị ảnh hưởng.
- Có thể nhắc khách trả đúng giờ theo kênh đã được studio chọn. Thời điểm nhắc và kênh thông báo là cấu hình cần chốt.

### 6.2 Khi đơn trước quá hạn

- Đơn trước vẫn là `ACTIVE`; nhân viên ghi nhận trạng thái quá hạn từ thời gian hiện tại so với giờ trả và ân hạn.
- Nếu có đơn sau cần cùng bộ, tăng mức ưu tiên tác vụ theo thời gian còn lại tới giờ nhận của đơn sau.
- Tìm bộ READY thay thế cùng variant/size/chi nhánh và kiểm tra lịch của mã thay thế.
- Liên hệ người thuê trước theo quy trình studio; không tự kéo dài đơn nếu chưa kiểm tra lịch.

### 6.3 Tại quầy của đơn kế tiếp

Trong transaction bàn giao, khóa mã bộ rồi kiểm tra lại:

1. Mã bộ đúng variant và size của dòng đơn.
2. Mã bộ đang thuộc đúng chi nhánh nhận.
3. Mã bộ có trạng thái vật lý `READY`.
4. Không còn dòng thuê khác đang `ACTIVE` trên mã bộ đó.
5. Không có block vệ sinh/sửa chữa/điều chuyển đang ngăn bàn giao.
6. Phiên bản đơn và điều kiện thanh toán vẫn hợp lệ.

Nếu kiểm tra không đạt, API trả lỗi xung đột có mã lỗi ổn định; đơn sau không chuyển `ACTIVE`, không ghi nhận bàn giao và không làm mất lịch đã xác nhận. Giao diện mở ngay tác vụ xử lý thay thế. Việc ghi nhận tiền phải theo thứ tự đã chốt để tránh thu xong mới phát hiện không có hàng; nếu tiền đã thành công thì giữ nguyên sổ giao dịch và xử lý hoàn/điều chỉnh theo quy trình tài chính, không xóa giao dịch.

### 6.4 Thứ tự khắc phục

1. **Đổi sang barcode khác cùng variant/size tại chi nhánh** nếu bộ đó READY và không xung đột. Ghi người đổi, thời điểm, mã cũ/mới.
2. **Đề nghị trang phục tương đương** nếu cùng size và phù hợp; cần khách đồng ý khi mẫu/màu/chất liệu/giá thay đổi. Ghi lựa chọn và chênh lệch giá trước khi bàn giao.
3. **Điều chuyển từ chi nhánh khác** chỉ khi thời gian đến và hoàn tất chuẩn bị bảo đảm trước lịch nhận; không lấy hàng của một đơn đã xác nhận khác.
4. Nếu không có bộ thay thế, nhân viên/manager liên hệ khách để thỏa thuận đổi mẫu, đổi giờ/ngày hoặc hủy. Bồi hoàn, giảm giá, credit hay refund phải theo policy đã công bố; không tự phát sinh.

Không có người dùng nào được override khi mã bộ vẫn đang ở khách. Override quản lý (nếu sau này cần) chỉ có thể áp dụng cho xung đột lịch dự kiến có thể khắc phục và cần lý do/audit; không được bỏ qua trạng thái vật lý.

## 7. Phí, cọc và giao tiếp khách hàng

- Trên đơn/biên nhận phải hiện ngày và giờ trả hẹn, quy định ân hạn, cách tính phí trễ và hướng dẫn xin gia hạn.
- Khách trả trễ không tự tạo thời gian thuê mới. Gia hạn chỉ có hiệu lực khi nhân viên kiểm tra availability, báo phí và xác nhận.
- Phí trễ tiếp tục dùng policy version gắn với đơn; không lấy buffer làm phí, không thu phí buffer.
- Đơn B chưa được bàn giao thì không được đánh dấu đã thuê. Nếu khách đã thanh toán trước, mọi refund/điều chỉnh phải là giao dịch có lý do và tham chiếu payment gốc.
- Không tự khấu trừ toàn bộ cọc của A chỉ vì trả trễ. Cọc được quyết toán theo policy đã chốt, bằng chứng và giao dịch riêng.

## 8. Trạng thái và dữ liệu

Không cần thêm trạng thái đơn `AT_RISK`. Đề xuất giữ state machine đơn hiện tại và tạo cờ/tác vụ vận hành có thể tính từ dữ liệu:

| Đối tượng | Dữ liệu dùng | Hành vi mong muốn |
| --- | --- | --- |
| Đơn A đang thuê | order status, giờ trả hẹn, allocation status, barcode | Còn `ACTIVE` tới lúc nhận trả; quá hạn không tự giải phóng unit. |
| Đơn B kế tiếp | trạng thái đơn, giờ nhận, branch, barcode/variant | Giữ trạng thái đã xác nhận và được đánh dấu có rủi ro khi A chưa trả hoặc buffer không đủ. |
| Bộ vật lý | `unitId`, `unitCode`, variant, branch, operational status, blocks | Chỉ bàn giao khi đúng branch và `READY`; không hiển thị UUID cho nhân viên. |
| Tác vụ rủi ro | A, B, unit, due A, pickup B, mức ưu tiên, owner, resolution | Gộp tình huống, tránh tạo thông báo lặp, lưu lịch sử xử lý/đổi barcode/liên hệ. |

Đề xuất API/service phải dùng cùng một quy tắc khả dụng trong tra cứu public, báo giá, xác nhận, reallocate, gia hạn, điều chuyển và bàn giao. Kiểm tra ở UI chỉ hỗ trợ nhân viên; quyết định cuối phải được backend kiểm tra trong transaction.

Không yêu cầu thay schema trong tài liệu này. Nếu triển khai, cần chốt cấu hình buffer và xem xét trường/cấu hình `turnaroundBufferMinutes` tách biệt với `cleaningBufferMinutes`; mọi thay đổi schema/migration là việc riêng, không nằm trong cập nhật tài liệu này.

## 9. Giao diện nhân viên

### Tác vụ “Đơn kế tiếp có nguy cơ thiếu bộ”

Mỗi tác vụ nên hiển thị:

- Mã đơn A, tên khách và thời gian trễ.
- Mã đơn B, tên khách, giờ nhận và thời gian còn lại.
- Mã barcode, mẫu, size, chi nhánh và trạng thái hiện tại của bộ.
- Số bộ thay thế cùng variant đang READY; có thể mở chi tiết lịch của từng bộ.
- Người đang phụ trách và lịch sử liên hệ/đổi bộ.

CTA ưu tiên: `Gán bộ thay thế` → `Liên hệ khách đang thuê` → `Đề xuất phương án cho đơn kế tiếp`. Cảnh báo tới nhận trong 2 giờ có thể ở mức khẩn; khoảng 2 giờ là đề xuất UX cần kiểm thử, không phải policy nghiệp vụ.

### Bàn giao

- Trước khi thu/ghi nhận thanh toán cuối và xác nhận giao, hiển thị barcode thực tế đã scan và kết quả kiểm tra sẵn sàng.
- Nếu conflict: nêu đơn đang giữ bộ và giờ nhận kế tiếp, có nút chọn mã thay thế; không chỉ hiện `An unexpected error occurred`.
- Trên điện thoại, mã đơn B và hành động thay thế phải luôn dễ truy cập; không để tác vụ khẩn phụ thuộc bảng rộng hoặc cuộn ngang.
- Tác vụ được đóng khi đã có unit thay thế hợp lệ hoặc đơn B đã có thỏa thuận khác được ghi nhận; chỉ ghi “khách A đã trả” là chưa đủ nếu bộ vẫn đang vệ sinh.

## 10. Đối chiếu với source hiện tại trên GitHub `main`

Đây là snapshot đọc source ngày 14/10/2026, không phải xác nhận runtime production:

| Hiện trạng đã xác minh | Tác động |
| --- | --- |
| `CostumeVariant.cleaningBufferMinutes` tồn tại; lúc nhận trả, service tạo `UnitBlock` vệ sinh từ giờ nhận thực tế tới hết buffer. | Có thể chặn vệ sinh sau khi trả; chưa bảo vệ trước đơn kế tiếp khi tính availability trước lúc trả. |
| Availability quote/public so khoảng `occupiedFrom`/`occupiedUntil` với kỳ khách yêu cầu. | Chưa cộng thời gian buffer vào kỳ giữ chỗ; có thể xác nhận cùng barcode cho lịch sát nhau. |
| `pickupOrder` kiểm tra tiền và khóa unit; source hiện không re-check unit READY, branch và allocation thuê ACTIVE khác trước khi chuyển đơn thành `ACTIVE`. | Nếu người trước trả trễ, có rủi ro hai đơn cùng chuyển thành đang thuê trên một barcode. Đây là lỗi mức P0 cần xử lý trước khi tin cậy bàn giao. |
| Dashboard tạo việc theo đơn/quá hạn nhưng chưa gắn đơn kế tiếp chịu ảnh hưởng, mã thay thế và quyết định xử lý. | Nhân viên phải tự tìm qua các màn đơn và kho; rủi ro bị bỏ sót. |

Liên kết source:

- [Schema `CostumeVariant`, `CostumeUnit`, `UnitBlock`, `RentalOrderItem`](https://github.com/BinCry/Costume-Rental-Studio/blob/main/apps/api/prisma/schema.prisma)
- [Tính availability, xác nhận/gán unit, gia hạn, bàn giao và nhận trả](https://github.com/BinCry/Costume-Rental-Studio/blob/main/apps/api/src/modules/rentals/rental.service.ts)
- [Availability công khai](https://github.com/BinCry/Costume-Rental-Studio/blob/main/apps/api/src/modules/public/public.service.ts)
- [Dashboard và hàng đợi tác vụ](https://github.com/BinCry/Costume-Rental-Studio/blob/main/apps/web/src/api/client.ts)

## 11. Kịch bản nghiệm thu

| ID | Kịch bản | Kết quả cần đạt |
| --- | --- | --- |
| RT-01 | Lịch thử đồ nhưng khách chưa gửi yêu cầu thuê | Không giữ unit. |
| RT-02 | Request `PENDING_CONFIRMATION` và một request khác được confirm trước | Pending không khóa hàng; confirm sau phải re-check và có thể báo hết hàng. |
| RT-03 | Đơn giữa có giờ trả + buffer muộn hơn giờ nhận của đơn kế tiếp | Không xác nhận cùng barcode; tìm barcode khác hoặc từ chối yêu cầu. |
| RT-04 | Đơn giữa chưa trả và `plannedDueAt` đã qua; khách mới hỏi kỳ tương lai | Barcode vẫn bị tính đang ở khách, không hiện trống chỉ vì occupiedUntil kế hoạch đã qua. |
| RT-05 | Đơn kế tiếp đã xác nhận cùng barcode; khách trước trả trễ | Tác vụ liên kết A/B xuất hiện; B không bị hủy hoặc tự dời. |
| RT-06 | Nhân viên thử bàn giao B trên barcode vẫn thuộc allocation ACTIVE của A | API trả conflict; B không chuyển ACTIVE; không ghi nhận bàn giao trên barcode đó. |
| RT-07 | Tại RT-06 có barcode thay thế READY cùng variant/size | Reallocate trong transaction; giữ audit old/new; chỉ bàn giao barcode thay thế. |
| RT-08 | Đã nhận lại nhưng bộ đang CLEANING/REPAIR hoặc block chưa xong | Bị từ chối bàn giao; không tự coi hết buffer là READY. |
| RT-09 | Nhân viên gia hạn A nhưng đơn B dùng cùng barcode | Gia hạn bị từ chối và hiển thị đơn B + giờ nhận; có thể thử mốc khác. |
| RT-10 | Hai nhân viên cùng xác nhận barcode cuối hoặc cùng bàn giao | Tối đa một thao tác thành công; thao tác còn lại nhận conflict có thể khôi phục. |
| RT-11 | Đơn B đã thu payment trước khi phát hiện conflict | Không xóa payment; hiển thị trạng thái tiền và cho xử lý refund/điều chỉnh theo policy. |
| RT-12 | Đổi barcode thay thế rồi mở lại dashboard | Cảnh báo được đóng theo resolution đã lưu; không tạo bản ghi/tác vụ trùng. |

## 12. Quyết định cần chủ dự án chốt

| Quyết định | Đề xuất | Trạng thái |
| --- | --- | --- |
| Khoảng đệm tối thiểu | Pilot 24 giờ liên tục cho nhóm thường; cấu hình dài hơn cho đồ cần làm sạch lâu. Đo dữ liệu rồi chỉnh. | Cần chốt |
| Giờ liên tục hay giờ làm việc | Chọn giờ liên tục ở MVP cho dễ tính nhất quán; nếu chọn giờ mở cửa, cần lịch nghỉ/chi nhánh đầy đủ. | Cần chốt |
| Phạm vi cấu hình buffer | Theo variant hoặc nhóm trang phục; override theo chi nhánh chỉ khi quy trình vệ sinh thực sự khác. | Cần chốt |
| Thời điểm nhắc khách/nhân viên | Nhắc trước hạn và cảnh báo ngay khi quá hạn mà có B sắp nhận; chốt SLA và kênh gửi sau. | Cần chốt |
| Thay bộ tương đương | Cùng variant/size có thể thay barcode nội bộ; khác mẫu/màu/giá cần khách đồng ý. | Cần chốt |
| Không có hàng thay thế | Thống nhất quyền đổi lịch/hủy, refund nếu đã thu, giảm giá/credit/bồi hoàn và ai duyệt. | Cần chốt |
| Quyền override | Không bao giờ override khi đồ vẫn ở khách; nếu cho phép override thời gian chuẩn bị thì manager phải ghi lý do. | Đề xuất |

Cho tới khi chủ dự án duyệt các dòng trên, dùng tài liệu này như thiết kế đề xuất; không coi các mức phút/giờ hoặc mức bồi hoàn là cam kết kinh doanh.

## 13. Tài liệu liên quan

- [Quy tắc nghiệp vụ hiện hành](business-rules.md)
- [Phân tích nghiệp vụ và kịch bản nghiệm thu](business-analysis.md)
- [Chỉ mục tài liệu dự án](../README.md)
