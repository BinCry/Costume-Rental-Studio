-- Global administrators are assigned without a branch, so BRANCH permissions alone
-- cannot authorize the Inventory Unit administration endpoints.
INSERT INTO "permissions" ("id", "code", "module", "action", "scope")
VALUES
  ('f4b9bdf4-8fb0-4f39-9ef4-f8038c90d601', 'inventory.read.all', 'inventory', 'read', 'ALL'),
  ('f4b9bdf4-8fb0-4f39-9ef4-f8038c90d602', 'inventory.manage.all', 'inventory', 'manage', 'ALL')
ON CONFLICT ("code") DO UPDATE
SET "module" = EXCLUDED."module", "action" = EXCLUDED."action", "scope" = EXCLUDED."scope";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role.id, permission.id
FROM "roles" AS role
INNER JOIN "permissions" AS permission
  ON permission."code" IN ('inventory.read.all', 'inventory.manage.all')
WHERE role."role_code" = 'ADMIN'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
