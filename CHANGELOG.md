# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Detailed change history will begin from the first versioned release.

## [Unreleased]

### Internal
- **Added a real-DB regression fixture for the code generator's pre-edit-row
  handoff to `validateCustomRules()`** (`prj/lib/organization/service_validation_custom.ts`
  + `prj/test/flows/pre_edit_row_custom_validation.test.ts`). This was originally added
  directly to app-generator's own self-generated app; it moved here because a test-only
  fixture with no product meaning has no business living inside the generator's own
  generated output, where it already collided twice with that entity's own generated
  test suite. The rule locks an `organization.description` carrying a marker string no
  real usage would ever produce, so it stays fully independent of `organization`'s own
  generated CRUD coverage. See app-generator's
  `docs/knowledge/pre-edit-row-handoff-to-custom-validation.md`, "Where the regression
  fixture actually lives," for the full mechanism writeup and the two incidents that
  motivated the move.
- **Added permanent regression fixtures for known code-generator defect patterns**
  (`asset` / `asset_component` / `spare_part` / `maintenance_ticket`). These entities carry
  no product meaning — they exist purely as standing end-to-end coverage for defect patterns
  the code generator has shown before: a self-referential FK whose list-page click collides
  with a same-named dependency row, a child DataGrid FK select using the wrong label field,
  a non-nullable URI field silently skipped by populate/fill-command generation, a Decimal or
  date field that is optional in the UI but non-nullable in the database, a list table with no
  declared primary column, and a role-gated approval flow on an org-scoped entity. Kept to the
  minimum entity count by concentrating multiple patterns per entity. See the entity block
  comment in `prj/code_generator/json_schema.yaml` before removing or narrowing any of these.
- **`.github/workflows/ci.yml` re-synced to the app-generator canonical source, and gained a
  machine-checked drift gate.** The previous copy had silently diverged from the canonical body
  (`app-generator/docs/consumer-commands/ci.yml`) in one step's `name:` field and several step
  comments — this restores an exact match and adds a `verify-canonical-ci` job (now part of the
  canonical body itself) that diffs this file's body against the submodule-pinned canonical copy
  on every push/PR, so future drift fails the build instead of going unnoticed. See
  `app-generator/docs/knowledge/ci-workflow-canonical-source.md` "Drift check".
- **`vercel-setup.sh` no longer runs database migration or seeding** (PR #58) — its old
  Steps 3/4/5/5.5 (`migrate:deploy`/`db:seed-tenant` against production then staging) are removed.
  `vercel-build` already runs `migrate:deploy` on every deploy (§18), so the earlier call was a
  redundant second owner; and `vercel-setup.sh` runs before the first deploy, so seeding there
  risked seeding a database with no schema yet. Split into a fixed three-stage sequence:
  `vercel-setup.sh` (control plane only — provisioning, project link, env vars) → `vercel-deploy.sh`
  (unchanged; creates the schema via `vercel-build`) → new `scripts/vercel-seed.sh` (bootstrap
  tenant/admin data, modeled on `app-generator/scripts/gcp-seed.sh`'s idempotency/DRY_RUN/prerequisite
  conventions). `vercel-seed.sh` checks `prisma migrate status`'s exit code before seeding and stops
  with a plain-language message if the schema isn't there yet, rather than assuming the order was
  followed — verified live against a scratch local Postgres container: halts cleanly when no
  migrations are applied, proceeds and successfully seeds once a real migration has been deployed,
  and is idempotent on a second run. Added `vercel-setup.sh --status`, a read-only diagnostic that
  prints production/staging `prisma migrate status` without writing anything. `docs/vercel-automation-design.md`
  §5 and new §19 updated; `vercel-teardown.sh` confirmed to need no change (it only removes env vars
  and unlinks the project — never depended on the removed steps).
- **SSL deprecation warning during `db:seed-tenant`, root-caused and fixed** (PR #58) — traced to
  `pg-connection-string`'s one-time warning for Neon's embedded `sslmode=require`, not to any
  first-party SSL configuration (repo-wide grep for `sslmode|ssl:|rejectUnauthorized|NODE_TLS` in
  first-party `.ts`/`.js` sources returns zero hits). The fix is in `app-generator` (`lib/db-url.ts`,
  reaching this repo through the submodule pointer, not duplicated here) — see
  `app-generator/docs/knowledge/pg-connection-string-sslmode-deprecation.md` for the full writeup and
  §19.2 of this repo's `docs/vercel-automation-design.md` for a summary.
- Set `x-generate.test: false` on `approval_flow` (PR #53) — its generated CRUD Cypress specs (desktop/mobile/API)
  and support helper are being replaced by hand-written coverage placed in app-generator (submodule) so the coverage
  reaches every consumer through the submodule, rather than living only in this repo's `prj/`. Verified via
  `generate-code`: the three specs, `cypress/support/approval_flow/helper.ts`, and the task registry entry in
  `cypress/support/generated-tasks.ts` are no longer written (confirmed against `.generated-manifest.json`, 
  which no longer lists them). The hand-written replacement is tracked separately, pending an app-generator submodule
- `scripts/vercel-env.sh`'s `vercel_env_inject()` now also injects `DIRECT_URL` (Production and Preview), sourced
  from the unpooled Neon connection strings `vercel-setup.sh` already fetches and persists as
  `DATABASE_URL_UNPOOLED_PROD`/`DATABASE_URL_UNPOOLED_STAGING` — nothing new is fetched from Neon, only forwarded
  to Vercel (PR #52 addendum). This is what `app-generator`'s `prisma.config.ts` (PR #52) needs so that
  `prisma migrate deploy` (the DB-schema-change command, not a Vercel app deploy) stops running through the pooled
  connection during a Vercel deploy's build. Corrected a comment in `vercel-setup.sh` Step 3/5 that claimed
  `prisma migrate deploy` was "deliberately not part of vercel.json buildCommand" — traced via `git log`
  (not just today's `grep`): the comment was accurate when written (PR #7, 2026-07-07, describing the then-operative
  root-level `vercel.json`, which never included it) and went stale after PR #25 (2026-07-29) made
  `app-generator/vercel.json` — which had included it since 2026-05-24 — the operative buildCommand; 
  the comment was never updated for that switch. See `docs/vercel-automation-design.md` §18.

### Fixed
- **`approval_flow` predecessor/successor list showed a different label on the View page than on
  the Edit page for the same row**, and picking a predecessor/successor offered candidates from
  every entity type instead of just the one the approval chain applies to. Both are fixed upstream
  in app-generator; see its CHANGELOG for detail. Multiple `approval_flow` rows sharing the same
  entity type is expected (multi-stage approval chains), not a data-quality issue.

### Added
- `user.image` (a plain string URL, no longer populated since OAuth avatar sync was retired
  upstream) is now `user.image_id`, a direct-attachment FK to `attachment`, matching
  app-generator's default schema. The Settings page's avatar field is now an upload widget
  instead of a read-only URL string. A migration
  (`prj/prisma/migrations/20260825110000_user_image_direct_fk/migration.sql`) drops the old
  column — the stored values are external OAuth provider URLs, not locally uploaded files, so
  there is nothing meaningful to carry forward into the new upload-backed model; see the
  migration file's header comment for the full reasoning. No production data is affected
  (pre-customer).
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
- **`ApprovalRequestStatus`, `ReactionType`, `ShiftStatus`, and `DayOfWeek` nativeEnum members are now lowercase snake_case** (e.g. `Pending` → `pending`, `Sunday` → `sunday`), matching app-generator's established casing convention for the two inherited enums and extending it to app-template's own `ShiftStatus`/`DayOfWeek`. A migration (`prj/prisma/migrations/20260730221905_cmd499_enum_case_normalization/migration.sql`) rewrites existing rows losslessly; verified against a seeded isolated database (all pre-migration member values round-tripped with zero data loss, `prisma migrate diff` empty against the new schema). Any code or scripts outside this repo that compare against the old PascalCase literals (e.g. `'Scheduled'`, `'Sunday'`) must be updated to the lowercase form.

### Changed
- Updated npm scripts to align with app-generator's established script patterns
- Fixed broken script references (dev, build, start, cleanup)
- Aligned setup.sh bootstrap with env:use dual-link flow
- Added thin wrapper scripts: env:use, env:current, ports:generate, ports:check
- `dev` and `build` now sync `prj/` via `prj:sync` (`app-generator/scripts/prj_sync.py`), matching `generate-code` and `test:e2e:build`, instead of `scripts/sync-prj.sh`. `prj:sync` deep-merges `messages/*.json` rather than overwriting it.

### Removed
- `scripts/sync-prj.sh` — retired now that all local commands and the Vercel deploy path use `prj:sync`, leaving it with zero callers.

### Internal
- Fixed hand-written Cypress test helpers (`prj/cypress/support/purchase_order/reservation_helper.ts`) that predated the `inventory.location_id` required id-FK migration and never supplied a `location_id` when seeding `inventory` rows, crashing `seedReservationInventory`/`seedSecondProduct` with a Prisma validation error before any assertions ran. Added a deterministic find-or-create default location (same idiom as `seedSecondInventoryLot` and the generated `populatePurchaseOrderDependencies` helper). This unblocked 37 previously-crashing tests across 8 hand-written API specs (`purchase_order_reservation`, `purchase_order_move_reservation`, `purchase_per_item_approval_approve`/`_dispatch`/`_split`, `receiving_receipt_line_approval_approve`/`_dispatch`/`_split`) — all now pass. Also updated two stale assertions in `purchase_order_move_reservation.cy.ts` that expected a `null` location on the default lot, which is no longer possible post-migration.
