-- Branch staff need operational knowledge in the Ops Agent and knowledge screens.
-- Keep global knowledge access as a separate permission for platform administrators.
INSERT INTO "permissions" ("id", "code", "module", "action", "scope", "description")
VALUES (
  'a3d63253-9ef1-4ec3-ae27-51bb139f0001',
  'knowledge.read.branch',
  'knowledge',
  'read',
  'BRANCH',
  'Cho phép tra cứu tri thức vận hành dành cho nhân viên tại chi nhánh được phân công'
)
ON CONFLICT ("code") DO UPDATE
SET "module" = EXCLUDED."module",
    "action" = EXCLUDED."action",
    "scope" = EXCLUDED."scope",
    "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" AS role
INNER JOIN "permissions" AS permission ON permission."code" = 'knowledge.read.branch'
WHERE role."role_code" IN ('SALES_STAFF', 'INVENTORY_STAFF')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
