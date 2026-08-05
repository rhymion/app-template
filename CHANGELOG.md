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

### Added
- **`personal_note`** (cmd_575): a private per-user note (`x-self-only`, `admin_bypass: true`) — relocated here from app-generator's default schema, which shipped it only as a fixture for its own regression spec, not as a default consumer feature. Its regression spec (`prj/cypress/e2e/api/self_only_access_control.cy.ts`) moved here with it, closing the gap where the spec was previously bundled unconditionally by app-generator regardless of whether this project's schema had the entity (`cmd_569`'s issue ①: 5 failing tests, now passing).
- **`x-self-only` on `setting`** (cmd_536 catch-up, cmd_575): this project's schema fork predated the upstream `setting` self-only change and never picked it up, so a non-owner with `general.read` could read/edit another user's settings despite the ownership invariant existing upstream since cmd_536. Added `x-self-only: { admin_bypass: true }` to `setting`, matching app-generator's default schema (part of the same cmd_569 issue ① gap: 2 of its 5 failing tests were this).
