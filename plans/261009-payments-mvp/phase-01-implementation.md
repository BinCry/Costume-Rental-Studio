---
phase: 1
title: "Implement payment and refund MVP"
status: completed
priority: P1
dependencies: []
---

# Phase 1: Implement payment and refund MVP

## Implementation Steps

1. Add schema support and seed permissions.
2. Add the payment Zod contracts, service, routes, and route registration.
3. Extract or share settlement calculations with rental code where needed.
4. Add focused tests and run repository verification.

## Success Criteria

- [x] Financial state transitions are validated and atomic.
- [x] Access is constrained to the rental's pickup branch.
- [x] Existing rental lifecycle behaviour remains valid.
