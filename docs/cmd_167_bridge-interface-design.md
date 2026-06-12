# cmd_167 Bridge Interface Design

Date: 2026-06-11
Project: proj_f / oshicry
Scope: design only. No code, schema, generator, Prisma, or test changes are part of this document.

## 1. Purpose

This document defines the default interface for bridge child entities such as `channel` and
`fc_link`. The design covers both parent-side embedded operations and child-side standalone pages,
then proposes three schema/generator extensions:

1. Generic read-only properties.
2. Parent fields are always read-only from the child side.
3. Parent item labels can be specified in schema, including different label fields per parent type.

The north star is to keep bridge children consistent: their primary CRUD belongs with the parent,
while their standalone pages remain useful for list/detail visibility and secondary operations.

## 2. Source Review And Current Facts

The requested reference files `docs/knowledge/oshicry-bridge-overhaul-design.md` and
`docs/cmd_136_bridge-design.md` were not present under `/home/sean/work/generated-apps/oshicry`.
The design below therefore uses the available source-of-truth files and active command history:

- `queue/shogun_to_karo.yaml` cmd_167 acceptance criteria.
- `app-generator/docs/knowledge/appendix/comment-bridge.md`.
- `app-generator/docs/knowledge/appendix/approval-flow.md`.
- `app-generator/docs/knowledge/schema-yaml-configuration.md`.
- `prj/code_generator/json_schema.yaml`.
- `app-generator/code_generator/helpers/bridge_direction.py`.
- `app-generator/code_generator/helpers/bridge_prisma.py`.
- `app-generator/code_generator/build_context.py`.
- `app-generator/code_generator/generators.py`.

Current structural facts:

- `commentable` and `approvable` are system bridge records without standalone pages. CRUD or actions
  are surfaced from the parent page through generated includes and custom sections.
- Current one-to-one auto-create mode excludes bridge FKs from the parent form and pre-creates the
  bridge row in a transaction.
- Current custom bridge declarations already use FK-on-parent direction:
  each parent owns `<bridge>_id`, the bridge model has only an id and back-relations, and each child
  owns `<bridge>_id`.
- `channel` declares `x-bridge.parents` for `work`, `character`, and `scene`, with per-parent
  `labelField` values `title`, `name`, and `label`.
- `fc_link` declares `x-bridge.parents` for `work`, `character`, `music`, and `channel`, with
  per-parent `labelField` values `title`, `name`, `title`, and `name`.
- Current generated child service code accepts `selectedParentType` and `selectedParentId` on create,
  resolves the selected parent's bridge FK, and stores it on the child. That is a creation-time
  mechanism, not yet the desired user-facing default interface.

No contradiction was found with the available bridge facts. The missing named documents are a
documentation-location caveat, not a design blocker.

## 3. Existing Parent-Side Interface Pattern

### 3.1 Comment

Comment uses a system bridge (`commentable`) and a child table (`comment`). The `commentable`
record is auto-created for the parent, and generated parent pages include nested comments. The UI
does not need a standalone `commentable` page. The parent page owns the user workflow: display
comments, add a comment, edit/delete allowed comments, and refresh the parent page.

### 3.2 Attachment Files

Attachment follows the same parent-owned interface principle: attachments are supporting records
whose useful context is the parent item. The parent page is the natural place to add, remove, or
inspect files. A standalone attachment list can exist for audit/admin purposes, but it is not the
primary workflow.

### 3.3 Approval Requests

Approval uses `approvable` plus `approval_request` and `approval_history`. `approvable_detail` has
generated pages disabled. Approval actions are surfaced from the parent view/edit page through an
approval section. The standalone page is not the primary interaction point for the bridge holder.

### 3.4 Conclusion For Custom Bridges

Custom bridge children (`channel`, `fc_link`) should follow the same parent-owned default:

- Parent side default = embedded DataGrid.
- The embedded DataGrid is the default create/edit/delete surface for bridge child rows.
- Standalone list pages remain available for browsing, search, filtering, audit, and navigation.
- The reason is consistent with existing bridge systems: the parent provides the business context;
  the bridge child is a supporting record attached to exactly one parent item.

## 4. Parent-Side Default Interface

### 4.1 Default UI

For each parent entity listed in a child's `x-bridge.parents`, generate a child DataGrid section on
the parent detail/edit interface:

- `work` shows its `channels` and `fc_links`.
- `character` shows its `channels` and `fc_links`.
- `scene` shows its `channels`.
- `music` shows its `fc_links`.
- `channel` shows its `fc_links`.

The default section should behave like an embedded one-to-many list:

- List child rows attached to the parent's bridge record.
- Create a new child row already bound to the current parent.
- Edit child scalar fields without exposing parent switch controls.
- Delete child rows when permissions allow.
- Reuse normal DataGrid behavior for sort, row actions, and dense scanning.

### 4.2 Parent-Side Create

Create from the parent must pass parent context implicitly:

- UI should not ask for `selectedParentType` when the parent page already determines it.
- UI should not ask for `selectedParentId` when the current parent row already determines it.
- Generator/service can still use the existing internal pair (`selectedParentType`,
  `selectedParentId`) as an implementation detail.

Example:

```text
work view/edit
  Channels DataGrid
    Create Channel
      form fields: name, kind, visibility, other child scalar fields
      hidden/internal parent context: selectedParentType='work', selectedParentId=work.id
```

### 4.3 Parent-Side List Display

Parent DataGrid columns should default to the child's `x-display.table` if present. For `channel`,
that means `name`, `kind`, and `visibility`. For `fc_link`, either define an `x-display.table` or
fall back to sensible scalar columns such as `name` and `url`.

Parent information should not be repeated inside the parent-embedded grid because the parent is
already known.

## 5. Child-Side Default Interface

Standalone pages still exist for `channel` and `fc_link`, but their role is different from the
parent interface.

### 5.1 Child List Page

The child list page must display parent information for each row. The generated query should include
enough parent-side data to compute:

- `parent_type`: the concrete parent entity (`work`, `character`, `scene`, `music`, `channel`).
- `parent_id`: the concrete parent row id.
- `parent_label`: the display label configured for that parent type.

For FK-on-parent bridge direction, this is derived by traversing from child to bridge to exactly one
back-relation parent:

```text
channel
  channelable_id -> channelable
    work? / character? / scene?
```

The query strategy should be:

1. Include the child bridge relation.
2. Include each possible parent back-relation.
3. For each parent relation, select `id` and the configured label field.
4. At mapping time, choose the first non-null parent relation. Because `parentCardinality` is
   `exactlyOne`, more than one non-null parent should be treated as data corruption.

The list page should render a read-only `Parent` column:

```text
Parent: Work / Bocchi the Rock
```

or, in compact form:

```text
work: Bocchi the Rock
```

### 5.2 Child Detail Page

The child detail page should show parent information as read-only metadata near the top of the page:

- Parent type.
- Parent label.
- Optional link to the parent detail page if the current user has permission.

It should also show child scalar fields and secondary sections such as comments, depending on the
child entity's schema.

### 5.3 Child New Page

Default decision: child standalone new page should not be the primary create path.

Recommended behavior:

- If parent context is absent, do not show a generic create form by default.
- If a URL carries explicit parent context, e.g. `/channel/new?parentType=work&parentId=...`, the new
  form can be rendered with parent metadata read-only and hidden internal selected parent values.
- Parent-embedded create remains the default path.

This preserves standalone pages without making users choose parent type/id manually.

### 5.4 Child Edit Page

Child edit must not allow parent switching.

The edit form should:

- Render child editable scalar fields normally.
- Exclude parent FK and bridge relation fields from editable inputs.
- Show parent metadata as read-only display-only content.
- Submit only child scalar updates and embedded non-parent child updates.

In particular, `selectedParentType`, `selectedParentId`, `<bridge>_id`, and the resolved parent
relation are create-time or display-only concepts. They are not editable child fields.

## 6. Extension 1: Generic Read-Only Property

### 6.1 Schema Notation Options

Option RO-A: per-field flag.

```yaml
properties:
  status:
    type: integer
    enum: [pending, approved, rejected]
    x-readonly: true
```

Option RO-B: entity-level list.

```yaml
x-readonly-fields:
  - status
  - created_by
```

Option RO-C: support both, with entity-level list normalized into per-field metadata.

Recommendation: adopt RO-C.

### 6.2 Generator Semantics

The generator should compute a read-only field set for each entity:

```text
readonly_fields =
  fields where property.x-readonly == true
  union entity.x-readonly-fields
  union automatic read-only fields from bridge parent rules
```

Read-only fields are not validation-disabled. They still appear in view/detail output and can still
be part of server-returned data. The restriction is on editability from generated UI.

Recommended behavior by page:

- List: display normally.
- Detail/view: display normally.
- New: omit unless the field has a safe default or is display-only context.
- Edit: render as disabled/read-only or display-only depending on field type.
- Server update action: ignore incoming values for read-only fields, or reject changes with a clear
  validation error. For safety, reject when submitted value differs from persisted value.

### 6.3 UI Semantics

For MUI inputs:

- Text fields: prefer `InputProps={{ readOnly: true }}` when copying text is useful.
- Select/autocomplete/date inputs: prefer `disabled` because read-only support is inconsistent.
- Hidden/system fields: render display-only metadata instead of disabled raw ids.

Use a helper-level abstraction, for example:

```text
Form field metadata:
  editable: false
  readonlyReason: "schema" | "bridge-parent" | "system"
```

This keeps bridge-specific behavior out of low-level MUI components.

### 6.4 Generic Scope

This feature must be available to all entities, not only bridge children. Examples:

- Audit fields.
- Workflow status controlled by actions.
- Derived counters.
- Externally synchronized ids.

## 7. Extension 2: Parent Always Read-Only

Parent context on a bridge child is automatically read-only, even when schema does not specify
`x-readonly`.

### 7.1 Rule

For an entity with `x-bridge`:

- Its bridge FK (`<bridge>_id`) is internal.
- Its parent type is derived from the bridge's non-null back-relation.
- Its parent id is derived from the concrete parent row.
- Its parent label is derived from the configured label strategy.
- None of these are editable after child creation.

### 7.2 Relation To Extension 1

Extension 1 is explicit schema-level read-only. Extension 2 is automatic read-only.

Implementation should merge both into the same form metadata so templates can treat them uniformly:

```text
readonly_fields = explicit_readonly_fields + automatic_bridge_parent_fields
```

The important distinction is that parent fields should not need schema annotations. A child-side
parent is always an out-only relation.

### 7.3 Why Parent Switching Is Excluded

Allowing parent switch from child edit would create several risks:

- Permission ambiguity: edit permission on child does not imply permission to attach it to another
  parent.
- Audit ambiguity: parent movement is a relationship operation, not a scalar child edit.
- Data integrity risk: `parentCardinality: exactlyOne` means changing parent requires detaching from
  one bridge owner and attaching to another in a transaction.
- UX risk: users editing a channel name should not accidentally move it from a work to a character.

If parent reassignment is ever required, it should be a separate explicit action with its own
permission and audit design.

## 8. Extension 3: Parent Item Label Specification

### 8.1 Problem

Bridge children can attach to different parent entities, and those parent entities use different
display fields:

- `work`: `title`
- `character`: `name`
- `scene`: `label`
- `music`: `title`
- `channel`: `name`

A single global `parent_label_field` cannot represent this. The schema needs a way to express label
selection per parent type.

### 8.2 Option A: Per-Parent `labelField` In `x-bridge.parents`

Example:

```yaml
channel:
  x-bridge:
    name: channelable
    child: channel
    parentCardinality: exactlyOne
    parents:
      - role: work_hub
        target: work
        labelField: title
      - role: character_hub
        target: character
        labelField: name
      - role: scene_hub
        target: scene
        labelField: label
```

Pros:

- Already matches current `channel` and `fc_link` schema shape.
- Local to the bridge declaration, where parent targets are already listed.
- Handles each parent type independently.
- Easy to validate: target exists, label field exists on target or is a supported label path.
- Low implementation risk because `helpers/bridge_direction.py` already parses `labelField`.

Cons:

- Repeats labels if many bridges target the same parent.
- Requires bridge authors to remember label config for every parent.
- Does not solve complex formatting by itself.

Implementation difficulty: low to medium.

### 8.3 Option B: Reuse Existing Primary Field

Use each parent entity's existing primary display field from `x-display.table` where `primary: true`.

Pros:

- Minimizes bridge-specific schema.
- Aligns parent label with the parent entity's own list identity.
- Good default when schema is well curated.

Cons:

- Existing primary field may be optimized for parent list pages, not bridge labels.
- Some entities may not have an explicit primary field.
- It hides an important bridge behavior behind another feature.
- Changing the parent list primary would silently change bridge labels.

Implementation difficulty: low.

### 8.4 Option C: Template Expression

Allow a string template:

```yaml
labelTemplate: "${title} (${kind})"
```

Pros:

- Most expressive.
- Can handle compound labels without extra code per entity.
- Useful for ambiguous parent rows.

Cons:

- Requires expression parsing, validation, escaping, and nested include derivation.
- Higher risk of runtime null/undefined bugs.
- Harder to translate/i18n.
- Overkill for current `work` / `character` / `scene` / `music` / `channel` labels.

Implementation difficulty: high.

### 8.5 Option D: Label Resolver Hook

Allow a custom resolver module per bridge or parent type.

Pros:

- Maximum flexibility for computed or external labels.
- Keeps core schema simple for complex domains.

Cons:

- Adds custom code surface area.
- Harder to test generated behavior.
- Not needed for the current problem.

Implementation difficulty: high.

### 8.6 Recommended Label Strategy

Recommend Option A with Option B as fallback:

1. Primary source: `x-bridge.parents[].labelField`.
2. Fallback: target entity's `x-display.table` primary field.
3. Final fallback: `name`, then `title`, then `label`, then `id`.
4. Defer template expressions until a real compound-label requirement appears.

Rationale:

- Option A is already present in the current schema for `channel` and `fc_link`.
- It directly solves the parent-specific field problem.
- It gives deterministic query/include requirements.
- It avoids the cost and risk of a template engine before one is needed.

This decision requires approval because it defines the public schema contract for parent labels and
decides whether bridge labels should be explicit per bridge or inherited from parent entity display
metadata.

## 9. Implementation Shape For Later Cmd

This section is non-implementation guidance for a future command.

### 9.1 Bridge Parent Metadata

Add derived context for bridge child entities:

```text
bridge_parent_options:
  - target: work
    role: work_hub
    label_field: title
    relation_name_on_bridge: work
  - target: character
    role: character_hub
    label_field: name
    relation_name_on_bridge: character
```

Use it to generate:

- list/detail includes;
- parent display mapping;
- parent read-only metadata in forms;
- parent-embedded create defaults.

### 9.2 Query Strategy

For child list/detail:

```typescript
include: {
  channelable: {
    include: {
      work: { select: { id: true, title: true } },
      character: { select: { id: true, name: true } },
      scene: { select: { id: true, label: true } },
    }
  }
}
```

Then map:

```text
if channelable.work exists:
  parent_type = "work"
  parent_id = channelable.work.id
  parent_label = channelable.work.title
else if channelable.character exists:
  ...
```

For `parentCardinality: exactlyOne`, mapping should detect:

- zero parents: orphan/corrupt bridge row;
- more than one parent: corrupt bridge row.

The UI can display an error marker rather than crashing.

### 9.3 Parent-Embedded DataGrid

Parent pages already include bridge FK records. A later implementation should use the parent-owned
bridge id to list child rows:

```text
parent.channelable_id -> channel.where({ channelable_id: parent.channelable_id })
```

This avoids polymorphic search during parent-side CRUD because the parent context is concrete.

## 10. Permissions And Safety

Parent-side embedded operations should require permissions on both sides:

- Parent visibility/read permission to show the embedded section.
- Child create/update/delete permission for row operations.
- If permission semantics conflict, fail closed and hide the operation.

Child standalone pages should not grant parent reassignment. A separate future "move parent" action
would need:

- explicit permission;
- transactional detach/attach;
- audit trail;
- clear UI confirmation.

## 11. Decision Matrix

| Topic | Option | Score | Recommendation |
|---|---|---:|---|
| Parent-side default | Embedded DataGrid | 5/5 | Adopt |
| Parent-side default | Standalone child CRUD as primary | 2/5 | Reject as default |
| Child create | Parent-context only | 5/5 | Adopt |
| Child create | Manual parent type/id picker | 2/5 | Avoid by default |
| Child edit | Parent display-only | 5/5 | Adopt |
| Child edit | Parent switchable | 1/5 | Reject for now |
| Read-only schema | Field flag only | 3/5 | Support, but not alone |
| Read-only schema | Entity list only | 3/5 | Support, but not alone |
| Read-only schema | Both normalized | 5/5 | Adopt |
| Parent label | Per-parent labelField | 5/5 | Adopt |
| Parent label | Primary field fallback | 4/5 | Use as fallback |
| Parent label | Template expression | 2/5 | Defer |
| Parent label | Custom resolver hook | 2/5 | Defer |

## 12. Approval Points

### AP-1: Parent Label Absorption Strategy

Decision needed: how to absorb different label properties per parent entity.

Options:

- A: `x-bridge.parents[].labelField` per parent.
- B: target entity primary field from `x-display.table`.
- C: template expression such as `"${title} (${type})"`.
- D: custom resolver hook.

Recommendation: A as primary, B as fallback. Defer C/D.

Reason approval is needed: this becomes a schema contract and affects generated query includes,
list columns, detail metadata, and tests.

### AP-2: Standalone Child New Page Behavior

Decision needed: whether `/channel/new` without parent context should exist.

Options:

- A: Disable generic child new page and allow create only from parent context.
- B: Keep generic child new page but require parent context query parameters.
- C: Keep manual parent type/id picker.

Recommendation: B if standalone URL compatibility is desired; otherwise A. Reject C as default.

Reason approval is needed: this affects navigation and whether generated pages expose parent
selection UI.

### AP-3: Read-Only Submission Semantics

Decision needed: when an edit request submits a read-only field, should the server ignore it or
reject it?

Options:

- A: Ignore read-only fields.
- B: Reject if submitted value differs from persisted value.

Recommendation: B for clearer safety and testability.

Reason approval is needed: this affects API behavior and tests, not just UI rendering.

## 13. Acceptance Criteria Coverage

- Parent-side default interface: covered in sections 3 and 4.
- Existing comment / attachment / approval pattern: covered in section 3.
- Custom bridge default DataGrid and standalone list availability: covered in sections 4 and 5.
- Child list/detail parent display: covered in sections 5 and 9.
- Child edit excludes parent switching: covered in sections 5.4 and 7.
- Generic read-only property: covered in section 6.
- Parent always read-only: covered in section 7.
- Parent label specification and alternatives: covered in section 8.
- Approval points: covered in section 12.
- Existing design consistency: covered in sections 2 and 3, with caveat that the two named docs were
  not present at the requested paths.

## 14. Final Recommendation

Adopt this design with three core decisions:

1. Parent side owns bridge child CRUD through embedded DataGrid.
2. Child standalone pages are list/detail-first; edit is child-scalar-only and parent display-only.
3. Parent labels use per-parent `x-bridge.parents[].labelField`, falling back to the target entity's
   primary display field.

The only mandatory approval before implementation is AP-1. AP-2 and AP-3 should also be decided
before generator work begins to avoid implementing temporary UI semantics.
