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

Run in this order (mirrors `app-generator/.claude/commands/add-component.md §Completion gate`):

1. `npm --prefix app-generator run test:pytest` — Python unit tests for code generator
2. `npm run test:e2e:build`  — prj:sync + docker:up:test + generate-code + db:push + db:generate + db:seed-tenant + build
3. `npm --prefix app-generator run test:vitest`  — vitest component tests
4. `npm run test:e2e:cy:api` — API Cypress specs only
5. `npm run lint`
6. `npm --prefix app-generator audit --omit=dev --audit-level=high`

Step 1 runs unconditionally rather than relying on a prose "unchanged"
exemption with no mechanism to verify it — see
`app-generator/docs/knowledge/gate-exemption-must-be-machine-checkable.md`
(cmd_498). This task type's own scope rule already forbids touching
`app-generator/`, so in practice this step is a cheap confirmation that
the rule was actually followed, not a source of new failures.
