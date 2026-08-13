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

1. `npm run sync` — prj:sync only. Copies `prj/`'s tracked files into
   `app-generator/` at their real destination paths. Does **not** run
   `generate-code` — the template-generated application code (`lib/*/service.ts`
   etc.) is not produced yet at this point.
2. `npm run lint` — must run here, immediately after step 1 and before
   step 3 (see below for why; this is not the same ordering as earlier
   revisions of this doc — see cmd_682).
3. `npm run test:e2e:build` — prj:sync (idempotent re-run; safe — step 1
   already did the same copy) + docker:up:test + generate-code + db:push +
   db:generate + db:seed-tenant + build
4. `npm --prefix app-generator run check:generated` — generated code matches templates/schema
5. `npm run test:e2e:cy:api` — API Cypress specs only (mandatory dev-time gate)
6. `npm --prefix app-generator audit --omit=dev --audit-level=high` — production-dependency vulnerability scan

Not a local step — enforced by CI instead:

7. `npm run test:e2e:cy:start` — full Cypress suite including UI specs.
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

### Why lint stays — and why step order matters

Unlike pytest/vitest, `npm run lint` **is** retained as a required step,
but its position is deliberate and has changed (cmd_682, 2026-08-13 —
corrected from an earlier revision of this doc that got the ordering
backwards; see "History of this section" below).

`npm run lint` must run at **step 2** — after step 1 (`npm run sync`,
prj:sync only) and **before** step 3 (`test:e2e:build`, which runs
`generate-code`). ESLint has no path-based include/exclude rule that
would skip prj/-synced files, so running lint right after `prj:sync`
(before `generate-code`) already gives real coverage of `prj/`'s
TS/TSX content at its synced destination paths inside `app-generator/` —
this is coverage app-generator's own CI cannot provide, since
app-generator's own `lint` CI job checks out app-generator alone with no
`prj/` sibling, so it structurally never sees this content no matter what
changes in this repo.

**Do not move step 2 to after step 3.** Measured directly (cmd_682,
isolated worktree, develop tip `27015f2`, same unmodified schema, `npm
run lint` via `eslint --max-warnings 20`):

| when `npm run lint` runs | population measured | result |
|---|---|---|
| after step 1 (`sync`), before `generate-code` — **this doc's order** | app-generator's own baseline (13 warnings) + prj/'s own 32 files (43 warnings) = 56 warnings, all traceable to either app-generator's pre-existing baseline or to `prj/`'s own tracked content | still over the inherited ceiling of 20 (see flagged item below) but a real, explainable population |
| after step 3 (`test:e2e:build`, which runs `generate-code`) — **the old, wrong order** | the same 56, **plus 394 additional warnings from freshly-instantiated template output** (e.g. `lib/setting6/actions.ts`, `lib/setting8/service.ts` — per-entity `service.ts`/`actions.ts` files that exist only after `generate-code` expands the jinja2 templates for every entity in the schema) — **450 warnings total** | fails, for reasons that have nothing to do with the schema change under test |

This is the mechanism behind a real, reproducible problem: content that
app-generator's own gate treats as fine (13 warnings, passes at ceiling
20, because app-generator's own repo only lints its committed templates,
never an instantiated copy of them) gets rejected once a schema is
created here and the old ordering measures the full generated output
instead. app-generator's own gate never lints an instantiated copy of its
templates across a real schema's worth of entities, because app-generator
has no schema of its own to generate against. The old "lint after
generate-code" ordering in this doc was the only place that population
(394 extra warnings, 0 errors, entirely pre-existing generator template
debt unrelated to any given schema edit) got measured — and it silently
failed *any* schema-creation task in this repo, regardless of what was
actually changed. Moving lint to before `generate-code` removes that
false population from the gate.

**Flagged, not resolved by the reordering above (needs a project-owner
decision, not a silent patch)**: even with the corrected scope (56
warnings: baseline 13 + prj/'s own 43), the gate is **still red** today,
because the inherited `--max-warnings 20` ceiling (delegated verbatim
from app-generator's own `package.json`, which calibrated it for
app-generator's own ~13-15-warning template baseline) was never
recalibrated for `prj/`'s own growing hand-written content. `prj/`'s own
scoped warning count grew from 3 (2026-08-12, subtask_664b) to 43
(2026-08-13, cmd_682) in one day, driven by genuine new hand-written
Cypress specs (`no-unused-expressions` on chai-style assertions — the
same warning class already present in app-generator's own 13-warning
baseline). This is real, correctly-scoped signal, not an ordering
artifact — do **not** raise the ceiling number to paper over it without
that decision; that would repeat the "launder the threshold instead of
fixing the population" mistake cmd_600 explicitly rejected. Tracked
together with the prj/-lint-scope implementation decision (subtask_664b)
that is pending the same decision.

#### History of this section

An earlier revision of this doc (through 2026-08-13) placed `npm run
lint` after `test:e2e:build` on the stated rationale that `prj:sync`
(bundled inside `test:e2e:build`) had to run first for lint to see
`prj/`'s content at all. That reasoning about needing `prj:sync` first
was correct; the mistake was placing lint after the **entire**
`test:e2e:build` step (which also runs `generate-code`) instead of after
just the `prj:sync` portion. This doc now separates `prj:sync` out as its
own step (step 1, `npm run sync`) specifically so lint can run right
after it without also picking up `generate-code`'s output.

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
