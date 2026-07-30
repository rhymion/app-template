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

1. `npm run test:e2e:build`  — prj:sync + docker:up:test + generate-code + db:push + db:generate + db:seed-tenant + build
2. `npm --prefix app-generator run test`  — vitest component tests
3. `npm run test:e2e:cy:api` — API Cypress specs only
4. `npm run lint`
5. `npm --prefix app-generator audit --omit=dev --audit-level=high`

(`npm --prefix app-generator run test:pytest` is skipped — Python generators unchanged.)
