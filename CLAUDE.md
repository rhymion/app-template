# proj_c — App Template

This project is a **thin wrapper** around `app-generator/`.
Full rules and conventions live in:

> See also: `./app-generator/CLAUDE.md` for the full rule set

---

## proj_c-specific rules

### Supported task types (4 only)

| Task | Slash command |
|------|--------------|
| Generate / update schema | `/generate-schema` |
| Update non-generated code | `/update-code` |
| Update a UI component | `/update-component` |
| Investigate / answer questions | `/investigate` |

Tasks outside this scope (`update-generator`, `generate-component`, etc.) are
handled in the `app-generator/` upstream repo — do **not** attempt them here.

### File output scope

All generated and edited files **must** live under `prj/`:

| Artifact | Path |
|----------|------|
| Schema YAML | `prj/code_generator/json_schema.yaml` |
| Components | `prj/components/` |
| App pages / routes | `prj/app/` |
| Other source files | `prj/<relevant subdir>/` |

**Never write outside `prj/`.** If a task seems to require editing outside `prj/`,
stop and ask for clarification.

### Submodule rule

`app-generator/` is a submodule. **Do not modify it directly.**
Changes to the generator must go through the upstream repo.
