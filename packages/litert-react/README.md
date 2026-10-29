# LiteRT React

`⚛ React` `🧠 LiteRT` `⚙ Web Worker` `🎮 WebGPU`

Package gồm các hook React và tiện ích quản lý vòng đời của LiteRT trong trình duyệt.

## Chức năng

- Khởi tạo và đóng Web Worker an toàn.
- Theo dõi tiến độ các tác vụ suy luận.
- Phát hiện WebGPU và chọn phương án dự phòng khi cần.
- Giới hạn tần suất xử lý để giao diện vẫn mượt.

## Biên dịch

Package được biên dịch cùng toàn bộ dự án:

```bash
npm run build
```

## Cấu trúc

```text
src/             Hook React và tiện ích runtime
src/worker.ts    Tiện ích dùng trong Web Worker
```
