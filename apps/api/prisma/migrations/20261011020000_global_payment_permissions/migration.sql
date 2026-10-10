-- Global administrator assignments have no branchId, so payment actions need
-- explicit ALL-scope permission records to pass the same authorization checks.
INSERT INTO "permissions" ("id", "code", "module", "action", "scope", "description")
VALUES
  ('f4b9bdf4-8fb0-4f39-9ef4-f8038c90d620', 'payments.read.all', 'payments', 'read', 'ALL', 'Cho phép xem thanh toán trên toàn hệ thống'),
  ('f4b9bdf4-8fb0-4f39-9ef4-f8038c90d621', 'payments.manage.all', 'payments', 'manage', 'ALL', 'Cho phép quản lý thanh toán trên toàn hệ thống'),
  ('f4b9bdf4-8fb0-4f39-9ef4-f8038c90d622', 'payments.collect.all', 'payments', 'collect', 'ALL', 'Cho phép thu tiền trên toàn hệ thống'),
  ('f4b9bdf4-8fb0-4f39-9ef4-f8038c90d623', 'refunds.approve.all', 'refunds', 'approve', 'ALL', 'Cho phép duyệt hoàn tiền trên toàn hệ thống')
ON CONFLICT ("code") DO UPDATE
SET "module" = EXCLUDED."module",
    "action" = EXCLUDED."action",
    "scope" = EXCLUDED."scope",
    "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" AS role
INNER JOIN "permissions" AS permission
  ON permission."code" IN ('payments.read.all', 'payments.manage.all', 'payments.collect.all', 'refunds.approve.all')
WHERE role."role_code" = 'ADMIN'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
