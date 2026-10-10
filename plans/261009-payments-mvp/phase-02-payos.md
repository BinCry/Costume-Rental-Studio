---
phase: 2
title: "Replace manual transfer with payOS"
status: completed
priority: P1
dependencies: [1]
---

# Phase 2: Replace manual transfer with payOS

## Requirements

- Cash payments are employee-recorded and immediately successful.
- Gateway payments are created pending and receive a payOS QR/checkout URL.
- Only a verified, idempotent payOS webhook can mark gateway payments successful.
- Existing settlement and refund behavior remains unchanged.

## Success Criteria

- [x] `BANK_TRANSFER` is absent from public request schemas and routes.
- [x] Checkout and webhook flows have focused tests.
- [x] Prisma validation, typecheck, lint, and full tests pass.
