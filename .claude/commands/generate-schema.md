---
description: Generate or update a schema for app-template — output scoped to prj/code_generator/json_schema.yaml.
argument-hint: <model or schema change description>
---

This is a **generate-schema** task for app-template.

Refer to `@app-generator/.claude/commands/generate-schema.md` for the full procedure.

Task: $ARGUMENTS

## Scenario & Confirmation Protocol

### Scenario A — Fresh start (default schema only)

No custom models or entities have been added yet. The repository contains only the
default Prisma models (`user`, `organization`, `role`, `permission`, etc.) and
default JSON schema entities.

- Describe the application domain and the models/entities you want to create.
- The AI applies the six confirmation rules below before proceeding.

### Scenario B — Add to existing schema

Custom models and/or entities already exist. You are extending the schema with new ones.

- Describe what you want to add (new Prisma model, new JSON entity, or both).
- The AI applies the six confirmation rules below before adding anything.

---

### Confirmation rules (AI must verify before acting)

**① Default model/entity preservation**
Keep all default Prisma models and JSON schema entities unless explicitly instructed
otherwise. If deletion is requested, explain the risks (broken relations, cascade effects)
and ask for confirmation before deleting.

**② Naming convention**
New model and entity names must be singular lowercase (e.g., `product`, `purchase_order`).
If the user specifies a plural or uppercase name, explain the standard rule and the risks
of non-standard naming, then ask for confirmation before proceeding.

**③ ID type — String CUID only**
The primary ID is always `String @id @default(cuid())`. If the user requests a different
type (e.g., integer), keep it as a non-primary unique field instead. Explain this
constraint and confirm with the user.

**④ Existing feature first**
If a built-in feature (comment, attachment, reaction, approval, etc.) can largely satisfy
the requirement, recommend using it. Explain that labels and display names are easily
changed without altering the model structure. Confirm before creating a custom model.

**⑤ JSON schema array display**
Confirm whether to show an independent entity's list on another entity's detail page.
Default: do NOT add a user-created item list to the user detail page unless explicitly
requested. For other relationships (e.g., show `resource` list on `organization` detail?),
always confirm.

**⑥ Fast-track option**
Offer the user the option to skip all confirmation prompts and let the AI choose the best
approach autonomously. In fast-track mode the AI generates and presents the result;
the user follows up with adjustments after reviewing the generated application.

---

## app-template constraints

- Schema files **must** be saved to `prj/code_generator/json_schema.yaml`.
- Schema syntax reference: `app-generator/docs/knowledge/schema-yaml-configuration.md`
- After creating or updating a schema, run `npm run generate-code` to regenerate code.
- Do **not** edit anything inside `app-generator/`.

## Completion gate

Two-stage e2e, mirroring app-generator's own pattern
(`app-generator/.claude/commands/generate-schema.md §Completion gate`):
the mandatory local gate runs the API-only Cypress suite; the full suite
(including UI specs) is not a required local step — it runs automatically
at merge time via CI.

Required, in this order:

1. `npm run lint` — runs `prj:sync` internally, then lints exactly the
   `.ts`/`.tsx` files `prj:sync` just reported syncing (see below for
   why this is not app-generator's own `lint` script and does not
   measure the full generated codebase).
2. `npm run test:e2e:build` — prj:sync (idempotent re-run; safe — step 1
   already did the same copy) + docker:up:test + generate-code + db:push +
   db:generate + db:seed-tenant + build
3. `npm --prefix app-generator run check:generated` — generated code matches templates/schema
4. `npm run test:e2e:cy:api` — API Cypress specs only (mandatory dev-time gate)
5. `npm --prefix app-generator audit --omit=dev --audit-level=high` — production-dependency vulnerability scan

Not a local step — enforced by CI instead:

6. `npm run test:e2e:cy:start` — full Cypress suite including UI specs.
   Runs automatically on push/PR to `develop`/`main` via this repo's own
   `.github/workflows/ci.yml` (`e2e-tests` job). Do not run this locally
   as a gate; it's covered before merge regardless.

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

### Why lint stays — and why it is not app-generator's own `lint`

`npm run lint` here does **not** delegate to app-generator's own `lint`
script (`eslint --max-warnings 20`, unscoped over that whole repo) —
it delegates to `npm --prefix app-generator run lint:prj`
(`app-generator/scripts/lint_prj_synced.py`). This is a decision (cmd_683,
2026-08-13): a consumer's lint is not a copy of the generator's own lint.
app-generator's own code is already covered by app-generator's own CI;
what this repo needs to check is whether `prj/`'s own hand-written
content — the only thing unique to this repo — passes ESLint once
synced to its real destination paths.

`lint:prj` runs `prj:sync` itself, takes prj_sync.py's own
`copied`/`merged` stdout lines as the list of what to lint (never
re-derives that list independently), filters to `.ts`/`.tsx`, and lints
exactly those files. Because the population is explicitly the output of
`prj:sync` and nothing else, running it before or after `generate-code`
makes no difference to what gets measured — there is no larger,
unscoped population for step ordering to accidentally expose (contrast
with app-generator's own `lint`, which genuinely must run before
`generate-code` to match its own CI precondition — see
`app-generator/docs/knowledge/lint-gate-must-match-ci-precondition.md`
and `app-generator/docs/knowledge/consumer-prj-scoped-lint.md` for the
full contrast between the two). Step 1 here is placed first purely so a
badly-formed `prj/` change is caught before spending time on the much
slower `test:e2e:build` step, not because of a scope leak this ordering
prevents.

**Fail-closed, not "no target files = pass"**: `lint:prj` exits non-zero
if `prj:sync` reports zero `.ts`/`.tsx` files, for any reason —
including a genuinely fresh `prj/` with no hand-written TS content yet.
A lint step that can go green by having nothing to check is the exact
failure mode the earlier candidate (i) investigation hit (naive
invocation linted 0 files due to an ESLint base-path restriction and
exited 0) — `lint:prj` refuses to reproduce that shape.

**No `--max-warnings` ceiling here**, unlike app-generator's own `lint`
— only ESLint errors (or the fail-closed check above) fail this step.
See `app-generator/docs/knowledge/consumer-prj-scoped-lint.md` for why a
ceiling inherited from app-generator's own template-surface baseline
would not be a meaningful signal for `prj/`'s own, structurally
different and independently growing content.

Verified end-to-end against this repo's actual `prj/` content (cmd_683,
same unmodified schema as cmd_682's measurement): `npm run lint`
reports 32 `.ts`/`.tsx` files synced from `prj/` and **exits 0**. This
supersedes cmd_682's intermediate fix (which reordered app-generator's
own `--max-warnings 20`-capped `lint` to run before `generate-code`,
reducing the false population from 450 to 56 warnings but still failing
against a ceiling that was never calibrated for `prj/`'s own content) —
`lint:prj` has no such ceiling, so the residual failure cmd_682 flagged
does not apply to this mechanism.

#### History of this section

An earlier revision of this doc (through cmd_682, 2026-08-13) delegated
`npm run lint` to app-generator's own `lint` script and placed it after
`test:e2e:build` — measuring the full generated codebase (hundreds of
pre-existing, per-entity template warnings unrelated to `prj/`).
cmd_682 fixed the *ordering* (moved it before `generate-code`) but kept
delegating to app-generator's own capped `lint` script, leaving a
smaller but still-present false-population problem plus a stale warning
ceiling. cmd_683 replaces the delegate target entirely with the
purpose-built, `prj/`-scoped `lint:prj` mechanism described above —
ordering relative to `generate-code` is no longer a correctness
requirement for this step at all, only a minor performance
consideration (fail fast before the slow build step).

### CI does not run this step — a green CI run does not mean lint passed

This repo's own `.github/workflows/ci.yml` defines exactly one job
(`E2E Tests`: `test:e2e:build` then `test:e2e:cy:start`). It has no lint
job of any kind, and never has (confirmed by reading the workflow file
directly, not inferred from a job name). A product gate is deliberately
not made to depend on CI in this repo (a local-only check must still
work for a developer who never touches CI), so this is not itself a
defect — but it means a green CI run on a PR is **not** evidence that
`npm run lint` was ever run or passed on that PR. Only this local
Completion gate step, or an explicit local run, tells you that. Do not
read "CI is green" as "lint passed" for this repo.

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
