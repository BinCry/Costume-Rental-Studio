# Báo cáo phân tích nghiệp vụ toàn diện

## Hệ thống quản lý studio cho thuê trang phục

Repository: BinCry/Costume-Rental-Studio

*Phạm vi: nghiệp vụ, tính vận hành thực tế, ngoại lệ, lỗi và edge cases; không đánh giá tiến độ API.*

Ngày đánh giá: 03/10/2026

| Mục tiêu của tài liệu Đánh giá hệ thống dưới góc nhìn một chuỗi studio có nhiều chi nhánh và nhân viên: liệu quy trình có đủ đơn giản để người thật chịu dùng; dữ liệu và tiền có được bảo vệ khi xảy ra ngoại lệ; và còn tình huống nghiệp vụ nào chưa có cách xử lý rõ ràng. Tài liệu đồng thời đưa ra flow đề xuất, business rules, mức ưu tiên và bộ kịch bản nghiệm thu để nhóm dùng khi tiếp tục thiết kế/triển khai. |
| :---- |

*Nguồn chính: docs/business/business-rules.md; docs/database/schema-summary.md; apps/api/prisma/schema.prisma; docs/ui/core-flow-ux-review.md. Tài liệu phân tích nghiệp vụ cũ trong `docs/archive/` chỉ được dùng như nguồn lịch sử/tham khảo khi cần vì repository ghi rõ business-rules.md là nguồn nghiệp vụ hiện hành.*

# **1\. Kết luận điều hành**

| Kết luận tổng quát Scope cốt lõi hiện tại là hợp lý và có khả năng triển khai cho studio thật nếu nhóm giữ trọng tâm vào vòng đời thuê trang phục, giảm thao tác tay của nhân viên và bổ sung các ngoại lệ thường gặp. Điểm mạnh là quản lý từng bộ vật lý theo barcode, tồn kho theo chi nhánh, chống trùng lịch, tách tiền cọc khỏi doanh thu, hỗ trợ đơn online/tại quầy và có lịch sử khách. Điểm yếu lớn nhất không nằm ở việc thiếu thật nhiều tính năng, mà ở một số “lỗ hổng vận hành” như liên kết khách offline-online, gia hạn/đổi thông tin sau xác nhận, đóng chi nhánh, xử lý hư hỏng chưa định giá, giờ hoạt động chi nhánh và cơ chế sửa sai giao dịch. |
| :---- |

| Hạng mục | Đánh giá | Kết luận ngắn |
| :---- | :---- | :---- |
| Scope cốt lõi | PHÙ HỢP | Đủ để giải quyết bài toán chuỗi studio thuê trang phục; không cần thêm giao hàng, trả khác chi nhánh, loyalty/campaign vào MVP. |
| Khả năng người thật sử dụng | PHÙ HỢP CÓ ĐIỀU KIỆN | Phải giảm số bước tại quầy, tự động hóa cleaning/trạng thái và không ép nhân viên cập nhật quá nhiều trạng thái trung gian. |
| Độ chặt chẽ tồn kho | TỐT | Barcode từng bộ \+ chi nhánh \+ trạng thái \+ lịch chiếm dụng là nền tảng đúng. |
| Độ chặt chẽ tiền/cọc | KHÁ | Tách payment/refund tốt. MVP chốt hoàn tiền thủ công: staff có quyền chuyển tiền ngoài hệ thống rồi ghi nhận giao dịch hoàn thành; backend tự tính và chặn vượt số tiền được phép hoàn. |
| Đa chi nhánh | KHÁ | Có phân quyền và điều chuyển; thiếu quy tắc đóng chi nhánh, giờ hoạt động và một số edge case chuyển nhân viên/tài sản. |
| Khách online/offline | CẦN BỔ SUNG | Cần cơ chế claim/link hồ sơ tại quầy với tài khoản online để lịch sử không bị tách. |
| Thay đổi sau xác nhận | ĐÃ CHỐT NGHIỆP VỤ | Gia hạn toàn đơn nếu không conflict; amendment ngày/size/unit chỉ trước pickup; không đổi trực tiếp sau ACTIVE. |
| Khả năng xử lý ngoại lệ | KHÁ | Đã nghĩ đến no-show, trả một phần, refund fail, conflict; cần hoàn thiện lỗi vận hành thực tế và recovery. |

## **1.1. Bảy điểm phải chốt trước khi coi nghiệp vụ là “kín”**

* Liên kết hồ sơ khách tại quầy với tài khoản online bằng email đã xác minh; không triển khai merge hồ sơ trong MVP.  
* Đơn tại quầy được xác nhận trực tiếp nếu nhân viên có quyền và tồn kho hợp lệ; không bắt đi vòng qua hàng đợi như đơn online.  
* Không xóa chi nhánh đã có lịch sử; chỉ cho INACTIVE khi không còn đơn đang hoạt động/tương lai, unit hoặc transfer chưa xử lý.  
* Gia hạn đơn đang thuê và đổi ngày/size/bộ sau xác nhận phải kiểm tra lại khả dụng và giá trước khi cho lưu.  
* Hư hỏng chưa định giá ngay phải có PENDING\_ASSESSMENT và tiếp tục giữ cọc cho đến khi quyết toán.  
* Sau khi trả đồ bình thường, hệ thống nên tự tạo trạng thái/block vệ sinh thay vì bắt nhân viên thao tác lại ở kho.  
* Chi nhánh phải có giờ hoạt động/cutoff nhận-trả để các rule no-show, quote hết hạn, nhận muộn, ngày nghỉ vận hành có nghĩa.

## **1.2. Nguyên tắc thiết kế để không rơi vào “quy trình quá nhiều việc”**

* Một sự kiện ngoài đời nên tương ứng tối đa một thao tác chính trên phần mềm. Ví dụ “khách trả đồ” \-\> quét/kiểm/nhận trả; hệ thống tự chuyển các trạng thái phụ.  
* Trạng thái chi tiết có thể tồn tại để kiểm soát dữ liệu, nhưng không đồng nghĩa nhân viên phải bấm nút cho từng trạng thái.  
* Nhân viên chỉ nhập ngoại lệ hoặc thông tin con người mới biết: hư hỏng, thiếu phụ kiện, lý do hủy, khoản tiền thực nhận, xác nhận điều chuyển.  
* Mọi dữ liệu từng tham gia giao dịch không nên bị xóa vật lý; dùng INACTIVE/RETIRED/TERMINATED và giữ lịch sử.  
* Các thay đổi ảnh hưởng lịch/tồn kho/tiền phải kiểm tra lại tại thời điểm xác nhận, không tin dữ liệu đã xem từ vài phút trước.  
* Ưu tiên một nguồn sự thật cho khách, bộ vật lý, đơn và giao dịch tiền để tránh lịch sử bị chia nhỏ.

## **1.3. Quyết định nghiệp vụ đã chốt cho MVP**

| Hạng mục | Quyết định cuối cùng |
| :---- | :---- |
| Refund | Staff có permission `payments.refund` tự chuyển tiền ngoài hệ thống và chỉ ghi nhận refund sau khi chuyển thành công. Không có bước manager duyệt và không gọi API refund tự động của SePay trong MVP. |
| Số tiền refund | Hệ thống tính mức hoàn tối đa từ payment `SUCCEEDED`, ưu tiên tiền cọc và khoản chuyển dư, sau khi trừ phí và các refund đã ghi nhận. Staff không được nhập vượt mức này. |
| Customer claim | Customer do staff tạo tại quầy được claim khi khách xác minh đúng email bằng OTP; dùng lại `User` và `Customer` cũ, không tạo hồ sơ mới. |
| Google link | Nếu Google trả về email đã xác minh trùng với `User` hợp lệ, hệ thống gắn `AuthIdentity` Google vào User cũ. |
| Customer merge | Không thuộc MVP. Email và số điện thoại unique; staff phải tìm hồ sơ trước khi tạo mới. |
| Audit | Không triển khai audit module/audit log. Chỉ giữ các trường nghiệp vụ cần thiết như `recordedBy`, `processedBy`, `requestedBy`, `createdAt`, `completedAt` và mã giao dịch. |
| Branch | Admin cấu hình operating hours/ngày nghỉ/cutoff theo từng chi nhánh. Đóng chi nhánh là action riêng có kiểm tra nghĩa vụ, không phải cập nhật status tùy ý. |
| Extension | Có trong MVP; chỉ thành công khi toàn bộ unit của đơn không conflict và phụ phí đã được xác nhận. Chưa hỗ trợ gia hạn từng item. |
| Amendment | Cho đổi ngày/size/unit khi đơn ở `CONFIRMED`; release và allocate phải atomically. Không hỗ trợ exchange sau khi đơn `ACTIVE`. |
| Damage/outstanding | Staff ghi nhận tình trạng; branch manager chốt phí. Phí vượt cọc tạo outstanding balance và chặn confirm đơn mới cho đến khi thanh toán hoặc được manager miễn/giảm. |
| State transition | Mọi thay đổi trạng thái phải đi qua action nghiệp vụ và kiểm tra current state; không cho sửa status trực tiếp. |

# **2\. Phạm vi nghiệp vụ đề xuất**

Phạm vi nên được trình bày với giảng viên/chủ studio như một hệ thống quản lý vòng đời thuê trang phục của chuỗi nhiều chi nhánh, không phải ERP tổng hợp. Core value là biết “khách nào thuê bộ nào, ở chi nhánh nào, từ khi nào đến khi nào, tiền/cọc ra sao, và bộ đó đang ở trạng thái nào”.

| Nhóm | Nên thuộc MVP | Không nên kéo vào MVP |
| :---- | :---- | :---- |
| Khách hàng | Hồ sơ khách; online \+ tại quầy; lịch sử thuê; ghi chú cơ bản | Campaign marketing, loyalty phức tạp, segmentation nâng cao |
| Đơn thuê | Online; tại quầy; xác nhận; giao; đang thuê; gia hạn; trả; hủy/no-show | Giao tận nơi, marketplace, thuê qua đối tác ngoài |
| Kho | Model/variant/unit; barcode; READY/CLEANING/REPAIR/TRANSFER/RETIRED; điều chuyển | Mua hàng, nhà cung cấp, kế toán kho đầy đủ |
| Tiền | Tiền thuê; cọc; phụ phí; refund; còn nợ | Kế toán sổ cái, hóa đơn điện tử tích hợp sâu nếu môn không yêu cầu |
| Đa chi nhánh | Phân quyền theo chi nhánh; tồn theo chi nhánh; báo cáo theo chi nhánh | Nhận ở A trả ở B trong MVP |
| CRM | Hồ sơ, lịch sử, tương tác/case nếu còn thời gian | Automation marketing, loyalty, lead pipeline |

# **3\. Quy ước đánh giá**

| Mức | Ý nghĩa | Ví dụ |
| :---- | :---- | :---- |
| P0 \- Critical | Có thể cho thuê sai bộ, mất/ghi sai tiền, mất lịch sử hoặc tạo dữ liệu mâu thuẫn | Cho hai đơn cùng một barcode; hoàn cọc hai lần; merge nhầm khách. |
| P1 \- High | Chặn một tình huống vận hành thực tế thường gặp hoặc làm nhân viên không thể xử lý đúng | Không gia hạn được; không đóng chi nhánh đúng cách; đổi size làm mất allocation. |
| P2 \- Medium | Không làm mất dữ liệu nhưng tạo nhiều thao tác, dễ nhầm hoặc trải nghiệm kém | Bắt admin tự request rồi tự approve transfer; bắt tạo cleaning thủ công. |
| P3 \- Low | Cải thiện chất lượng/khả năng mở rộng, chưa cần cho MVP | Loyalty, campaign, tối ưu nâng cao. |

| Trạng thái coverage | Diễn giải |
| :---- | :---- |
| ĐÃ CÓ | Nghiệp vụ/rule đã được mô tả tương đối rõ trong nguồn hiện hành. |
| MỘT PHẦN | Có dữ liệu/trạng thái hoặc ý tưởng nhưng chưa khép kín toàn bộ luồng/ngoại lệ. |
| THIẾU | Chưa có rule rõ hoặc dễ phát sinh mâu thuẫn nếu triển khai theo mô tả hiện tại. |
| NGOÀI MVP | Nên chủ động không làm để giữ scope. |

# **4\. Tác nhân và trách nhiệm**

| Tác nhân | Nhiệm vụ nên có | Không nên mặc định cho phép |
| :---- | :---- | :---- |
| Customer | Xem catalog/khả dụng; gửi yêu cầu; xem/hủy đơn của mình; cập nhật hồ sơ; theo dõi tiền/refund | Xem dữ liệu khách khác; tự đổi unit; tự sửa phí/cọc. |
| Sales Staff | Tạo đơn tại quầy; duyệt/xác nhận; giao; nhận trả; ghi tiền; tra lịch sử khách trong phạm vi | Sửa policy/giá toàn chuỗi; xem khách toàn chuỗi nếu không có ngữ cảnh nghiệp vụ. |
| Inventory Staff | Nhận unit; kiểm tình trạng; cleaning/repair; kiểm kê; transfer | Thu tiền hoặc sửa CRM nếu không được cấp quyền. |
| Admin/Manager | Chi nhánh; nhân viên; role/permission; catalog; policy; báo cáo; xử lý ngoại lệ | Không được bỏ qua business rule hoặc sửa trực tiếp dữ liệu giao dịch đã hoàn tất. |

Nguyên tắc: role chỉ là cách gom quyền. Quyết định cuối cùng phải dựa trên permission \+ branch scope \+ trạng thái đối tượng. Một nhân viên có thể làm nhiều chi nhánh, nhưng không vì vậy mà mặc định có quyền ALL toàn chuỗi.

# **5\. Quản lý chi nhánh**

## **Thiết kế hiện tại**

Nguồn hiện hành có Branch với mã, tên, địa chỉ, điện thoại, timezone và ACTIVE/INACTIVE. Tài liệu lịch sử từng yêu cầu giờ hoạt động/cấu hình nhận-trả nhưng nguồn hiện hành chưa thể hiện thành rule đầy đủ.

| Đánh giá khả năng vận hành Đúng hướng, nhưng “xóa/sửa/đóng chi nhánh” phải được đối xử như nghiệp vụ lịch sử chứ không phải CRUD thông thường. |
| :---- |

## **Flow đề xuất**

Tạo chi nhánh \-\> cấu hình thông tin và giờ hoạt động \-\> gán nhân viên/tồn kho \-\> ACTIVE. Khi ngừng: kiểm tra ràng buộc \-\> chuyển đơn/tài sản cần thiết \-\> INACTIVE. Không xóa vật lý chi nhánh đã từng phát sinh nghiệp vụ.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-BR-01 | Mã chi nhánh duy nhất; tên có thể đổi nhưng mã nghiệp vụ không tái sử dụng. |
| BR-BR-02 | Chi nhánh đã có order/unit/transfer hoặc dữ liệu nghiệp vụ tham chiếu không được xóa vật lý. |
| BR-BR-03 | Chỉ cho INACTIVE khi không còn ACTIVE rental, future confirmed order, transfer đang chạy và unit chưa được xử lý theo policy đóng chi nhánh. |
| BR-BR-04 | Địa chỉ/điện thoại hiện tại có thể sửa; chứng từ lịch sử quan trọng nên giữ snapshot thông tin tại thời điểm giao dịch nếu hệ thống có in biên nhận. |
| BR-BR-05 | Chi nhánh INACTIVE không nhận đơn mới, không được chọn làm điểm transfer đến, nhưng vẫn hiển thị trong lịch sử. |
| BR-BR-06 | Cần giờ mở cửa/ngày nghỉ/cutoff nhận-trả để no-show và booking hợp lệ. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Admin thêm chi nhánh mới | Cho tạo khi mã không trùng, địa chỉ hợp lệ, timezone/giờ hoạt động được cấu hình. Ban đầu chưa có tồn kho/nhân viên vẫn được nhưng chưa nhận đơn nếu policy yêu cầu. | MỘT PHẦN | P1 |
| Sửa địa chỉ chi nhánh | Cho sửa thông tin hiện tại; không làm mất lịch sử các đơn cũ. Nếu có chứng từ lịch sử, snapshot địa chỉ cũ. | MỘT PHẦN | P2 |
| Xóa chi nhánh đã từng có đơn | Từ chối xóa; hướng người dùng sang “Ngừng hoạt động”. | ĐÃ CÓ Ý | P0 |
| Ngừng chi nhánh còn khách đang thuê | Chặn. Liệt kê số đơn ACTIVE/RETURN\_INSPECTION và hướng xử lý. | THIẾU | P0 |
| Ngừng chi nhánh còn đơn tương lai | Chặn hoặc bắt chuyển/hủy từng đơn có xác nhận; không âm thầm vô hiệu hóa. | THIẾU | P0 |
| Ngừng chi nhánh còn unit READY/CLEANING/REPAIR | Yêu cầu retire hoặc transfer unit trước khi đóng hoàn toàn. | THIẾU | P1 |
| Chi nhánh đóng ngày lễ nhưng khách chọn giờ nhận | Booking phải kiểm lịch mở cửa; đề nghị khung giờ/chi nhánh khác. | THIẾU | P1 |
| Đổi timezone/giờ hoạt động | Chỉ ảnh hưởng cách hiển thị/lịch mới; không được dịch chuyển timestamp lịch sử đã chốt. | THIẾU | P1 |

## **Thay đổi tối thiểu khuyến nghị**

* Bổ sung operating hours/holiday overrides/cutoff hoặc tối thiểu một cấu hình giờ mở cửa đơn giản.  
* Bổ sung màn/flow “Đóng chi nhánh” dạng checklist thay vì nút delete.

# **6\. Nhân viên, phân công chi nhánh và phân quyền**

## **Thiết kế hiện tại**

Repo đã phân biệt User/Employee, role, permission và assignment theo branch. Một người có thể có nhiều role/chi nhánh.

| Đánh giá khả năng vận hành Nền tảng tốt; cần policy vòng đời assignment để xử lý nhân viên nghỉ/chuyển chi nhánh và tránh mất dấu quyền cũ. |
| :---- |

## **Flow đề xuất**

Admin tạo nhân viên \-\> PENDING \-\> nhân viên xác thực \-\> ACTIVE \-\> gán role theo chi nhánh. Khi đổi công việc: kết thúc assignment cũ \+ tạo assignment mới. Khi nghỉ: TERMINATED/INACTIVE, quyền hết hiệu lực nhưng lịch sử actor vẫn giữ.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-ST-01 | Nhân viên chỉ thao tác trên branch mà assignment còn hiệu lực và có permission tương ứng. |
| BR-ST-02 | Không hardcode chức danh; một người có thể nhiều role nhưng quyền hiệu lực là hợp các role hợp lệ trong đúng branch. |
| BR-ST-03 | Không xóa nhân viên đã tham gia giao dịch; dùng TERMINATED/INACTIVE. |
| BR-ST-04 | Không được vô tình loại bỏ quản trị viên cuối cùng có quyền quản lý phân quyền. |
| BR-ST-05 | Assignment nên có ngày hiệu lực/hết hiệu lực nếu có hỗ trợ tạm thời đa chi nhánh. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Nhân viên được phân 2 role cùng chi nhánh | Giữ đồng thời cả hai; không ghi đè role cũ. | ĐÃ CÓ | P1 |
| Nhân viên hỗ trợ chi nhánh khác 1 tuần | Nên có effective period; hết hạn tự mất quyền tại branch phụ. | THIẾU | P2 |
| Nhân viên nghỉ việc khi đang là người xử lý case/transfer | Khóa quyền mới nhưng giữ actor lịch sử; reassign các công việc đang mở. | MỘT PHẦN | P1 |
| Admin bỏ quyền chính mình | Cho phép nếu vẫn còn ít nhất một admin khác đủ quyền; nếu là người cuối cùng thì chặn. | MỘT PHẦN | P0 |
| Nhân viên đang mở màn hình thì bị thu hồi quyền | Thao tác tiếp theo phải bị từ chối và UI yêu cầu tải lại; không lưu nửa chừng. | ĐÃ CÓ Ý | P0 |
| Nhân viên branch A biết mã đơn branch B | Không cho xem/xử lý chỉ nhờ sửa URL/mã đơn. | ĐÃ CÓ | P0 |

# **7\. Khách hàng và liên kết tài khoản online/offline**

## **Thiết kế hiện tại**

Khách tại quầy vẫn có User \+ Customer dù chưa có password hoặc auth identity. Staff tìm customer theo email, số điện thoại hoặc mã khách. Email/số điện thoại là unique để hạn chế tạo trùng.

| Đánh giá khả năng vận hành Flow claim bằng email OTP và link Google theo email đã xác minh đã có trong auth. MVP không triển khai merge customer. |
| :---- |

## **Flow đề xuất**

Tại quầy: tìm email/số điện thoại/mã khách \-\> nếu có dùng customer cũ \-\> nếu chưa có tạo User \+ Customer nội bộ. Online bằng email/password: khách xác minh OTP của đúng email \-\> hệ thống cập nhật password và `emailVerifiedAt` trên User cũ. Online bằng Google: nếu Google xác minh email trùng User hợp lệ \-\> tạo `AuthIdentity` trỏ vào User cũ. Mọi đơn tiếp tục trỏ cùng Customer.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-CU-01 | Không tự link hoặc tạo account dựa trên tên. |
| BR-CU-02 | Claim/link online chỉ dùng email đã được OTP hoặc Google xác minh. |
| BR-CU-03 | Không triển khai merge Customer trong MVP; khi phát hiện hồ sơ trùng phải dừng tạo mới và xử lý dữ liệu ngoài flow vận hành. |
| BR-CU-04 | Sau khi khách online claim hồ sơ tại quầy, lịch sử offline hợp lệ phải xuất hiện trong “Đơn của tôi”. |
| BR-CU-05 | Nhân viên branch không được duyệt toàn bộ hồ sơ toàn chuỗi chỉ vì biết số điện thoại; chỉ dữ liệu cần cho nghiệp vụ. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Khách mới đến quầy, chưa có account | Tìm trước theo email/SĐT; nếu chưa có thì tạo User \+ Customer nội bộ rồi tạo đơn. | ĐÃ CÓ | P1 |
| Khách cũ quay lại quầy | Tìm theo SĐT/mã khách và dùng hồ sơ cũ; không tạo khách mới. | ĐÃ CÓ Ý | P1 |
| Khách offline sau này đăng ký email/password | Claim hồ sơ sau OTP email; password và emailVerifiedAt được gắn vào User cũ. | ĐÃ CÓ | P0 |
| Khách offline sau này đăng nhập Google cùng email | Tạo AuthIdentity Google trên User cũ; không tạo Customer mới. | ĐÃ CÓ | P0 |
| Khách online sau này thuê tại quầy | Nhân viên tìm theo SĐT/mã và tạo đơn vào cùng customer. | MỘT PHẦN | P1 |
| Hai người trùng tên | Không tự merge. | ĐÃ CÓ Ý | P0 |
| Một người đổi số điện thoại | Cho cập nhật nếu số mới chưa được dùng; không làm thay đổi User/Customer hoặc lịch sử đơn. | MỘT PHẦN | P1 |
| Hai hồ sơ vô tình cùng người | Không merge trong MVP; khóa thao tác tạo thêm và chuyển cho admin xử lý dữ liệu. | NGOÀI MVP | P2 |
| Khách không nhớ SĐT cũ | Nhân viên tìm thêm bằng mã/ tên \+ thông tin xác minh; không tự tạo mới nếu nghi ngờ trùng. | THIẾU | P2 |

## **Thay đổi tối thiểu khuyến nghị**

* Không cần thêm trạng thái identity riêng: `passwordHash`, `emailVerifiedAt` và `AuthIdentity` thể hiện khả năng đăng nhập hiện tại.  
* Giữ email/SĐT unique và dùng lại User cũ khi claim/link. Merge Customer để phase sau.

# **8\. Danh mục mẫu, biến thể và phụ kiện**

## **Thiết kế hiện tại**

Thiết kế phân biệt model \-\> variant \-\> physical unit; giá thuê/cọc/thay thế ở variant; phụ kiện chuẩn ở model và snapshot phụ kiện thực giao ở order item.

| Đánh giá khả năng vận hành Rất phù hợp ngành cho thuê. Cần chú ý vòng đời thay đổi catalog để không làm đơn cũ biến đổi theo master mới. |
| :---- |

## **Flow đề xuất**

Tạo model \-\> tạo variant size/màu/edition \-\> cấu hình giá/cọc/replacement \-\> tạo physical units \-\> READY mới cho thuê. Khi ngừng bán/thuê, chuyển INACTIVE thay vì xóa nếu đã có lịch sử.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-CA-01 | Model/variant đã từng xuất hiện trong đơn không xóa làm mất lịch sử; dùng inactive. |
| BR-CA-02 | Đơn đã xác nhận giữ snapshot tên/giá/cọc/phụ kiện cần thiết để giải thích giao dịch sau này. |
| BR-CA-03 | Variant không có giá hiệu lực hoặc không có unit hợp lệ không nhận booking. |
| BR-CA-04 | Một unit vật lý chỉ thuộc một variant tại một thời điểm; không đổi variant tùy tiện sau khi đã có lịch sử. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Admin đổi tên mẫu | Catalog mới dùng tên mới; đơn cũ nên giữ snapshot/đủ thông tin để không khó hiểu. | MỘT PHẦN | P2 |
| Admin xóa variant đã có đơn | Không xóa vật lý; chuyển inactive. | MỘT PHẦN | P0 |
| Giá/cọc thay đổi | Đơn cũ giữ snapshot; đơn mới dùng giá hiệu lực mới. | ĐÃ CÓ | P0 |
| Phụ kiện chuẩn thay đổi | Đơn đã giao giữ snapshot quantity/giá thay thế cũ. | ĐÃ CÓ | P1 |
| Unit đặc biệt giá khác | Tạo variant/SKU riêng hoặc cơ chế giá riêng rõ; không sửa giá chung tạm thời. | MỘT PHẦN | P1 |
| Variant hết toàn bộ unit nhưng vẫn active | Catalog có thể hiển thị nhưng phải báo không khả dụng; không nhận xác nhận sai. | ĐÃ CÓ Ý | P1 |

# **9\. Bộ trang phục vật lý, barcode và vòng đời tài sản**

## **Thiết kế hiện tại**

Physical unit có unit code, branch hiện tại, condition grade và operational status INBOUND/READY/CLEANING/REPAIR/IN\_TRANSFER/RETIRED; có unit events.

| Đánh giá khả năng vận hành Đây là một trong các phần chặt nhất của thiết kế. Nên giữ đơn giản bằng scan barcode và tự sinh event. |
| :---- |

## **Flow đề xuất**

Đăng ký unit \-\> INBOUND \-\> chi nhánh nhận/kiểm \-\> READY. Trong vòng đời: READY \<-\> CLEANING/REPAIR, READY \-\> IN\_TRANSFER \-\> READY tại branch mới, cuối đời \-\> RETIRED.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-UN-01 | Barcode/unit\_code không tái sử dụng, kể cả unit retired. |
| BR-UN-02 | Chỉ READY và không có block/lịch chiếm dụng mới có thể được gán cho đơn. |
| BR-UN-03 | Mọi đổi branch/status/condition quan trọng tạo unit event. |
| BR-UN-04 | RETIRED không quay lại READY trừ flow phục hồi được quản lý đặc biệt; MVP nên coi là kết thúc. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Quét barcode không tồn tại | Báo “không tìm thấy”, giữ màn hiện tại, không hiển thị dữ liệu cũ. | ĐÃ CÓ | P1 |
| Barcode thuộc branch khác | Báo rõ branch sở hữu; không cho thao tác nhầm. | ĐÃ CÓ | P0 |
| Barcode đang CLEANING/REPAIR | Không cho gán/giao. | ĐÃ CÓ | P0 |
| Barcode đã RETIRED | Không cho thuê; chỉ xem lịch sử. | ĐÃ CÓ Ý | P0 |
| Hai nhân viên cùng sửa condition/status | Cần optimistic version hoặc transactional rule; người sau phải tải lại. | MỘT PHẦN | P0 |
| Mất/nhòe barcode vật lý | Cho tra cứu unit bằng mã khác/tìm kiếm, sau đó in lại tem; không tạo unit mới để “thay barcode”. | THIẾU | P2 |
| Unit nhập sai variant khi tạo | Nếu chưa phát sinh nghiệp vụ có thể sửa; nếu đã giao dịch thì chỉ manager có quyền correction và không làm sai lịch sử đơn. | THIẾU | P1 |

# **10\. Khả dụng và chống trùng lịch**

## **Thiết kế hiện tại**

Đơn chờ chưa giữ unit; khi xác nhận mới gán unit. Database design có khoảng occupied và exclusion chống cùng unit bị HELD/CONFIRMED/ACTIVE chồng thời gian; unit blocks cũng làm không khả dụng.

| Đánh giá khả năng vận hành Nền đúng và cần giữ. Điều quan trọng là giải thích rõ “xem còn” không đồng nghĩa “đã giữ”. |
| :---- |

## **Flow đề xuất**

Khách chọn branch \+ khoảng thuê \+ variant \-\> hệ thống ước lượng availability \-\> gửi yêu cầu \-\> khi staff confirm mới khóa/gán từng physical unit trong transaction.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-AV-01 | Availability là kết quả tại thời điểm kiểm tra, không phải reservation trừ khi đơn đã được xác nhận. |
| BR-AV-02 | Xác nhận phải re-check unit status, branch, active blocks, overlapping allocations và cleaning buffer. |
| BR-AV-03 | Khoảng occupied nên bao gồm thời gian vệ sinh/chuẩn bị cần thiết hoặc có block tương đương. |
| BR-AV-04 | Một đơn nhiều bộ chỉ thành công khi có đủ số unit; tránh xác nhận nửa đơn nếu UX không hỗ trợ partial confirmation. |
| BR-AV-05 | Allocation còn ACTIVE vẫn làm unit không khả dụng sau plannedDueAt cho đến khi thực nhận; không suy ra đã trả chỉ từ thời hạn kế hoạch. |
| BR-AV-06 | Xếp lịch kế tiếp phải áp dụng thời gian đệm khả dụng sau giờ trả; không dùng lateGraceMinutes thay cho buffer. |
| BR-AV-07 | Nếu đơn ACTIVE trễ ảnh hưởng đơn CONFIRMED kế tiếp, giữ cam kết đơn sau và tạo tác vụ xử lý liên kết hai đơn. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Hai khách cùng gửi request một bộ | Cả hai request có thể tồn tại; người được xác nhận trước lấy unit, request sau phải chọn unit khác/từ chối. | ĐÃ CÓ | P0 |
| Hai staff confirm đồng thời cùng unit | Tối đa một transaction thành công; người kia nhận conflict và chọn lại. | ĐÃ CÓ Ý | P0 |
| Unit trống trong ngày thuê nhưng có cleaning block | Không tính khả dụng trong block. | ĐÃ CÓ | P0 |
| Khách đổi ngày sau khi xem quote | Quote/availability cũ vô hiệu; phải check lại. | MỘT PHẦN | P0 |
| Đơn nhiều bộ, chỉ còn 1/2 | Không tự xác nhận thiếu; đề xuất đổi mẫu/ngày hoặc tách đơn nếu business chấp nhận. | THIẾU | P1 |
| Unit có booking kế tiếp quá sát giờ trả | Tính khoảng đệm khả dụng trước khi xác nhận; nếu không đủ thì chọn unit khác hoặc từ chối lịch. | THIẾU | P0 |
| Khách thuê ở giữa quá hạn, cùng unit có đơn sau đã xác nhận | Giữ nguyên đơn sau; gắn cảnh báo A/B; không giao cho đến khi unit READY hoặc có unit thay thế hợp lệ. | THIẾU | P0 |
| Availability tra cứu lịch tương lai khi allocation trước vẫn ACTIVE sau plannedDueAt | Tính unit vẫn ở khách tới khi nhận thực tế; không chỉ dựa occupiedUntil theo kế hoạch. | THIẾU | P0 |

# **11\. Đặt thuê online**

## **Thiết kế hiện tại**

Flow hiện tại: browse \-\> chọn branch/kỳ \-\> quote \-\> nhập người thuê \-\> gửi request PENDING\_CONFIRMATION; chưa giữ unit cho đến staff confirm.

| Đánh giá khả năng vận hành Hợp lý cho MVP, nhưng cần giảm bước và phân biệt rõ quote, request và confirmed reservation. |
| :---- |

## **Flow đề xuất**

Khách chọn \-\> xem availability/giá \-\> gửi request \-\> nhận mã \-\> staff duyệt \-\> confirmed hoặc rejected. Khách luôn thấy trạng thái và lý do nếu bị từ chối/hết hạn.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-ON-01 | Request phải có branch, kỳ thuê, variant/quantity, customer và quote/policy snapshot. |
| BR-ON-02 | PENDING\_CONFIRMATION phải hiển thị rõ “chưa giữ trang phục”. |
| BR-ON-03 | Nếu quote hết hạn trước khi staff xác nhận, yêu cầu refresh/requote hoặc rule rõ để giữ giá; không âm thầm tăng tiền. |
| BR-ON-04 | Nếu staff reject, nên bắt lý do đủ để khách hiểu và hỗ trợ chọn phương án khác. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Khách mất mạng khi submit | Idempotency/request token để retry không tạo 2 request; UI giữ dữ liệu. | THIẾU | P0 |
| Khách double-click nút gửi | Chỉ tạo một request. | THIẾU | P0 |
| Quote hết hạn giữa lúc submit | Từ chối với thông báo cập nhật giá/lịch; không tạo request mập mờ. | ĐÃ CÓ Ý | P1 |
| Khách đóng trang sau khi submit | Request vẫn tồn tại; có thể xem trong account/lịch sử. | MỘT PHẦN | P1 |
| Khách chọn branch inactive | Không cho chọn/submit. | THIẾU | P0 |
| Khách nhập SĐT trùng hồ sơ cũ | Nếu chưa đăng nhập, có thể match sau xác minh; tránh tự chiếm lịch sử người khác. | THIẾU | P0 |
| Staff không xử lý request lâu | Có SLA/expiry/notification; nhưng cần dựa trên giờ hoạt động branch. | MỘT PHẦN | P1 |

# **12\. Tạo đơn tại quầy**

## **Thiết kế hiện tại**

Repo có màn tạo tại quầy, tìm/tạo khách, chọn trang phục/kỳ, lấy quote rồi tạo yêu cầu. Hiện concept vẫn gần flow online vì tạo PENDING\_CONFIRMATION trước.

| Đánh giá khả năng vận hành Cần rút gọn. Khách đang đứng tại quầy không nên bị bắt qua hàng đợi giống online nếu nhân viên có quyền xác nhận. |
| :---- |

## **Flow đề xuất**

Tìm/tạo khách \-\> quét/chọn bộ hoặc chọn variant \-\> chọn kỳ \-\> quote \-\> staff xác nhận ngay (CONFIRMED). Nếu chưa muốn gán unit ngay thì tối thiểu có nút “Tạo & xác nhận” trong cùng màn.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-CT-01 | Nhân viên phải tìm customer trước; một kết quả chính xác có thể auto-select để giảm thao tác. |
| BR-CT-02 | Nếu staff có rentals.manage.branch và đủ unit, cho xác nhận trực tiếp tại quầy. |
| BR-CT-03 | Không tạo customer trùng nếu SĐT đã tồn tại. |
| BR-CT-04 | Order channel phải phân biệt COUNTER/ONLINE để báo cáo và áp dụng đúng flow. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Khách có hồ sơ cũ | Tìm bằng SĐT/mã, chọn đúng hồ sơ, tạo vào lịch sử cũ. | ĐÃ CÓ | P1 |
| Khách mới | Tạo customer tối thiểu tên \+ SĐT rồi tiếp tục; không bắt Google login. | ĐÃ CÓ | P1 |
| Nhân viên tạo customer trùng SĐT | Chặn và mở hồ sơ hiện có. | THIẾU | P0 |
| Khách muốn lấy đồ ngay | Cho tạo \+ confirm \+ handover liên tục, không qua hàng đợi dư thừa. | THIẾU | P1 |
| Không đủ unit tại quầy | Không xác nhận; đề xuất ngày/branch/variant khác. | MỘT PHẦN | P1 |
| Nhân viên branch A tạo đơn cho branch B | Chỉ cho nếu có quyền branch B; mặc định rentalBranch \= branch đang làm việc. | MỘT PHẦN | P0 |

# **13\. Duyệt, xác nhận và gán physical unit**

## **Thiết kế hiện tại**

PENDING\_CONFIRMATION \-\> CONFIRMED, mỗi line được gán unit và database chống overlap. Có optimistic version ở order.

| Đánh giá khả năng vận hành Chặt về dữ liệu. Nên tối ưu để staff chỉ cần chọn/scan đủ unit rồi xác nhận một lần. |
| :---- |

## **Flow đề xuất**

Mở request \-\> xem khách/kỳ/quote \-\> hệ thống gợi ý eligible units \-\> staff scan/chọn đủ \-\> confirm transaction \-\> snapshot giá/policy/promotion \-\> unit allocation CONFIRMED.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-CF-01 | Confirm chỉ từ trạng thái hợp lệ và version hiện tại. |
| BR-CF-02 | Mỗi item phải có unit hợp lệ, cùng branch, đúng variant, READY và không conflict. |
| BR-CF-03 | Không dùng cùng barcode cho hai item trong cùng đơn. |
| BR-CF-04 | Confirm thất bại phải rollback toàn bộ allocation của thao tác, trừ khi business cố ý hỗ trợ partial confirmation. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Khách hủy trong lúc staff đang duyệt | Confirm bị từ chối, không giữ unit; staff thấy trạng thái mới. | ĐÃ CÓ Ý | P0 |
| Staff khác vừa sửa đơn | Version conflict; tải lại trước khi xử lý tiếp. | ĐÃ CÓ | P0 |
| Unit vừa được đơn khác lấy | Conflict; giữ các lựa chọn UI nhưng bắt chọn lại unit bị xung đột. | ĐÃ CÓ Ý | P0 |
| Chọn nhầm barcode khác variant | Chặn. | ĐÃ CÓ Ý | P0 |
| Unit bị chuyển CLEANING sau khi staff mở màn | Re-check lúc confirm, không tin snapshot cũ. | MỘT PHẦN | P0 |
| Promotion hết usage trong lúc confirm | Re-check promotion; thông báo giá mới và yêu cầu staff/khách xác nhận nếu tổng tiền đổi. | THIẾU | P1 |

# **14\. Chuẩn bị và giao trang phục**

## **Thiết kế hiện tại**

Flow có PREPARING/READY\_FOR\_PICKUP \-\> ACTIVE, barcode, condition, phụ kiện và thu rental \+ deposit lúc giao.

| Đánh giá khả năng vận hành Nghiệp vụ đúng; tránh bắt staff bấm PREPARING rồi READY bằng tay nếu không cần. “Giao” nên là thao tác chính. |
| :---- |

## **Flow đề xuất**

Mở đơn confirmed \-\> scan từng barcode \-\> kiểm tình trạng/phụ kiện \-\> ghi tiền thực nhận \-\> xác nhận giao \-\> ACTIVE; picked\_up\_at và actor được ghi.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-HO-01 | Không giao unit không thuộc allocation hoặc sai branch. |
| BR-HO-02 | Nếu policy yêu cầu rental \+ deposit trước giao, chỉ ACTIVE khi đủ điều kiện tiền; ngoại lệ phải có permission/lý do. |
| BR-HO-03 | Condition/phụ kiện lúc giao phải được snapshot để so sánh lúc trả. |
| BR-HO-04 | Thời điểm giao thực tế không tự động lùi planned due date trừ khi có thao tác gia hạn/điều chỉnh hợp lệ. |
| BR-HO-05 | Ngay trước handover phải khóa và re-check unit đúng branch, READY, không còn allocation ACTIVE khác hoặc block; conflict thì không chuyển đơn sang ACTIVE. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Khách đến sớm | Cho giao nếu unit READY, không conflict với đơn trước và policy cho phép; cập nhật actual pickup. | THIẾU | P1 |
| Khách đến muộn nhưng trong grace | Giao bình thường; due không tự lùi. | MỘT PHẦN | P1 |
| Khách đến sau khi đã NO\_SHOW | Không tự giao; cần reopen/đơn mới theo rule nếu unit còn. | THIẾU | P1 |
| Quét thiếu một unit trong đơn 2 bộ | Không cho giao toàn đơn nếu không hỗ trợ partial handover; hoặc định nghĩa partial handover rõ. | THIẾU | P1 |
| Một phụ kiện bị thiếu ngay trước giao | Điều chỉnh checklist/snapshot hoặc đổi unit/phụ kiện trước khi ACTIVE; khách xác nhận. | MỘT PHẦN | P1 |
| Unit của khách trước chưa được trả khi khách sau đến nhận | Chặn bàn giao barcode đó; giữ nguyên đơn sau và mở xử lý thay thế; không tạo hai allocation ACTIVE trên một unit. | THIẾU | P0 |
| Chuyển khoản đang chờ đối soát | Không coi là đã thu; không giao nếu policy yêu cầu confirmed payment. | ĐÃ CÓ | P0 |
| Nhân viên nhập sai số tiền mặt | Không sửa mất dấu sau khi chốt; tạo correction/reversal có lý do. | THIẾU | P0 |

# **15\. Đơn đang thuê: gia hạn, đổi ngày, đổi bộ/size**

## **Thiết kế hiện tại**

Current source mô tả ACTIVE và trả trễ nhưng chưa có flow nghiệp vụ riêng cho extension/amendment.

| Đánh giá khả năng vận hành Đã chốt nghiệp vụ cho MVP; cần triển khai API/service theo rule bên dưới. |
| :---- |

## **Flow đề xuất**

ACTIVE \-\> “Gia hạn” \-\> nhập due mới \-\> re-check toàn bộ unit \+ cleaning buffer \+ policy \-\> tính phụ thu \-\> xác nhận \-\> cập nhật planned\_due\_at và tạo khoản `EXTRA`. MVP chỉ gia hạn toàn đơn, không gia hạn từng item. Với đổi ngày/unit/size khi `CONFIRMED`, xử lý như amendment có release \+ allocate trong một transaction. Không hỗ trợ exchange sau `ACTIVE`.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-AM-01 | Mọi thay đổi sau CONFIRMED phải đi qua action extension/amendment; không cho cập nhật trực tiếp các field lịch/unit. |
| BR-AM-02 | Gia hạn chỉ được chấp nhận nếu tất cả unit cần giữ không conflict với allocation/block tương lai. |
| BR-AM-03 | Giá phát sinh phải theo policy đã chốt cho đơn hoặc rule amendment được định nghĩa rõ; không tự dùng bảng giá mới nếu làm khách bất ngờ. |
| BR-AM-04 | Đổi size/bộ phải release unit cũ và allocate unit mới atomically để không mất reservation giữa chừng. |
| BR-AM-05 | Đổi chi nhánh trong MVP nên hủy/tạo đơn mới thay vì chuyển location giữa đơn đã xác nhận. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Khách đang thuê xin thêm 2 ngày | Kiểm lịch toàn bộ unit; nếu trống thì báo phụ thu và gia hạn. | THIẾU | P1 |
| Một trong 2 unit có booking kế tiếp | Từ chối gia hạn toàn đơn; MVP chưa hỗ trợ item-level extension. | ĐÃ CHỐT | P1 |
| Khách xin đổi size trước khi nhận | Tìm unit size mới; swap allocation transaction; cập nhật giá/cọc nếu khác và yêu cầu xác nhận. | THIẾU | P1 |
| Khách xin đổi size sau khi đã ACTIVE | Không hỗ trợ trong MVP; khách trả unit cũ và tạo đơn mới nếu cần. | NGOÀI MVP | P1 |
| Khách xin đổi giờ trả sớm hơn | Cho cập nhật nếu không tạo refund tiền thuê tự động; history lưu. | THIẾU | P2 |
| Khách xin đổi chi nhánh nhận sau confirmed | MVP: hủy/rebook tại branch khác nếu còn hàng; không đổi branch trực tiếp. | THIẾU | P1 |

# **16\. Nhận trả toàn phần và trả một phần**

## **Thiết kế hiện tại**

Repo đã nghĩ đến partial return: đơn nhiều bộ có thể trả một phần, các bộ còn ở khách vẫn ACTIVE; chỉ quyết toán khi đủ điều kiện.

| Đánh giá khả năng vận hành Rất tốt và thực tế. Cần item-level return status rõ để tránh chỉ dựa trên order status. |
| :---- |

## **Flow đề xuất**

Quét unit trả \-\> xác minh thuộc đơn/đang ACTIVE \-\> ghi condition/phụ kiện \-\> đánh dấu item returned \-\> nếu còn item ở khách, order vẫn ACTIVE; khi tất cả returned hoặc có biên bản missing \-\> RETURN\_INSPECTION \-\> settlement \-\> COMPLETED.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-RT-01 | Không nhận trả barcode không thuộc order/khách đang giữ. |
| BR-RT-02 | Mỗi item có trạng thái/return timestamp riêng; order status chỉ tổng hợp. |
| BR-RT-03 | Partial return không được hoàn toàn bộ cọc nếu còn unit ở khách, trừ policy item-level deposit rõ. |
| BR-RT-04 | Sau return, unit không tự READY trước khi có kết quả inspection/cleaning. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Đơn 2 bộ trả 1 bộ | Nhận 1 bộ; danh sách đang thuê chỉ còn bộ kia; order chưa completed. | ĐÃ CÓ | P0 |
| Quét cùng barcode trả 2 lần | Lần 2 báo đã nhận trước đó; không tạo thêm fee/refund/event. | THIẾU | P0 |
| Barcode thuộc đơn khác | Chặn và hiển thị đúng order tham chiếu cho staff có quyền. | MỘT PHẦN | P0 |
| Khách trả phụ kiện thiếu | Ghi quantityReturned, fee/replacement theo policy; không mất snapshot phụ kiện lúc giao. | ĐÃ CÓ | P0 |
| Khách trả sớm | Nhận bình thường; không tự refund tiền thuê trừ policy cho phép. | THIẾU | P1 |
| Khách trả sau giờ đóng cửa | Cần policy: không nhận ngoài giờ hoặc ghi actual return bởi người có quyền; phí trễ dựa rule rõ. | THIẾU | P1 |

# **17\. Hư hỏng, mất đồ và chờ đánh giá**

## **Thiết kế hiện tại**

Order có inspectionStatus gồm PENDING\_ASSESSMENT/HAS\_DAMAGE/HAS\_MISSING\_ITEM; item/accessory có damage/missing fee và evidence key.

| Đánh giá khả năng vận hành Đã chốt: staff ghi nhận tình trạng/evidence, branch manager chốt fee; cọc chỉ được hoàn sau khi assessment hoàn tất. |
| :---- |

## **Flow đề xuất**

Nhận trả \-\> staff ghi tình trạng/evidence \-\> nếu fee đã rõ thì branch manager chốt \-\> settle. Nếu chưa định giá: PENDING\_ASSESSMENT \-\> giữ cọc \-\> branch manager đánh giá trong SLA \-\> chốt fee \-\> refund phần còn lại hoặc tạo outstanding \-\> completed.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-DM-01 | Hao mòn thông thường không được tính như damage nếu policy không quy định. |
| BR-DM-02 | Một sự cố không vừa tính repair fee vừa tính full replacement cho cùng thiệt hại. |
| BR-DM-03 | Branch manager là người chốt damage/missing fee; staff nhận trả chỉ ghi nhận tình trạng và evidence. |
| BR-DM-04 | PENDING\_ASSESSMENT phải có due/SLA để không giữ cọc vô thời hạn. |
| BR-DM-05 | Evidence/notes và actor phải đủ để giải thích khoản cấn trừ. |
| BR-DM-06 | Phí vượt cọc tạo outstanding balance thuộc order và được tổng hợp theo customer; outstanding quá hạn chặn confirm đơn mới. |
| BR-DM-07 | Manager có permission mới được miễn/giảm outstanding; thanh toán nợ có thể thực hiện nhiều lần cho đến khi balance bằng 0. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Vết bẩn xử lý ngay được | Ghi fee vệ sinh đặc biệt nếu policy; unit \-\> CLEANING. | MỘT PHẦN | P1 |
| Rách nhưng chưa biết phí sửa | PENDING\_ASSESSMENT, giữ cọc, tạo deadline đánh giá. | MỘT PHẦN | P1 |
| Mất toàn bộ trang phục | Đánh dấu missing; dùng replacement value snapshot; tạo khoản phải thu/cấn cọc. | ĐÃ CÓ Ý | P0 |
| Thiệt hại \> tiền cọc | Cấn toàn bộ cọc và tạo outstanding amount; chặn confirm đơn mới cho đến khi settle hoặc được manager miễn/giảm. | ĐÃ CHỐT | P0 |
| Khách tranh chấp damage | Tạo CRM case/dispute; không sửa/xóa evidence cũ; trạng thái tài chính thể hiện đang tranh chấp nếu cần. | THIẾU | P1 |
| Sau đánh giá xác định không có damage | Chuyển PASSED/COMPLETED và hoàn cọc còn lại; không để fee ảo. | MỘT PHẦN | P0 |

# **18\. Thanh toán, tiền cọc, phụ thu và hoàn tiền**

## **Thiết kế hiện tại**

Payment tách RENTAL/DEPOSIT/EXTRA, có cash/bank transfer/gateway và idempotency. Refund MVP là hoàn thủ công: staff có permission chuyển tiền ngoài hệ thống rồi ghi nhận mã giao dịch; không tích hợp API refund tự động của SePay.

| Đánh giá khả năng vận hành Flow MVP đã chốt; backend phải tự tính refundable amount và chống ghi nhận hoàn vượt mức. |
| :---- |

## **Flow đề xuất**

Giao: ghi rental \+ deposit thực nhận. Trả: tính extra/deduction. Refund thủ công: hệ thống tính mức hoàn tối đa \-\> staff có permission chuyển khoản \-\> nhập số tiền, lý do, mã giao dịch và thời điểm chuyển \-\> tạo refund `COMPLETED`. Nếu chuyển không thành công thì không tạo `COMPLETED`; có thể ghi `FAILED` để theo dõi. Không sửa trực tiếp payment/refund đã thành công; sửa sai bằng bản ghi correction/reversal nghiệp vụ.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-PY-01 | Deposit không phải doanh thu. |
| BR-PY-02 | Payment/refund SUCCEEDED/COMPLETED không được sửa số tiền trực tiếp; sửa sai bằng reversal/correction. |
| BR-PY-03 | Refund không vượt refundable amount: payment đủ điều kiện đã `SUCCEEDED` trừ fee/deduction và các refund `COMPLETED` trước đó. |
| BR-PY-04 | Idempotency cho mọi hành động có thể retry để không thu/hoàn hai lần. |
| BR-PY-05 | Outstanding amount sau cấn cọc cần trạng thái và lịch sử thu tiếp. |
| BR-PY-06 | Chỉ staff có permission `payments.refund` và đúng branch scope mới được ghi nhận refund. |
| BR-PY-07 | Refund thủ công bắt buộc có mã giao dịch ngoài hệ thống duy nhất, thời điểm chuyển, số tiền và lý do. Không có bước manager approve trong MVP. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Thu tiền mặt đủ | Ghi payment succeeded \+ actor \+ paid\_at. | ĐÃ CÓ | P0 |
| Chuyển khoản chưa đối soát | Giữ pending; không coi là đã thu. | ĐÃ CÓ | P0 |
| Staff nhập nhầm 1.000.000 thay vì 100.000 | Không sửa payment thành công; tạo correction/void có quyền và lý do. | THIẾU | P0 |
| Khách chuyển dư | Tạo amount received đúng thực tế và refund/credit phần dư theo policy; không giấu bằng sửa số. | THIẾU | P1 |
| Chuyển hoàn thất bại | Không ghi `COMPLETED`; staff có thể ghi `FAILED` và thực hiện lại bằng mã giao dịch/idempotency key mới. | ĐÃ CHỐT | P0 |
| Hoàn cọc tiền mặt một phần | Ghi refund/settlement rõ; số còn lại nếu chuyển khoản phải là giao dịch riêng hoặc trạng thái rõ. | THIẾU | P1 |
| Phí \> cọc | Deposit deduction \= cọc; phần dư là khoản phải thu EXTRA/outstanding. | THIẾU | P0 |
| Khách chưa trả nợ nhưng muốn thuê tiếp | Policy quyết định block/warn; nên block confirm nếu outstanding quá hạn chưa giải quyết. | THIẾU | P1 |

# **19\. Vệ sinh, sửa chữa và retire**

## **Thiết kế hiện tại**

unit\_blocks hỗ trợ CLEANING/REPAIR/INSPECTION, status PLANNED/IN\_PROGRESS/... và làm unit không khả dụng.

| Đánh giá khả năng vận hành Cần tự động hóa để tránh biến hệ thống thành danh sách việc thủ công quá nặng. |
| :---- |

## **Flow đề xuất**

Return passed \-\> tự tạo cleaning block mặc định \-\> CLEANING \-\> staff chỉ bấm “Hoàn tất vệ sinh” khi xong \-\> READY. Damage \-\> REPAIR block \-\> khi sửa xong kiểm condition \-\> READY hoặc RETIRED.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-MT-01 | Return bình thường nên tự tạo cleaning theo buffer/policy. |
| BR-MT-02 | Finishing cleaning/repair sớm chỉ mở READY nếu không còn block khác và inspection đạt. |
| BR-MT-03 | Không cho block thời gian âm/chồng mâu thuẫn; manual block cần lý do. |
| BR-MT-04 | RETIRED kết thúc khả năng cho thuê nhưng vẫn giữ lịch sử. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Trả đồ bình thường | Auto CLEANING; không bắt staff sang module khác tạo việc. | THIẾU | P2 |
| Giặt xong sớm | Staff complete block \-\> READY nếu đủ điều kiện. | MỘT PHẦN | P1 |
| Phát hiện hỏng trong cleaning | Chuyển/add REPAIR, giữ unavailable. | MỘT PHẦN | P1 |
| Có cleaning và repair chồng nhau | Unit unavailable cho tới khi tất cả blocking conditions kết thúc. | THIẾU | P0 |
| Unit sửa nhiều lần không còn kinh tế | Manager retire với reason; báo cáo lịch sử chi phí để hỗ trợ quyết định. | MỘT PHẦN | P2 |

# **20\. Điều chuyển giữa chi nhánh**

## **Thiết kế hiện tại**

Flow hiện tại REQUESTED \-\> APPROVED \-\> IN\_TRANSIT \-\> RECEIVED, có condition out/in và actor theo từng bước.

| Đánh giá khả năng vận hành Chặt nhưng có nguy cơ quá nhiều bước cho studio nhỏ. Nên cho phép fast-path theo quyền quản lý mà vẫn giữ kiểm soát nhận/giao. |
| :---- |

## **Flow đề xuất**

Staff request \-\> manager approve \-\> source ship \-\> destination receive. Admin/manager có thể “Tạo phiếu đã duyệt” nếu có quyền, nhưng vẫn cần ship \+ receive để xác nhận trách nhiệm hai đầu.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-TR-01 | Source \!= destination; unit phải thuộc source và đủ điều kiện transfer. |
| BR-TR-02 | Unit đang allocated cho đơn tương lai gần không được transfer nếu làm mất khả năng fulfillment. |
| BR-TR-03 | IN\_TRANSIT giữ current branch theo convention hiện tại nhưng UI phải nói rõ đang vận chuyển; khi RECEIVED mới đổi branch atomically. |
| BR-TR-04 | Không được có hai active transfers cùng unit. |
| BR-TR-05 | Condition out/in bắt buộc khi receive để truy trách nhiệm hư hỏng trong vận chuyển. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Admin tự chuyển 1 bộ | Cho fast-path request+approve trong một thao tác nhưng vẫn lưu người tạo, thời điểm ship/receive và trạng thái phiếu. | THIẾU | P2 |
| Unit có order confirmed ngày mai tại source | Chặn transfer hoặc yêu cầu thay allocation trước. | ĐÃ CÓ Ý | P0 |
| Unit đang CLEANING/REPAIR | Chỉ transfer nếu business cho phép và destination nhận đúng status; mặc định chặn để đơn giản MVP. | MỘT PHẦN | P1 |
| Destination inactive | Chặn. | THIẾU | P0 |
| Receive thiếu 1/3 unit | Không hoàn tất toàn phiếu như đã nhận đủ; hỗ trợ partial receipt hoặc giữ IN\_TRANSIT \+ incident. | THIẾU | P1 |
| Hư hỏng khi nhận | Ghi conditionIn, incident/notes; unit không READY tự động nếu condition xấu. | MỘT PHẦN | P0 |
| Phiếu bị hủy sau khi đã IN\_TRANSIT | Không cho CANCEL đơn giản; cần nhận lại/return transfer riêng. | MỘT PHẦN | P1 |

# **21\. Hủy đơn, từ chối và no-show**

## **Thiết kế hiện tại**

Order có REJECTED/CANCELLED/NO\_SHOW; policy có free cancel before/late cancel fee và no-show grace. Business-rules nói hủy không đồng nghĩa refund.

| Đánh giá khả năng vận hành Đúng hướng nhưng policy MVP nên đơn giản vì hiện tiền thu lúc giao; tránh tạo khoản phạt khó thu nếu khách chưa trả gì. |
| :---- |

## **Flow đề xuất**

PENDING \-\> customer/staff cancel hoặc staff reject. CONFIRMED \-\> cancel theo policy \+ release allocations \+ xử lý payment/refund riêng. READY\_FOR\_PICKUP quá grace \-\> NO\_SHOW \+ release unit. ACTIVE không cancel, phải return.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-CN-01 | Mỗi cancel/reject/no-show có reason/actor/time. |
| BR-CN-02 | Cancel release allocation và future availability trong transaction. |
| BR-CN-03 | Cancel không tự động đồng nghĩa money settled; refund là flow riêng. |
| BR-CN-04 | ACTIVE không cancel; xử lý return/early termination. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Khách hủy PENDING | Cho hủy miễn phí, request kết thúc. | ĐÃ CÓ | P1 |
| Khách hủy CONFIRMED chưa trả tiền | Release unit; fee theo policy nhưng MVP nên cân nhắc 0 nếu chưa có booking fee. | MỘT PHẦN | P1 |
| Khách hủy sau khi đã trả trước | Cancel order \+ refund theo policy, hiển thị refund pending riêng. | MỘT PHẦN | P0 |
| Staff reject do hết đồ | Bắt lý do; đề xuất phương án khác; không ghi khách như “hủy”. | MỘT PHẦN | P2 |
| Khách no-show nhưng gọi sau grace | Nếu đã release unit thì không tự khôi phục; check lại availability và tạo/reopen có rule. | THIẾU | P1 |
| Job tự đánh NO\_SHOW khi branch đóng sớm/ngày lễ | Phải dựa operating calendar; nếu không có giờ mở cửa thì automation dễ sai. | THIẾU | P0 |

# **22\. Giá, chính sách và promotion**

## **Thiết kế hiện tại**

Policy có version hiệu lực, billing mode, min/max days, quote validity, no-show, late, cancel, refund SLA; promotion có limit và thời gian. Order snapshot policy/promotion/discount.

| Đánh giá khả năng vận hành Cấu trúc tốt, nhưng cần chốt các tham số thực tế và tránh để quá nhiều chính sách khó giải thích cho nhân viên/khách. |
| :---- |

## **Flow đề xuất**

Admin tạo policy version mới với effective date \+ change reason; version cũ bất biến. Quote chọn policy/price hiện hành; confirm snapshot. Promotion re-check usage tại confirm.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-PR-01 | Policy version đã được order tham chiếu không sửa; tạo version mới. |
| BR-PR-02 | Khoảng hiệu lực không overlap. |
| BR-PR-03 | Khách/staff phải thấy công thức phí đủ hiểu, không chỉ số tổng. |
| BR-PR-04 | Promotion limit phải tiêu thụ theo rule atomic để không vượt quota. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Đổi giá hôm nay | Order confirmed hôm qua không đổi. | ĐÃ CÓ | P0 |
| Quote cũ nhưng policy mới vừa hiệu lực | Rule phải chọn: quote giữ giá đến expiry hay requote; hiện hướng là snapshot quote có thời hạn. | MỘT PHẦN | P1 |
| Hai đơn dùng promotion slot cuối cùng đồng thời | Chỉ một được tiêu thụ nếu totalUsageLimit hết. | THIẾU | P0 |
| Admin nhập policy maxDays \< minDays | Validation chặn. | MỘT PHẦN | P1 |
| Policy thay đổi giữa ACTIVE rental và gia hạn | Cần rule extension dùng policy order hay policy mới; khuyến nghị giữ policy gốc hoặc hiển thị rõ trước xác nhận. | THIẾU | P1 |
| Giờ mở cửa ảnh hưởng quote expiry/no-show | Cần branch operating calendar; hiện thiếu nguồn chính. | THIẾU | P1 |

# **23\. CRM, lịch sử khách và khiếu nại**

## **Thiết kế hiện tại**

MVP hiện hành có customers, interactions, cases, case history; tài liệu lịch sử từng đề xuất rộng hơn nhưng business-rules đã rút campaign/consent/tag/loyalty khỏi schema hiện tại.

| Đánh giá khả năng vận hành Nên giữ CRM gọn. Hồ sơ \+ lịch sử thuê \+ note \+ case là đủ để tạo giá trị, không nên biến đồ án thành CRM marketing. |
| :---- |

## **Flow đề xuất**

Customer profile tổng hợp order history \-\> staff ghi interaction khi cần \-\> complaint/support tạo case \-\> assignment/status history append-only \-\> resolve/close.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-CRM-01 | Interaction/case history append-only hoặc mọi sửa phải có history; không xóa mất dấu xử lý. |
| BR-CRM-02 | Nhân viên chỉ xem dữ liệu khách phù hợp scope/ngữ cảnh. |
| BR-CRM-03 | Case liên kết order nếu khiếu nại liên quan đơn; verify order thuộc customer. |
| BR-CRM-04 | Outstanding/damage dispute có thể mở case và hiện cảnh báo khi tạo đơn mới. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Khách khiếu nại phí hư hỏng | Case gắn order/evidence; giữ settlement status rõ. | MỘT PHẦN | P1 |
| Case owner nghỉ việc | Reassign; history giữ owner cũ. | THIẾU | P1 |
| Staff chỉ có quyền đọc CRM | Không hiện/cho submit form sửa. | ĐÃ CÓ Ý | P0 |
| Khách có lịch sử ở nhiều branch | Customer là toàn chuỗi; staff chỉ xem phần cần thiết theo permission, admin xem full. | MỘT PHẦN | P1 |
| Xóa interaction cũ | Không cho xóa bình thường; nếu nhập sai thì tạo entry correction mới. | MỘT PHẦN | P2 |

# **24\. Báo cáo và truy vết nghiệp vụ**

## **Thiết kế hiện tại**

Hệ thống không triển khai audit module riêng trong MVP. Báo cáo và truy vết dựa trên dữ liệu giao dịch cùng các field nghiệp vụ như người ghi nhận/xử lý, thời gian, trạng thái, lý do và mã tham chiếu.

| Đánh giá khả năng vận hành Đúng nhưng báo cáo phải dựa trên định nghĩa KPI nhất quán, đặc biệt tách cọc khỏi doanh thu và không tính refund pending như đã hoàn. |
| :---- |

## **Flow đề xuất**

Sự kiện nghiệp vụ \-\> transactional data \-\> report theo branch/period/channel. Các KPI tài chính dựa payment `SUCCEEDED` và refund `COMPLETED`, không dựa order status đơn thuần.

## **Business rules cần coi là bắt buộc**

| Mã rule | Quy tắc |
| :---- | :---- |
| BR-RP-01 | Doanh thu không gồm deposit đang giữ. |
| BR-RP-02 | Refund failed/pending không giảm doanh thu như tiền đã thực hoàn trừ khi KPI định nghĩa khác. |
| BR-RP-03 | Không có audit log riêng; các bảng nghiệp vụ phải lưu đủ actor/time/status/reference cần cho vận hành và đối soát. |
| BR-RP-04 | Báo cáo historical branch vẫn hiển thị branch inactive. |

## **Ma trận tình huống và xử lý lỗi/ngoại lệ**

| Tình huống | Hệ thống nên xử lý | Coverage | Ưu tiên |
| :---- | :---- | :---- | :---- |
| Branch inactive | Báo cáo quá khứ vẫn lọc được branch đó. | MỘT PHẦN | P2 |
| Payment cash nhập sai rồi correction | Report tính net đúng theo payment và correction/reversal, không sửa mất bản ghi gốc. | THIẾU | P0 |
| Cọc đang giữ | Không tính revenue. | ĐÃ CÓ | P0 |
| Refund requested nhưng failed | Không báo đã hoàn. | ĐÃ CÓ Ý | P0 |
| Một order đổi branch qua cancel/rebook | Report theo order thực tế, không sửa lịch sử branch của order cũ. | THIẾU | P2 |

# **25\. Khả năng xử lý lỗi xuyên suốt hệ thống**

Ngoài business rule của từng tính năng, hệ thống cần một bộ nguyên tắc recovery thống nhất. Mục tiêu là: người dùng luôn biết thao tác đã thành công hay chưa, không tạo bản ghi/giao dịch trùng khi retry, và không giữ dữ liệu cũ khiến nhân viên tưởng là dữ liệu mới.

| Lỗi/xung đột | Cách xử lý chuẩn | Ưu tiên |
| :---- | :---- | :---- |
| Mất mạng trước khi gửi | Giữ dữ liệu form; không thay đổi server; cho retry. | P1 |
| Mất mạng sau khi server đã nhận nhưng client chưa nhận response | Retry bằng idempotency key; trả về cùng kết quả thay vì tạo order/payment/refund thứ hai. | P0 |
| Double-click/nút bị bấm nhiều lần | Disable khi processing \+ idempotent backend rule. | P0 |
| Hai nhân viên cùng sửa một order/transfer | Optimistic version; người lưu sau nhận conflict và phải review bản mới. | P0 |
| Quyền bị thu hồi giữa phiên | Mọi write re-check permission; từ chối mà không lưu nửa chừng. | P0 |
| Dữ liệu tham chiếu đã bị inactive | Không cho tạo nghiệp vụ mới; vẫn hiển thị trong record lịch sử. | P1 |
| Barcode scan sai | Không giữ chi tiết barcode trước đó như thể là kết quả hiện tại. | P1 |
| Payment provider timeout | Trạng thái UNKNOWN/PENDING cho tới khi reconcile; không cho user tự bấm tạo payment mới ngay. | P0 |
| Refund timeout | Tra cứu bằng provider/idempotency trước khi retry. | P0 |
| Job tự động no-show/expiry chạy lặp | Job idempotent; chuyển trạng thái có compare-and-set/state check. | P0 |
| Clock/timezone sai | Lưu timestamp tuyệt đối; render theo branch; policy dựa branch timezone rõ. | P0 |
| Ảnh evidence upload lỗi | Không chốt inspection nếu evidence bắt buộc; giữ draft/cho retry upload. | P1 |
| Form dài mất dữ liệu khi đổi màn | Warn unsaved changes hoặc autosave draft cục bộ ở các màn quản trị dài. | P2 |
| Dữ liệu cũ trong cache/UI | Sau write phải refresh nguồn chính; không “optimistic success” cho tiền/tồn kho nếu server chưa confirm. | P0 |

# **26\. Quy tắc dữ liệu và xóa/khóa đối tượng**

Một sai lầm phổ biến trong đồ án quản lý là cho CRUD “Xóa” trên mọi màn. Với hệ thống thuê tài sản và có giao dịch tiền, nhiều đối tượng phải có vòng đời thay vì bị xóa.

| Đối tượng | Thao tác nên dùng | Khi nào được xóa vật lý? |
| :---- | :---- | :---- |
| Branch | ACTIVE \-\> INACTIVE | Chỉ dữ liệu test/chưa từng được tham chiếu; production gần như không cần delete. |
| Employee/User | PENDING/ACTIVE \-\> INACTIVE/TERMINATED/LOCKED | Chỉ tài khoản tạo nhầm chưa từng có nghiệp vụ, nếu policy cho phép. |
| Costume model/variant | ACTIVE \-\> INACTIVE | Nếu chưa từng có unit/order/reference. |
| Costume unit | READY/... \-\> RETIRED | Không xóa nếu đã có events/order/transfer. |
| Rental order | State machine \-\> terminal status | Không xóa giao dịch thật; chỉ void/test data theo quyền đặc biệt. |
| Payment/refund | Append correction/reversal | Không xóa giao dịch tài chính đã ghi nhận. |
| CRM interaction/case history | Close/resolve \+ append history | Không xóa bình thường. |
| Role/permission assignment | Kết thúc assignment/thu hồi | Có thể delete assignment chưa từng hiệu lực; assignment đã dùng nên kết thúc hiệu lực thay vì sửa lịch sử nghiệp vụ. |

# **27\. Thiết kế trải nghiệm vận hành tối giản**

| Nguyên tắc Nếu nhân viên phải cập nhật nhiều trạng thái hơn số việc họ thực sự làm ngoài đời, phần mềm đang tạo thêm công việc. Hệ thống nên chuyển trạng thái phụ và tạo block/event tự động từ hành động chính. |
| :---- |

| Việc ngoài đời | Thao tác chính trên hệ thống | Hệ thống tự làm phía sau |
| :---- | :---- | :---- |
| Khách muốn thuê tại quầy | Tìm/tạo khách \-\> chọn/scan đồ \-\> ngày \-\> xác nhận | Check availability; snapshot giá/policy; tạo order; allocate unit; history. |
| Khách tới lấy | Mở đơn/scan \-\> kiểm \-\> thu tiền \-\> Giao | Ghi condition/accessories; payment; picked\_up\_at; order ACTIVE; allocation ACTIVE. |
| Khách trả | Scan \-\> đánh dấu thiếu/hỏng \-\> Nhận trả/Quyết toán | Return timestamps; inspection; fee; refund state; cleaning block; unit unavailable. |
| Giặt xong | Scan \-\> Hoàn tất vệ sinh | Đóng block; kiểm block khác; READY nếu đủ điều kiện. |
| Chuyển kho | Chọn unit \+ nơi đến \-\> gửi/nhận | Event/history; status IN\_TRANSFER; đổi current branch khi receive. |

# **28\. Danh sách điểm nghẽn tổng hợp theo ưu tiên**

| Ưu tiên | Điểm nghẽn | Rủi ro | Thay đổi đề xuất |
| :---- | :---- | :---- | :---- |
| P0 | Customer claim/link offline-online | Tránh tách lịch sử hoặc tạo customer mới khi account đã có hồ sơ tại quầy. | Dùng email đã xác minh để claim/link User cũ; merge ngoài MVP. |
| P0 | Đóng/xóa chi nhánh | Tránh đơn/tồn kho mồ côi. | Không delete; closure checklist chặn khi còn nghĩa vụ. |
| P0 | Sửa sai payment/refund | Tránh sửa mất dấu hoặc lệch báo cáo. | Void/reversal/correction append-only \+ permission. |
| P0 | Idempotency cho submit/payment/refund/return | Tránh double order/thu/hoàn khi retry hoặc double-click. | Business action key/idempotency key. |
| P0 | Outstanding vượt tiền cọc | Tránh đơn completed dù còn nợ. | Outstanding balance \+ settlement/block policy. |
| P0 | Giờ hoạt động chi nhánh | No-show/expiry/booking có thể sai nếu không biết cửa hàng mở khi nào. | Operating hours \+ holiday override tối thiểu. |
| P1 | Gia hạn rental | Case thực tế thường gặp chưa có flow. | Extension flow \+ conflict check \+ fee. |
| P1 | Đổi ngày/size/bộ sau confirm | Sửa trực tiếp dễ làm conflict/mất allocation. | Order amendment \+ atomic re-allocation. |
| P1 | PENDING\_ASSESSMENT hư hỏng | Không thể luôn định giá ngay lúc khách trả. | Staff ghi evidence, giữ cọc và branch manager chốt fee trong SLA. |
| P1 | Partial receipt transfer | Nhận thiếu/hỏng trong chuyển kho cần xử lý. | Incident/partial receive hoặc giữ IN\_TRANSIT. |
| P1 | Partial handover/exchange policy | Đơn nhiều bộ có thể phát sinh giao/đổi không đồng thời. | Chốt hỗ trợ hay cấm trong MVP. |
| P2 | Counter order đi vòng qua pending queue | Tăng thao tác, khiến staff không muốn dùng. | Tạo & xác nhận trong một flow. |
| P2 | Cleaning thủ công | Tạo việc dư thừa sau mỗi lần trả. | Auto block cleaning. |
| P2 | Transfer 4 bước cho admin | Quá enterprise với studio nhỏ. | Fast-path cho manager nhưng vẫn có ship/receive. |
| P3 | Campaign/loyalty nâng cao | Không cần để chứng minh bài toán thuê. | Để phase sau. |

# **29\. Bộ kịch bản nghiệm thu nghiệp vụ đề xuất**

Nhóm có thể dùng danh sách dưới đây như checklist demo/test. Một kịch bản chỉ được coi là đạt khi trạng thái đơn, trạng thái unit, tiền và các bản ghi nghiệp vụ liên quan đều nhất quán sau thao tác.

| ID | Kịch bản | Kết quả mong đợi |
| :---- | :---- | :---- |
| AT-01 | Hai staff confirm hai đơn chồng lịch cùng barcode | Chỉ một thành công; đơn kia conflict; không payment sai. |
| AT-02 | Khách offline thuê tại quầy rồi claim account online | Một customer; đơn cũ xuất hiện trong lịch sử account sau xác minh. |
| AT-03 | Hai người cùng tên nhưng SĐT khác | Không merge. |
| AT-04 | Admin thử xóa branch có lịch sử | Bị từ chối; chỉ có INACTIVE/closure flow. |
| AT-05 | Đóng branch còn ACTIVE rental | Bị chặn và liệt kê nghĩa vụ chưa xử lý. |
| AT-06 | Booking vào ngày branch nghỉ | Không cho chọn giờ/submit; gợi ý lịch hợp lệ. |
| AT-07 | Counter customer mới | Staff tạo hồ sơ \+ order \+ confirm trong flow ngắn. |
| AT-08 | Double click submit online | Chỉ một order/request. |
| AT-09 | Mạng timeout sau submit | Retry trả lại cùng order, không tạo bản sao. |
| AT-10 | Unit bị CLEANING khi staff đang confirm | Confirm fail/reload; không allocation sai. |
| AT-11 | Khách hủy trong lúc staff duyệt | Confirm bị từ chối; unit không bị giữ. |
| AT-12 | Payment bank pending | Không chuyển “đã thu” và không giao nếu policy cấm. |
| AT-13 | Staff nhập sai cash payment sau khi chốt | Correction/reversal; không edit mất dấu. |
| AT-14 | Khách lấy muộn | Actual pickup cập nhật, due không tự lùi. |
| AT-15 | Gia hạn khi unit không có booking kế | Gia hạn thành công \+ fee/history. |
| AT-16 | Gia hạn khi unit có booking kế | Bị từ chối hoặc chỉ gia hạn item còn trống theo policy. |
| AT-17 | Đổi size trước pickup | Allocate unit mới \+ release cũ atomically; giá/cọc re-evaluate. |
| AT-18 | Đơn 2 bộ trả 1 bộ | Order chưa completed; chỉ barcode còn lại xuất hiện “đang thuê”. |
| AT-19 | Scan trả cùng barcode hai lần | Lần 2 idempotent/reject; không duplicate refund/event. |
| AT-20 | Damage chưa định giá | PENDING\_ASSESSMENT \+ deposit held \+ SLA. |
| AT-21 | Damage \> deposit | Cấn cọc \+ outstanding balance; order không giả vờ settled. |
| AT-22 | Refund failed | Hiển thị failed; retry không tạo double refund. |
| AT-23 | Return bình thường | Auto cleaning block; unit chưa READY ngay. |
| AT-24 | Cleaning xong sớm | Close block; READY nếu không còn block/repair. |
| AT-25 | Transfer unit có confirmed order sắp tới | Chặn hoặc yêu cầu re-allocation trước. |
| AT-26 | Receive transfer thiếu 1 unit | Không đánh cả phiếu RECEIVED đủ; incident/partial handling. |
| AT-27 | Nhân viên bị revoke permission trong lúc mở màn | Write bị từ chối; không partial save. |
| AT-28 | Admin đổi giá | Order cũ giữ snapshot; order mới dùng giá mới. |
| AT-29 | Promotion slot cuối bị hai order dùng đồng thời | Không vượt totalUsageLimit. |
| AT-30 | Branch inactive trong báo cáo quá khứ | Vẫn xem được số liệu lịch sử. |
| AT-31 | Khách trả sớm | Nhận trả được; không tự refund tiền thuê nếu policy không cho. |
| AT-32 | No-show job chạy lặp | Trạng thái/event không nhân đôi. |
| AT-33 | Khách no-show quay lại sau khi unit đã release | Re-check availability; không tự restore allocation. |
| AT-34 | Unit barcode mất tem | Tìm unit khác cách, in lại barcode; không tạo duplicate unit. |
| AT-35 | Case CRM owner nghỉ việc | Reassign case; history giữ owner cũ. |
| AT-36 | Khách tranh chấp damage | Case gắn order/evidence, không xóa assessment cũ. |
| AT-37 | Payment/refund report | Deposit không vào revenue; failed refund không tính như đã hoàn. |
| AT-38 | Sửa địa chỉ branch | Đơn lịch sử/chứng từ đã phát hành không bị diễn giải sai. |
| AT-39 | Mẫu/variant inactive | Không nhận booking mới nhưng đơn cũ vẫn hiển thị đủ thông tin. |
| AT-40 | Unit retired | Không cho thuê lại; lịch sử vẫn truy vết được. |
| AT-41 | Khách thuê ở giữa trả trễ, ảnh hưởng đơn sau đã xác nhận | Cảnh báo gắn hai đơn; đơn sau giữ lịch; bàn giao cùng barcode bị chặn; không có hai đơn ACTIVE cùng unit. |
| AT-42 | Lịch tương lai nằm trong buffer sau giờ trả dự kiến | Cùng unit không được xác nhận; unit thay thế chỉ được nhận nếu lịch và trạng thái đều hợp lệ. |
| AT-43 | Đơn trước quá plannedDueAt nhưng chưa scan trả | Unit tiếp tục bị tính là đang ở khách cho quote, confirm, reallocate và handover; trạng thái chỉ đổi sau khi nhận thực tế. |

### Bổ sung: chính sách cho đơn giữa bị trả trễ

Đối chiếu trong nước: [Solarent tại TP.HCM](https://solarent.vn/policy) công khai gói thuê, hạn trả ngày-giờ, phí trả trễ và hoàn cọc sau khi kiểm tra; [Rent by TD](https://rentbytd.com/thue-vay-di-tiec-tphcm/) nêu một ngày thuê là 24 giờ với giờ trả cụ thể. Đối chiếu quốc tế: [Sophia’s Gallery & Costumes](https://sophiasgallery.com/pages/rental-agreement-terms) nói rõ trang phục có thể đã được đặt cho khách kế tiếp. Mức phí và ân hạn khác nhau, nên không có con số nào là chuẩn của dự án. Điểm phù hợp để áp dụng là ghi rõ giờ trả, yêu cầu khách báo sớm khi xin gia hạn, chỉ coi đồ đã sẵn sàng sau khi nhận và kiểm tra, và bảo vệ đơn kế tiếp bằng phương án xử lý thay thế.

**Đề xuất cho Costume Rental Studio:** lịch thử không giữ bộ; đơn thuê chỉ giữ barcode sau khi nhân viên xác nhận. Đơn chen giữa chỉ được nhận nếu khoảng từ giờ trả hẹn đến đơn kế tiếp đủ cho dự phòng trả trễ và chuẩn bị đồ. Đơn kế tiếp đã xác nhận không tự bị hủy/dời nếu người thuê trước quá hạn. Tạo tác vụ liên kết hai đơn, tìm barcode READY thay thế cùng variant/size, liên hệ khách nhận sau nếu cần; ngay tại quầy vẫn phải chặn bàn giao barcode đang có allocation ACTIVE hoặc chưa READY.

**Pilot chưa được chủ studio phê duyệt:** đề xuất khoảng cách tối thiểu 24 giờ cho trang phục thông thường (12 giờ dự phòng trễ + 12 giờ chuẩn bị) và 48 giờ cho trang phục cầu kỳ (24 + 24 giờ); nếu thời gian vệ sinh/chuẩn bị đã cấu hình dài hơn thì dùng thời gian dài hơn. Đây là giả định thận trọng để bắt đầu đo vận hành, không phải chuẩn ngành. Sau 4 tuần hoặc tối thiểu 30 lượt trả (lấy mốc nào đến sau), xem lại thời gian trả trễ, thời gian đưa bộ về READY và số đơn kế tiếp bị ảnh hưởng. Phí trễ, ân hạn, hoàn/giảm giá nếu studio không giao được, và quy tắc giờ mở cửa vẫn cần được chốt riêng.

Chi tiết nguồn đối chiếu, luồng xử lý và acceptance tests: [Chính sách trả trễ và bảo vệ đơn thuê kế tiếp](chinh-sach-tra-tre-va-don-thue-ke-tiep.md).

# **30\. State machine nghiệp vụ khuyến nghị**

## **Đơn thuê**

| Current state | Action | Next state | Actor/điều kiện chính |
| :---- | :---- | :---- | :---- |
| DRAFT | Submit | PENDING_CONFIRMATION | Customer/staff; dữ liệu hợp lệ. |
| PENDING_CONFIRMATION | Confirm | CONFIRMED | Staff đúng branch; availability được re-check. |
| PENDING_CONFIRMATION | Reject | REJECTED | Staff đúng branch; có lý do. |
| PENDING_CONFIRMATION | Cancel | CANCELLED | Customer hoặc staff theo policy. |
| CONFIRMED | Mark ready | READY_FOR_PICKUP | Staff; unit đã được chuẩn bị. |
| CONFIRMED | Amend | CONFIRMED | Staff; release/allocate atomically và tính lại tiền/cọc. |
| READY_FOR_PICKUP | Handover | ACTIVE | Staff; payment/deposit đáp ứng policy. |
| READY_FOR_PICKUP | Mark no-show | NO_SHOW | System/staff; đã quá grace period theo giờ branch. |
| ACTIVE | Extend | ACTIVE | Staff; toàn bộ unit không conflict, khách xác nhận phụ phí. |
| ACTIVE | Receive return | RETURN_INSPECTION | Staff; item-level return hợp lệ. |
| RETURN_INSPECTION | Complete settlement | COMPLETED | Không còn item ở khách; assessment/refund/outstanding đã có kết quả rõ. |

Không cho `ACTIVE → CANCELLED`, `COMPLETED → ACTIVE`, `REJECTED → CONFIRMED`. Khách no-show quay lại phải re-check availability, không tự khôi phục allocation.

## **Item/unit trong đơn**

UNASSIGNED \-\> CONFIRMED/ALLOCATED \-\> ACTIVE (đã giao) \-\> RETURNED/INSPECTING \-\> COMPLETED. Với partial return, order có thể vẫn ACTIVE trong khi một số item đã RETURNED.

## **Physical unit**

INBOUND \-\> READY \-\> (ACTIVE qua allocation/order) \-\> CLEANING \-\> READY; hoặc \-\> REPAIR \-\> READY/RETIRED; hoặc READY \-\> IN\_TRANSFER \-\> READY tại branch đích. Trạng thái “đang thuê” nên suy từ allocation/order hoặc có state rõ nhưng phải tránh hai nguồn sự thật mâu thuẫn.

## **Payment/refund**

Payment: `PENDING → SUCCEEDED/FAILED/CANCELLED`. Payment `SUCCEEDED` không được sửa số tiền trực tiếp.

Refund MVP: staff chuyển tiền ngoài hệ thống rồi tạo `COMPLETED`; nếu cần lưu lần chuyển không thành công thì tạo `FAILED`. Không dùng approval flow. Correction không sửa bản ghi thành công; dùng bản ghi bổ sung/reversal.

# **31\. Scope MVP cuối cùng khuyến nghị**

Nếu mục tiêu là đồ án có thể vận hành được và demo thuyết phục, nên đóng scope theo ba lớp sau.

| Lớp | Bắt buộc | Có thể để sau |
| :---- | :---- | :---- |
| Lớp 1 \- Core rental | Branch; customer; catalog/variant/unit; availability; online request; counter order; confirm/allocation; handover; return; deposit/payment/refund; cleaning; history | Không bỏ. |
| Lớp 2 \- Real-world exceptions | Partial return; no-show; late return; extension; damage/missing; pending assessment; transfer; employee permissions; branch closure | Nên có ít nhất rule \+ demo cho các case P0/P1. |
| Lớp 3 \- Advanced | CRM case nâng cao; promotion phức tạp; marketing; loyalty; gateway; giao tận nơi; return khác branch | Phase 2/3. |

# **32\. Cách trả lời giảng viên khi bị hỏi về tính thực tế**

| Thông điệp nên dùng Hệ thống không yêu cầu nhân viên “quản lý quy trình” bằng cách bấm hàng loạt trạng thái. Nhân viên chỉ thực hiện đúng các việc họ làm ngoài đời: xác nhận thuê, giao, nhận trả, ghi hư hỏng/tiền và điều chuyển. Các trạng thái kỹ thuật, cleaning buffer, lịch sử và kiểm tra xung đột được hệ thống tự quản lý. Vì vậy phần mềm giảm rủi ro trùng lịch, thất lạc đồ và sai cọc mà không biến công việc cửa hàng thành quy trình hành chính. |
| :---- |

# **33\. Nguồn đối chiếu trong repository**

| Tệp | Vai trò trong đánh giá |
| :---- | :---- |
| README.md | Mô tả scope, roles, rental flow và trạng thái triển khai. |
| docs/business/business-rules.md | Nguồn nghiệp vụ hiện hành: multi-branch, counter/online, unit, transfer, order state, payment/refund, CRM, delete policy. |
| docs/database/schema-summary.md | Tóm tắt 33 bảng và ràng buộc nghiệp vụ chính. |
| apps/api/prisma/schema.prisma | Đối chiếu khả năng biểu diễn Branch, Customer, Employee, RentalOrder, RentalOrderItem, Payment, Refund, UnitBlock và Transfer. |
| docs/ui/core-flow-ux-review.md | Đối chiếu 10 luồng UI fixture, partial return, counter order, conflict, permission, refund fail và dependency khi nối dữ liệu thật. |
| docs/archive/historical-business-analysis.md | Tài liệu lịch sử dùng để tham khảo các giả định/acceptance cases; không được coi là source of truth nếu mâu thuẫn business-rules.md. |

**Repository: https\://github.com/BinCry/Costume-Rental-Studio**

# **34\. Checklist chốt nghiệp vụ trước khi code**

* Chốt operating hours/ngày nghỉ của branch và rule booking/no-show ngoài giờ.  
* Chốt “không delete” branch/unit/order/payment; định nghĩa deactivate/retire/terminate.  
* Claim/link khách offline-online dùng email đã xác minh; merge không thuộc MVP.  
* Chốt counter order fast-path: tạo \+ confirm trong cùng flow nếu đủ quyền.  
* Extension áp dụng toàn đơn nếu không conflict; amendment chỉ trước pickup và phải re-allocation atomically.  
* Chốt có hỗ trợ partial handover/exchange hay chỉ partial return.  
* Staff ghi damage/evidence; branch manager chốt fee trong SLA; giữ cọc khi pending assessment.  
* Phí vượt cọc tạo outstanding; block confirm đơn mới cho đến khi settle hoặc manager miễn/giảm.  
* Refund thủ công: staff có permission chuyển tiền rồi lưu số tiền, lý do, mã giao dịch và thời điểm; backend chặn vượt refundable amount.  
* Chốt auto-cleaning sau return và điều kiện READY lại.  
* Chốt transfer fast-path \+ partial receive/incident.  
* Chốt KPI báo cáo: revenue, deposit held, refund completed, overdue, utilization.  
* Chạy tối thiểu 40 acceptance scenarios ở mục trên trước khi tuyên bố flow nghiệp vụ hoàn chỉnh.

# **Phụ lục A. Các quyết định nên ghi vào Business Decision Log**

| Quyết định | Khuyến nghị mặc định | Lý do |
| :---- | :---- | :---- |
| Nhận/trả khác branch | Không trong MVP | Giảm điều phối tồn kho và trách nhiệm. |
| Giao tận nơi | Không trong MVP | Tạo thêm logistics, COD, proof delivery. |
| Pending request có giữ unit | Không | Tránh chiếm tồn khi chưa confirm/thu tiền. |
| Counter order cần staff duyệt lại | Không nếu cùng staff có quyền | Giảm thao tác tại quầy. |
| Gia hạn | Có trong MVP/P1 | Tình huống rất thực tế và giá trị. |
| Đổi size trước pickup | Có nếu re-allocation thành công | Thực tế và không quá nặng. |
| Đổi unit sau ACTIVE | Không hoặc xử lý exchange riêng | Phức tạp condition/money; có thể để phase sau. |
| Partial return | Có | Repo đã hỗ trợ ý tưởng và rất thực tế. |
| Partial handover | Không mặc định | Giữ flow giao đơn giản trừ khi studio cần. |
| Damage chưa định giá | Có PENDING\_ASSESSMENT | Không ép staff đoán phí tại quầy. |
| Cleaning sau return | Tự động | Giảm thao tác. |
| Delete branch | Không | Bảo toàn lịch sử. |
| CRM campaign/loyalty | Phase sau | Không phải core rental. |
| Refund | Staff có permission chuyển tiền thủ công và ghi nhận `COMPLETED`; không approval, không SePay refund API trong MVP | Phù hợp studio nhỏ và giảm phụ thuộc ngân hàng/provider. |
| Customer claim/link | Dùng email OTP hoặc email Google đã xác minh để gắn vào User/Customer cũ | Giữ nguyên lịch sử thuê tại quầy. |
| Customer merge | Ngoài MVP | Tránh rủi ro hợp nhất nhầm hồ sơ. |
| Audit module | Không triển khai | Dùng các field actor/time/reference trong bảng nghiệp vụ. |
| Extension | Gia hạn toàn đơn; từ chối nếu một unit conflict | Giữ flow và tính phí đơn giản. |
| Amendment | Chỉ trước pickup; không exchange sau ACTIVE | Giảm phức tạp condition và tiền. |
| Outstanding | Chặn confirm đơn mới khi còn nợ quá hạn; manager được miễn/giảm theo permission | Bảo vệ tiền nhưng vẫn có đường xử lý ngoại lệ. |


# Bổ sung nghiệp vụ: đệm lịch, trả trễ và bảo vệ đơn kế tiếp — 14/10/2026

Phần này làm rõ các rule và cách triển khai đề xuất khi đơn A chưa trả mà khách B đến nhận cùng bộ. Mô hình giải quyết riêng ba mốc: hạn trả ghi trên đơn, ân hạn trước khi tính phí, và đệm lịch nội bộ. Đơn B đã xác nhận được bảo vệ; đơn request chưa duyệt không tự giữ barcode. Unit còn allocation `ACTIVE` không thể được dùng cho đơn khác dù đã quá hạn kế hoạch.

**Pilot cần chủ studio duyệt trước khi công bố:** 60 phút ân hạn; phí 30% tiền thuê đã giảm của từng bộ cho mỗi kỳ 24 giờ đã bắt đầu sau ân hạn, tối đa 100% tiền thuê bộ; tổng đệm lịch khởi điểm 12 giờ dự phòng trả trễ + 12 giờ vệ sinh (24 giờ), hoặc 24 + 24 giờ (48 giờ) với trang phục cầu kỳ. Đây là khuyến nghị, không phải thông lệ chuẩn. Mức phí công khai giữa các cửa hàng cho thuê khác nhau đáng kể; xem đối chiếu [Solarent](https://solarent.vn/policy), [Trang Phục Hồng Hạnh](https://trangphuchonghanh.com/quy-dinh-khi-thue-trang-phuc-bid25.html), [Rent by TD](https://rentbytd.com/thue-vay-di-tiec-tphcm/) và hướng dẫn buffer của [Booqable](https://help.booqable.com/en/articles/90053-how-to-adjust-product-settings).

Đơn policy cũ tiếp tục dùng công thức phí v1 theo tổng giá thuê gộp khi trả đủ; đơn có policy version mới dùng công thức v2 tính theo từng bộ ngay khi nhân viên thực nhận, sau khi phân bổ giảm giá. Phí nằm ở khoản phải thu EXTRA, còn tiền cọc được quyết toán riêng. Không tự trừ phí trễ vào cọc hay tự động hoàn.

Trong branch `feature/chinh-sach-dem-va-tra-tre`, code đề xuất đã đưa buffer vào quote/availability, xác nhận, gia hạn và phân công lại; bổ sung kiểm tra pickup atomic và preflight trước khi ghi payment; cho phép khôi phục đơn `READY_FOR_PICKUP` bằng unit READY cùng variant/chi nhánh; đưa mức ân hạn/phí lên policy UI và báo giá khách. Migration mới mặc định buffer bằng 0, do đó policy đang có không bị đổi. Xem [quy tắc nghiệp vụ](business-rules.md), [chi tiết policy và quy trình](chinh-sach-tra-tre-va-don-thue-ke-tiep.md), [tóm tắt schema](../database/schema-summary.md).

Acceptance cần chạy trong CI: RT-03, RT-04, RT-06, RT-07, RT-08, RT-09, RT-10, RT-11 và RT-12; AT-41, AT-42, AT-43. Cần bổ sung kiểm thử API tích hợp cho trả một phần, trả trễ, tính phí theo item, conflict sau preflight và reallocation concurrent trước khi merge.

**Còn cần quyết định:** phê duyệt hoặc thay mức pilot và ngày hiệu lực; giờ liên tục hay theo giờ mở cửa cho chu kỳ tính thuê; kênh/SLA cảnh báo A/B; quyền giảm phí hoặc bồi hoàn khi không có đồ thay; nội dung điều khoản khách phải chấp thuận. Repo hiện không tự gửi thông báo và không tự quyết định refund/bồi hoàn.
