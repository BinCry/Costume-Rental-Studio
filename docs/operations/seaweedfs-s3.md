# SeaweedFS S3 cho catalog media

## Finalize va bao ve object key

The presigned POST writes only to `catalog-staging/`. The browser sends that temporary key as `uploadKey` to the catalog media endpoint. The API reads and fully decodes the object, normalizes it, and writes a new server-generated key under `catalog/`; only this final key is stored in the database and used for public URLs. Replaying the still-valid POST can change the staging object, but cannot overwrite an already finalized object.

After a successful database insert, the API best-effort deletes the staging object. The periodic orphan cleanup also scans old objects under both `catalog/` and `catalog-staging/`; registered final objects are retained, while stale staging objects and unregistered final objects are removed after `MEDIA_ORPHAN_RETENTION_HOURS`.

API tạo presigned **POST** policy, giới hạn file 1 byte đến `MEDIA_MAX_UPLOAD_BYTES`. Browser gửi toàn bộ `fields` nhận từ `/api/v1/uploads/presign` và field `file` vào `uploadUrl`; không gửi AWS key/secret.

## Bắt buộc khi deploy

- Chạy SeaweedFS S3 gateway với auth và HTTPS; API giữ `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` trong secret manager.
- Endpoint trong `S3_PUBLIC_ENDPOINT` phải là endpoint browser truy cập được và dùng cùng host với URL được ký.
- CORS phải allow chính xác `WEB_URL`, method `POST, OPTIONS`, header `Content-Type`, và expose `ETag`. Với gateway CLI dùng `-s3.allowedOrigins=https://<web-domain>`; không dùng `*` ở production.
- Dùng path-style (`S3_FORCE_PATH_STYLE=true`) trừ khi đã cấu hình virtual-host bucket domain.
- Tạo bucket `S3_BUCKET` trước khi bật upload và chỉ cấp quyền Read/Write/List cần thiết cho credential của API.

## Smoke test trước release

1. Login bằng user có `catalog:manage`.
2. Gọi presign, POST ảnh JPEG 1 byte nhỏ hơn limit, rồi gọi create media.
3. Kiểm tra POST vượt limit bị SeaweedFS từ chối.
4. Chạy cùng request từ `WEB_URL`, xác nhận không có lỗi CORS.
5. Kiểm tra `MEDIA_PUBLIC_BASE_URL` trả ảnh với `X-Content-Type-Options: nosniff` tại proxy/CDN.

SeaweedFS gateway có flag `allowedOrigins`; các credential S3 được cấu hình bằng `-s3.config`. Tham khảo [S3 command flags](https://github.com/seaweedfs/seaweedfs/blob/master/weed/command/s3.go) và [S3 authentication](https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API).
