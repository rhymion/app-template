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
