# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Detailed change history will begin from the first versioned release.

## [Unreleased]

### Changed
- Updated npm scripts to align with app-generator cmd_007-015 patterns
- Fixed broken script references (dev, build, start, cleanup)
- Aligned setup.sh bootstrap with env:use dual-link flow
- Added thin wrapper scripts: env:use, env:current, ports:generate, ports:check
- `dev` and `build` now sync `prj/` via `prj:sync` (`app-generator/scripts/prj_sync.py`), matching `generate-code` and `test:e2e:build`, instead of `scripts/sync-prj.sh`. `prj:sync` deep-merges `messages/*.json` rather than overwriting it.

### Removed
- `scripts/sync-prj.sh` — retired now that all local commands and the Vercel deploy path use `prj:sync`, leaving it with zero callers.
