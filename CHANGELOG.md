# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Detailed change history will begin from the first versioned release.

## [Unreleased]

### Fixed
- **`approval_flow` predecessor/successor list showed a different label on the View page than on
  the Edit page for the same row**, and picking a predecessor/successor offered candidates from
  every entity type instead of just the one the approval chain applies to. Both are fixed upstream
  in app-generator; see its CHANGELOG for detail. Multiple `approval_flow` rows sharing the same
  entity type is expected (multi-stage approval chains), not a data-quality issue.

### Added
- `parent1`'s `organization` relationship is now optional (was required) — `resource` stays
  required, so the schema now covers both a required-org and an optional-org entity for exercising
  CSV import organization isolation end to end. A migration
  (`prj/prisma/migrations/20260808112800_parent1_organization_optional/migration.sql`) drops the
  `NOT NULL` constraint; `onDelete` on the relation changed from `Cascade` to `SetNull` (deleting
  an organization should orphan a now-optional `parent1` row, not destroy it).
- `leave_request.user_id` now uses `x-server-value` delegation
  (`{source: actor, override_permission: delete}`): the field defaults to the acting user, and an
  actor holding delete permission on `leave_request` may explicitly file one on another user's
  behalf. See `prj/cypress/e2e/api/leave_request_server_value_delegation.cy.ts` for both directions
  proven end to end.
- `resource` and `parent1` gained `x-import-key: [name]`, making both genuinely CSV-importable. New
  spec `prj/cypress/e2e/api/org_isolation_csv_import.cy.ts` proves organization isolation on
  import for both the required-org and optional-org path.

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
