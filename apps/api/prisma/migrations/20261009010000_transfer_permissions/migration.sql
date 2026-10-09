-- Transfer readers need their own permission because transfer visibility spans
-- both its source and destination branch.  Global administrators require ALL
-- permissions because their role assignment is not attached to a branch.
INSERT INTO "permissions" ("id", "code", "module", "action", "scope")
VALUES
  ('f4b9bdf4-8fb0-4f39-9ef4-f8038c90d610', 'transfers.manage.branch', 'transfers', 'manage', 'BRANCH'),
  ('f4b9bdf4-8fb0-4f39-9ef4-f8038c90d611', 'transfers.read.branch', 'transfers', 'read', 'BRANCH'),
  ('f4b9bdf4-8fb0-4f39-9ef4-f8038c90d612', 'transfers.read.all', 'transfers', 'read', 'ALL'),
  ('f4b9bdf4-8fb0-4f39-9ef4-f8038c90d613', 'transfers.manage.all', 'transfers', 'manage', 'ALL')
ON CONFLICT ("code") DO UPDATE
SET "module" = EXCLUDED."module", "action" = EXCLUDED."action", "scope" = EXCLUDED."scope";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role.id, permission.id
FROM "roles" AS role
INNER JOIN "permissions" AS permission
  ON permission."code" IN ('transfers.manage.branch', 'transfers.read.branch', 'transfers.read.all', 'transfers.manage.all')
WHERE role."role_code" = 'ADMIN'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role.id, permission.id
FROM "roles" AS role
INNER JOIN "permissions" AS permission
  ON permission."code" IN ('transfers.read.branch', 'transfers.manage.branch')
WHERE role."role_code" = 'INVENTORY_STAFF'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
