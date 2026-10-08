# SeaweedFS S3 cho catalog media

## Finalize va bao ve object key

The presigned POST writes only to `catalog-staging/`. The browser sends that temporary key as `uploadKey` to the catalog media endpoint. The API reads and fully decodes the object, normalizes it, and writes a new server-generated key under `catalog/`; only this final key is stored in the database and used for public URLs. Replaying the still-valid POST can change the staging object, but cannot overwrite an already finalized object.

After a successful database insert, the API best-effort deletes the staging object. The periodic orphan cleanup also scans old objects under both `catalog/` and `catalog-staging/`; registered final objects are retained, while stale staging objects and unregistered final objects are removed after `MEDIA_ORPHAN_RETENTION_HOURS`.

## Database integrity and deployment order

`costume_media.source_upload_key` is nullable and unique. Existing media may keep `NULL`; each new registration records the staging upload key so replaying that key cannot register another image, including across API instances. This field is internal integrity metadata and is omitted from media API responses; public URLs continue to use the final `object_key`.

Finalization takes a database `FOR UPDATE` row lock on the owning model or variant, then counts its media and inserts the new row in the same transaction. The shared database lock enforces the per-owner image limit across API instances. Storage promotion occurs before this short transaction.

Before deploying the changed API, apply its migration from the repository root against the intended deployment database:

```sh
pnpm --filter @costume/api db:migrate:deploy
```

The migration must complete before the changed API starts. This documentation update does not execute a production migration.

Run the PostgreSQL-backed locking tests explicitly after migration. The command uses
`DATABASE_URL` from `apps/api/.env`; set `DATABASE_TEST_URL` to override it with a dedicated
database. Use a non-production database because the suite creates and deletes catalog rows:

```sh
pnpm --filter @costume/api test:postgres
```

The test creates uniquely named catalog rows and removes them afterward. It verifies the model
image limit, duplicate finalize protection, atomic category deactivation, and the create-versus-
deactivate race against a real PostgreSQL server. Object-storage calls are mocked so this suite
isolates database concurrency guarantees.

Category deactivation is a status-only, atomic cascade over the selected category, all nested
categories, their models and variants, and model accessories. It does not delete catalog data,
media, or existing rental records. Reactivating the selected category does not reactivate any
descendant; descendants retain their previous inactive state and must be reactivated explicitly
under an active parent.

After the PostgreSQL suite passes against a test database and the migration succeeds against the
deployment database, merge or push the API changes to `main`. The `Build, Test, Publish API Image`
GitHub Actions workflow publishes
`kietphan24/costume-rental-studio-api:staging` and an immutable `staging-<short-sha>` tag to Docker
Hub, then invokes the configured Coolify webhook. A local migration or successful local test run
does not deploy the API: confirm the workflow completed and that Coolify pulled the expected image
before considering the release deployed. Required secrets and production migration details are in
[CI/CD and database migration](ci-cd.md).

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
