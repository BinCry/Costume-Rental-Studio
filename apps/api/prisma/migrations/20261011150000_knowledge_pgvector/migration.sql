-- Knowledge authorization remains in the operational database. Vector storage is
-- migrated by the separate Ops Agent Python service using AI_DATABASE_URL.
INSERT INTO "permissions" ("id", "code", "module", "action", "scope", "description")
VALUES ('9a18d307-9215-4f5d-8db4-74c57d84e101', 'knowledge.read.all', 'knowledge', 'read', 'ALL', 'Cho phép truy vấn kho tri thức vận hành nội bộ')
ON CONFLICT ("code") DO UPDATE
SET "module" = EXCLUDED."module",
    "action" = EXCLUDED."action",
    "scope" = EXCLUDED."scope",
    "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" AS role
INNER JOIN "permissions" AS permission ON permission."code" = 'knowledge.read.all'
WHERE role."role_code" = 'ADMIN'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
