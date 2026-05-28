---
description: Generate or update a schema for proj_c — output scoped to prj/code_generator/schema/.
argument-hint: <model or schema change description>
---

This is a **generate-schema** task for proj_c.

Refer to `@app-generator/.claude/commands/generate-schema.md` for the full procedure.

Task: $ARGUMENTS

## proj_c constraints

- Schema files **must** be saved to `prj/code_generator/schema/`.
- Schema syntax reference: `app-generator/docs/knowledge/schema-yaml-configuration.md`
- After creating or updating a schema, run `npm run generate-code` to regenerate code.
- Do **not** edit anything inside `app-generator/`.
