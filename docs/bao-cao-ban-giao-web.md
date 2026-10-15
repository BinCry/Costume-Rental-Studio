# Biên bản bàn giao sản phẩm web

**Dự án:** Costume Rental Studio  
**Ngày rà soát:** 15/10/2026  
**Phạm vi:** Website khách hàng và khu vận hành kết nối API hiện có. **Ops Agent API không thuộc phạm vi**; màn hình Ops Agent tiếp tục ở chế độ fixture/demo.

## 1. Kết quả đã hoàn thiện

- Catalog gom size/màu theo mẫu, dùng ảnh công khai từ API và tạo bộ lọc theo dữ liệu thực. Trang chi tiết và đặt thuê giữ đúng biến thể đến bước báo giá; kiểm tra lịch theo biến thể, chi nhánh và khoảng ngày.
- Đơn thuê tải toàn bộ trang dữ liệu API, phân biệt trạng thái rỗng/lỗi/đang tải và có hành động khôi phục. Các lỗi API phía web được chuẩn hóa tiếng Việt.
- Bàn giao và nhận trả lưu bằng chứng theo từng bộ, kiểm tra grade thực tế và số lượng/tình trạng phụ kiện. Khi lỗi version hoặc trạng thái, nhân viên tải lại dữ liệu rồi quét lại thay vì gửi lại thao tác cũ.
- Luồng nhận đồ thất lạc tách khỏi quét barcode: nhân viên phải ghi lý do, đính kèm chứng từ/hình ảnh liên quan và xác nhận rõ thao tác. API sẽ đưa bộ đồ sang trạng thái ngừng khai thác; form không bắt nhân viên bịa tình trạng hay lịch sửa cho món không được nhận về.
- Luồng quyết toán cho phép nhân viên có quyền ghi nhận tiền mặt hoặc chuyển khoản đã đối soát cho khoản phí bổ sung. Số thu lấy từ snapshot mới nhất của máy chủ; khoản đang chờ đối soát chặn lần thu tiếp. Khóa idempotency tách từng lần thu để retry cùng thao tác không tạo khoản trùng.
- API chặn thu phí bổ sung và tạo hoàn cọc trong lúc biên bản còn chờ đánh giá; phí gia hạn đã thu trước thời điểm trả không tự khóa việc đánh giá. Hoàn tất đơn từ chối thu dư so với số phí ròng phải thu; số dư phí không âm.
- Màn hình hoàn cọc chỉ hiển thị bản ghi và trạng thái máy chủ. Không có nút tạo/đánh dấu hoàn vì phương thức và thời hạn hoàn cọc chưa được Studio chốt.
- CRM đọc lịch sử thuê, tương tác và case từ endpoint hiện có. Bảng việc chỉ hiển thị nhóm công việc API đang cung cấp; Ops Agent vẫn gắn nhãn fixture/demo.
- Không thay đổi Prisma schema, không thêm migration, không ghi production database và không deploy.

## 2. Kiểm tra kỹ thuật

PR: [#4 – Hoàn thiện UX/API web và kiểm thử production](https://github.com/BinCry/Costume-Rental-Studio/pull/4)

GitHub Actions trên PR chạy API lint/typecheck/unit tests/build, kiểm tra migrations, PostgreSQL concurrency suite và web lint/test/typecheck/build. Toàn bộ workflow đã thành công ở run [#202](https://github.com/BinCry/Costume-Rental-Studio/actions/runs/38681231691), kiểm tra commit mã nguồn `65892885389e2de52bc28c24cc9dd5a9b06103e0` (15/10/2026).

Rà soát này không thực hiện đăng nhập staging, kiểm tra trình duyệt trên nhiều thiết bị, gọi giao dịch PayOS thật hay deploy. CI xác nhận mã nguồn build/test theo workflow, không chứng minh cấu hình hạ tầng đang chạy.

## 3. Việc cần đóng trước khi gọi là production

1. **Chốt chính sách kinh doanh:** khoảng ân hạn, phí trả trễ, phí hủy và cách/thời hạn hoàn cọc. Quy tắc đệm lịch 12 giờ trước + 12 giờ sau được thống nhất là cấu hình có thể chỉnh, không hard-code. Phương thức và SLA hoàn cọc vẫn để mở.
2. **Đối soát thanh toán:** cần kiểm chứng PayOS thật, webhook đến muộn, khoản thu đang chờ/đã hủy và đối soát chuyển khoản. Phí hủy và các trường hợp thanh toán muộn cần quyết định nghiệp vụ cuối.
3. **Smoke test staging:** đăng nhập thường/Google, CORS/domain, email, lưu ảnh, phân quyền vai trò/chi nhánh, đặt thuê, nhận trả, thu tiền, hoàn cọc và CRM.
4. **Diễn tập migration:** chạy migration/backfill trên bản sao database gần production, kiểm tra dữ liệu lịch thuê chồng lấn và khả năng khôi phục.
5. **Bảo vệ nhánh:** bật required checks cho main. Công cụ hiện không xác nhận được cấu hình branch protection; cần quản trị repo kiểm tra trực tiếp.
6. **Kiểm tra sau deploy:** health check, luồng đăng nhập, đặt thuê và giao dịch thử ở môi trường production theo quy trình vận hành của Studio.
7. **Ops Agent:** API agent chưa hoàn tất và bị loại khỏi phạm vi bàn giao này; trang hiện tại là fixture/demo, không được xem như tích hợp production.

## 4. Trạng thái bàn giao

Mã nguồn nằm trên nhánh review và PR #4; commit mã nguồn đã qua CI đầy đủ, nhưng PR chưa được merge và chưa deploy. Đây là **release candidate đã qua kiểm tra tự động, sẵn sàng cho review và staging**, không phải chứng nhận production đã sẵn sàng. Cần hoàn tất hoặc được chủ dự án chấp nhận các cổng nghiệp vụ/hạ tầng ở mục 3 trước khi phát hành thật.
