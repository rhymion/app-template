# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Detailed change history will begin from the first versioned release.

## [Unreleased]

### Fixed
- `approval_flow.preceded_by` / `.followed_by` used the legacy `labelField` + `secondaryLabelField` pair (`entity_name` + `approver_role.name`), a key the code generator no longer reads at all — the composite label silently degraded to a single field on the View/Edit pages instead of erroring, so the `approver_role` half of every Preceded By / Followed By entry's label was missing on screen. Replaced with the composite array form `labelField: [entity_name, approver_role.name]`. Confirmed the on-screen label actually changes (not just the schema key): before the fix, a linked predecessor's "Preceded By" entry rendered as just its role name (e.g. "Verify Predecessor Role"); after the fix it renders the full composite (e.g. "permission Verify Predecessor Role") — verified with a live Cypress run against a real Postgres-backed dev server, both before and after, not by reading source. Swept the rest of `prj/code_generator/json_schema.yaml` for `secondaryLabelField` — zero remaining occurrences.

### Internal
- Set `x-generate.test: false` on `approval_flow` (cmd_661) — its generated CRUD Cypress specs (desktop/mobile/API) and support helper are being replaced by hand-written coverage placed in app-generator (submodule) so the coverage reaches every consumer through the submodule, rather than living only in this repo's `prj/`. Verified via `generate-code`: the three specs, `cypress/support/approval_flow/helper.ts`, and the task registry entry in `cypress/support/generated-tasks.ts` are no longer written (confirmed against `.generated-manifest.json`, which no longer lists them). The hand-written replacement is tracked separately, pending an app-generator submodule pointer update that brings in the entity_name filter/validation design (cmd_652) it needs to exercise.

### Security
- The `setting` entity (the acting user's own profile/settings view) was missing the `x-self-only: { admin_bypass: true }` schema declaration that app-generator's own default schema already carries — a non-owner authenticated user could read another user's settings (`GET /api/setting/{id}` returned 200 instead of 404). Added the declaration to `prj/code_generator/json_schema.yaml` so `setting` gets the same creator-id-scoped ownership filter as app-generator's default, with an audited Administrator bypass (`self_only:admin_bypass` rows written to `audit_log`, see `lib/self_only.ts`). App-layer only — no `schema.prisma`/migration changes (verified byte-identical with and without the declaration).

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
