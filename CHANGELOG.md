# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Detailed change history will begin from the first versioned release.

## [Unreleased]

### BREAKING
- **`ApprovalRequestStatus`, `ReactionType`, `ShiftStatus`, and `DayOfWeek` nativeEnum members are now lowercase snake_case** (e.g. `Pending` → `pending`, `Sunday` → `sunday`), matching app-generator's cmd_493 casing convention for the two inherited enums and extending it to app-template's own `ShiftStatus`/`DayOfWeek`. A migration (`prj/prisma/migrations/20260730221905_cmd499_enum_case_normalization/migration.sql`) rewrites existing rows losslessly; verified against a seeded isolated database (all pre-migration member values round-tripped with zero data loss, `prisma migrate diff` empty against the new schema). Any code or scripts outside this repo that compare against the old PascalCase literals (e.g. `'Scheduled'`, `'Sunday'`) must be updated to the lowercase form.

### Changed
- Updated npm scripts to align with app-generator cmd_007-015 patterns
- Fixed broken script references (dev, build, start, cleanup)
- Aligned setup.sh bootstrap with env:use dual-link flow
- Added thin wrapper scripts: env:use, env:current, ports:generate, ports:check
- `dev` and `build` now sync `prj/` via `prj:sync` (`app-generator/scripts/prj_sync.py`), matching `generate-code` and `test:e2e:build`, instead of `scripts/sync-prj.sh`. `prj:sync` deep-merges `messages/*.json` rather than overwriting it.

### Removed
- `scripts/sync-prj.sh` — retired now that all local commands and the Vercel deploy path use `prj:sync`, leaving it with zero callers.

### Internal
- Fixed hand-written Cypress test helpers (`prj/cypress/support/purchase_order/reservation_helper.ts`) that predated the `inventory.location_id` required id-FK migration (cmd_562) and never supplied a `location_id` when seeding `inventory` rows, crashing `seedReservationInventory`/`seedSecondProduct` with a Prisma validation error before any assertions ran. Added a deterministic find-or-create default location (same idiom as `seedSecondInventoryLot` and the generated `populatePurchaseOrderDependencies` helper). This unblocked 37 previously-crashing tests across 8 hand-written API specs (`purchase_order_reservation`, `purchase_order_move_reservation`, `purchase_per_item_approval_approve`/`_dispatch`/`_split`, `receiving_receipt_line_approval_approve`/`_dispatch`/`_split`) — all now pass. Also updated two stale assertions in `purchase_order_move_reservation.cy.ts` that expected a `null` location on the default lot, which is no longer possible post-migration.
- Moved `approval_flow` to `x-generate.test: false` and replaced its generated desktop/mobile/API Cypress specs with hand-written equivalents (`prj/cypress/e2e/approval_flow.cy.ts`, `prj/cypress/e2e/mobile/approval_flow.cy.ts`, `prj/cypress/e2e/api/approval_flow.cy.ts`, `prj/cypress/support/approval_flow/helper.ts`), since `preceded_by`/`followed_by` candidate narrowing (`lib/approval_flow/autocomplete_filter.ts`) is bespoke logic the generated spec template cannot represent or verify. The new desktop spec covers the same 13 cases the generated version had, plus a real gap it left open: "Add Preceded By"/"Add Followed By" were clicked but never verified to persist — now asserted. Also fixed two pre-existing bugs found in the process: a fixture/`@@unique([entity_name, approver_role_id])` collision in `populateApprovalFlowDependencies()` that silently failed create in some of the generated spec's own test cases, and a stale `secondaryLabelField` schema key (no longer read by the generator since cmd_613) that had been silently breaking `approval_flow_same_entity_autocomplete_filter.cy.ts`'s label-consistency test.
