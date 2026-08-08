---
description: Add or update a UI component in proj_c — scoped to prj/components/.
argument-hint: <component name or description>
---

This is an **update-component** task for proj_c.

Refer to `@app-generator/.claude/commands/add-component.md` for the full procedure.

Task: $ARGUMENTS

## proj_c constraints

- Edit only files under `prj/components/` (or equivalent path under `prj/`).
- Do **not** touch `app-generator/`.

## Completion gate

Two-stage e2e, mirroring app-generator's own pattern
(`app-generator/.claude/commands/add-component.md §Completion gate`): the
mandatory local gate runs the API-only Cypress suite; the full suite
(including UI specs) is not a required local step — it runs automatically
at merge time via CI.

Required, in this order:

1. `npm run test:e2e:build` — prj:sync + docker:up:test + generate-code + db:push + db:generate + db:seed-tenant + build
2. `npm run test:e2e:cy:api` — API Cypress specs only (mandatory dev-time gate)
3. `npm --prefix app-generator audit --omit=dev --audit-level=high` — production-dependency vulnerability scan

Not a local step — enforced by CI instead:

4. `npm run test:e2e:cy:start` — full Cypress suite including UI specs.
   Runs automatically on push/PR to `develop`/`main` via this repo's own
   `.github/workflows/ci.yml` (`e2e-tests` job). Do not run this locally
   as a gate; it's covered before merge regardless.

### Why pytest/vitest/lint are not required steps here

`npm run test:pytest`, `npm run test:vitest`, and `npm run lint` (all
three delegate to `app-generator/`) are **not** required steps for proj_c
tasks. app-generator already runs all three against its own code in its
own CI (`pytest`, `unit-tests`, `lint` jobs in
`app-generator/.github/workflows/ci.yml`) — and this task type's own
scope rule already forbids touching `app-generator/`, so re-running them
here against unmodified app-generator content is redundant.

This does **not** mean prj/-sourced hand-written code (copied into
`app-generator/` by `prj:sync`, step 1 above) is covered by those
app-generator CI jobs — it structurally isn't: app-generator's own CI
checks out app-generator alone, with no `prj/` sibling directory, so
those jobs never see prj/ content no matter what changes in this repo.
`prj/` currently contains 32 TS/TSX files (16 Cypress spec/support files,
16 application source files); **0 of them are ever exercised by any lint
or vitest job in either repo's current CI configuration.** vitest
specifically has nothing to run against `prj/` regardless of gate
ordering — none of these files are named `*.test.ts`/`*.spec.ts`. lint is
a different case: ESLint has no path restriction that would exclude these
files, so a lint step scoped to `prj/` (run after `prj:sync`) would add
real, currently-absent coverage. This gate does not require it — an open
question for a future revision of this doc, not a settled "not needed".

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
