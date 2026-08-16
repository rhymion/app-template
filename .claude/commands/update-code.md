---
description: Update non-generated TypeScript or configuration in proj_c — scoped to prj/.
argument-hint: <change description>
---

This is an **update-code** task for proj_c.

Refer to `@app-generator/.claude/commands/update-code.md` for the full procedure.

Task: $ARGUMENTS

## proj_c constraints

- Edit only files under `prj/`. Do **not** touch `app-generator/`.
- Temporary adjustments to generated code belong in `prj/` — not in the generator templates.

## Completion gate

Two-stage e2e, mirroring app-generator's own pattern
(`app-generator/.claude/commands/update-code.md §Completion gate`): the
mandatory local gate runs the API-only Cypress suite; the full suite
(including UI specs) is not a required local step — it runs automatically
at merge time via CI.

Required, in this order:

1. `npm run test:e2e:build` — prj:sync + docker:up:test + generate-code + db:push + db:generate + db:seed-tenant + build
2. `npm run check:generated` — must run after step 1 (needs the generated `lib/`/`app/` tree on disk); see below for why
3. `npm run lint` — must run after step 1, not before (see below for why)
4. `npm run test:e2e:cy:api` — API Cypress specs only (mandatory dev-time gate)
5. `npm --prefix app-generator audit --omit=dev --audit-level=high` — production-dependency vulnerability scan

Not a local step — enforced by CI instead:

6. `npm run test:e2e:cy:start` — full Cypress suite including UI specs.
   Runs automatically on push/PR to `develop`/`main` via this repo's own
   `.github/workflows/ci.yml` (`e2e-tests` job). Do not run this locally
   as a gate; it's covered before merge regardless.

### check:generated — why it's a required step here, not just generate-schema's

`check:generated` was already a `generate-schema.md` completion-gate step
(schema-changing tasks only). That was the whole reason a real violation
(the `commentable` bridge's comment/reaction writes going straight to
`prisma.comment.*`/`prisma.reaction.*` from `lib/db_table/actions.ts`
instead of through a service layer) went unnoticed from 2026-05-23 until
cmd_705: `update-code` tasks — routine feature work, not schema changes —
are both far more frequent and exactly the kind of task that can introduce
a new write:direct violation (e.g. a hand-authored server action reaching
for `prisma.<model>.*` directly) without ever touching a schema file, so a
generate-schema-only gate structurally never saw it. Requiring the check
here closes that gap at the source instead of relying solely on CI (added
as a CI step, see `.github/workflows/ci.yml`'s `e2e-tests` job, in the same
change) to catch it after the fact.

### Why pytest and vitest are not required steps here

`npm run test:pytest` and `npm run test:vitest` (both delegate to
`app-generator/`) are **not** required steps for proj_c tasks.
app-generator already runs both against its own code in its own CI
(`pytest`, `unit-tests` jobs in
`app-generator/.github/workflows/ci.yml`) — and this task type's own
scope rule already forbids touching `app-generator/`, so re-running them
here against unmodified app-generator content is redundant.

vitest specifically stays dropped even accounting for prj/-sourced
content (see the lint section below for why lint is a different case):
`prj/` currently contains 32 TS/TSX files (16 Cypress spec/support
files, 16 application source files), and none of them is named
`*.test.ts`/`*.spec.ts`. vitest's default test discovery has nothing new
to execute against `prj/` regardless of gate ordering — it would only
re-run app-generator's own existing suite, which is already covered by
app-generator's own CI.

### Why lint stays — and why step order matters

Unlike pytest/vitest, `npm run lint` **is** retained as a required step —
run at step 2, **after** step 1 (`test:e2e:build`, which performs
`prj:sync`), not before. ESLint has no path-based include/exclude rule
that would skip prj/-synced files, so running lint after prj:sync means
it genuinely lints all 32 of `prj/`'s TS/TSX files at their synced
destination paths inside `app-generator/`, not just app-generator's own
templates. This is real coverage app-generator's own CI cannot provide:
app-generator's own `lint`/`unit-tests` CI jobs check out app-generator
alone with no `prj/` sibling directory, so they structurally never see
this content, no matter what changes in this repo. **Do not reorder step
2 ahead of step 1** — doing so silently drops prj/ lint coverage back to
zero.

### npm audit — why it stays

`npm --prefix app-generator audit --omit=dev --audit-level=high` remains
a required step even though app-generator's own `audit` CI job already
audits this same dependency tree: a new high/critical CVE can be
published in an already-pinned dependency *after* app-generator's own
audit last passed, with no app-generator commit to re-trigger it (a
`nanoid` vulnerability surfaced exactly this way in practice). Neither
proj_c's nor proj_g's own CI runs an audit job today, so this local step
is the only check standing between a newly-disclosed vulnerable pin and
merge.
