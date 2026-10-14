# Biên bản bàn giao sản phẩm web

**Dự án:** Costume Rental Studio  
**Ngày rà soát:** 14/10/2026  
**Phạm vi:** Website khách hàng và khu vận hành kết nối API hiện có. **Ops Agent API không thuộc phạm vi**; màn hình Ops Agent còn lại là fixture/demo.

## 1. Kết quả đã hoàn thiện

- Catalog gộp các size/màu theo một mẫu, dùng ảnh đã công khai từ API, và tạo bộ lọc từ dữ liệu đang có.
- Chọn biến thể xuyên suốt trang chi tiết → đặt thuê → báo giá bằng đúng mã biến thể; kiểm tra lịch theo từng biến thể, chi nhánh và khoảng thời gian. Trạng thái lỗi có thể thử lại và không hiển thị kết quả cũ sau khi đổi kỳ.
- Bàn giao và nhận trả dùng dữ liệu trả thực tế: tình trạng trang phục, số phụ kiện nhận được và tình trạng phụ kiện. Ảnh chứng từ đã tải được giữ lại khi thử lại cùng thao tác; khoản thu đang chờ xác minh không tự tạo lại.
- Hồ sơ CRM đọc lịch sử thuê, tương tác và lịch sử case từ các endpoint hiện hữu, phân biệt đang tải/lỗi/rỗng và có hành động thử lại.
- Bảng việc chỉ hiển thị nhóm việc mà API hiện trả về. Không trình bày số liệu giả cho hàng đợi giao dịch trong chế độ API.
- Thông báo lỗi mạng/API được chuẩn hóa tiếng Việt; các danh sách web đọc đủ trang.
- CI được bổ sung bộ PostgreSQL concurrency tests trên database CI đã chạy migration.

Các thay đổi không bổ sung năng lực nghiệp vụ mới, không sửa Prisma schema, không thay chính sách tiền và không ghi vào database production.

## 2. Kiểm tra kỹ thuật

PR: [#4 – Hoàn thiện UX/API web và kiểm thử production](https://github.com/BinCry/Costume-Rental-Studio/pull/4)

GitHub Actions chạy trên PR:
- API: lint, typecheck, unit tests, build và kiểm tra migrations.
- PostgreSQL: concurrency suite với database CI riêng.
- Web: lint, test, typecheck và build.

**Kết quả:** đang chờ CI hoàn tất; cập nhật trạng thái cuối tại PR trước khi merge.

Rà soát này không thực hiện đăng nhập staging, kiểm tra trình duyệt trên nhiều thiết bị, gọi giao dịch PayOS thật hay deploy. Kết quả CI xác nhận build/test tự động, không xác nhận hoạt động của hạ tầng đang chạy.

## 3. Cổng cần đóng trước phát hành production

1. **Chốt chính sách kinh doanh:** khoảng ân hạn, phí trả trễ, phí hủy, thời hạn/cách hoàn cọc. Các con số trong seed hiện là dữ liệu cấu hình tham khảo, chưa được chủ studio duyệt làm chính sách cuối. Quy tắc đệm lịch 12 giờ trước + 12 giờ sau đã được thống nhất là cấu hình có thể chỉnh, không hard-code.
2. **Đối soát thanh toán:** backend cần chốt cách xử lý phí hủy và callback PayOS đến muộn. Khi giao dịch chưa xác minh, nhân viên cần đối chiếu trạng thái nhà cung cấp; giao diện không tự đánh dấu đã thu/đã hoàn.
3. **Kiểm tra môi trường staging:** đăng nhập thường/Google, CORS và domain web, email, tải ảnh, PayOS webhook, quyền theo vai trò/chi nhánh và smoke test toàn bộ luồng đơn.
4. **Rà migration dữ liệu:** diễn tập migration backfill trên bản sao database gần production để tìm xung đột lịch đã tồn tại trước khi cập nhật dữ liệu thật.
5. **Bảo vệ nhánh:** yêu cầu CI thành công trước khi nhập vào main; sau deploy cần health check và smoke test riêng. CI PR không thay thế bước này.
6. **Quyền CRM:** API lịch sử thuê dùng endpoint đọc đơn theo khách. Nếu tài khoản CRM không có quyền đọc đơn, giao diện giữ thông báo lỗi và cho thử lại; cần chốt ma trận quyền để cấp đúng quyền tối thiểu.
7. **Các API còn thiếu:** hàng đợi thanh toán và trạng thái “chờ xác nhận lâu” chưa được API dashboard cung cấp. Chúng bị ẩn ở chế độ API cho đến khi backend hỗ trợ.

## 4. Trạng thái bàn giao

Mã nguồn đã được đưa lên nhánh review và PR #4. Có thể xem đây là **release candidate để review kỹ thuật**, chưa phải xác nhận hệ thống đã sẵn sàng phát hành production. Chỉ merge sau khi CI thành công và các cổng kinh doanh/hạ tầng ở mục 3 đã được xử lý hoặc được chủ dự án chấp nhận bằng văn bản.
