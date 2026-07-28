# Design: Split Approval/Rejection & Rejection Classification

**cmd_305 FIX-B (#2) + FIX-C (#3) — Integrated Design (rev.2, post-確定方針)**

> Revised 2026-07-11 to reflect approved design rulings.
> Key changes from rev.1: (1) allow_choice / temporary-rejection / resubmit-to-Pending path
> entirely removed from FIX-C scope. (2) reason_kind is integer enum on approval_history.
> (3) FIX-B reservation logic unified: inventory_id optional; auto-allocate when absent.

---

## Background

### FIX-B: Split children never trigger inventory movements on approval

When a `purchase_per_item` is split, `generate.py:623-624` excludes
`inventory_transactionable_id` from `_always_exclude`. The split route template
(`templates/split_action_route.ts.jinja2`) creates child records without a bridge and
without reservation rows. Because `service_after_approve.ts:38` and
`service_after_reject.ts:40` both guard on `if (!item?.inventory_transactionable_id) return`,
split children are silently no-ops on approval/rejection. In addition, the parent's
`reserved_quantity` is never released when the parent transitions to `status=SPLIT`,
so reserved inventory balloons.

### FIX-C: UI rejection diverges from REST route rejection

The REST route (`app/api/approval_request/[id]/reject/route.ts`) correctly:
- determines terminal vs non-terminal via `isTerminalReject(entity_name)` (L27)
- sets status 3 (terminal) or 2 (non-terminal) accordingly (L28)
- calls `dispatchOnRejected` to fire `afterReject` side effects (L70/75)
- records `rejection_reason` on the approvable (L55-59)

The server action (`lib/approval_request/actions.ts:126-156`) used by `ApprovalSection.tsx`:
- always sets status 2 regardless of entity type
- never calls `dispatchOnRejected`
- never records `rejection_reason`

For `purchase_per_item` (terminal entity), UI rejection therefore:
- leaves reserved inventory permanently unreleased
- does not fire `PurchasePerItemAfterReject`
- lets the item be re-submitted (status 2 allows resubmit; status 3 would block it)

### Intersection

FIX-C server-action fix is the prerequisite for FIX-B's benefit to manifest in the
UI flow. Even after FIX-B gives split children bridges, UI rejections still bypass
`dispatchOnRejected` until FIX-C lands. FIX-C must pass its gate before the FIX-B
integration E2E is run.

### Design direction (terminal-only rejection for reservation/receiving)

Reservation and receiving rejections are **always terminal** (status 3). The concept of
"temporary rejection with resubmit" applies only to `leave_request` and is not extended
to reservation/receiving entities. When an operator needs to re-assign quantity to a
different inventory lot or entity, they use **split** instead. Transfer to a different
entity type is a future deliverable (outside cmd_305 scope — see §Future Work).

---

## FIX-C: Rejection Correctness and Classification

### C-1: `reason_kind` — integer enum on `approval_history`

**Column location: `approval_history.reason_kind Int?`** (per-event audit trail, not
overwritten on re-rejection, aligns with existing per-event history pattern).

**Integer enum convention** (matching codebase pattern: `type: integer` + `enum` labels,
Prisma `Int` column):

| Value | Label | Meaning |
|-------|-------|---------|
| 0 | Customer | Customer-side or contractual reason |
| 1 | Internal | Internal/operational reason |
| null | — | Not specified |

**Schema change (`prj/prisma/schema.prisma`):**

```prisma
model approval_history {
  // ... existing fields ...
  reason_kind  Int?   // 0=Customer 1=Internal
}
```

Migration: `ADD COLUMN "reason_kind" INT4` (nullable, no data migration).

**JSON schema note**: `reason_kind` is not a first-class entity field; it lives in
`approval_history` which is framework-managed. No `json_schema.yaml` change needed for
the column itself. The integer enum definition lives in the Prisma schema only.

### C-2: Server action divergence fix

**File: `app-generator/lib/approval_request/actions.ts`** (hand-written, git-tracked)

Change `rejectApprovalRequest` to mirror the REST route exactly:

```typescript
export async function rejectApprovalRequest(
  id: string,
  message?: string,
  options?: { reason?: string; reasonKind?: number }
): Promise<void>
```

Steps inside (matching `app/api/approval_request/[id]/reject/route.ts` L27-79):
1. Fetch `approval_flow.entity_name` from `approval_request`.
2. `terminal = isTerminalReject(entity_name)` — static entity rule, no UI override.
3. `newStatus = terminal ? 3 : 2`.
4. Within `$transaction` (isolationLevel: Serializable):
   - `approval_request.update({ status: newStatus })`
   - `approval_history.create({ ..., reason_kind: options?.reasonKind ?? null })`
   - If `options?.reason`: `approvable.update({ rejection_reason: reason })`
   - Terminal path: idempotency guard via `approved_at != null`, then `approvable.update({ approved_at: new Date() })`, then `dispatchOnRejected(...)`
   - Non-terminal path: `dispatchOnRejected(...)` (always)

`resubmitApprovalRequest` in the same file already blocks `status === 3`; no change needed
(REST resubmit route L21 also blocks it). The divergence on status value (2 vs 3) is the
critical bug: once server action sets status 3 correctly, resubmit is naturally blocked.

### C-3: REST route `reason_kind` parity

**File: `app/api/approval_request/[id]/reject/route.ts`** (hand-written, git-tracked)

Add `reason_kind` parsing and pass to `approval_history.create`:

```typescript
// After existing body parsing (L30-32 area):
const reasonKind: number | undefined =
  (typeof body?.reason_kind === 'number') ? body.reason_kind : undefined;

// In approval_history.create data:
reason_kind: reasonKind ?? null
```

### C-4: `ApprovalSection.tsx` UI changes

**File: `components/_standard/ApprovalSection.tsx`** (hand-written, git-tracked)

Changes:
1. **`STATUS_LABELS`** (L30): extend to cover status 3 — add `'TerminalRejected'` at index 3.
2. **`canResubmit`** (L135): already guards `ar.status === 2`; status 3 items are correctly
   excluded. No logic change needed.
3. **Reject dialog**: add `reason_kind` selector (integer values 0/1, display labels
   "Customer" / "Internal" / "(unspecified)") and free-text `rejection_reason` field.
   Pass `{ reasonKind: selectedKind, reason: reasonText }` to `rejectApprovalRequest`.

No `allowTerminalChoice` prop, no terminal/temporary radio — single "Reject" flow only.

Updated `confirmAction` signature:
```typescript
const confirmAction = () => {
  if (!dialog) return;
  const { arId, action } = dialog;
  const msg = message.trim() || undefined;
  const reasonText = rejectionReason.trim() || undefined;
  const reasonKind = selectedReasonKind; // number | undefined
  closeDialog();
  startTransition(() => {
    if (action === 'approve') approveApprovalRequest(arId, msg);
    else if (action === 'reject')
      rejectApprovalRequest(arId, msg, { reason: reasonText, reasonKind });
    else resubmitApprovalRequest(arId, msg);
  });
};
```

New state: `const [rejectionReason, setRejectionReason] = useState('')` and
`const [selectedReasonKind, setSelectedReasonKind] = useState<number | undefined>(undefined)`.

---

## FIX-B: Split Child Bridge Allocation

### Confirmed decisions (確定方針)

- 案B: each split child gets a new `inventory_transactionable` bridge; parent
  reservations are released; each child gets its own reservation.
- `inventory_id` (optional) added to `purchase_per_item`; included in
  `x-splittable.perPartRequired` for per-part lot selection.
- Reservation logic unified: if `inventory_id` specified → reserve from that lot;
  if absent → auto-allocate using same greedy algorithm as initial PO creation.
- Existing hand-written hooks require no changes.

### B-1: Schema addition — `inventory_id` on `purchase_per_item`

**File: `prj/code_generator/json_schema.yaml`** (L1890-1962 area)

```yaml
purchase_per_item:
  x-splittable:
    quantityField: quantity
    parentField: parent_id
    perPartRequired:
      - inventory_id          # NEW — optional per-part lot selection
  properties:
    # ...
    inventory_id:             # NEW
      type: [string, "null"]
      pattern: "^c[a-z0-9]{24,}$"
      x-relationship:
        type: many-to-one
        target: inventory
        labelField: [product.name, location, lot_number]
```

**File: `prj/prisma/schema.prisma`** (purchase_per_item model)

```prisma
model purchase_per_item {
  // ...
  inventory_id  String?
  inventory     inventory?  @relation(fields: [inventory_id], references: [id])
}
```

Migration: `ADD COLUMN "inventory_id" TEXT REFERENCES "inventory"("id")`.

### B-2: `_always_exclude` handling

`generate.py:623-624` keeps `inventory_transactionable_id` in `_always_exclude`. This
is **correct and must not change** — children must not inherit the parent's bridge.
The split template explicitly creates a fresh bridge per child (B-3).

### B-3: Split route template — bridge allocation block

**File: `app-generator/code_generator/templates/split_action_route.ts.jinja2`**
**File: `app-generator/code_generator/generate.py`** (split config builder)

#### Generator change

Add flag `has_inventory_bridge` to split config:
```python
has_inventory_bridge = (
    'inventory_transactionable_id' in entity_properties
    and entity_schema.get('x-approval', {}).get('on_approved', {}).get('emit_hook')
)
```

Also pass `product_id_field` (the field name linking to product for auto-allocate query,
derived from schema: `purchase_per_item.product_id`).

#### Template — per-child bridge allocation (inside `for part of parts` loop)

```typescript
{% if has_inventory_bridge %}
// Bridge allocation per child
const _childInventoryId: string | undefined = (part as Record<string, unknown>).inventory_id as string | undefined;
let _childBridgeId: string;

if (_childInventoryId) {
  // Specified lot: validate availability and reserve exactly that lot
  const _childInv = await tx.inventory.findUnique({
    where: { id: _childInventoryId },
    select: { id: true, quantity: true, reserved_quantity: true,
              product_id: true, location: true, lot_number: true, expiration_date: true },
  });
  if (!_childInv) throw new ApiError(400, `Inventory not found: ${_childInventoryId}`);
  const _childQty = part.{{ quantity_field }} as number;
  const _claimResult = await tx.inventory.updateMany({
    where: { id: _childInventoryId,
             reserved_quantity: { lte: _childInv.quantity - _childQty } },
    data: { reserved_quantity: { increment: _childQty } },
  });
  if (_claimResult.count === 0)
    throw new ApiError(409, 'Concurrent reservation conflict; please retry');
  const _childBridge = await tx.inventory_transactionable.create({ data: {} });
  _childBridgeId = _childBridge.id;
  await tx.inventory_transaction.create({
    data: {
      inventory_transactionable_id: _childBridgeId,
      event_type: 'reserve',
      quantity_delta: 0,
      reserved_delta: _childQty,
      product_id: _childInv.product_id,
      location: _childInv.location ?? '',
      lot_number: _childInv.lot_number,
      expiration_date: _childInv.expiration_date,
      creator_id: userId, updater_id: userId, created_by_id: userId,
    },
  });
} else {
  // Auto-allocate: greedy scan by expiration_date asc, lot_number asc (same as PO creation)
  const _childQty = part.{{ quantity_field }} as number;
  const _parentForProduct = parent as Record<string, unknown>;
  const _candidates = await tx.inventory.findMany({
    where: { product_id: _parentForProduct.{{ product_id_field }} as string, quantity: { gt: 0 } },
    orderBy: [{ expiration_date: { sort: 'asc', nulls: 'last' } }, { lot_number: 'asc' }, { id: 'asc' }],
  });
  const _childBridge = await tx.inventory_transactionable.create({ data: {} });
  _childBridgeId = _childBridge.id;
  let _remaining = _childQty;
  for (const _cand of _candidates) {
    if (_remaining <= 0) break;
    const _avail = _cand.quantity - _cand.reserved_quantity;
    if (_avail <= 0) continue;
    const _claim = Math.min(_remaining, _avail);
    const _claimResult = await tx.inventory.updateMany({
      where: { id: _cand.id, reserved_quantity: { lte: _cand.quantity - _claim } },
      data: { reserved_quantity: { increment: _claim } },
    });
    if (_claimResult.count > 0) {
      _remaining -= _claim;
      await tx.inventory_transaction.create({
        data: {
          inventory_transactionable_id: _childBridgeId,
          event_type: 'reserve',
          quantity_delta: 0,
          reserved_delta: _claim,
          product_id: _cand.product_id,
          location: _cand.location ?? '',
          lot_number: _cand.lot_number,
          expiration_date: _cand.expiration_date,
          creator_id: userId, updater_id: userId, created_by_id: userId,
        },
      });
    }
  }
  if (_remaining > 0)
    throw new ApiError(400, `Insufficient inventory for split part (shortfall: ${_remaining})`);
}
{% endif %}
```

Then in the `entity.create` data block:
```typescript
{% if has_inventory_bridge %}
inventory_transactionable_id: _childBridgeId,
{% endif %}
```

### B-4: Parent reservation release

**In the split template**, after the `for (const part of parts)` loop:

```typescript
{% if has_inventory_bridge %}
// Release parent's reserved inventory (cancel all reserve rows on parent bridge)
if ((parent as Record<string, unknown>).inventory_transactionable_id) {
  const _parentBridgeId = (parent as Record<string, unknown>)
    .inventory_transactionable_id as string;
  const _parentReserveRows = await tx.inventory_transaction.findMany({
    where: { inventory_transactionable_id: _parentBridgeId, event_type: 'reserve' },
  });
  for (const _row of _parentReserveRows) {
    await tx.inventory.updateMany({
      where: {
        product_id: _row.product_id,
        // O-6 denormalization: inventory_transaction.location stores '' for null-location
        // lots (written as `?? ''` at PO creation). inventory.location is NULL in the DB.
        // Must undo the normalization — same pattern as service_after_reject.ts:105.
        location: _row.location === '' ? null : _row.location,
        ...(_row.lot_number != null ? { lot_number: _row.lot_number } : {}),
        ...(_row.expiration_date != null ? { expiration_date: _row.expiration_date } : {}),
      },
      data: { reserved_quantity: { decrement: _row.reserved_delta } },
    });
    await tx.inventory_transaction.create({
      data: {
        inventory_transactionable_id: _parentBridgeId,
        event_type: 'cancel',
        quantity_delta: 0,
        reserved_delta: -_row.reserved_delta,
        product_id: _row.product_id,
        location: _row.location ?? '',  // ledger stores '' (not null) — unchanged
        lot_number: _row.lot_number,
        expiration_date: _row.expiration_date,
        creator_id: userId, updater_id: userId, created_by_id: userId,
      },
    });
  }
}
{% endif %}
```

Parent release runs **after** all children are created and reserved, so partial failure
rolls back the entire transaction cleanly.

### B-5: `perPartRequired` template wiring

When `inventory_id` is added to `x-splittable.perPartRequired`, the generated split form
receives it as an optional autocomplete field. The template already handles `per_part_required`
fields; no additional template changes are needed for the form UI.

### B-6: Hand-written hook continuation

**Recommendation: keep hand-written hooks, no changes.**

`service_after_approve.ts` and `service_after_reject.ts` implement purchase_per_item-specific
reserve→ship / cancel semantics (O-4/O-6/O-8). Once split children have valid bridges (B-3),
the guard at L38/L40 passes and both hooks work unchanged. Generator-driven approach
(`x-ledger-source` extension) is deferred as future work.

---

## Cross-cutting Points

### (i) Implementation order

FIX-C server action fix (subtask_305c) is the **prerequisite** for FIX-B to function
end-to-end on the UI path. FIX-C and FIX-B schema changes (subtask_305d) have no shared
files and can start in parallel. The FIX-B split template (subtask_305e) depends only on
the schema migration being applied.

### (ii) Bridge lifecycle and `dispatchOnRejected` interface

Split route manages bridge lifecycle (create per child, release parent).
`dispatchOnRejected` routes by entity_name to `afterReject`, which reads the bridge via
`entity.inventory_transactionable_id`. No changes to `on_rejected_dispatch.ts` or its
template. Separation is clean.

### (iii) Rejection finality for split children

Split children are `purchase_per_item` → terminal by static entity rule. UI rejection
after FIX-C fires `afterReject`, which cancels the child's bridge reservations
(decrement `reserved_quantity`). Status becomes 3; resubmit is blocked. This is the
correct and intended behavior. No `allow_choice` is added to `purchase_per_item`.

`leave_request` retains its non-terminal/resubmit behavior unchanged.

---

## Future Work (outside cmd_305 scope)

Transfer of purchase quantity to a different entity (e.g. a new entity representing
a replacement purchase or rerouting) is the intended long-term substitute for
"temporary rejection". This is deferred to a follow-up cmd and is not designed here.
cmd_305 delivers split with per-part inventory selection (FIX-B) as the immediate
operational tool.

---

## Decisions — All Confirmed (確定方針 2026-07-11)

| ID | Decision | Ruling |
|----|----------|--------|
| DP-C1 | `reason_kind` location | **approval_history.reason_kind Int?** — per-event audit trail. Integer enum: 0=Customer, 1=Internal. |
| DP-C2 | Reject dialog UI | **Single "Reject" dialog** — reason_kind selector + free text only. No terminal/temporary radio. |
| DP-B1 | Reservation on split | **Unified logic** — inventory_id specified → reserve that lot; absent → auto-allocate (greedy, same as PO creation). |
| DP-B1a | Quantity shortfall | **Hard error** — Σ(child.quantity) < available inventory → tx abort with ApiError(400). |
| DP-B2 | allow_choice for purchase_per_item | **Not added** — terminal-only; allow_choice concept removed from FIX-C entirely. |

---

## Implementation Order and Subtask Split

RACE-001 analysis: no two subtasks below share a write target.

### subtask_305c — FIX-C: server action fix + UI (no blockers)

Files:
- `app-generator/lib/approval_request/actions.ts`: add entity_name fetch, isTerminalReject,
  newStatus 3/2, dispatchOnRejected, rejection_reason + reasonKind params
- `app/api/approval_request/[id]/reject/route.ts`: add reason_kind to approval_history.create
- `components/_standard/ApprovalSection.tsx`: extend STATUS_LABELS to index 3;
  add reason_kind selector (0/1/null) + rejection_reason field to reject dialog

Blocked-on: none. Gate: `test:e2e:cy:api` passing (single-agent, uncontested test DB).

### subtask_305d — Schema migrations: FIX-B + FIX-C combined (no blockers)

Files:
- `prj/code_generator/json_schema.yaml`: add `inventory_id` to purchase_per_item properties
  and `x-splittable.perPartRequired`
- `prj/prisma/schema.prisma`: add `inventory_id FK` on purchase_per_item;
  add `reason_kind Int?` on approval_history
- `prj/prisma/migrations/<timestamp>_fix_b_c_schema/migration.sql` (new)

Both schema changes in one migration to avoid sequential dependency.
Blocked-on: none. Parallel with 305c.

### subtask_305e — FIX-B: split template + generator (depends on 305d)

Files:
- `app-generator/code_generator/templates/split_action_route.ts.jinja2`: bridge allocation
  block (B-3), parent release block (B-4)
- `app-generator/code_generator/generate.py`: add `has_inventory_bridge` flag and
  `product_id_field` to split config builder

Blocked-on: subtask_305d (inventory_id must exist in schema; migration must be applied
before E2E can run against DB).
Gate: `test:e2e:cy:api` — split→approve and split→reject flows must pass.

### Dependency graph

```
305c (FIX-C server action + UI)  ──┐
305d (schema migrations)         ──┴──► 305e (FIX-B split template)
```

Integration E2E (UI reject → dispatchOnRejected → afterReject → reserved_quantity released)
runs after both 305c and 305e are complete.

---

## Summary of File-level Change Map

| File | Edit type | Subtask |
|------|-----------|---------|
| `app-generator/lib/approval_request/actions.ts` | hand-written, direct edit | 305c |
| `app/api/approval_request/[id]/reject/route.ts` | hand-written, direct edit | 305c |
| `components/_standard/ApprovalSection.tsx` | hand-written, direct edit | 305c |
| `prj/code_generator/json_schema.yaml` | SoT schema edit | 305d |
| `prj/prisma/schema.prisma` | SoT schema edit | 305d |
| `prj/prisma/migrations/<new>/migration.sql` | new migration | 305d |
| `app-generator/code_generator/templates/split_action_route.ts.jinja2` | template edit | 305e |
| `app-generator/code_generator/generate.py` | generator edit | 305e |
| `app-generator/lib/approval_request/on_rejected_dispatch.ts` | NO CHANGE | — |
| `app-generator/lib/purchase_per_item/service_after_approve.ts` | NO CHANGE | — |
| `app-generator/lib/purchase_per_item/service_after_reject.ts` | NO CHANGE | — |
