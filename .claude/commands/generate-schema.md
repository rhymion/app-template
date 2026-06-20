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
