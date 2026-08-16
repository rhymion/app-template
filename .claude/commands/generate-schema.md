---
description: Generate or update a schema for app-template — output scoped to prj/code_generator/json_schema.yaml.
argument-hint: <model or schema change description>
---

This is a **generate-schema** task for app-template.

Refer to `@app-generator/.claude/commands/generate-schema.md` for the full procedure.

The Scenario & Confirmation Protocol and most of the Completion gate below
are shared across consumer repos and canonicalized in
`app-generator/docs/consumer-commands/generate-schema.md` — see
`app-generator/docs/knowledge/consumer-commands-canonical-source.md` for
which parts are canonical vs. kept local to this repo (measured facts and
one documented behavioral divergence do not collapse into the shared text).

Task: $ARGUMENTS

## Scenario & Confirmation Protocol

See `app-generator/docs/consumer-commands/generate-schema.md §Scenario &
Confirmation Protocol` (Scenarios A/B and confirmation rules ①–⑦).

## app-template constraints

- Schema files **must** be saved to `prj/code_generator/json_schema.yaml`.
- Schema syntax reference: `app-generator/docs/knowledge/schema-yaml-configuration.md`
- After creating or updating a schema, run `npm run generate-code` to regenerate code.
- Do **not** edit anything inside `app-generator/`.

## Completion gate

See `app-generator/docs/consumer-commands/generate-schema.md §Completion
gate` for the full step list and rationale (why pytest/vitest are dropped,
why `lint` delegates to `lint:prj` instead of app-generator's own `lint`,
why `npm audit` stays). Required steps, in order:

1. `npm run lint`
2. `npm run test:e2e:build`
3. `npm --prefix app-generator run check:generated`
4. `npm run test:e2e:cy:api`
5. `npm --prefix app-generator audit --omit=dev --audit-level=high`

### app-template specifics (measured facts — kept local, not canonical)

- `prj/` currently contains 32 TS/TSX files (16 Cypress spec/support files,
  16 application source files), none named `*.test.ts`/`*.spec.ts` — this
  is why vitest has nothing new to discover here (see the canonical file
  for the general reasoning).

- **Fail-closed on measurement, not on empty result**: `lint:prj` exits
  non-zero if `prj:sync` could not be observed running against a real
  `../prj` — no `../prj` sibling directory at all, or a `../prj` that
  exists but from which `prj:sync` synced zero files of any kind. It does
  **not** fail merely because none of the files `prj:sync` did observe and
  sync happen to be `.ts`/`.tsx` — a `prj/` that holds only e.g.
  schema/SQL/migration files and no hand-written TypeScript is a legitimate
  state, not a temporary gap to be treated as red (2026-08-15 product
  decision). This repo's own `lint:prj` semantics — confirm against
  `app-generator/scripts/lint_prj_synced.py` directly if in doubt, since
  the canonical file flags this as a point where consumers may genuinely
  diverge.

- Verified end-to-end against this repo's actual `prj/` content (cmd_683,
  same unmodified schema as cmd_682's measurement): `npm run lint` reports
  32 `.ts`/`.tsx` files synced from `prj/` and **exits 0**.

- This repo's own `.github/workflows/ci.yml` defines exactly one job
  (`E2E Tests`: `test:e2e:build` then `test:e2e:cy:start`). It has no lint
  job of any kind, and never has (confirmed by reading the workflow file
  directly, not inferred from a job name). A green CI run on a PR is
  **not** evidence that `npm run lint` was ever run or passed on that PR
  in this repo — only this local Completion gate step, or an explicit
  local run, tells you that.
