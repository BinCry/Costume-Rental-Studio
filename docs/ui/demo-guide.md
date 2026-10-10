# Hướng dẫn trình diễn giao diện toàn hệ thống

## Phạm vi

Frontend hiện có 18 màn hình theo [design-implementation-plan.md](design-implementation-plan.md): 5 màn hình lõi đã duyệt và 13 màn hình mở rộng. Fixture chỉ dùng để phát triển và trình diễn giao diện; những luồng đã nối API sẽ đọc/ghi dữ liệu thật khi có phiên API phù hợp.

| Cách chạy | Nguồn dữ liệu và hành vi |
|---|---|
| Local, không cấu hình `VITE_API_URL` | Fixture trong bộ nhớ; thanh **Kiểm tra UI fixture** cho chọn tình huống, vai trò và chi nhánh. |
| Local, có `VITE_API_URL`, chưa đăng nhập API | Fixture để demo; có thể đăng nhập bằng tài khoản API ở thanh phía trên. |
| Local, đã đăng nhập API | Màn hình đã tích hợp dùng API. Lỗi máy chủ hoặc quyền được hiển thị; không âm thầm đổi sang fixture. |
| Production | Bắt buộc cấu hình `VITE_API_URL`. Danh mục công khai lấy từ API; đặt thuê, đơn riêng tư và khu vận hành yêu cầu đăng nhập. Không có thanh fixture và không dùng dữ liệu mẫu làm dự phòng. |

Fixture không ghi vào PostgreSQL và được đặt lại khi tải lại trang. Trong production, thiếu API URL làm trang hiện lỗi cấu hình để tránh trình diễn nhầm dữ liệu mẫu như dữ liệu cửa hàng.

Chạy từ thư mục gốc:

```bash
pnpm install
pnpm --filter @costume/web dev
pnpm --filter @costume/web typecheck
pnpm --filter @costume/web lint
pnpm --filter @costume/web build
```

## Đường dẫn

| Khu vực | Đường dẫn | Màn hình |
|---|---|---|
| Khách | `/` | Bộ sưu tập |
| Khách | `/trang-phuc/:ma-mau` | Chi tiết trang phục |
| Khách | `/dat-thue` | Gửi yêu cầu thuê |
| Khách | `/don-cua-toi`, `/don-cua-toi/:ma-don` | Đơn và chi tiết đơn của hồ sơ mẫu đang chọn |
| Chung | `/tai-khoan` | Google sign-in entry, hoàn thiện hồ sơ và trạng thái tài khoản ở mức UI |
| Vận hành | `/van-hanh/tong-quan` | Bảng việc |
| Vận hành | `/van-hanh/don-thue`, `/van-hanh/don-thue/:id` | Không gian xử lý đơn |
| Vận hành | `/van-hanh/don-thue/:id/giao`, `/van-hanh/don-thue/:id/tra` | Giao/thu và nhận trả/quyết toán |
| Vận hành | `/van-hanh/tao-don` | Tạo yêu cầu tại quầy |
| Vận hành | `/van-hanh/dang-thue` | Theo dõi từng bộ đang ở khách |
| Kho | `/van-hanh/kho`, `/van-hanh/dieu-chuyen` | Bộ theo barcode và phiếu điều chuyển |
| CRM | `/van-hanh/khach-hang` | Hồ sơ và case |
| Quản trị | `/quan-tri/danh-muc`, `/quan-tri/nhan-vien`, `/quan-tri/vai-tro`, `/quan-tri/chi-nhanh`, `/quan-tri/chinh-sach`, `/quan-tri/bao-cao` | Danh mục/giá, nhân viên, quyền, chi nhánh, chính sách, báo cáo |

## Cách dùng fixture

Khi chạy Vite ở chế độ phát triển, thanh **Kiểm tra UI fixture** cho chọn tình huống, vai trò, chi nhánh và hồ sơ khách. Thanh này không có trong bản build production. Tình huống demo chỉ điều khiển fixture; nó không giả lập kết quả của máy chủ API. Vai trò và mã quyền fixture bám `apps/api/prisma/seed/core.ts`; role nhân viên chỉ hiệu lực tại chi nhánh được phân công. Quản trị có phạm vi toàn chuỗi. Các checkbox ở `/quan-tri/vai-tro` sửa permission trên role, scope hiển thị theo mã quyền và không thể tự đổi.

Các tình huống có sẵn: tải, trống, lỗi mạng, mất quyền, xung đột gán bộ, đơn đổi phiên bản, khách hủy khi duyệt, chuyển khoản chưa đối soát, hoàn cọc lỗi, barcode không thấy/khác chi nhánh, và bộ đang vệ sinh/sửa. Chọn **Bình thường** để thực hiện luồng fixture. Những thao tác tạo/sửa chỉ được hiển thị là hoàn tất sau khi adapter trả thành công.

Luồng demo gợi ý:

1. Ở fixture, chọn Áo dài Lina và kỳ mẫu 10/10/2026 09:00–12/10/2026 09:00 tại Quận 1. Yêu cầu mới xuất hiện ở **Đơn của tôi** cho hồ sơ khách vừa nhập và trong hàng đợi nhân viên. Với API, chọn lịch tương lai để lấy báo giá do máy chủ tính.
2. Trong `/van-hanh/don-thue/:id`, chọn đủ barcode READY và xác nhận theo quyền. Ở fixture, có thể chọn **Xung đột bộ** để xem trạng thái lỗi; với API, máy chủ kiểm tra quyền và phiên bản đơn.
3. Tại quầy, tìm khách hoặc lưu hồ sơ khách mới, chọn mẫu/biến thể/kỳ thuê, kiểm tra báo giá và khả dụng. Tạo yêu cầu chờ xử lý hoặc gán một bộ khi xác nhận nếu tài khoản có quyền. Tiền thuê và cọc được thu ở bước giao đồ.
4. Tra `BC-031` ở **Đang thuê** để xem khách giữ, đơn, hạn trả và mở luồng nhận trả. Tại **Kho**, xem trạng thái vận hành riêng với khả dụng theo kỳ; thử `BC-018` cho tình huống bộ bị block.
5. Ở **Điều chuyển**, mở `DC-001`, duyệt, xuất `BC-012`, chọn tình trạng nhận và xác nhận nhận từng bộ. Chi nhánh hiện tại của bộ chỉ đổi sau bước nhận.
6. Tại **Vai trò**, chọn một role, tick/bỏ mã quyền và lưu. Chuyển vai trò/chi nhánh trên thanh fixture để xem menu hiệu lực thay đổi. Chọn nhân viên kho ở Quận 1 sẽ thấy trạng thái chưa được phân công; chuyển sang Thủ Đức để xem quyền kho.

## Kiến trúc và giới hạn

- `apps/web/src/app/routes.ts` khai báo đường dẫn; `app/StudioApp.tsx` quản lý điều hướng và context fixture. Component dùng chung ở `components/ui.tsx`, `components/studio.tsx`; token nằm ở `index.css`.
- `fixtures/adapter.ts` và `fixtures/studio.ts` giữ dữ liệu demo và chuyển tiếp sang API ở những thao tác đã tích hợp. Màn hình dùng snapshot từ API cho báo giá/quyết toán; lỗi API không được thay bằng dữ liệu fixture.
- Thuê, cọc, phụ phí và hoàn cọc hiển thị riêng. Chuyển khoản chưa đối soát không được coi là đã thu; cọc đang giữ không cộng doanh thu. Trạng thái hoàn cọc được hiển thị theo dữ liệu máy chủ, không tự suy ra số tiền hoàn.
- Cấu hình giữ tạm trang phục trong lúc đơn chờ nhân viên duyệt vẫn cần được chốt giữa nghiệp vụ và backend. Hiện giao diện báo rõ đây là chính sách còn mở; không tự hứa giữ bộ.
- Quyền duyệt, chuẩn bị, giao, nhận trả và quyết toán được backend kiểm theo phiên và chi nhánh. Mã `rentals.manage.branch` đang bao phủ các thao tác nghiệp vụ nơi seed chưa cấp mã quyền chi tiết riêng; UI không tự tạo thêm quyền.
- Danh sách người nhận case CRM được đọc qua quyền CRM tại chi nhánh; nhân viên CRM không cần quyền quản trị nhân sự để xử lý case. Quyền thu tiền cho quản trị toàn chuỗi dùng mã phạm vi `ALL` riêng, được thêm bằng migration dữ liệu `20261011020000_global_payment_permissions`.
- Giá thuê/cọc được máy chủ lấy theo biến thể và chính sách hiện hành. Giá theo chi nhánh hoặc lịch giá cần quyết định và endpoint riêng nếu dự án muốn hỗ trợ. CRM hiện tập trung vào hồ sơ, lịch sử tương tác và case; loyalty, chiến dịch, consent và phân nhóm khách chưa thuộc phạm vi hiện tại.

Khi nối backend, ưu tiên thay từng hàm adapter bằng API trả cùng shape và giữ các trạng thái lỗi/xung đột. Backend phải kiểm quyền theo người dùng, role và chi nhánh trên mỗi yêu cầu; kiểm tra UI không thay thế phân quyền server.
