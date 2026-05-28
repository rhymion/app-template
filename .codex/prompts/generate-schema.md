This is a **generate-schema** task for proj_c. Read AGENTS.md and `app-generator/AGENTS.md` before starting.

See also: `app-generator/.codex/prompts/generate-schema.md` for the full rules and completion gate.

## proj_c constraints

- Output schema YAML to `prj/code_generator/json_schema.yaml` only.
- Do not edit any files outside `prj/`.
- Do not touch `app-generator/` source files.

## Task flow

1. Create or update schema YAML in `prj/code_generator/json_schema.yaml`.
2. Run `generate-code` scoped to `prj/` output.
3. Run completion gate (see `app-generator/.codex/prompts/generate-schema.md`).

## Input
$ARGUMENTS
