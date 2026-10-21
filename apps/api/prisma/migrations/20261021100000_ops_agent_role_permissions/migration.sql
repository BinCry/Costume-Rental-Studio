-- Existing production databases may have been migrated before Ops Agent permissions
-- were added to the Prisma seed. Keep the role grants available through migrations.
INSERT INTO "permissions" ("id", "code", "module", "action", "scope", "description")
VALUES
  ('ce8d9db4-11cc-46a8-b0b2-e90f6ea30101', 'agents.read.branch', 'agents', 'read', 'BRANCH', 'Cho phép xem cảnh báo Ops Agent tại chi nhánh được phân công'),
  ('ce8d9db4-11cc-46a8-b0b2-e90f6ea30102', 'agents.manage.branch', 'agents', 'manage', 'BRANCH', 'Cho phép xử lý cảnh báo Ops Agent tại chi nhánh được phân công'),
  ('ce8d9db4-11cc-46a8-b0b2-e90f6ea30103', 'agents.read.all', 'agents', 'read', 'ALL', 'Cho phép xem cảnh báo Ops Agent trên toàn hệ thống'),
  ('ce8d9db4-11cc-46a8-b0b2-e90f6ea30104', 'agents.manage.all', 'agents', 'manage', 'ALL', 'Cho phép xử lý cảnh báo Ops Agent trên toàn hệ thống')
ON CONFLICT ("code") DO UPDATE
SET "module" = EXCLUDED."module",
    "action" = EXCLUDED."action",
    "scope" = EXCLUDED."scope",
    "description" = EXCLUDED."description";

-- Global Admin can read and manage Ops Agent cases across branches.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" AS role
INNER JOIN "permissions" AS permission
  ON permission."code" IN (
    'agents.read.branch',
    'agents.manage.branch',
    'agents.read.all',
    'agents.manage.all'
  )
WHERE role."role_code" = 'ADMIN'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Branch staff can handle cases only at branches where their role is assigned.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" AS role
INNER JOIN "permissions" AS permission
  ON permission."code" IN ('agents.read.branch', 'agents.manage.branch')
WHERE role."role_code" IN ('SALES_STAFF', 'INVENTORY_STAFF')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
