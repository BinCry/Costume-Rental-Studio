# Audit UI/UX toàn web — giảm thao tác và ưu tiên nội dung công việc

Ngày: 17/11/2026 · Phạm vi: web khách hàng, nhân viên, quản trị. Đây là audit mới trên mã nguồn `main` sau tích hợp API và ảnh màn Đơn thuê do người dùng cung cấp. Báo cáo nghiệm thu fixture ngày 04/10/2026 không được dùng làm bằng chứng rằng bản production hiện tại đã đạt UX.

## Phương pháp và giới hạn

- **Đã xác nhận:** bố cục Đơn thuê trong ảnh, cấu trúc route/component/CSS và luồng dữ liệu trong `apps/web/src`.
- **Cần kiểm trực quan:** các màn khác trên production ở 375, 768, 1366 và 1920 px, với tài khoản khách/nhân viên/admin và dữ liệu thật. Các nhận định của những màn đó là audit code, chưa phải kết quả E2E.
- **Không đụng nghiệp vụ:** giá, cọc, trạng thái, phân quyền và hành động trên server tiếp tục theo API. Rút ngắn chữ không được xóa giải thích về khoản tiền, điều kiện khóa nút hay hậu quả của thao tác không thể hoàn tác.
- **Tham khảo:** [Shopify Orders](https://help.shopify.com/en/manual/fulfillment/managing-orders/viewing-orders) đặt tìm kiếm, trạng thái, ngày và bộ lọc ngay trên danh sách; [Square Orders](https://squareup.com/help/us/en/article/8454-manage-orders-with-square) tổ chức một danh sách đơn tập trung và lọc/sắp xếp; [Baymard — số trường checkout](https://baymard.com/research-articles/checkout-flow-average-form-fields) cho thấy trường nhập dư làm luồng nặng hơn; [Baymard — bộ lọc đang áp dụng](https://baymard.com/research-articles/how-to-design-applied-filters) khuyến nghị cho người dùng thấy bộ lọc hiện hành. Đây là tham chiếu nguyên tắc, không sao chép giao diện hoặc kết luận kết quả của Studio từ nghiên cứu bên ngoài.

## Quy tắc thiết kế áp dụng cho toàn web

1. Một màn có **một mục tiêu chính** và một hành động chính. Tiêu đề + thông tin trạng thái phải nằm trong hàng đầu; bỏ eyebrow/đoạn dẫn nếu tên trang đã rõ.
2. Thông tin lặp lại theo hàng và cần so sánh dùng **bảng trên desktop**; trên mobile dùng thẻ 2–4 dòng. Chi tiết chỉ xuất hiện khi chọn một hàng, đúng đối tượng đang lọc.
3. Bộ lọc cùng một loại chỉ xuất hiện **một lần**. Các bộ lọc nâng cao đặt trong vùng mở rộng; luôn có xóa bộ lọc và số kết quả.
4. Hướng dẫn mặc định tối đa một câu ngắn bên cạnh chỗ cần quyết định. Chính sách dài đưa vào “Xem chi tiết”; cảnh báo thật giữ rõ hậu quả và cách khắc phục.
5. Không bắt nhập lại thông tin đã có từ tài khoản hoặc route trước. Giữ nháp khi chuyển bước và nêu rõ khi dữ liệu hết hạn.
6. Mỗi hàng có trạng thái dạng chữ, ngày giờ định dạng `dd/MM/yyyy HH:mm`, mã/tiền thẳng cột. Không dùng màu làm tín hiệu duy nhất.
7. Hành động quan trọng có loading, kết quả và lối sửa lỗi tại đúng nơi thao tác. Không mở thêm modal chỉ để lặp lại nội dung đã thấy.
8. Ở mobile, menu và nút thao tác phải dễ chạm; không đặt bảng nhiều cột gây tràn ngang. Đảm bảo focus sau chọn dòng, mở panel và đóng dialog.

## Lỗi và giải pháp theo từng màn

`P0`: cản công việc chính hoặc dễ dẫn tới sai đơn/tiền. `P1`: lãng phí không gian/thao tác rõ rệt. `P2`: tinh gọn sau khi giải quyết P0/P1. “Đã sửa” chỉ áp dụng cho thay đổi trong đợt audit này.

### Kiểm kê màn và phạm vi audit

Danh sách sau đối chiếu với `apps/web/src/app/routes.ts`. Những route admin dùng chung component với staff vẫn phải kiểm riêng quyền và chi nhánh.

| Khu | Route | Vấn đề liên quan |
| --- | --- | --- |
| Khách | `/`, `/trang-phuc/:id`, `/dat-thue` | C01–C05 |
| Khách | `/don-cua-toi`, `/don-cua-toi/:order`, `/tai-khoan` | C06–C07 |
| Xác thực | `/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, callback Google | G06; cần kiểm trực quan thông điệp lỗi và đường quay lại |
| Nhân viên | `/van-hanh/tong-quan`, `/van-hanh/don-thue`, `/van-hanh/don-thue/:order/giao`, `/van-hanh/don-thue/:order/tra` | S01, O01–O04, S04 |
| Nhân viên | `/van-hanh/tao-don`, `/van-hanh/dang-thue`, `/van-hanh/kho`, `/van-hanh/dieu-chuyen`, `/van-hanh/khach-hang`, `/van-hanh/bao-cao` | S02–S06, A04 |
| Quản trị | `/quan-tri/don-thue`, `/quan-tri/don-thue/:order/giao`, `/quan-tri/don-thue/:order/tra`, `/quan-tri/tao-don`, `/quan-tri/dang-thue`, `/quan-tri/kho`, `/quan-tri/dieu-chuyen`, `/quan-tri/khach-hang` | Dùng lại O01–O04, S02–S06; cần kiểm với quyền admin |
| Quản trị | `/quan-tri/danh-muc`, `/quan-tri/nhan-vien`, `/quan-tri/vai-tro`, `/quan-tri/chi-nhanh`, `/quan-tri/chinh-sach`, `/quan-tri/uu-dai`, `/quan-tri/bao-cao` | A01–A04 |

| ID | Màn / bằng chứng | Vấn đề và tác động | Giải pháp cụ thể | Ưu tiên / trạng thái |
| --- | --- | --- | --- | --- |
| O01 | Đơn thuê desktop — ảnh; `OrdersPage.tsx`, `.orders-workspace` | Ba cột cố định 180/300/phần còn lại khiến danh sách thành thẻ dài, khoảng trống lớn khi cuộn; không so sánh được các đơn cùng lúc. | Dùng bảng toàn chiều ngang với mã, khách, nhận, trả, trạng thái. Chi tiết ở dưới và cuộn đến khi chọn. Mobile dùng thẻ riêng. | P0 · **Đã sửa code** |
| O02 | Đơn thuê — `OrdersPage.tsx` có `Nhóm trạng thái` và cột `Nhóm đơn` | Hai bộ lọc cùng một ý; người dùng phải hiểu cả hai. | Giữ select trạng thái cạnh tìm kiếm, bỏ cột nhóm. | P1 · **Đã sửa code** |
| O03 | Đơn thuê — `rawOrder` trước đây chọn từ `scoped`, còn list từ `visible` | Khi đổi bộ lọc/tìm kiếm, chi tiết có thể giữ đơn không nằm trong kết quả, gây nhầm ngữ cảnh. | Chọn chi tiết từ kết quả đang hiển thị; deep link chỉ giữ khi chưa áp lọc. | P0 · **Đã sửa code** |
| O04 | Đơn thuê — bảng mới | Khi danh sách dài, tìm đơn vẫn có thể mất công cuộn; thứ tự không thấy rõ trong mã hiện tại. | Thêm sắp xếp nhận/trả/hạn và phân trang hoặc tải thêm; nhớ lọc/sort trong URL. Nếu dữ liệu lớn, phân trang ở API thay vì chỉ cắt trên client. | P1 · **Đã sửa code lọc/sắp xếp URL và phân trang 15 hàng trên client; API vẫn tải toàn bộ, cần phân trang server khi dữ liệu lớn** |
| O05 | Đơn thuê admin — `OrdersPage.tsx` dùng chung với nhân viên | Chọn đơn và nút Giao/Trả đã điều hướng cứng sang `/van-hanh`, làm admin rời đúng khu vực và có thể bị chặn quyền. | Giữ `/quan-tri` cho URL chi tiết và hai hành động khi mở từ admin; nhân viên giữ `/van-hanh`. | P0 · **Đã sửa code** |
| G01 | Menu nội bộ — `StudioApp.tsx` có 7 nhóm admin, 5 nhóm staff | Nhiều nhóm phải mở rồi dò; sidebar chiếm chiều rộng kể cả khi người dùng chỉ xử lý đơn. | Giữ mục việc thường dùng ở lớp đầu, gom cấu hình vào một nhóm; tự mở nhóm của route hiện tại; cho thu gọn sidebar ở desktop. Đo số lần bấm từ Bảng việc đến Đơn thuê/Kho. | P1 · **Đã đưa màn việc thường dùng thành liên kết trực tiếp và gom 5 màn cấu hình admin; còn thu gọn sidebar desktop** |
| G07 | Sidebar desktop — ảnh ngày 17/11; CSS đặt chiều cao `100dvh - 132px` | Nền menu dừng trước đáy màn hình và để một dải trống rõ rệt; thẻ tài khoản như bị cắt khỏi bố cục. | Giữ header ở đầu, sidebar bám ngay dưới header và cao đến đáy viewport; menu cuộn bên trong nếu nhiều mục. | P1 · **Đã sửa code** |
| G08 | Nhóm chỉ còn một mục sau lọc quyền — `StudioApp.tsx` vẫn render nút mở nhóm | Người dùng phải mở dropdown để vào đúng một trang; nhóm “Tổng quan”, “Danh mục” thành hai lần bấm vô ích. | Khi nhóm có một mục, render liên kết trực tiếp với tên nhóm, không chevron; nhóm có từ hai mục giữ cơ chế mở/đóng. | P1 · **Đã sửa code** |
| G09 | Các màn danh sách–chi tiết — ảnh Chính sách ngày 17/11; `feature-two-column`, `role-layout` | Cả hai cột dùng chung thanh cuộn trang. Khi đọc phần chi tiết dài, danh sách ngắn bên trái biến mất và nửa màn hình còn lại trắng. | Trên desktop, giới hạn chiều cao vùng làm việc và cho mỗi cột cuộn riêng; chọn mục khác đưa nội dung chi tiết về đầu. Có tên vùng cuộn và điểm focus cho bàn phím. Dưới 1200px dùng một luồng cuộn trang. Áp dụng Chính sách, Nhân viên, Chi nhánh, Vai trò, Kho, Điều chuyển, Đang thuê. | P1 · **Đã sửa code; chờ kiểm trực quan** |
| G02 | Tiêu đề và thông báo ở hầu hết trang — nhiều `eyebrow`, H1, mô tả, `Feedback` | Một hành động bị giới thiệu lặp nhiều lần; nội dung quan trọng tụt dưới fold. | Chỉ giữ tên trang, một dòng trạng thái; thông báo mang tính giáo dục chuyển thành help ngữ cảnh. Giữ lỗi hành động và cảnh báo tài chính. | P1 · Đã rút gọn đầu Đơn thuê, Đặt thuê và Bảng việc; các màn khác chưa làm |
| G03 | `DataTable.tsx` — mặc định 6 hàng, tìm bằng `JSON.stringify(row)` nếu không có `searchKey` | Tìm có thể khớp dữ liệu ẩn; bảng dài thành nhiều trang sớm và không rõ đang lọc gì. | Yêu cầu `searchKey` theo cột hiển thị, cung cấp nhãn tìm riêng từng màn; số hàng/trang phù hợp mật độ và tổng kết quả. | P1 · **Đã sửa code: bắt buộc khóa tìm, 12 hàng/trang, nhãn theo barcode/biến thể, hiện số kết quả và xóa lọc** |
| G04 | Toàn web — text và badge trong bảng/danh sách | Mã, tên, ngày và trạng thái có nguy cơ xuống dòng không kiểm soát ở 768–1024 px; ảnh Đơn thuê cho thấy thẻ hẹp. | Ưu tiên cột quan trọng, `min-width: 0`, ngày không ngắt, text dài ellipsis kèm title hoặc mở chi tiết; kiểm tràn ở 375/768/1366. | P1 · Đã sửa bảng Đơn thuê; kiểm các màn khác |
| G05 | Toàn web — thông báo lỗi rải giữa nội dung | Lỗi tổng quát có thể đẩy form và hành động ra xa; lỗi trường không luôn gần dữ liệu cần sửa. | Lỗi field đặt cạnh field; lỗi tải danh sách ở đầu danh sách với “Thử lại”; lỗi hậu quả thật giữ mã và cách phục hồi. | P1 · Chưa làm toàn hệ thống |
| G06 | Đăng nhập/đăng ký/quên mật khẩu — `AuthPage.tsx`, callback route | Luồng xác thực có nhiều trạng thái, nhưng hiện chưa có bằng chứng trực quan đủ để khẳng định thông điệp lỗi và chỗ quay lại nhất quán. | Kiểm từng lỗi thường gặp (sai mật khẩu, rate limit, callback, hết phiên); hiện câu ngắn và hành động kế tiếp, quay về đúng trang trước khi đăng nhập; form không mất email. | P1 · Cần kiểm trực quan |
| C01 | Khám phá/catalog — `CatalogPage.tsx` có thanh kỳ thuê, lọc, thẻ sản phẩm, hướng dẫn ba bước | Nội dung hướng dẫn lặp mục tiêu đặt thuê; khách phải cuộn qua phần giải thích. Câu “Thanh toán khi nhận” đã lỗi thời khi web có checkout trực tuyến. | Giữ tìm kiếm, lọc quan trọng, ảnh/giá/size và CTA; bỏ hướng dẫn ba bước lỗi thời; hiển thị filter đang áp dụng. | P1 · **Đã sửa code: hiện/xóa từng bộ lọc, kiểm size và màu trên cùng biến thể, bỏ mô tả lọc dư; chờ kiểm trực quan** |
| C02 | Chi tiết trang phục — `CustomerFeatures.tsx` chia chất liệu, phom dáng, phụ kiện thành các đoạn | Người dùng cần ảnh, size, giá tham khảo, khả dụng và CTA trước. | Đưa giá/size/kỳ thuê/chọn bộ lên trước, mô tả dài vào tab/thẻ mở rộng; duy trì ảnh rõ và chính sách cọc gần CTA. | P1 · **Đã đưa chọn size, giá, lịch và CTA lên trước; mô tả/chất liệu/phụ kiện trong phần mở rộng; chờ kiểm trực quan** |
| C03 | Đặt thuê — `BookingDraft` chỉ có một `variant`, `quantity` 1 hoặc 2; `createQuote/createOrder` lặp cùng `variantId` | Khách không thể thuê hai size khác nhau trong cùng yêu cầu, dù API nhận mảng item. | Dùng danh sách dòng `{model, variant, quantity}`, cho thêm/xóa bộ, mỗi dòng chọn size riêng; báo giá và gửi đơn từ cùng mảng; hiển thị thiếu khả dụng ngay tại dòng. | P0 · **Đã sửa code nhiều dòng mẫu/size, chặn báo giá thiếu bộ; chờ kiểm trên web** |
| C04 | Đặt thuê — ba bước và nhiều `Feedback` trước/giữa form | Text hướng dẫn dày, thông báo thông tin liên tục chiếm chiều cao; khách phải qua nhiều lớp để xem báo giá. | Rút về chọn bộ + thời gian → báo giá/liên hệ → xác nhận; tự dùng hồ sơ đã đăng nhập; chỉ hiện giải thích khi khách mở hoặc API báo vấn đề. Đo thao tác từ catalog đến gửi. | P1 · Đã bỏ nhắc đăng nhập lặp và chú thích trường dài; còn cần đo thao tác, tinh gọn bước |
| C05 | Báo giá — `BookingPage.tsx` xử lý lỗi và khuyến mãi bằng nhiều khối | Khi không có giá, lý do có thể bị trộn với ghi chú khuyến mãi/chính sách. | Một vùng trạng thái cạnh tổng tiền: giá hoặc lỗi cụ thể + hành động sửa lựa chọn; mã ưu đãi là mục phụ. Không hiển thị “0 đ” như giá hợp lệ khi API lỗi. | P0 · Đã bỏ thuyết minh lặp, mở mã ưu đãi khi cần và chặn tiếp tục khi thiếu bộ; còn cần gộp trạng thái/lỗi |
| C06 | Đơn của tôi / thanh toán — `CustomerFeatures.tsx` có nhiều thông báo trạng thái | Chi tiết đơn và trạng thái tiền dễ thành trang đọc dài. | Danh sách đơn thành hàng ngắn theo trạng thái và ngày; chi tiết ưu tiên “việc cần làm”, số còn thanh toán, hạn nhận/trả; lịch sử và chứng từ mở khi cần. | P1 · Chưa làm |
| C07 | Tài khoản — `CustomerFeatures.tsx` có tiêu đề chào, lời dẫn và trạng thái | Thông tin liên hệ quan trọng nằm dưới các khối giới thiệu. | Hiện tên/email/điện thoại và nút sửa ở đầu; bỏ lời chào và câu giải thích lặp; giữ trạng thái xác minh khi ảnh hưởng thao tác. | P2 · **Đã đưa tên/email/điện thoại lên đầu, chỉ mở form khi sửa; chờ kiểm trực quan** |
| S01 | Bảng việc — `DashboardPage.tsx` có lời chào, nhiều hàng đợi | Công việc ưu tiên có thể chìm dưới phần giới thiệu/tổng hợp. | Đặt việc quá hạn và việc hôm nay ở đầu, mỗi hàng có đơn/hạn/hành động; chỉ số tổng hợp thành dải gọn. | P1 · **Đã giữ nhóm quá hạn trước và thu chỉ số xuống dải 70 px; còn cần kiểm dữ liệu thật và thứ tự việc trong nhóm** |
| S02 | Tạo đơn tại quầy — `StaffFeatures.tsx` trộn tra khách, chọn bộ, quote, kiểm khả dụng | Nhân viên dễ phải chuyển mắt giữa nhiều vùng và đọc thông báo giải thích của API. | Một luồng theo thứ tự khách → bộ + lịch → báo giá → tạo; tự chọn khách khớp duy nhất; chỉ mở tùy chọn nâng cao khi cần. | P1 · Chưa làm |
| S03 | Đang thuê — `StaffFeatures.tsx` và Đơn thuê là hai điểm vào cùng dữ liệu đơn | Người dùng phải quyết định vào mục nào trước khi biết cần làm gì. | Bảng Đơn thuê có view “Đang thuê/Quá hạn” và hành động nhận trả; giữ riêng màn theo dõi barcode chỉ nếu nghiệp vụ tra bộ thật sự cần. | P1 · Chưa làm |
| S04 | Giao/trả — `OrderDetailShell.tsx` nhiều khối `Feedback` và đoạn giải thích về bước xử lý/tiền | Trang rất dài; việc cần làm hiện tại không nổi bật. | Một thanh tiến độ ngắn (quét → kiểm → tiền → hoàn tất), chỉ mở bước đang làm; tóm tắt số bộ/số dư luôn thấy; trạng thái ngoại lệ ở đúng bước. Giữ đối soát/hoàn cọc rõ ràng. | P1 · Chưa làm |
| S05 | Kho/điều chuyển — `InventoryFeatures.tsx` gom nhiều tác vụ trong component lớn | Tra bộ, lịch xử lý, năng lực, block và phiếu dễ thành trang nhiều phần ngang nhau. | Mặc định bảng bộ và tìm barcode; block/lịch/điều chuyển là action hoặc tab theo nhiệm vụ. Sau khi lưu trả về đúng hàng vừa sửa. | P1 · Chưa làm |
| S06 | Khách hàng/CRM — `CrmFeatures.tsx` hồ sơ, case, cảnh báo nằm chung | Khó quét case nào cần xử lý trước. | Bảng khách/case với chủ sở hữu, hạn, trạng thái; chi tiết ở panel; lịch sử thu gọn. | P2 · Chưa làm |
| A01 | Quản trị danh mục — `AdminFeatures.tsx` có mẫu, biến thể, ảnh, phụ kiện và giá trong trang dài | Sửa một thuộc tính phải cuộn và dễ lẫn bản ghi. | Bảng sản phẩm, mở editor theo tab “Thông tin / Biến thể & giá / Ảnh”; lưu theo mục, báo nháp rõ. | P1 · Chưa làm |
| A02 | Nhân viên/vai trò/chi nhánh — `AdminFeatures.tsx` chứa danh sách và form chi tiết | Form và danh sách cùng hiển thị làm trang dài, thay đổi đối tượng có nguy cơ mất ngữ cảnh. | Bảng nhân viên/vai trò, editor theo lựa chọn; hành động tạo mới riêng; nút Lưu cố định khi có nháp. | P1 · Chưa làm |
| A03 | Chính sách/ưu đãi — nhiều điều kiện phức tạp | Nếu hiện toàn bộ điều kiện cùng lúc, quản trị khó biết cấu hình nào đang có hiệu lực. | Danh sách mặc định: tên, hiệu lực, trạng thái, phạm vi; editor tách các nhóm điều kiện, preview kết quả trước lưu. | P2 · Chưa làm |
| A04 | Báo cáo — `AdminFeatures.tsx` | Người quản trị cần câu trả lời nhanh về đơn, tiền, năng lực hơn là nhiều đoạn thuyết minh. | KPI có khoảng thời gian/chi nhánh rõ; bảng chi tiết có bộ lọc, tải dữ liệu; ngày và đơn vị nhất quán. | P2 · Cần kiểm trực quan |
| OPA | Trợ lý vận hành | Theo yêu cầu trước, tính năng đã bị ẩn khỏi điều hướng người dùng. | Giữ ngoài audit điều hướng chính; chỉ đánh giá lại nếu bật tính năng. | Ngoài phạm vi thao tác hiện tại |

## Kế hoạch xử lý và điều kiện nghiệm thu

| Đợt | Phạm vi | Điều kiện nghiệm thu |
| --- | --- | --- |
| 1 — danh sách công việc | O01–O04, G01–G04, S01 | Desktop thấy ít nhất 8 đơn trong viewport 900 px; bảng dùng ≥ phần lớn chiều ngang nội dung; lọc còn một chỗ; mở đúng đơn; mobile không tràn ngang, quay lại danh sách giữ lọc. |
| 2 — hành trình khách | C01–C07 | Từ catalog đến gửi yêu cầu không nhập lại cùng dữ liệu; hai size khác nhau trong một đơn báo giá và lưu đúng; lỗi giá nêu lý do + nơi sửa; thanh toán rõ trạng thái. |
| 3 — tác nghiệp | S02–S06 | Mỗi việc có một CTA rõ, không cần cuộn qua hướng dẫn để làm; barcode và khoản thu có kết quả tại chỗ; phiên bản dữ liệu đổi không để thao tác nhầm. |
| 4 — quản trị | A01–A04, G05 | Danh sách có thể quét/sắp xếp; editor không làm mất nháp; thông báo lỗi cạnh dữ liệu; chính sách/giá không bị thay chỉ vì rút gọn giao diện. |

## Rà soát trước khi coi là hoàn tất

1. Kiểm trên production sau deploy với khách, nhân viên, admin: 375/768/1366/1920 px; dữ liệu 0/1/50+ hàng; tên khách/mẫu dài; màn có lỗi API; zoom 200% và bàn phím.
2. Đếm số lần bấm và thời gian hoàn thành cho năm việc: tìm đơn, xác nhận đơn, tạo tại quầy, khách đặt hai size, nhận trả có phí. So sánh trước/sau với cùng dữ liệu.
3. Tài chính, quyền và trạng thái vận hành phải lấy từ API; không coi giao diện gọn hơn là bằng chứng nghiệp vụ đúng.
