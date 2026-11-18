# Môi trường test Docker local

Compose tạo **project `costume-local-test` riêng**, không đọc `.env` của Coolify hay production. PostgreSQL, S3 SeaweedFS và các volume đều tách biệt; mọi cổng chỉ mở tại `127.0.0.1`. Môi trường này không chạy Ops Agent và không cần khóa API của AI.

## Khởi động

Yêu cầu Docker Desktop đang chạy. Trong PowerShell tại gốc repo:

```powershell
.\local-test\start.ps1 up
```

Lần đầu script tạo `local-test/.env` với mật khẩu ngẫu nhiên, build web/API, chạy migration, nạp demo seed và bật đăng nhập cho tài khoản local. File `.env` được Git bỏ qua. Các lần khởi động sau giữ dữ liệu test hiện có; seed chỉ nạp dữ liệu nghiệp vụ khi database rỗng.

## Truy cập và tài khoản

| Dịch vụ | URL |
| --- | --- |
| Web | http://localhost:5180 |
| API readiness | http://localhost:4180/health/ready |
| S3 API | http://localhost:59000 |

Lệnh kiểm tra luồng upload ảnh catalog (dùng Admin local, tạo rồi xóa ảnh test):

```powershell
node .\local-test\check-upload.mjs
```

Lệnh này cần Node.js 22 trở lên trên máy. Khi khởi động, `s3-init` tự kiểm tra ghi/đọc S3, ảnh catalog được đọc công khai và ảnh staging bị chặn.

Đọc mật khẩu tài khoản test bằng `Get-Content .\local-test\.env | Select-String LOCAL_TEST_ACCOUNT_PASSWORD`. Cùng một mật khẩu local cho các tài khoản seed: `admin@costume.local`, `sales.q1@costume.local`, `sales.q3@costume.local`, `inventory.q1@costume.local`, `inventory.q3@costume.local`, `customer1@costume.local` đến `customer5@costume.local`. Không dùng các tài khoản này ngoài Docker local.

Demo seed tạo hai chi nhánh, quyền/vai trò, 6 mẫu và 12 biến thể trang phục, 24 unit, 11 đơn, 5 thanh toán và 3 hồ sơ CRM. S3 local tự tạo 6 **ảnh minh họa test** tương ứng; đây không phải ảnh sản phẩm thật. Có thể tải ảnh khác qua màn quản trị để kiểm tra luồng upload. Chỉ prefix ảnh catalog được đọc công khai; ảnh staging vẫn riêng tư. Các màn gọi Ops Agent sẽ báo service chưa cấu hình, đúng với phạm vi môi trường này.

## Vận hành

```powershell
.\local-test\start.ps1 status
.\local-test\start.ps1 logs
.\local-test\start.ps1 seed
.\local-test\start.ps1 down
```

`down` giữ nguyên volume và dữ liệu. `seed` chỉ nạp demo khi database rỗng và luôn đồng bộ lại mật khẩu test cho 10 tài khoản mẫu. Container `migrate`, `seed` và `s3-init` ở trạng thái `Exited (0)` sau khi hoàn thành là bình thường. Script chỉ áp dụng mật khẩu nếu database URL trỏ chính xác tới `db/costume_local_test` trong mạng Docker local.
