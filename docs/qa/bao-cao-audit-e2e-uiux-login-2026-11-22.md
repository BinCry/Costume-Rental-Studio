# Báo cáo audit E2E, UI/UX và đăng nhập theo vai trò

**Ngày:** 22/11/2026  
**Môi trường:** Docker local cô lập, không dùng production  
**Web:** `http://localhost:5180`  
**API readiness:** `http://localhost:4180/health/ready`

## Kết luận

Các luồng kiểm thử tự động đã chạy qua local và đạt. Sáu tài khoản/nhóm quyền được đăng nhập riêng; các màn được cấp quyền tải đúng, còn một số URL không được cấp quyền hiển thị từ chối truy cập. Luồng thuê từ khách gửi yêu cầu đến nhân viên giao/nhận, quyết toán tiền mặt, khách đánh giá kèm ảnh và admin ẩn/khôi phục đánh giá cũng hoàn tất.

Không phát hiện tràn ngang toàn trang ở các viewport đã kiểm. Điều này chưa loại trừ việc chữ hoặc nút bị xuống dòng vụn trong một ô. Audit trực quan còn thấy một số vấn đề về độ đậm chữ, mật độ bảng, căn chỉnh cột và sử dụng khoảng trống; danh sách đề xuất nằm bên dưới.

## Phạm vi và tài khoản

Các phiên đăng nhập local được kiểm tra độc lập:

| Vai trò/nhánh | Tài khoản local | Kết quả |
| --- | --- | --- |
| Khách hàng | `customer1@costume.local` | Đăng nhập, chuyển đến đơn thuê của khách; menu không lộ chức năng nhân viên/admin |
| Nhân viên bán hàng, Quận 1 | `sales.q1@costume.local` | Vào bảng việc; thấy chức năng bán hàng được gán |
| Nhân viên kho, Quận 1 | `inventory.q1@costume.local` | Vào bảng việc; chỉ thấy kho và điều chuyển |
| Nhân viên bán hàng, Quận 3 | `sales.q3@costume.local` | Menu và chi nhánh đúng quyền/nhánh |
| Nhân viên kho, Quận 3 | `inventory.q3@costume.local` | Menu và chi nhánh đúng quyền/nhánh |
| Admin | `admin@costume.local` | Vào báo cáo quản trị; thấy menu quản trị |

Mật khẩu local không được ghi vào báo cáo. Có thể đọc từ `local-test/.env` theo hướng dẫn trong `local-test/README.md`. Không dùng các tài khoản này ngoài Docker local.

## Bao phủ màn hình và responsive

Các viewport được kiểm: **320, 375, 390, 768, 1024 và 1440 px**.

- **34 tổ hợp màn hình/vai trò**, mỗi tổ hợp kiểm tại cả 6 viewport (204 lần tải màn hình): 5 màn khách hàng, 9 màn nhân viên bán hàng, 4 màn nhân viên kho và 16 màn admin. Bao gồm dashboard, đơn thuê và chi tiết/giao/nhận, tạo tại quầy, đang thuê, kho, điều chuyển, khách hàng/CRM, báo cáo, catalog, nhân viên, vai trò, chi nhánh, chính sách, ưu đãi và đánh giá.
- **7 màn public/auth** kiểm tại 6 viewport: trang chủ, đặt thuê, đăng nhập, đăng ký, khôi phục mật khẩu, callback OAuth báo lỗi và chi tiết trang phục.
- **40 ảnh chụp UI desktop** đã lưu trong `apps/web/test-results/ui-audit-all/` để đối chiếu nhanh theo vai trò.
- Thử riêng menu mobile, menu đăng xuất, phân trang đơn thuê, hộp thoại thử đồ ảo, tải ảnh lên và các trạng thái đăng nhập/khôi phục mật khẩu.
- Đo `scrollWidth`/`clientWidth` không thấy trang nào tràn ngang ở các route responsive nêu trên. Một số nhãn trong ô vẫn xuống dòng hoặc sát cột; đây là lỗi bố cục nội bộ, không phải tràn toàn trang.

Kiểm quyền truy cập trực tiếp: nhân viên kho bị từ chối ở tạo tại quầy, CRM, báo cáo, giao và nhận; nhân viên bán hàng bị từ chối ở điều chuyển. Các đường dẫn bị chặn hiển thị thông báo rõ ràng.

## Kết quả E2E

| Hạng mục | Kết quả |
| --- | --- |
| Playwright trên trình duyệt local | **28/28 kịch bản đạt** trong lượt chạy cuối ngày 22/11/2026 |
| API smoke | **14/14 kịch bản đạt** |
| API workflow E2E | **15/15 kịch bản đạt** |
| Upload/đọc ảnh catalog từ S3 local | Đạt; không dùng dịch vụ lưu trữ production |
| Luồng thuê qua UI | Đạt: báo giá → gửi yêu cầu → nhân viên xác nhận/gán bộ → chuẩn bị → giao và thu tiền mặt → nhận trả/đánh giá tình trạng → quyết toán/hoàn cọc tiền mặt → hoàn tất |
| Đánh giá | Đạt: khách gửi sao, nội dung và ảnh → ảnh hiển thị công khai → admin ẩn/khôi phục → kiểm tra lại trang công khai |
| Hệ thống thanh toán ngoài | Không gọi PayOS; chỉ tạo giao dịch tiền mặt trong DB local |

API workflow còn bao gồm voucher, thuê nhiều size, chuyển kho, khóa vệ sinh, khung năng lực, CRM và báo cáo. Automation chặn request rời khỏi các dịch vụ local trong các luồng tương ứng; thử đồ không mở camera thật hoặc tải model AI.

## Bổ sung thao tác CRUD trực tiếp trên UI

Đã thêm và chạy các kịch bản UI CRUD trên Docker local. Bản ghi thử dùng mã `E2E-*`; quyền vai trò được khôi phục sau khi xác minh, còn bộ vật lý được ngừng sử dụng theo nghiệp vụ thay vì xóa mất lịch sử.

| Màn/nhóm | Thao tác đã xác minh |
| --- | --- |
| Ưu đãi | Tạo, tìm, sửa, tắt/bật và tải lại mã ưu đãi |
| Chi nhánh và nhân viên | Tạo/sửa/ngừng chi nhánh; tạo/sửa nhân viên; gỡ phân công; chấm dứt hồ sơ |
| Danh mục | Tạo/sửa mẫu; tạo biến thể và phụ kiện; sửa/ngừng phụ kiện; tải ảnh, sửa mô tả, đặt ảnh chính, thay và xóa ảnh test |
| Khách hàng/CRM | Tạo hồ sơ và ghi nhận trao đổi; kiểm tra lịch sử trao đổi lưu lại; khách sửa/hủy form liên hệ và khôi phục dữ liệu ban đầu |
| Tạo tại quầy | Chọn khách/mẫu/biến thể, xem báo giá, tạo yêu cầu chờ, mở đơn và hủy yêu cầu test |
| Danh sách đơn | Tìm, lọc, sắp xếp, chuyển trang, mở/đóng chi tiết đơn thuê |
| Phân quyền | Chọn/bỏ nhóm, lưu thay đổi một quyền, tải lại xác nhận và khôi phục quyền ban đầu |
| Chính sách và báo cáo | Tạo phiên chính sách mới (phiên đã ban hành không sửa); lọc báo cáo và tải CSV |
| Kho và lịch xử lý | Nhập bộ, kiểm tra đưa vào sẵn sàng, đổi trạng thái, tạo/sửa/bắt đầu/hoàn tất/hủy lịch xử lý, tạo/sửa/xóa khung năng lực, ngừng bộ test |
| Điều chuyển | Tạo phiếu, duyệt, xuất, nhận đủ; hủy và từ chối hai phiếu riêng |
| Đơn thuê và đánh giá | Từ báo giá/đặt thuê qua xác nhận, chuẩn bị, giao, nhận trả, quyết toán/hoàn cọc tiền mặt; gửi đánh giá và ảnh; admin ẩn/khôi phục đánh giá |

Các thao tác hủy, từ chối, ngừng sử dụng và phiên chính sách bất biến được kiểm theo đúng vòng đời nghiệp vụ; không thay bằng hard-delete dữ liệu có lịch sử.

Hai lỗi chức năng được phát hiện và sửa trong lượt này: lưu hồ sơ nhân viên có thể dừng trước khi lưu thao tác gỡ phân công; nút hủy/từ chối phiếu điều chuyển gọi sai endpoint API. Cả hai đã được xác nhận lại qua UI và API local.

**Phạm vi còn lại:** lượt chạy bao phủ 28 kịch bản, các màn được phân quyền và các thao tác CRUD/lifecycle nêu trong bảng; chưa phải kiểm từng nút điều hướng/trang trí và mọi tổ hợp lọc/phân trang trên tất cả màn. Báo cáo là chỉ đọc; chính sách là phiên bản bất biến; hồ sơ CRM chưa có nút sửa/xóa trong UI hiện tại. Ops Agent tiếp tục để ngoài phạm vi theo chỉ dẫn trước đó và không có service AI trong local-test.

## Phát hiện UI/UX

| Mức | Màn/điểm | Hiện trạng quan sát được | Đề xuất | Trạng thái code |
| --- | --- | --- | --- | --- |
| P2 | Đơn thuê nhân viên/admin | Bảng có nhiều cột; tên chi nhánh dài và nút **Chi tiết** bị ngắt dòng, làm hàng cao và khó quét nhanh. | Giữ nhãn hành động trên một dòng; đặt chiều rộng tối thiểu cho cột hành động/mã đơn; trên màn hẹp dùng vùng cuộn ngang có chỉ báo hoặc chuyển thành danh sách gọn. | Đã đặt chiều rộng tối thiểu cho cột chi nhánh/thao tác và giữ nút **Chi tiết** trên một dòng. Cần kiểm tra trực quan ở desktop/mobile. |
| P2 | Tạo đơn tại quầy | Form nằm lệch trái; khối báo giá ở góc trên bên phải kết thúc sớm, để khoảng trống lớn ở phần dưới/trên phải. | Cho tóm tắt báo giá bám theo vùng nhìn khi cuộn; cân lại tỉ lệ hai cột và giới hạn chiều rộng form để bước nhập và kết quả luôn liên hệ rõ. | Đã cân lại tỉ lệ cột và ghim tóm tắt báo giá trên desktop; màn hẹp trở về một cột. Cần kiểm tra cuộn thực tế trên trình duyệt. |
| P2 | Các trang quản trị | Chữ dữ liệu và nhãn trong bảng nhỏ; nền tím nhạt, viền xanh/lavender và trạng thái màu có độ tương phản/hệ phân cấp chưa nhất quán. | Tăng cỡ chữ dữ liệu/nhãn, làm rõ tiêu đề–dữ liệu–trạng thái, dùng màu trạng thái có ý nghĩa và kiểm tra tương phản theo WCAG trước khi kết luận tuân thủ. | Đã tăng cỡ chữ bảng và làm dịu nền/viền portal. Chưa đo tương phản WCAG và chưa xác nhận trực quan. |
| P2 | Ưu đãi | Mã và thời gian hiệu lực dài chiếm nhiều dòng; thời điểm kết thúc sát badge trạng thái nên khó đọc đủ khoảng ngày. | Tách mã khỏi tên chương trình, định dạng khoảng ngày gọn; bảo đảm cột thời hạn có min-width hoặc bố trí nội dung phụ dưới ngày trên màn vừa. | Đã tách hai mốc thời gian thành phần tử có ngữ nghĩa; ngày nằm cùng hàng ở desktop, xếp dọc trên mobile; bảng có vùng rộng đủ để cuộn ngang. Cần kiểm tra trực quan. |
| P3 | Kho trên mobile | Một số badge trạng thái như **Sẵn sàng** xuống hai dòng, làm nhãn vận hành mất gọn. | `white-space: nowrap` cho badge; khi thiếu chỗ, cho hàng chuyển sang bố cục thẻ thay vì ép badge nhỏ. | Đã giữ badge một dòng; bố cục thẻ mobile đã có sẵn. Cần kiểm tra trên viewport nhỏ. |
| P3 | CRM / khách hàng | Bảng đọc được trên desktop nhưng khoảng trống dưới danh sách lớn khi ít bản ghi; màn chi tiết và form dài nằm cùng một trang. | Dùng empty state ngắn có CTA; chuyển tạo/sửa hồ sơ và ghi trao đổi sang dialog theo quy tắc bảng + popup đã thống nhất. | Màn CRM hiện có bảng và dialog chi tiết/tạo/trao đổi; đã rút gọn trạng thái danh sách trống/không có kết quả. Hồ sơ khách chưa có thao tác sửa/xóa; đây vẫn là giới hạn sản phẩm. |
| P3 | Đánh giá admin | Trạng thái chưa có kết quả để lại panel rỗng cao hơn nội dung cần thiết. | Thu gọn vùng trống, đưa thông báo và thao tác lọc/xóa lọc gần nhau. | Đã thu gọn empty state và thêm thao tác xóa bộ lọc khi không có kết quả do lọc. Cần kiểm tra trực quan. |
| P3 | Thử đồ ảo | Bundle thử đồ tạo cảnh báo kích thước chunk trên 500 KB ở build. | Tải trễ module/các model chỉ khi người dùng mở thử đồ; giữ màn catalog và đặt thuê nhẹ hơn trên thiết bị di động. | Đã chuyển canvas, tải trang phục do người dùng tải lên, bảng look và phản hồi sang import tải trễ. Chưa chạy build nên chưa đo lại kích thước chunk. |

Các sửa trên mới được rà ở mức mã nguồn trong lượt này; không chạy build, test hoặc automation. Các trạng thái “đã” trong bảng chưa đồng nghĩa đã xác nhận hình ảnh/hiệu năng sau render.

## Giới hạn kiểm thử

Đã đăng nhập từng vai trò, tải các route được cấp quyền tại các kích thước đã nêu, kiểm tra route bị chặn và chạy 28/28 kịch bản trình duyệt local. Các module CRUD có dữ liệu test riêng được thao tác theo bảng ở trên; không khẳng định từng nút điều hướng hoặc toàn bộ tổ hợp filter/phân trang đã được bấm thủ công.

Không kiểm xác thực Google thành công, gửi OTP/email thật, camera/GPU thật hoặc thu/hoàn tiền qua PayOS. Callback Google lỗi và màn khôi phục mật khẩu được kiểm ở UI. Đây là giới hạn của môi trường local, không phải xác nhận các tích hợp thật đã hoạt động.

## Trạng thái môi trường và thay đổi trong phiên

- Bốn dịch vụ local hiện chạy: web `5180`, API `4180`, PostgreSQL `55484`, S3 `59000`; container `migrate` có thể ở `Exited (0)` sau khi hoàn thành bình thường.
- Bản seed local được đồng bộ core permissions để tài khoản bán hàng Quận 3 nhận đúng quyền báo cáo. Cập nhật seed chạy lặp lại không xóa dữ liệu đơn/đánh giá hiện có.
- Test đã tạo thêm dữ liệu chỉ trong DB local; không ghi dữ liệu lên production.
- Khi dựng lại riêng web, Compose đã gọi container seed trên DB local đã có dữ liệu và phát hiện mã unit sinh từ branch/variant E2E có thể dài quá giới hạn 50 ký tự. Công thức mã unit local đã được sửa theo hướng rút gọn có hash ổn định; không chạy lại seed trên volume đang chứa dữ liệu E2E để tránh ghi đè trạng thái kho.
- Không tạo commit hoặc push trong phiên này. Workspace có sẵn các thay đổi từ trước; báo cáo không khẳng định toàn bộ diff hiện tại chỉ thuộc audit.

## Đề xuất thứ tự xử lý

1. Mở local và kiểm tra trực quan các sửa bảng đơn thuê, kho, ưu đãi, CRM và đánh giá ở desktop/mobile.
2. Kiểm tra trạng thái cuộn của báo giá tại quầy và xác nhận không che form/nội dung khi màn hình thấp.
3. Chạy build để đo lại chunk thử đồ, sau đó kiểm tra luồng mở/đóng tải trang phục và chuyển sang chế độ ảnh.
4. Đo tương phản màu trên các trang quản trị; chỉ kết luận WCAG sau khi có số đo.
5. Mở rộng kiểm tra các nút điều hướng, bộ lọc/phân trang còn lại theo từng màn và xác nhận với người dùng nghiệp vụ trước khi chuẩn bị phát hành.
