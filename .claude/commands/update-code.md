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

Run in this order (mirrors `app-generator/.claude/commands/update-code.md §Completion gate`):

1. `npm --prefix app-generator run test:pytest` — Python unit tests for code generator
2. `npm --prefix app-generator run test:vitest` — vitest unit/component tests
3. `npm run test:e2e:build`  — prj:sync + docker:up:test + generate-code + db:push + db:generate + db:seed-tenant + build
4. `npm run test:e2e:cy:api` — API Cypress specs only
5. `npm run lint`
6. `npm --prefix app-generator audit --omit=dev --audit-level=high`

Steps 1 and 2 run unconditionally rather than relying on a prose "unless
affected" exemption with no mechanism to verify it — see
`app-generator/docs/knowledge/gate-exemption-must-be-machine-checkable.md`
(cmd_498). This task type's own scope rule already forbids touching
`app-generator/`, so in practice these two steps are cheap confirmations
that the rule was actually followed, not a source of new failures.
