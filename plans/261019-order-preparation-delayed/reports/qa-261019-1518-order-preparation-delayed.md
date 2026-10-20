---
status: passed
scope: order-preparation-delayed
tested_at: 2026-10-19T15:18:00+07:00
---

# Test Report — Order Preparation Delayed

## Summary

Case 3 detection, Agent Tool contracts, deterministic simulation, API routes, persistence, and migration tests passed. No production database or `.env` data was used.

## Test Results

| Area | Result |
|---|---:|
| Studio API targeted Vitest | 80 passed, 0 failed |
| AI service targeted pytest | 49 passed, 0 failed |
| TypeScript typecheck | Passed |
| Studio API production build | Passed |
| Targeted ESLint | Passed |
| Ruff | Passed |
| mypy | Passed, 36 source files |

## Covered Behavior

- Detects `ORDER_PREPARATION_DELAYED` only for `CONFIRMED` or `PREPARING` orders within two hours of pickup.
- Requires every item to have a confirmed unit allocation.
- Suppresses the rule when Case 1 or Case 2 owns the unit-level risk.
- Resolves an existing Case 3 finding when the risk disappears or is superseded.
- Produces non-executable `START_PREPARATION` or `COMPLETE_PREPARATION` options.
- Accepts order-level findings with nullable affected entity and unit references.
- Keeps the live context free of customer PII.

## Commands

```text
pnpm --filter @costume/api typecheck
pnpm --filter @costume/api exec vitest run <five targeted suites> --pool=threads --maxWorkers=1
pnpm --filter @costume/api build
pnpm --filter @costume/api exec eslint <Case 3 files>
python -m pytest <four targeted AI suites> -q
python -m ruff check app <targeted tests>
python -m mypy app
```

## Coverage Metrics

Coverage percentages were not collected in this run. Critical Case 3 paths and error/precedence scenarios are covered by targeted tests.

## Critical Issues

None.

## Recommendations

1. Run the HTTP smoke flow with isolated staging data after migrations are deployed.
2. Keep Case 3 non-executable until preparation checklist/task data exists.

## Unresolved Questions

- None for the current Case 3 scope.
