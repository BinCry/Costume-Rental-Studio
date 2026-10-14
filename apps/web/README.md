# Giao diện Costume Rental Studio

Frontend React/Vite cung cấp khu khách và khu vận hành. Dữ liệu mẫu chỉ phục vụ phát triển giao diện; website production cần máy chủ API và không tự chuyển sang fixture khi API hoặc phiên đăng nhập gặp lỗi.

## Chế độ chạy

- Chạy local không có `VITE_API_URL`: dùng fixture trong bộ nhớ trình duyệt. Thanh kiểm tra fixture chỉ xuất hiện ở chế độ phát triển.
- Chạy local có `VITE_API_URL` nhưng chưa đăng nhập API: vẫn dùng fixture để demo. Sau khi đăng nhập, các màn có tích hợp sẽ đọc/ghi API; lỗi API được hiển thị để người dùng xử lý, không đổi sang dữ liệu mẫu.
- Bản production phải được build với `VITE_API_URL`. Danh mục công khai lấy từ API; đặt thuê, đơn hàng, hồ sơ khách và khu vận hành yêu cầu phiên phù hợp. Thiếu cấu hình API sẽ hiện trạng thái cấu hình thay vì dữ liệu mẫu.

## Lệnh phát triển

Chạy từ thư mục gốc repo:

```bash
pnpm install
pnpm --filter @costume/web dev
pnpm --filter @costume/web typecheck
pnpm --filter @costume/web lint
pnpm --filter @costume/web test
pnpm --filter @costume/web build
```

Test API client nằm trong `tests/api-client.test.mjs`; test dùng Vitest có sẵn trong monorepo, không cần backend đang chạy. Xem [`docs/ui/demo-guide.md`](../../docs/ui/demo-guide.md) để biết đường dẫn, cách chuyển giữa fixture/API, luồng demo và các quyết định nghiệp vụ còn mở.
