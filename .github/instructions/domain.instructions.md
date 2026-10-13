---
name: 'Domain business rules'
description: 'Use when implementing business rules: scheduling, recurrence, capacity, booking holds, cancellations, permissions and roles, locations, notes visibility.'
applyTo: 'packages/domain/**'
---
# Domain business rules

Rules: `docs/product/PRODUCT.md` (spec sections are linked from `FEATURES.md`), ADR-006, ADR-010, ADR-012.

- All business rules live here, server-side. Web, iOS and Android call the API; they never re-implement a rule.
- Pure and deterministic: no I/O, no framework imports. Get "now" from an injected `Clock`, never `Date.now()` or `new Date()`.
- Time: instants are UTC; recurrence is expressed in wall-clock time in the workspace's IANA zone (default Europe/Amsterdam) and must hold across DST changes.
- Every operation is scoped to one workspace (`organization_id`). Roles are Owner, Admin, Trainer and Client (`PRODUCT.md §50`).
- Notes may contain health data: trainer-only by default; never put note content in errors, logs or list payloads.
- Tests sit next to the code (`*.test.ts`) with edge cases and invalid input. Line coverage of this package must stay at or above 90%.
