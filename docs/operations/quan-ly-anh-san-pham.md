# Quản lý ảnh sản phẩm

## Phạm vi

Quản trị viên hoặc nhân viên được cấp quyền `catalog:manage` có thể quản lý thư viện ảnh của từng mẫu trang phục trong **Quản trị → Danh mục → Mẫu, biến thể & giá**. Màn hiện tại quản lý ảnh ở cấp mẫu; ảnh riêng theo biến thể chưa được mở thành thao tác trên giao diện.

## Thao tác trên giao diện

1. Chọn mẫu đã lưu trên máy chủ. Mẫu mới phải được lưu trước khi có thể tải ảnh lên.
2. Xem thư viện hiện tại, chọn tệp JPEG, PNG hoặc WebP và kiểm tra ảnh xem trước.
3. Nhập mô tả ảnh ngắn. Mô tả hỗ trợ trình đọc màn hình và hiển thị thay thế khi ảnh không tải được.
4. Chọn **Thêm ảnh** để thêm vào cuối thư viện; hoặc chọn một ảnh hiện có rồi chọn **Thay ảnh đã chọn**.
5. Dùng **Đặt làm ảnh đại diện** để đưa ảnh lên đầu danh mục khách hàng. Có thể sửa mô tả hoặc xóa ảnh sau khi xác nhận.

Giao diện giữ ảnh cũ trong lúc ảnh thay thế đang tải. Nếu ảnh mới được lưu nhưng xóa ảnh cũ thất bại, tải lại thư viện để kiểm tra trạng thái trước khi thử lại; không tải ảnh mới lần nữa nếu ảnh mới đã xuất hiện.

## Luồng lưu trữ

1. Trình duyệt gọi API để xin presigned POST cho đúng mẫu, loại ảnh và kích thước.
2. Trình duyệt tải trực tiếp lên vùng `catalog-staging/`; khóa S3 không được gửi xuống trình duyệt.
3. Trình duyệt đăng ký ảnh qua API catalog. API kiểm tra quyền, chủ sở hữu, định dạng, giới hạn dung lượng và số ảnh; sau đó chuẩn hóa ảnh sang khóa cuối dưới `catalog/` và ghi metadata vào cơ sở dữ liệu.
4. Thứ tự hiển thị và mô tả được cập nhật qua API. Khi xóa, API gỡ metadata và yêu cầu worker xóa object; nếu xóa tức thời thất bại, outbox sẽ thử lại.

Giới hạn dung lượng, số ảnh mỗi mẫu và cấu hình xử lý ảnh lấy từ backend (`MEDIA_MAX_UPLOAD_BYTES`, `MEDIA_MAX_MODEL_IMAGES`, `MEDIA_MAX_IMAGE_DIMENSION`, `MEDIA_MAX_IMAGE_PIXELS`). Không đặt các giá trị này trong giao diện như luật nghiệp vụ cố định.

## Lỗi và cách phục hồi

| Tình huống | Hành động |
| --- | --- |
| Không tải được thư viện | Chọn **Tải lại thư viện ảnh**; nếu vẫn lỗi, kiểm tra quyền catalog và API. |
| Ảnh vượt dung lượng hoặc sai định dạng | Chọn ảnh JPEG, PNG hoặc WebP nhỏ hơn giới hạn backend. |
| Đạt số ảnh tối đa | Xóa ảnh không còn dùng hoặc thay một ảnh hiện có. |
| Mạng gián đoạn trong lúc thay ảnh | Tải lại thư viện và xác định ảnh mới đã xuất hiện chưa trước khi thao tác lại. |
| Xóa ảnh báo lỗi nhưng ảnh còn hiện | Tải lại để xác nhận trạng thái; API sẽ tiếp tục xử lý yêu cầu xóa object qua outbox nếu cần. |

## Kiểm tra trước khi phát hành

- Tài khoản có `catalog:manage` thêm ảnh, đặt ảnh đại diện, sửa mô tả, thay và xóa ảnh thành công.
- Tài khoản chỉ có quyền đọc xem được danh sách nhưng không thấy thao tác ghi.
- Tài khoản không có quyền catalog không thể xin URL upload hoặc gọi API ghi trực tiếp.
- Ảnh mới xuất hiện đúng trong danh mục công khai; ảnh đại diện xuất hiện trước.
- Thử lỗi định dạng, giới hạn dung lượng, giới hạn số ảnh, lỗi mạng và tải lại sau thao tác không rõ kết quả.
- Xác nhận CORS và `MEDIA_PUBLIC_BASE_URL` trên đúng domain frontend; không đưa S3 secret vào frontend, log hoặc tài liệu.

## Giới hạn hiện tại

- Giao diện hiện hỗ trợ thư viện ảnh cấp mẫu; chưa có bộ quản lý ảnh riêng cho từng size/màu/biến thể.
- Mỗi thao tác đặt ảnh đại diện cập nhật thứ tự qua các request PATCH tuần tự; nếu mạng gián đoạn giữa chừng, tải lại thư viện để đối chiếu rồi đặt lại ảnh đại diện.
- Thay ảnh là thao tác tải ảnh mới rồi gỡ ảnh cũ, không sửa object tại chỗ. Cách này tránh thay ảnh đang được khách xem trước khi ảnh mới được lưu thành công.
