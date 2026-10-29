# Try-on Core

`🧠 Xử lý AI` `🧍 Nhận diện dáng người` `👕 Ghép trang phục` `🎮 WebGPU`

Package lõi cho tính năng thử quần áo ảo. Package hoạt động độc lập với giao diện và cung cấp pipeline xử lý hình ảnh ngay trong trình duyệt.

## Chức năng

- Nhận diện tư thế và phân vùng cơ thể.
- Nội suy điểm neo để căn chỉnh trang phục.
- Biến dạng trang phục theo hình thể bằng Thin-plate spline.
- Ghép trang phục với mặt nạ, chiều sâu và ánh sáng.
- Tạo Web Worker cho suy luận nền, suy luận chiều sâu và tách nền.

## Sử dụng trong dự án

Package này được biên dịch tự động khi chạy lệnh ở thư mục gốc:

```bash
npm run build
```

## Cấu trúc

```text
src/             Pipeline, kiểu dữ liệu và thuật toán ghép đồ
src/workers/     Worker xử lý suy luận
```
