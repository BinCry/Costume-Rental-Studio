# Giao diện Costume Rental Studio

Frontend React/Vite cung cấp khu khách và khu vận hành. Dữ liệu mẫu chỉ phục vụ phát triển giao diện; website production cần máy chủ API và không tự chuyển sang fixture khi API hoặc phiên đăng nhập gặp lỗi.

## Chế độ chạy

- Chạy local không có `VITE_API_URL`: dùng fixture trong bộ nhớ trình duyệt. Thanh kiểm tra fixture chỉ xuất hiện ở chế độ phát triển.
- Chạy local có `VITE_API_URL` nhưng chưa đăng nhập API: vẫn dùng fixture để demo. Sau khi đăng nhập, các màn có tích hợp sẽ đọc/ghi API; lỗi API được hiển thị để người dùng xử lý, không đổi sang dữ liệu mẫu.
- Bản production phải được build với `VITE_API_URL`. Danh mục công khai lấy từ API; đặt thuê, đơn hàng, hồ sơ khách và khu vận hành yêu cầu phiên phù hợp. Thiếu cấu hình API sẽ hiện trạng thái cấu hình thay vì dữ liệu mẫu.
- Ops Agent giữ `fixture` làm mặc định ở local. Build production đặt `VITE_OPS_AGENT_MODE=api` để dùng `POST /api/v1/agent/messages`, đọc hồ sơ qua `GET /api/v1/agent/cases/{caseId}`, xử lý xác nhận/duyệt theo endpoint Agent và hỏi kho tri thức qua `POST /api/v1/knowledge/answer`. Hàng đợi, checklist và danh mục nguồn vẫn mang nhãn fixture.
- API Agent trả bằng chứng theo loại `knowledge` hoặc `live_tool`; giao diện hiển thị lần lượt là **Tài liệu** và **Dữ liệu nghiệp vụ**. Trình duyệt chỉ gọi API Studio công khai. Các tool nội bộ không được gọi trực tiếp từ web; backend kiểm tra actor, quyền, xác nhận và phê duyệt.
- API hiện chưa có danh sách hồ sơ Agent, lịch sử hội thoại/audit, danh sách/quản lý tài liệu tri thức, indexing/versioning, hoặc tìm kiếm thuần. UI để các phần này ở trạng thái chờ API; không tạo dữ liệu live giả.
- Backend cần cấu hình `AI_SERVICE_URL` và `AI_INTERNAL_API_KEY` trỏ tới Agent runtime. Không đưa khóa nội bộ vào frontend hoặc build args.

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

Test API client nằm trong `tests/api-client.test.mjs`; test dùng Vitest có sẵn trong monorepo, không cần backend đang chạy. GitHub Actions chạy lint, test, typecheck và build frontend trong API CI; workflow publish web chạy cùng các bước trước khi đóng gói image. Xem [`docs/ui/demo-guide.md`](../../docs/ui/demo-guide.md) để biết đường dẫn, cách chuyển giữa fixture/API, luồng demo và các quyết định nghiệp vụ còn mở.
