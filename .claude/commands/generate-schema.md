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

1. `npm run test:e2e:build` — prj:sync + docker:up:test + generate-code + db:push + db:generate + db:seed-tenant + build
2. `npm --prefix app-generator run check:generated` — generated code matches templates/schema
3. `npm run lint` — must run after step 1, not before (see below for why)
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

### Why lint stays — and why step order matters

Unlike pytest/vitest, `npm run lint` **is** retained as a required step —
run at step 3, **after** step 1 (`test:e2e:build`, which performs
`prj:sync`), not before. ESLint has no path-based include/exclude rule
that would skip prj/-synced files, so running lint after prj:sync means
it genuinely lints all 32 of `prj/`'s TS/TSX files at their synced
destination paths inside `app-generator/`, not just app-generator's own
templates. This is real coverage app-generator's own CI cannot provide:
app-generator's own `lint`/`unit-tests` CI jobs check out app-generator
alone with no `prj/` sibling directory, so they structurally never see
this content, no matter what changes in this repo. **Do not reorder step
3 ahead of step 1** — doing so silently drops prj/ lint coverage back to
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
