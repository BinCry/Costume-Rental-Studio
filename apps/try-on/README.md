# AR Virtual Try-On

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 7" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=FFD62E" alt="Vite 8" />
  <img src="https://img.shields.io/badge/LiteRT-On--device_AI-FF6F00?style=for-the-badge&logo=google&logoColor=white" alt="LiteRT chạy trên thiết bị" />
  <img src="https://img.shields.io/badge/WebGPU-Accelerated-00A6ED?style=for-the-badge&logo=webgpu&logoColor=white" alt="WebGPU tăng tốc" />
  <img src="https://img.shields.io/badge/Responsive-Mobile_%2B_Laptop-E91E63?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Responsive trên mobile và laptop" />
</p>

Ứng dụng thử quần áo ảo chạy trực tiếp trong trình duyệt. Mở webcam, chọn trang phục và xem kết quả ghép ngay trên thiết bị — ảnh và video không rời khỏi trình duyệt.

## Điểm nổi bật

- Thử trang phục với webcam theo thời gian thực.
- Nhận diện dáng người, tách nền và đặt trang phục theo các điểm cơ thể.
- Danh mục trang phục có sẵn, hỗ trợ thêm trang phục cá nhân.
- Chế độ nâng cao 3D với ước lượng chiều sâu, che khuất hợp lý và cân bằng ánh sáng.
- Lưu bộ trang phục đã thử để so sánh.
- Giao diện responsive cho điện thoại và laptop.

## Công nghệ sử dụng

| Công nghệ | Vai trò |
| --- | --- |
| React và TypeScript | Giao diện, quản lý trạng thái và kiểu dữ liệu |
| Vite | Phát triển và đóng gói ứng dụng |
| LiteRT.js và TensorFlow.js | Chạy mô hình AI ngay trên thiết bị |
| WebGPU và Web Worker | Tăng tốc suy luận, giữ giao diện mượt mà |
| Canvas 2D và Thin-plate spline | Biến dạng, căn chỉnh và ghép trang phục |

## Yêu cầu

- Node.js 20 trở lên.
- Trình duyệt hiện đại trên điện thoại hoặc laptop.
- WebGPU là tuỳ chọn; ứng dụng tự chuyển sang CPU/Wasm khi thiết bị chưa hỗ trợ.

## Khởi chạy

```bash
npm install
npm run fetch-models
npm run dev
```

Mở địa chỉ do terminal hiển thị. Khi dùng webcam trên điện thoại, hãy cấp quyền camera và truy cập qua kết nối bảo mật (HTTPS).

## Cách sử dụng

1. Mở ứng dụng, nhấn **Mở camera** và cấp quyền webcam.
2. Đứng đủ xa để thấy phần thân trên rõ ràng, hướng mặt và vai về phía camera; sau đó chọn trang phục ở danh mục.
3. Dùng nút toàn màn hình nếu muốn trải nghiệm camera tập trung và chụp ảnh kết quả.
4. Tắt camera khi hoàn tất bằng nút **Tắt camera**.

### Cử chỉ trong chế độ camera trực tiếp

Cử chỉ được nhận diện từ cổ tay bởi mô hình pose có sẵn trong ứng dụng, không cần cấp thêm quyền. Giữ ít nhất một bàn tay trong khung hình và thực hiện dứt khoát:

| Cử chỉ | Kết quả |
| --- | --- |
| Vuốt sang phải | Chuyển sang trang phục thân trên kế tiếp. |
| Vuốt sang trái | Quay về trang phục thân trên trước đó. |
| Giơ tay vuốt lên cao, kết thúc phía trên vai | Bắt đầu đếm ngược 5 giây để chụp ảnh. |
| Vuốt xuống | Chưa gán thao tác. |

- Hai hướng vuốt ngang chỉ luân phiên trang phục thân trên; trang phục đáy chọn trực tiếp trong danh mục.
- Hệ thống có thời gian nghỉ ngắn giữa hai lần nhận cử chỉ để tránh nhận trùng.
- Nếu không nhận diện được, bảo đảm cổ tay không bị che, khung hình đủ sáng và thao tác liên tục theo một hướng.
- Hãy vào toàn màn hình trước khi chụp để kết quả có khung canvas hoàn chỉnh. Nhấn nút `?` để xem lại hướng dẫn tại chỗ.

## Đóng gói

```bash
npm run build
npm run preview
```

Lệnh `build` tự biên dịch các package xử lý nội bộ trước khi đóng gói giao diện.

## Cấu trúc dự án

```text
src/                    Giao diện, hooks và luồng thử đồ
packages/               Pipeline AI, worker và phép biến dạng trang phục
public/garments/        Ảnh trang phục mẫu
public/test-photos/     Ảnh thử có sẵn
tools/copy-litert-wasm.mjs
tools/fetch-models.mjs  Chuẩn bị runtime và mô hình cần thiết
```

## Quyền riêng tư

Nhận diện cơ thể, ghép trang phục và xử lý webcam đều diễn ra cục bộ trong tab trình duyệt. Ảnh và video của người dùng không được gửi đến máy chủ.
