# Scope: parent-embedded DataGrid for bridge children (cmd_167 §4)

Status: scoping only — no code changes here.
Goal: make it possible to **create / edit / delete `channel` and `fc_link` from
their parent** (work, character, scene, music, channel), per
`docs/cmd_167_bridge-interface-design.md` §4.

## 1. Current state and the exact gap

The data model already supports it (FK-on-parent, one-to-many through the bridge):

```
parent.<bridge>_id  (@unique)  →  <bridge> (channelable)  →  <child>[] (channels)
```

- `helpers/bridge_prisma.py` emits `<bridge>` with `children[]`; each parent has
  `<bridge>_id @unique`; each child has `<bridge>_id`.
- `helpers/bridge_direction.py::collect_parent_bridge_fk_props(model, schema)`
  injects the parent's `<bridge>_id` FK; the parent's `service.ts` already
  auto-creates the empty bridge row, and the parent getter includes `<bridge>: true`.

**The gap:** a parent's child grids are derived **only** from array `$ref`
properties on the parent's own `_detail`, in
`generate_types.py::_extract_children(defn, schema)` (line 48). Bridge children are
declared on the **child's** `x-bridge.parents`, not on the parent, so they never
enter the parent's `children` list → `grid_children` is empty for them →
no DataGrid is generated on the parent. That single omission is why `work` shows no
`channels` grid today.

Everything else needed (one-to-many storage, the empty-bridge auto-create, the
child's `selectedParentType`/`selectedParentId` create path, the read-only-parent
rules from cmd_167 §7) already exists.

## 2. Reuse vs. new

Reuse the **existing inline child-grid machinery** that already renders the
`characters` / `scenes` grids on `work` (driven by `grid_children` in
`generators.py`: `column_children`, `use<Child>Columns`, `has_grid_children`, the
FormUpsert child DataGrid + dialog). The bridge variant differs only in:

1. **Discovery** — reverse lookup from child `x-bridge.parents` instead of a parent
   array property.
2. **Data path** — list/create/edit/delete keyed on `<bridge>_id` instead of a
   direct parent FK.

## 3. Implementation steps

### Step 1 — reverse discovery helper
`helpers/bridge_direction.py`: add `collect_parent_bridge_children(model, schema)`,
the mirror of `collect_parent_bridge_fk_props`. For every entity whose new-form
`x-bridge` lists `model` as a parent target, return:
```python
{ 'child': 'channel', 'bridge_name': 'channelable',
  'parent_fk': 'channelable_id', 'columns': <child x-display.table>,
  'role': 'work_hub' }
```

### Step 2 — inject bridge children into the parent's child list
In `generate_types.py` (in/after `_extract_children`, or in `extract_entities`
after `children = _extract_children(...)`), append a synthetic child entry per
discovered bridge child with a distinct marker, e.g.
`output_type: 'bridge_grid'`, carrying `bridge_name` / `parent_fk` / `columns`.
Routed into `grid_children` so the existing grid context/template fire.
**Guards to update in `extract_entities`:**
- The validation at line ~164–173 ("a generated child must use `x-outputType: list`")
  must **exempt** `bridge_grid` children (they keep their own pages).
- The "pure child filtered out unless it has `_detail`" logic must keep bridge
  children standalone (they already have `_detail`, so likely fine — verify).

### Step 3 — parent getter (list the children)
`getters.ts` for the parent must fetch the children via the bridge. Per cmd_167
§9.3, the parent context is concrete, so query directly:
```ts
channel.findMany({ where: { channelable_id: parent.channelable_id }, ... })
```
or `include: { channelable: { include: { channels: {…} } } }`. Map to grid rows
using the child's `x-display.table` columns; **omit the parent column** (parent is
known — cmd_167 §4.3).

### Step 4 — create / edit / delete from the parent
Prefer **reusing the child's own server actions** (`add<Child>`, `update<Child>`,
`remove<Child>`) scoped to the parent, rather than nested writes in the parent
service — this keeps the parent service decoupled from child internals.
- **Create:** call the child create with parent context supplied implicitly
  (`selectedParentType=<this parent model>`, `selectedParentId=<parent row id>`) so
  it resolves `parent.<bridge>_id`. Hidden from the form (cmd_167 §4.2). The
  parent's bridge row already exists (auto-created), so no extra setup.
- **Edit:** child scalar fields only; exclude `<bridge>_id` / parent relation —
  already covered by the cmd_167 §7 "parent always read-only" rule.
- **Delete:** by child id.

### Step 5 — templates / UI
Extend the child-grid template (or add a `bridge_grid` variant) to render the
DataGrid + create dialog wired to the child's FormUpsert with parent context
hidden. Reuse existing DataGrid/dialog components.

### Step 6 — permissions (cmd_167 §10)
Show the section only with parent read permission; gate row ops on child
create/update/delete permissions; fail closed (hide) on conflict.

### Step 7 — tests
- e2e: create/edit/delete a `channel` from a `work` page; same for `fc_link`.
- child standalone list still shows the read-only parent column (cmd_167 §5.1).
- child edit form has no parent switcher (cmd_167 §5.4).
- pytest: `collect_parent_bridge_children` discovery; injected `bridge_grid`
  children survive the `extract_entities` validation exemptions.

## 4. Touched files

| File | Change |
|------|--------|
| `helpers/bridge_direction.py` | + `collect_parent_bridge_children()` |
| `generate_types.py` | inject `bridge_grid` children; exempt them from child-validation |
| `build_context.py` / `context.py` | feed bridge-grid children into `grid_children` context + getter include |
| `generators.py` | parent getter query (`where channelable_id`); wire grid create/edit/delete to child actions |
| `templates/*` (child grid / form_view / form_upsert) | render the bridge-child DataGrid + create dialog |
| `code_generator/tests/` | discovery + extraction + e2e |

## 5. Risks / decisions to confirm

1. **Write path:** child server actions (recommended, decoupled) vs nested parent
   writes (matches existing inline children but couples parent↔child). Pick one.
2. **`extract_entities` validation exemptions** must be precise so bridge children
   keep standalone pages while also appearing as parent grids.
3. **Columns for `fc_link`:** now resolved — `x-display.table` was added
   (`name`, `url`).
4. **Generator-wide impact:** this is shared-base behaviour (all projects using
   `x-bridge`); land it in the `app-generator` submodule and regenerate per project.

## 6. Effort

Small-to-medium. No schema or Prisma changes (data model already supports it). The
work is generator plumbing — one discovery helper, one injection point, getter +
action wiring, and a grid template variant — mostly reusing the existing inline
child-grid path.
