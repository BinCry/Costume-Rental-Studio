---
type: tester
date: 2026-10-19
status: passed
scope: operational-capacity-shortfall
---

# Plan Complete: Case 5 Operational Capacity Shortfall

## Summary

- **Duration:** 2026-10-19 18:00 → 21:54 ICT
- **Phases:** 4/4 completed
- **Plan tasks:** 12/12 completed
- **Tests:** Studio 352 passed/17 skipped; AI 216 passed

## Findings

| Area | Result |
| --- | --- |
| Explicit capacity source | Added branch capacity windows; no inference from employee count |
| Explicit workload source | Added optional positive `estimatedEffortMinutes` to unit blocks |
| Incomplete data | Any relevant task without effort suppresses shortfall creation |
| Detection | Branch-level deterministic finding, dedupe, reconciliation and stale protection |
| Analysis | PII-free live context; non-executable reprioritize/escalate guidance |
| Write safety | `OPERATIONAL_CAPACITY` is rejected by readiness confirmation preparation |
| Existing behavior | Full Studio and AI suites pass, including Cases 1–4 |

## Verification

| Check | Result |
| --- | --- |
| Studio full Vitest | 352 passed, 17 skipped |
| Studio focused Case 1–5/Agent tests | 91 passed |
| Studio TypeScript | Passed |
| Studio ESLint | Passed |
| Studio production build | Passed |
| Prisma schema validation | Passed |
| AI full pytest | 216 passed |
| AI migration/repository integration | 31 passed |
| AI route/simulation focused tests | 27 passed |
| AI Ruff | Passed |
| AI mypy | Passed, 38 source files |
| `git diff --check` | Passed; line-ending warnings only |

## Review Notes

- Capacity-window create/update serializes on the branch and rejects overlap.
- Completed/cancelled blocks are excluded; active blocks due by the window end are included.
- Detector pagination avoids starving later windows.
- Deadline filtering uses the inclusive window boundary; aggregate totals/completeness stay exact while detail payloads are capped at 100 rows.
- Enabled detectors run in the default API worker mode and the standalone worker mode.
- Capacity confirmation is explicitly rejected as non-executable before any live or write tool call.
- No production database, customer channel or write action was invoked during verification.
- Independent review and test agents verified the implementation; final regressions were rerun after every review fix.

## Recommendations

1. Apply the Studio operational-capacity migration and AI migration 012 before enabling the worker.
2. Enter capacity windows and effort estimates in a non-production environment.
3. Enable `AGENT_CAPACITY_DETECTION_ENABLED=true` only after both services share the new contract.

## Unresolved Questions

- Shift rosters, attendance, skills and automatic staff assignment remain outside this MVP.
- UI for managing capacity windows and effort estimates is not included.
