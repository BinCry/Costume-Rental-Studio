# Báo cáo QA responsive và khả năng truy cập các luồng lõi

Ngày kiểm tra: 03/10/2026. Phạm vi: frontend prototype dùng fixture, chưa có API nghiệp vụ. Vòng này tập trung vào tìm trang phục và đặt thuê; duyệt đơn và gán bộ; giao đồ, đối chiếu tiền thuê và cọc; trả một phần và quyết toán.

## Cách kiểm tra

- Duyệt các luồng bằng trình duyệt tại 375 px; kiểm tra chuyển focus, nội dung hiển thị, trạng thái nút và khả năng phục hồi sau lỗi.
- Kiểm tra chiều ngang ở 360, 768, 1024 và 1440 px trên bốn tuyến `/dat-thue`, `/van-hanh/don-thue`, `/van-hanh/don-thue/RT-1028/giao` và `/van-hanh/don-thue/RT-1035/tra`. Cả 16 tổ hợp không tràn ngang.
- Kiểm tra các fixture `error`, `empty`, `conflict`, `bankPending`, `refundFailed`; kiểm tra hộp thoại xác nhận và phím Escape. Không có lỗi hoặc cảnh báo console trong lượt kiểm tra cuối.
- Chạy ESLint, TypeScript, Vite build và Prettier cho các tệp thay đổi.

## Phát hiện và cách sửa

| Mức | Luồng | Trước | Sau |
| --- | --- | --- | --- |
| P0 | Giao đồ, đổi sang chuyển khoản chờ đối soát | Thông báo thành công “tiền mặt đã đủ” vẫn hiện dù phương thức chuyển khoản chưa đối soát và nút giao bị khóa. | Kết quả xem trước gắn với đơn, phiên bản, kịch bản, mã đã quét, checklist, phương thức, hai khoản tiền và ghi chú. Thay đổi điều kiện sẽ ẩn kết quả cũ; cảnh báo chờ đối soát và trạng thái chưa thu hiển thị nhất quán. |
| P1 | Đặt thuê trên mobile | Qua bước, focus ở nút dưới cùng; tiêu đề bước mới có thể nằm ngoài vùng đang đọc. Khi nhập sai, focus cũng ở nút dưới cùng. | Focus và cuộn tới tiêu đề bước mới; khi có lỗi biểu mẫu, focus tới trường sai đầu tiên hoặc thông báo lỗi. Sau khi gửi thành công, focus tới tiêu đề xác nhận. |
| P1 | Chọn đơn trên mobile | Danh sách biến mất, chi tiết đơn ở dưới màn hình; focus rơi về `body`. | Chọn đơn đưa focus tới nút quay lại và cuộn chi tiết vào màn hình. Quay lại danh sách phục hồi focus đúng dòng đã chọn. |
| P1 | Xung đột gán bộ | Đơn báo bộ vừa hết khả dụng ở đầu trang trong khi nhân viên đang ở cuối trang; focus rơi về `body`. | Thông báo được focus và đưa vào màn hình; nút “Xem bộ còn trống” trở lại phần chọn bộ. Bộ hợp lệ đã chọn vẫn được giữ. |
| P1 | Chuyển khu trên mobile | Menu khách không có lối vào khu vận hành và ngược lại. | Bổ sung liên kết chuyển khu trong menu mobile và khai báo `aria-controls` cho nút mở menu. |
| P2 | Tiến độ đặt thuê | Vùng nhấn của các nút bước cao 42 px tại 360 px. | Tăng tối thiểu lên 44 px. |

Điều hướng nội bộ cũng chuyển focus tới vùng nội dung chính sau khi đổi trang. Các thay đổi này chỉ điều chỉnh giao diện và tương tác, không thay đổi điều kiện xác nhận đơn, ghi nhận thanh toán hay hoàn cọc.

## Kết quả theo tình huống

- **Đặt thuê:** báo giá snapshot tách tiền thuê và tiền cọc; lỗi tải có nút thử lại; dữ liệu rỗng có đường về danh mục; lỗi tên hoặc số điện thoại chỉ rõ trường cần sửa. Yêu cầu gửi trong fixture chưa giữ bộ cho đến khi studio xác nhận.
- **Duyệt đơn:** hộp thoại cho xem lại hai barcode trước khi xác nhận; Escape đóng và trả focus về nút gọi. Với `conflict`, BC-001 bị đánh dấu không khả dụng, BC-012 vẫn được chọn; có thể trở lại chọn mã khác.
- **Giao đồ:** chỉ cho xem trước điều kiện giao sau khi quét đủ bộ, đánh dấu tình trạng và phụ kiện, đối chiếu riêng tiền thuê và cọc. `bankPending` hiển thị chưa thu, khóa bước cuối, không còn thông báo tiền mặt cũ.
- **Trả đồ:** quét 1/2 bộ vẫn ghi rõ bộ còn lại ở khách và chưa quyết toán hoặc hoàn cọc. `refundFailed` hiển thị cảnh báo giao dịch hoàn chưa thành công, giữ trạng thái cọc đang giữ và khóa xem trước quyết toán theo fixture.

## Giới hạn và việc cần quyết định khi nối API

- Kiểm tra bằng trình duyệt và cây truy cập; chưa thử với thiết bị thật, bàn phím vật lý hoặc trình đọc màn hình chuyên dụng. Cần chạy lại các luồng này trong môi trường tích hợp.
- Trạng thái còn đồ ở catalog hiện theo mẫu; API cần cung cấp khả dụng theo biến thể, chi nhánh và kỳ thuê để khách hiểu đúng trước khi gửi yêu cầu. Fixture có thể cho gửi một biến thể mà nhân viên không tìm được bộ đủ điều kiện.
- Xác nhận đơn, khóa bộ, đối soát chuyển khoản, ghi nhận thu tiền và hoàn cọc hiện chỉ là xem trước. Backend cần kiểm tra phiên bản đơn, quyền theo vai trò và chi nhánh, tính khả dụng và giao dịch tiền trước khi đổi trạng thái thật.
- Quy tắc tính “một ngày thuê” là chính sách cần cấu hình và trả về trong báo giá. Giao diện không tự tính lại phí hoặc tiền hoàn.
