# Phòng thử đồ ảo

Ứng dụng thử trang phục chạy trong trình duyệt, được nhúng cùng origin tại `/try-on/` trong web Studio. Mã nguồn được tích hợp từ `BinCry/AR-Virtual-Try-On`, commit `a4fe130e5ffb78160ea37733fcc064cf1ba5bcbd`.

## Luồng trong Studio

1. Khách mở trang chi tiết một mẫu và chọn **Thử với camera**.
2. Studio chuyển tên, loại trang phục và URL ảnh đang xem qua `sessionStorage` dùng một lần. Query string chỉ mang mã ngẫu nhiên; URL ảnh không xuất hiện trong lịch sử trình duyệt.
3. Sau màn giới thiệu quyền riêng tư, ứng dụng con tải ảnh sản phẩm, tách nền và gợi ý điểm căn chỉnh ngay trên thiết bị. Khách có thể điều chỉnh rồi lưu mẫu vào IndexedDB của trình duyệt.
4. Camera chỉ được bật khi khách nhấn **Mở camera** và cấp quyền cho trình duyệt.

Ảnh camera và ảnh sau xử lý không gửi lên API. Nếu ảnh mẫu không tải được do URL hết hạn, máy chủ ảnh không cho phép CORS, hoặc vượt 15 MB, khách có thể tải ảnh trang phục lên thủ công. Kết quả chỉ giúp tham khảo phom dáng, không thay thế việc thử trực tiếp.

## Build và phân phối

- Web production build package này trước khi build Studio web; Vite xuất vào `apps/web/public/try-on/`.
- `base` production là `/try-on/`, do đó model và WebAssembly được tải cùng origin.
- `preassets` sao chép LiteRT WebAssembly và tải các model TFLite cần thiết vào thư mục `public/`. Các tệp này không commit; Docker build cần truy cập được Google Cloud Storage, TensorFlow Hub/Kaggle và npm registry.
- Các model nằm trong `public/models/`, WebAssembly nằm trong `public/litert-wasm/`; cả hai được loại khỏi Git.
- Ứng dụng không có API riêng và dùng URL ảnh đã nhận từ trang Studio. Không đưa khóa truy cập hoặc dữ liệu xác thực vào iframe.

## Cập nhật nguồn

Khi kéo phiên bản mới từ kho AR, giữ `studioBridge.ts`, xử lý context Studio và yêu cầu người dùng bật camera chủ động; không đưa catalog hoặc ảnh minh họa demo của kho nguồn vào catalog sản phẩm thật.
