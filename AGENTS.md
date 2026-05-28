# app-template (proj_c) — Codex Rules

This project is a **thin wrapper** around `app-generator`.

See also: `./app-generator/AGENTS.md` for the full rule set.

## Task types

Only these four task types are in scope for this project:

| Task | Prompt |
|------|--------|
| generate-schema | `.codex/prompts/generate-schema.md` |
| update-code | `.codex/prompts/update-code.md` |
| update-component | `.codex/prompts/update-component.md` |
| investigate | `.codex/prompts/investigate.md` |

`update-generator` and all other task types are **out of scope**. Do not touch `app-generator/` source files.

## Output scope

- All generated and edited files **must be saved under `prj/`**.
- Schema YAML: `prj/code_generator/json_schema.yaml`
- Never write outside `prj/` unless explicitly updating docs already there.

## Rules

1. Read `./app-generator/AGENTS.md` before starting any task.
2. Read the relevant `app-generator/docs/knowledge/` files for your task type.
3. All completion gates are defined in the prompt for each task type.
