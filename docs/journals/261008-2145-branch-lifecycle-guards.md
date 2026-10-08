# Branch lifecycle guards

## Outcome

- Branch listing now validates and applies a safe sort field, with an `id` tie-breaker for stable pagination.
- Branch activation, deactivation, and deletion lock the branch row with `FOR UPDATE` inside one transaction.
- Deactivation is blocked by open rental work, in-progress transfers, non-retired units, branch role assignments, and unresolved CRM cases.
- Deletion is blocked by every direct business or history relation, even where the database relation would otherwise cascade or set the foreign key to null.

## Concurrency contract

`lockActiveBranch(transaction, branchId)` is the shared protocol for every write that creates a record bound to a branch. It locks the same branch row used by status changes, then verifies `ACTIVE` before the write.

The existing customer, customer-registration, and staff-role-assignment flows now use it. PostgreSQL integration tests prove the protocol for assignment versus deactivate/delete. Inventory, rental-order, and stock-transfer creator services do not yet exist in this repository, so their producer-side integration remains required when those modules are implemented.

## Authorization and validation

- Read endpoints require `branches.read.ALL`; writes require `branches.manage.ALL`.
- Branch administration deliberately remains global: there is no Branch Manager role or `branches.*.BRANCH` permission in the current RBAC seed.
- Timezone input must be a valid IANA name; codes are normalized to uppercase on creation.

## Verification

- API unit tests: 159 passed, 10 intentionally skipped PostgreSQL tests.
- PostgreSQL concurrency suite: 10 passed.
- Workspace typecheck, lint, and production build passed.
