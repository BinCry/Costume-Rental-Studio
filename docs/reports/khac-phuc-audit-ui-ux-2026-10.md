# Khắc phục kiểm toán UI/UX — 17/10/2026

**Nguồn:** Báo cáo “BÁO CÁO KIỂM TOÁN UI/UX TOÀN DIỆN”, đánh giá độc lập ngày 17/10/2026.

**Phạm vi bản sửa:** trải nghiệm khách hàng, booking, tuyến điều hướng, bộ lọc dashboard và các cải thiện an toàn có thể làm ở FE.
**Nguyên tắc:** giữ màu và nhận diện đã duyệt; không giả lập ảnh, size, dịp sử dụng, chính sách, giá hay tính sẵn có khi hệ thống chưa có dữ liệu.

## Kết quả theo backlog UX

| Mã | Kết quả | Thay đổi và điều kiện còn lại |
|---|---|---|
| UX-001 | Đã cải thiện, còn phụ thuộc dữ liệu studio | Gallery chi tiết nhận ảnh theo mẫu/biến thể từ media API khi có; bỏ các thumbnail giả cắt lại cùng một ảnh; ảnh mẫu được đổi sang WebP để giảm tải. Chưa thể thay ảnh minh họa bằng ảnh thương mại thật khi kho media chưa cung cấp đủ ảnh đã duyệt. |
| UX-002 | Đã cải thiện một phần | Trang chủ nêu rõ cách gửi yêu cầu, studio xác nhận từng bộ, nhận/trả cùng chi nhánh, thu tiền thuê và cọc khi nhận, quyết toán cọc sau kiểm tra. Nội dung về vệ sinh, cam kết chất lượng, đánh giá khách và địa chỉ chỉ nên thêm khi studio xác thực thông tin. |
| UX-003 | Đã xử lý | Booking được nhóm thành ba chặng: trang phục và lịch; báo giá và liên hệ; xem lại và gửi. Cơ chế lấy báo giá, vô hiệu báo giá cũ khi thay đổi lựa chọn và kiểm tra trước khi gửi được giữ lại. |
| UX-004 | Chưa đóng | Chưa có dữ liệu hoặc mapping sản phẩm theo dịp sử dụng; chưa thêm bộ lọc dịp để tránh tự gán áo, đầm hay suit vào một sự kiện cụ thể. Cần chủ studio xác nhận danh sách dịp và sản phẩm phù hợp. |
| UX-005 | Đã xử lý | Bổ sung tóm tắt yêu cầu dạng thu gọn trên mobile; hiển thị mẫu, biến thể, số bộ, chi nhánh, ngày và báo giá hiện có. Mở tóm tắt thì nó tham gia luồng nội dung bình thường, không che form. |
| UX-006 | Đã cải thiện ở storefront; còn một phần ở các màn công cụ | Booking, hướng dẫn thuê và trang tài khoản dùng ngôn ngữ dành cho khách; nhãn môi trường mẫu chỉ xuất hiện trên thanh công cụ phát triển. Các từ kỹ thuật vẫn có ở màn vận hành nơi barcode và quyết toán có ý nghĩa với nhân viên. Cần rà soát toàn bộ câu chữ ở từng màn quản trị trước UX sign-off. |
| UX-007 | Đã xử lý | Đường dẫn sai hoặc không giải mã được hiển thị trang không tìm thấy, giữ lại query context và cung cấp đường quay về bộ sưu tập. |
| UX-008 | Đã cải thiện, còn phụ thuộc dữ liệu catalog | Không tự đưa ra số đo phom khi studio chưa cung cấp. Trang chi tiết báo rõ khi chưa có số đo và hỗ trợ ảnh theo biến thể nếu API trả media. Bảng size/fit guide cần số đo đã xác nhận theo từng biến thể. |
| UX-009 | Đã xử lý phía FE; cần smoke test với đăng nhập thật | Chọn đăng nhập/đăng ký trong booking lưu nội dung cần thiết trong `sessionStorage` của tab tối đa 15 phút rồi quay về `/dat-thue?resume=1`. Giá không được khôi phục như báo giá còn hiệu lực; form lấy báo giá mới sau khi người dùng quay lại. Không ghi draft vào local storage bền vững. |
| UX-010 | Một phần; cần quyết định nghiệp vụ/API | FE chỉ trình bày mức phí trả trễ nếu báo giá API trả về; nếu không, yêu cầu khách xác nhận với studio. Hủy, đổi lịch và các điều kiện chưa có hiệu lực chưa được bịa hoặc đưa thành cam kết. Cần policy version hiện hành và nội dung hiển thị đã duyệt từ nghiệp vụ/API. |
| UX-011 | Đã xử lý | Nhóm bộ lọc tác vụ nâng cao trong vùng thu gọn và hiển thị số điều kiện đang áp dụng; thứ tự công việc/CTA chính được giữ nguyên. |
| UX-012 | Đã xử lý | Tăng độ đọc của giá, giá phụ và CTA trong card ở breakpoint mobile; bố cục hẹp 320–359px chuyển sang một cột. |
| UX-013 | Đã xử lý | Carousel hero có nút chọn trực tiếp từng slide, trạng thái đang chọn và nhãn truy cập được; giữ chuyển động đã duyệt. |
| UX-014 | Chưa đóng | Chưa chia nhỏ toàn bộ stylesheet lớn trong lượt này vì rủi ro thay đổi giao diện rộng. Các quy tắc mới được gom theo nhóm chức năng và breakpoint. Tách module CSS cần một lượt riêng có screenshot regression. |
| UX-015 | Đã xử lý ở FE; cần xác nhận phản hồi API production | Catalog gọi kiểm tra theo từng biến thể, chỉ liệt kê size/màu được trả về là còn trong kỳ đã chọn. Nếu một mẫu chưa có biến thể để kiểm tra hoặc việc gọi API lỗi, giao diện giữ trạng thái chưa xác nhận và cho thử lại, không kết luận hết đồ. |
| UX-016 | Chưa đóng toàn bộ | Rút gọn bộ lọc dashboard và giữ các trạng thái vận hành hiện có. Chuẩn hóa list–detail–action cho tất cả màn Kho, CRM, Nhân viên, Vai trò và Đơn cần một lượt đi theo từng tác vụ cùng kiểm thử nhân viên; chưa tuyên bố toàn bộ admin đã được audit lại. |

## Các thay đổi kỹ thuật liên quan

- Hero dùng ảnh WebP minh họa đã có trong repository; tải khoảng 78 KB thay cho PNG khoảng 1,72 MB. Đây vẫn là ảnh minh họa, chưa phải bộ ảnh thương mại cuối cùng.
- Khách hàng xem “Đơn của tôi” trong API mode lấy dữ liệu của chính tài khoản từ endpoint hiện có; không hiển thị các đơn fixture như thể là đơn thật.
- Nội dung phom không tự điền số đo mặc định khi biến thể chưa có ghi chú.
- Trang chi tiết dùng ảnh theo biến thể nếu catalog API cung cấp; khi thiếu ảnh vẫn giữ trạng thái thiếu ảnh trung thực.
- Card catalog hiển thị size/màu có lịch theo từng kết quả API; trạng thái lỗi/thiếu biến thể không bị diễn giải thành hết hàng.
- Thêm kiểm thử cho trang không tìm thấy và kỳ thuê mẫu không bị hết hạn theo ngày cố định.

## Kiểm chứng

- `pnpm --filter @costume/web lint`
- `pnpm --filter @costume/web test`
- `pnpm --filter @costume/web build`
- 29 bài test FE đã qua, gồm kiểm tra route lỗi, kỳ thuê mẫu, khả dụng theo biến thể và trường hợp API không đủ dữ liệu.
- Kiểm tra trực quan trang chủ và booking ở desktop; đi từ chặng chọn mẫu/lịch sang báo giá xem thử, mở đăng nhập và quay lại route tiếp tục booking.
- Build thành công, vẫn cảnh báo bundle JavaScript lớn hơn ngưỡng 500 KB (617 KB trước gzip, khoảng 170 KB sau gzip). Tách chunk là công việc tối ưu kỹ thuật riêng, không thay đổi hành vi trong lượt này.
- Chưa chạy keyboard-only, screen reader hoặc viewport giả lập 320/360/375px; CSS responsive đã được cập nhật nhưng cần lượt QA thiết bị riêng trước UX sign-off.

## Việc cần quyết định hoặc cung cấp trước khi đóng các mục còn mở

1. Bộ ảnh đã duyệt cho từng mẫu, màu và size; alt text hoặc quy tắc mô tả ảnh.
2. Các dịp sử dụng muốn đưa vào trang chủ, cùng danh sách mẫu studio xác nhận phù hợp từng dịp.
3. Bảng số đo/fit guide được studio xác nhận theo biến thể.
4. Nội dung hiệu lực về hủy, đổi lịch, trả muộn, mất/hỏng và thời điểm áp dụng; API cần trả đúng phiên bản policy của báo giá.
5. Kiểm tra trên production rằng endpoint khả dụng trả kết quả cho từng mã biến thể; FE đã dùng kết quả đó để chỉ ra size/màu phù hợp.
6. Kiểm thử đi qua đăng nhập hoặc đăng ký thật trên staging để xác nhận quay lại booking, tiếp tục điền và lấy báo giá mới.
7. Screenshot/keyboard walkthrough theo viewport 320, 360, 375, tablet và desktop; kiểm tra screen reader thực tế trước production UX sign-off.
