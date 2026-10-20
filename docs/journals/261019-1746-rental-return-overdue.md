---
date: 2026-10-19
session: rental-return-overdue
---

# Journal: 2026-10-19 — Rental Return Overdue

## Context

The first three operational cases focus on preparing an upcoming rental. Case 4 adds a distinct order-level concern: a currently active rental remains unreturned after its contractual grace deadline.

## What Happened

- Added `RENTAL_RETURN` and `RENTAL_RETURN_OVERDUE/v1` to the AI contract and database migration.
- Added a Studio worker that detects, deduplicates, reconciles, and resolves overdue-return findings.
- Reused the Case 1 risk evaluator so a downstream pickup conflict takes precedence over the generic overdue case.
- Added a PII-free live-context tool and deterministic, non-executable analysis options.
- Kept confirmation and write execution restricted to rental-readiness cases.
- Added migration, repository, route, simulation, detector, extension-resolution, and regression tests.

## Reflection

Using a separate `RENTAL_RETURN` case type keeps the operational queue shared while preventing readiness execution rules from leaking into customer-return handling. Suppression avoids asking staff to handle two cases caused by the same missing unit.

## Decisions Made

| Decision | Rationale | Impact |
| --- | --- | --- |
| Detection remains deterministic and opt-in | Operational facts do not need probabilistic classification | Safe deployment behind a disabled-by-default flag |
| LLM output is narrative only | Ranking and action scope must remain auditable | LLM cannot create actions or executable arguments |
| No customer or rental mutation is automated | Contact, extension, and fee policies are not in this case | Case 4 ends at human guidance |
| A valid extension resolves the old finding | The original overdue window no longer exists | A later overdue period gets a new dedupe window |

## Next Steps

- Apply migration 011 in the target environment.
- Deploy both services, enable detection in a non-production environment, and perform an HTTP smoke test with disposable rental data.
- Design notification and customer-contact workflows separately if required.
