# Hướng dẫn chạy bản mẫu giao diện năm màn hình lõi

**Phạm vi:** UI-01 catalog, UI-03 đặt thuê, UI-06 bảng việc nhân viên, UI-07 không gian xử lý đơn và cặp UI-09/UI-11 dùng chung `OrderDetailShell`. Đây là prototype React/Vite theo [quy chuẩn thiết kế](Quy%20chu%E1%BA%A9n%20thi%E1%BA%BFt%20k%E1%BA%BF%20giao%20di%E1%BB%87n%20v%C3%A0%20n%C4%83m%20m%C3%A0n%20h%C3%ACnh%20l%C3%B5i.md). Chưa triển khai 13 màn hình còn lại.

## Chạy tại máy

Tại thư mục gốc repository:

```bash
pnpm install --frozen-lockfile
pnpm --filter @costume/web dev
```

Mở địa chỉ Vite in trên terminal. Các route dùng hash để có thể mở trực tiếp mà chưa cần thư viện router:

| Luồng | Đường dẫn |
|---|---|
| Catalog | `/#catalog` |
| Đặt thuê | `/#booking` |
| Bảng việc | `/#dashboard` |
| Xử lý đơn | `/#orders` hoặc `/#orders?order=RT-1024` |
| Giao đồ | `/#handover?order=RT-1028` |
| Nhận trả | `/#return?order=RT-1031` |

## Cấu trúc giao diện

- `apps/web/src/index.css`: token màu, chữ, khoảng cách, kích thước, bề mặt và responsive 375/768/1024/1440 px.
- `apps/web/src/components/`: button, trường nhập, badge trạng thái, feedback, tiền, bảng có tìm/lọc/sắp xếp/phân trang, mục hàng đợi và modal xác nhận.
- `apps/web/src/fixtures/`: kiểu dữ liệu, bộ mẫu trang phục, đơn, bộ vật lý, hàng đợi, báo giá snapshot và adapter bất đồng bộ. Không gọi API nghiệp vụ.
- `apps/web/src/pages/`: năm luồng lõi. UI-09 và UI-11 chung `OrderDetailShell`, tách nội dung giao và trả.
- `apps/web/public/images/lookbook-minh-hoa.png`: ảnh minh họa tạo cho prototype, không phải ảnh trang phục thật trong kho.

## Kiểm tra tình huống

Thanh **Tình huống fixture** ở đầu trang cho phép chuyển giữa bình thường, loading, empty, lỗi mạng, xung đột bộ, đơn bị sửa, khách hủy, mất quyền, chuyển khoản chờ đối soát, hoàn cọc thất bại, barcode không tồn tại/khác chi nhánh và bộ đang vệ sinh/sửa. Tình huống có ý nghĩa theo luồng tương ứng; ví dụ hoàn cọc thất bại thuộc nhận trả. Form và bộ lọc đã nhập được giữ khi đổi tình huống trong cùng route.

Các dữ liệu mẫu đều là giả. Hàng đợi dùng **giờ fixture 03/10/2026, 15:30 theo giờ Việt Nam** để các nhãn quá hạn/trong hai giờ/hôm nay nhất quán. Báo giá chỉ có snapshot cho các mẫu và kỳ thuê mẫu ở Quận 1; nếu chọn tổ hợp chưa có snapshot, giao diện giữ lựa chọn và báo rõ chưa có dữ liệu thay vì tự tính giá hoặc khả dụng.

## Giới hạn có chủ ý

- Google login hiển thị vị trí và mô tả nhưng chưa đăng nhập thật. Chưa có dịch vụ xác thực.
- Gửi yêu cầu, xác nhận/gán bộ, ghi nhận tiền mặt, giao/trả và hoàn cọc chỉ xem trước trong phiên trình duyệt; không ghi máy chủ, không tạo giao dịch hoặc phiếu thu thật.
- Chuyển khoản chưa đối soát không được đánh dấu đã thu. Hoàn cọc thất bại không được thử lại tự động.
- Quy tắc tính ngày, khả dụng theo lịch, báo giá, số phải thu/hoàn, chuyển trạng thái và phân quyền phải đến từ backend khi tích hợp. UI không tự suy hoặc đặt ra các quy tắc này.
- Giá và ảnh là dữ liệu minh họa. Ảnh thật, màu accent cuối và các chính sách chưa chốt cần được xác nhận trước khi phát hành.

## Kiểm tra mã

```bash
pnpm --filter @costume/web typecheck
pnpm --filter @costume/web lint
pnpm --filter @costume/web build
```
