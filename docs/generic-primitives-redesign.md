# 汎用プリミティブ再設計書: Approval Flow + Event Trigger + Split + Ledger

> **種別**: 設計書（コード変更・実装なし）
> **Target**: app-template (this repository) and app-generator (submodule)
> **初版**: 2026-07-05 | cmd_278 / design_278a
> **改訂**: 2026-07-05 | cmd_278 / design_278b — 確定方針R1〜R8を反映
> **改訂**: 2026-07-06 | cmd_279 / design_279a — 承認O-1〜O-7を反映(確定版)
> **前提**: cmd_277 / design_277a — DP-4(認証再設計)は再検討(R5)、DP-1/DP-2/DP-3を本設計で上書き
> **方針**: app-generator は domain 非依存の汎用 CRUD ツール。
>           domain 固有ロジックを汎用プリミティブ(approval flow / event trigger / split / ledger)で実現する。

---

## パート A: 6 問のコード実証回答

### A-1. x-receiving の現在の特別扱い

**調査対象**: `app-generator/code_generator/generate.py:585`

```
generate.py:585  # --- x-receiving: confirm action route + inventory selection UI ---
generate.py:586  _x_receiving = schema.get('x-receiving') or {}
generate.py:587  _xr_policy   = _x_receiving.get('policy') or {}
generate.py:588  if _xr_policy.get('inventoryMutation') == 'confirm_receipt':
generate.py:589      _xr_roles      = _x_receiving.get('roles') or {}
generate.py:590      _receipt_entity = _xr_roles.get('receipt', 'receiving_receipt')
generate.py:591      _xr_inv         = _x_receiving.get('inventory') or {}
generate.py:592      _inv_entity     = _xr_inv.get('entity', 'inventory')
generate.py:593      _inv_qty_field  = _xr_inv.get('quantityField', 'quantity')
generate.py:594-600  (status enum から 'confirmed' の整数値を取得)
generate.py:608-610  → app/api/{receipt_entity}/[id]/actions/confirm/route.ts を生成
generate.py:612-614  → components/{receipt_entity}/ReceivingConfirmForm.tsx を生成
```

**実態の要約**:
- guard: `policy.inventoryMutation == 'confirm_receipt'` の場合のみ発火
- per-entity ループの外側(line 585)で実行される — 特定 entity に依存しない一括処理
- 生成物は 2 ファイルのみ: confirm action route + ReceivingConfirmForm コンポーネント
- inventory 選択 UI は ReceivingConfirmForm.tsx テンプレート内に組み込まれている(独立 route なし)
- confirm route は認証チェックなし(cmd_276b で発見した security bug)

---

### A-2. cancel 3分割(Done/Cancelled/Not-yet)と split 機能の関係

**調査対象**: `app-generator/code_generator/generators.py:1086`

```
generators.py:1086  elif act_type == 'cancel':
generators.py:1094      where: { {parent_field}: orderId, {stat_field}: { in: [open_statuses] } },
generators.py:1101      const releaseQty = alloc.remaining_quantity;  // ← 全量
generators.py:1109      data: { {pool_qty_field}: { increment: releaseQty }, ... }
generators.py:1115      data: { {rem_field}: 0, {stat_field}: {done_status_ts} }
```

**実態の要約**:
- 現在の cancel は **全量一括キャンセル** (remaining_quantity を全額解放)
- 「Done/Cancelled/Not-yet の3分割」は **現在未実装**
- **split 機能との関係**: 1 inventory_allocation を 3 sub-items に分割すれば同じ効果を汎用的に実現できる:
  - Sub-item A (Done): quantity=出荷済量, status=shipped — cancel不可
  - Sub-item B (Cancelled): quantity=今回キャンセル量, status=cancelled
  - Sub-item C (Not-yet): quantity=残量, status=reserved — 引き続き有効

→ **split 機能で 3分割方式を完全に代替できる**。

---

### A-3. reserveRoomReservation の未呼出し実証

**調査対象**: `app-generator/lib/room_reservation/service.ts:101`

```
# grep実行結果 (ソースファイルのみ, .next/ 除外):
$ grep -rn "reserveRoomReservation" app-generator/ --include="*.ts" --include="*.tsx" | grep -v ".next/"
app-generator/lib/room_reservation/service.ts:101:export const reserveRoomReservation = async (
```

**実証**: 呼出し元ゼロ。x-reservation.mode=item の validation 関数が dead code。

---

### A-4. FieldsDataGrid の独立ページ子対応の現状

**調査対象**: `app-generator/components/_standard/FieldsDataGrid.tsx:34`

**現状の要約**:
- FieldsDataGrid は親 Entity の new/edit page 内にインライン埋め込みで使われる DataGrid
- 「独立ページへのナビゲーション」機能は現在存在しない
- line 単位承認ページを実現するには: approve ボタン列 + column_def.tsx 拡張が必要

---

### A-5. remaining_quantity の実体と退役可能性

**調査対象**: `prj/code_generator/json_schema.yaml:1790`, `generators.py:1012-1013`

**実体**: inventory_allocation の「未出荷残量カウンタ」。ship/release 時に消耗される。

**split + R1(ledger統合)導入後**: inventory_transaction でのSUM計算に置き換え可能。
段階的退役を推奨(split導入フェーズでは維持、退役は別フェーズ)。

---

### A-6. inventory.quantity / reserved_quantity の排他的意味論 【O-4反映・確定】

**調査対象**: `generators.py:1014-1023` (ship ロジック)

**確認(2026-07-06, O-4)**: quantity は予約分を含む。経路別意味論は以下の通り確定:

| 経路 | quantity_delta | reserved_delta | 説明 |
|---|---|---|---|
| 予約(reserve) | **0** | **+qty** | 物理在庫は動かず、予約枠のみ増やす |
| 出荷(ship) | **-qty** | **-qty** | 物理的に倉庫を出る → 双方 decrement |
| 受入(receive) | **+qty** | **0** | 物理在庫増加、予約枠は変化なし |
| 解放(release) | **0** | **-qty** | 予約枠を解放、物理在庫は動かず |
| 取消(cancel) | **0** | **-qty** | 予約枠を解放(release と同 delta) |

**二系統 delta (O-4確定)**:
- `quantity_delta`: 物理在庫の変動分
- `reserved_delta`: 予約枠の変動分

**materialized cache (R1+O-4確定)**:
- `inventory.quantity = SUM(quantity_delta)` (全 transaction の集計)
- `inventory.reserved_quantity = SUM(reserved_delta)` (全 transaction の集計)

CHECK制約(quantity >= reserved)は conditional_update で代替。Prisma 非対応のため汎用 generator では追加しない。

---

## パート B: 汎用プリミティブ設計 (確定方針R1〜R8反映済み)

---

### B-1. x-reservation の存置と将来廃止方針 【R8反映】

> **確定方針R8**: x-reservation のスコープを可能な限り縮小し、x-approval 等の汎用機能で代替できる範囲を広げる。両方が定義された場合は警告を出した上で x-approval を優先する。将来的に x-reservation 自体を廃止する方向性を明記する。

**現行の状態**: x-reservation (count mode) は entity-agnostic に設計されているが、
ship/release/cancel の直接アクション route を生成するため、approval flow と競合する。

**R8 反映後の方針**:

| 状況 | 挙動 |
|---|---|
| `x-reservation` のみ定義 | 現行通り(ship/release/cancel action route を生成) |
| `x-approval` のみ定義 | 新設計(approval flow を使う) |
| **両方定義** | **警告を出し `x-approval` を優先**。x-reservation の ship/release action route は生成しない |
| 将来 | **x-reservation を廃止**。approval flow + split で全ケースをカバーする |

**x-reservation 廃止ロードマップ**:
1. Phase 1 (今回): 両方定義時は x-approval 優先 + 警告
2. Phase 2: x-reservation をスキーマから deprecation mark
3. Phase 3: x-reservation サポート完全削除

**generator SoT変更箇所**:

| ファイル | 変更内容 |
|---|---|
| `code_generator/generate.py:452` 付近 | x-reservation + x-approval 両方定義時に警告出力し、x-approval を優先する条件分岐追加 |
| `code_generator/generators.py:1196` 付近 | x-approval 存在時は has_actions=False にする（x-reservation action route 非生成） |

---

### B-2. ship/release を approval flow で処理

**設計方針**: `x-approval.on_approved.emit_hook: true` → `service_after_approve.ts` に
ship/release ロジックを実装する既存機構を再利用。

**approval 付与先の選択**:

| 付与先 | 挙動 | 適用シーン |
|---|---|---|
| `inventory_allocation` | 各 allocation row の承認で ship | allocation 単位で個別承認が必要な場合 |
| `purchase_per_item` | 明細行の承認で全 allocation を ship | 明細行(商品種別)単位の承認で十分な場合 |

→ **spec 依存設計**: `x-approval` を置く entity が approval 対象。generator は強制しない。

**generator SoT変更箇所**:
- `lib/{entity}/service_after_approve.ts` (once-stub): ship ロジックを手書き実装
- approval flow の既存機構 (on_approved_dispatch.ts.jinja2) は変更不要

**O-7確定: 既存 approval/rejection API を流用(新規 ship/release endpoint 不要)**:

> ship/release は新規 endpoint を設けず、**既存の approval/rejection API を流用**する。

| 操作 | endpoint | 備考 |
|---|---|---|
| 全量出荷 | `POST /api/{entity}/{id}/actions/approve` | 既存 approve route を流用 |
| 全量解放 | `POST /api/{entity}/{id}/actions/reject` | 既存 reject route を流用(解放ロジックは service_after_reject.ts) |
| **部分出荷/解放** | split → approve の 2ステップ | 専用 endpoint 不要 |

**部分出荷/解放の UX フロー (O-7+R6)**:
1. `POST /api/{entity}/{id}/actions/split` (B-4 x-splittable) で所望数量の sub-item に分割
2. その sub-item を `POST /api/{entity}/{sub_id}/actions/approve` で承認 = 出荷

cmd_277 DP-1 の「ship/release 数量指定 UI」はこの **split→approve UX** に再構成される。

---

### B-3. event trigger を rejection でも発火する拡張 + 在庫関連 terminal reject 【R7反映】

> **確定方針R7**: 在庫関連の rejection は再申請なしの終端却下(terminal reject)として扱う。
> 既存の approval_flow が前提とする「再申請ありき」の reject とは別の扱いにする。
> 必要であれば approval_request に新しい status 値を追加してよい。

**設計**:

```yaml
# json_schema.yaml: x-approval 拡張
x-approval:
  on_approved:
    set_fields:
      status: "approved"
    emit_hook: true
  on_rejected:          # 新規追加
    terminal: true      # R7: 終端却下(再申請不可)
    set_fields:
      status: "rejected"
    emit_hook: true     # service_after_reject.ts を生成
```

**terminal reject の実装設計**:
- `approval_request.status` に `terminal_rejected`(新値)を追加
- terminal_rejected = 再申請不可。通常の rejected は再申請可能
- `x-approval.on_rejected.terminal: true` 時、approve dispatch が `terminal_rejected` を設定
- 在庫関連 entity の reject: `terminal: true` を推奨(inventory_allocation, receiving_receipt_line 等)

**O-5との整合 — approved_at ガード**:
- terminal_rejected 時も `approvable.approved_at = NOW()` を設定する
  (reject dispatch が on_rejected.terminal: true の場合 approved_at を書き込む)
- approved_at の意味論: 「決定確定日時」(通常承認・終端却下どちらでも共通)
- これにより: 誤って approve が再発火しても `approved_at IS NOT NULL` ガードがブロック(B-5-7参照)
- inventory_transaction は service_after_reject.ts では**作成しない**(在庫変動なし / R7)

**generator SoT変更箇所**:

| ファイル | 変更内容 |
|---|---|
| `code_generator/templates/on_rejected_dispatch.ts.jinja2` | **新規**: reject 時の dispatch 関数 (terminal flag 付き) |
| `code_generator/templates/service_after_reject_stub.ts.jinja2` | **新規**: reject hook の once-stub |
| `code_generator/generate.py:671` 付近 | on_rejected 処理を追加(on_approved と対称) |
| `prj/code_generator/json_schema.yaml` | `approval_request.status` enum に `terminal_rejected` 追加 |

---

### B-4. split 機能 (x-splittable) — 新規 【R6反映】

> **確定方針R6**: 子 entity の approval を本体とする設計は OK(採用)。
> approve/reject 後の split は不可。split は承認前のみ許可する。

**キーワード**: `x-splittable: true` を approvable entity のスキーマ定義に付与

**動作設計**:

```yaml
# 例: inventory_allocation に split 機能を付与
inventory_allocation:
  x-splittable: true
  x-approval:
    on_approved: { emit_hook: true }
```

**split API**:
```
POST /api/{entity}/{id}/actions/split
Body: {
  parts: [
    { quantity: 10, label: "shipped" },
    { quantity: 5,  label: "cancelled" },
    { quantity: 3,  label: "remaining" }
  ]
}
```

**split のライフサイクル制約 (R6)**:

```
entity が x-splittable の場合:
  - status が pending/draft/reserved 等の「未承認」状態のみ split 可能
  - status が approved/rejected/terminal_rejected の場合は split を拒否 (400 Bad Request)
  - split 後: 親 entity の status = split(新値)、approval は無効化
  - 子 entity(sub-items)の approval が本体 (R6 追論-1 採用)
```

**split後のデータ構造 (Option A 確定)**:
- 同テーブル内の親子関係 (`parent_id` nullable FK to self) + `is_split_result: boolean`
- split 元は status=split(新値)
- sub-items が独立した quantity+status を持つ

**generator SoT変更箇所**:

| ファイル | 変更内容 |
|---|---|
| `code_generator/generate.py` | `x-splittable` を検出して split API route を生成するロジック追加 |
| `code_generator/templates/split_action_route.ts.jinja2` | **新規**: split action POST handler (ライフサイクル制約チェック付き) |
| `prj/code_generator/json_schema.yaml` | split 対象 entity に `parent_id` self-ref FK + `is_split_result` フィールド追加 |

---

### B-5. inventory transaction entity + inventory materialized cache 【R1+R2+R3 大幅改訂】

> **確定方針R1**: inventory は inventory_transaction の materialized cache である。
> inventory の create/update/delete は全て inventory_transaction 経由で行う。
> inventory_allocation(予約)も inventory_transaction へ統合する。
> inventory テーブルの存在理由は性能上の理由(SUM集計の回避)のみ。
>
> **確定方針R2**: inventory_transaction は approval/rejection を経ずに作成可能(approval は任意)。
>
> **確定方針R3**: inventory_transaction は source_id を直接カラムとして持たない。
> 代わりに bridge pattern (inventory_transactionable) を使う。

#### B-5-1. 全体アーキテクチャ

```
purchase_order ──────┐
                     ├── inventory_transactionable → inventory_transaction ← inventory(cache)
receiving_receipt ───┘
(その他任意の entity)
```

**inventory_transaction** = 在庫台帳の正典(source of truth)
**inventory** = transaction の SUM を事前計算した materialized cache

#### B-5-2. 新しい意味論 【R1+O-3+O-4反映・確定】

| 操作 | 旧設計 | 新設計 (quantity_delta / reserved_delta) |
|---|---|---|
| 予約(reserve) | inventory.reserved_quantity += qty | INSERT (type=reserve, quantity_delta=**0**, reserved_delta=**+qty**) |
| 出荷(ship) | inventory.quantity -= qty, reserved -= qty | INSERT (type=ship, quantity_delta=**-qty**, reserved_delta=**-qty**) |
| 受入(receive) | inventory.quantity += qty | INSERT (type=receive, quantity_delta=**+qty**, reserved_delta=**0**) |
| 解放(release) | inventory.quantity += qty, reserved -= qty | INSERT (type=release, quantity_delta=**0**, reserved_delta=**-qty**) |
| **inventory.quantity** | 実在庫を直接管理 | `SUM(quantity_delta)` (materialized cache) |
| **inventory.reserved_quantity** | 予約量を直接管理 | `SUM(reserved_delta)` (materialized cache) |

**inventory テーブルの役割変更**:
- Before: 権威的な在庫量を保持
- After: `quantity = SUM(quantity_delta)`, `reserved_quantity = SUM(reserved_delta)` の事前計算キャッシュ。性能上の理由のみで存在
- 再構成可能性: inventory_transaction を(product_id, location, lot_number, expiry_date)でグループ化してSUMすれば inventory を完全に再構成できる

**O-3 確定(status廃止)**: inventory_transaction は status を持たない。reserve → ship → release の状態遷移は単一レコードの status 更新ではなく、**複数レコードの積み上げ(multi-record model)**で表現する。状態は accumulated delta の SUM から導出。

#### B-5-3. inventory_transaction スキーマ 【O-1/O-3/O-5/O-6反映・確定】

> **O-1**: `x-readonly` → `x-generate(new/edit/delete/invalidate=false)` に変更。x-readonly は field レベル定義であり entity レベル読取専用の正しい表現は x-generate。
> **O-3**: `status` フィールド廃止。multi-record model に移行。
> **O-5**: `event_id` 廃止(Date.now()生成は非決定的)。冪等性は approved_at ガードで保証。
> **O-6**: `inventory_id` FK 廃止。`inventory_transactionable_id` をソースリンクとして保持。inventory 特定は非正規化フィールド(product_id/location/lot_number/expiry_date)で行う。

```yaml
inventory_transaction:
  type: object
  x-generate:
    new: false
    edit: false
    delete: false
    invalidate: false     # O-1: entity レベル読取専用の正式表現
  required: [id, inventory_transactionable_id, event_type, quantity_delta, reserved_delta, product_id, location]
  properties:
    id:
      type: string
      pattern: "^c[a-z0-9]{24,}$"
    inventory_transactionable_id:
      type: string        # O-2+O-6: bridge逆転。ソースeventへのリンク(inventory_id FK廃止)
      x-relationship:
        type: many-to-one
        target: inventory_transactionable
    event_type:
      type: string
      enum: [reserve, ship, receive, release, cancel]
    quantity_delta:
      type: integer       # O-4: 物理在庫変動(receive=+qty, ship=-qty, reserve=0, release=0)
    reserved_delta:
      type: integer       # O-4: 予約枠変動(reserve=+qty, ship=-qty, release=-qty, receive=0)
    # O-6: 非正規化在庫識別フィールド(inventory item削除可能性を優先、効率とのトレードオフ許容)
    product_id:
      type: string
    location:
      type: string
    lot_number:
      type: [string, "null"]
    expiry_date:
      type: [string, "null"]
      format: date
    approved_via:
      type: [string, "null"]  # approval_request.id (任意, R2)
    created_at:
      type: string
      format: date-time
    created_by_id:
      type: string
      x-relationship:
        type: many-to-one
        target: user
```

**廃止フィールド**: `event_id`(O-5廃止)、`inventory_id`(O-6廃止)、`status`(O-3廃止)

#### B-5-4. inventory_transactionable (bridge) スキーマ 【O-2: 極薄化+逆転確定】

> **O-2**: R3 の bridge(inventory_transaction_id/transactionable_type/transactionable_id を保持)を廃止。
> `commentable`(`{id}`)と同じ**極薄 through-table パターン**に統一。
> business entity と inventory_transaction の**双方が** `inventory_transactionable_id` FK を持つ「逆転参照」構造に変更。

```yaml
inventory_transactionable:
  type: object
  x-internal: true    # bridge through-table (UI 非表示)
  required: [id]
  properties:
    id:
      type: string
      pattern: "^c[a-z0-9]{24,}$"
```

**O-2 逆転の意味 — 既存パターンとの対応**:

| 既存パターン | inventory_transactionable (O-2) |
|---|---|
| `commentable {id}` のみ | `inventory_transactionable {id}` のみ |
| entity が `commentable_id` → commentable | business entity が `inventory_transactionable_id` → inventory_transactionable |
| comment が `commentable_id` → commentable | inventory_transaction が `inventory_transactionable_id` → inventory_transactionable |

**bridge 使用方法 (O-2)**:
1. bridge を先に作成: `inventory_transactionable.create({})`
2. business entity(purchase_order 等)に `inventory_transactionable_id = bridge.id` を設定
3. inventory_transaction に `inventory_transactionable_id = bridge.id` を設定
4. 同一 `inventory_transactionable_id` を持つ entity と transaction が紐付く

- business entity から transaction を検索: `WHERE inventory_transaction.inventory_transactionable_id = entity.inventory_transactionable_id`
- transaction からソース entity を検索: 逆引きで JOIN

**廃止フィールド**: `inventory_transaction_id`、`transactionable_type`、`transactionable_id`(O-2廃止)

#### B-5-5. inventory_allocation の統合 【R1+O-3: status廃止・multi-record確定】

> **O-3確定**: inventory_transaction は status を持たない。
> 予約POでは PO作成時に1レコード、出荷時に別レコードを作る **multi-record model**。
> 状態はレコードの積み上げ(delta SUM)で表現する。

**inventory_allocation は inventory_transaction の一種 (type=reserve)** として再設計:

```
現行: inventory_allocation (専用テーブル、status フィールドあり)
新設: inventory_transaction の複数レコード(status なし)

予約 PO の典型フロー:
  [1] PO 作成時   → INSERT (type=reserve,   quantity_delta=0, reserved_delta=+qty)
  [2] 出荷時      → INSERT (type=ship,       quantity_delta=-qty, reserved_delta=-qty)
  [3a] 解放時     → INSERT (type=release,    quantity_delta=0, reserved_delta=-qty)  [2の代替]
  [3b] 取消時     → INSERT (type=cancel,     quantity_delta=0, reserved_delta=-qty)  [2の代替]

状態の導出(SUM から):
  reserved_delta SUM > 0 かつ ship/cancel/release レコードなし → 予約中
  ship レコードあり → 出荷済
  release/cancel レコードあり → 解放/取消済
```

**移行方針 (段階的)**:
- Phase 1: inventory_allocation を残しつつ、inventory_transaction (multi-record) に同期書き込み
- Phase 2: inventory_allocation を廃止、inventory_transaction のみに移行
- remaining_quantity: Phase 1 では維持、Phase 2 で退役 (reserved_delta SUM で代替)

#### B-5-6. approval なしでの直接 transaction 【R2+O-2+O-4+O-6反映・確定】

```typescript
// R2+O-2+O-4+O-6: bridge逆転 + 二系統delta + inventory_id廃止(denormalized identity)
await prisma.$transaction(async (tx) => {
  // O-2: bridge(ultra-thin)を先に作成
  const bridge = await tx.inventory_transactionable.create({ data: {} });

  // O-2: business entity(purchase_order)に bridge ID を紐付け
  await tx.purchase_order.update({
    where: { id: purchaseOrderId },
    data: { inventory_transactionable_id: bridge.id }
  });

  // O-6: inventory identity を在庫レコードから取得(非正規化保持のため)
  const inventory = await tx.inventory.findUniqueOrThrow({ where: { id: inventoryId } });

  // inventory_transaction(reserve): O-4 = quantity_delta=0, reserved_delta=+qty
  await tx.inventory_transaction.create({
    data: {
      inventory_transactionable_id: bridge.id,  // O-2: bridge への逆参照
      event_type: 'reserve',
      quantity_delta: 0,                  // O-4: reserve は物理在庫を動かさない
      reserved_delta: requestedQty,       // O-4: 予約枠のみ increment
      // O-6: 非正規化 identity(inventory_id FK を持たない)
      product_id: inventory.product_id,
      location: inventory.location,
      lot_number: inventory.lot_number,
      expiry_date: inventory.expiry_date,
    }
  });

  // inventory(cache)を更新: reserve は reserved_quantity のみ変動
  await tx.inventory.update({
    where: { id: inventoryId },
    data: {
      // quantity は変化なし(quantity_delta = 0)
      reserved_quantity: { increment: requestedQty },  // reserved_delta = +qty
    }
  });
});
```

**ship 時のコード例(出荷 = 双方 decrement)**:
```typescript
// type=ship の場合: quantity_delta=-qty, reserved_delta=-qty (O-4)
await tx.inventory_transaction.create({
  data: {
    inventory_transactionable_id: bridge.id,
    event_type: 'ship',
    quantity_delta: -shippedQty,     // O-4: 物理在庫が減る
    reserved_delta: -shippedQty,     // O-4: 予約枠も同時に減る
    product_id: ..., location: ..., lot_number: ..., expiry_date: ...,  // O-6 非正規化
  }
});
await tx.inventory.update({
  where: { id: inventoryId },
  data: {
    quantity: { decrement: shippedQty },
    reserved_quantity: { decrement: shippedQty },
  }
});
```

**approval 経由の場合**: service_after_approve.ts 内で同じ transaction ロジックを実行。
`approved_via: approval_request.id` を設定して audit trail を保持。
O-5 ガード: service_after_approve.ts 先頭で `if (approvable.approved_at != null) return;` を追加(二重作成防止)。

#### B-5-7. 冪等性と順序保証 【O-5: approved_atガード確定・event_id廃止】

> **O-5確定**: `event_id`(Date.now()生成)は非決定的ゆえ廃止。冪等性は `approved_at` IS NOT NULL ガードで保証。
> `approved_at` は terminal reject でも設定し、「決定確定日時」として双方向ガードとして機能させる。

- **冪等性 (O-5確定)**:
  - 通常承認: approve dispatch が approvable.approved_at = NOW() に設定 → service_after_approve.ts が発火
  - `service_after_approve.ts` 先頭ガード: `if (approvable.approved_at != null) return;`
    → 二重 approve や terminal_rejected 後の誤 approve 発火を防ぐ
  - terminal reject: reject dispatch も approvable.approved_at = NOW() に設定
    → 以降の approve 発火でも inventory_transaction の二重作成をブロック
  - `event_id` フィールドは B-5-3 スキーマから廃止(B-5-3参照)

- **順序保証**: created_at(DB default now()) + id(cuid) でソート可能。Serializable isolation でブロック

#### B-5-9. 前方互換確認: 1 order line → 複数 inventory_transaction 【O-8-1確認・cmd_280】

> **殿追加(O-8)**: 予約POで一つの order line が複数 inventory item に跨り予約する場合、
> 複数の inventory_transaction が生まれる。確定設計がこれを塞がぬことを確認。

**結論: 前方互換 OK。確定設計は「1 order line → 複数 inventory_transaction」を自然に許容する。**

**根拠(O-2 + O-6 の組み合わせ)**:

| 根拠 | 説明 |
|---|---|
| **O-2 bridge 逆転** (many-to-one) | inventory_transaction が `inventory_transactionable_id` に `many-to-one` で紐付く。つまり **同一 bridge を複数の inventory_transaction が指せる**。commentable(1 entity → N comments)と同型。 |
| **O-6 非正規化 identity** | 各 inventory_transaction が独自の `product_id/location/lot_number/expiry_date` を保持する。同一 bridge に紐付く複数 transaction が**各々異なる inventory item を参照できる**。 |

**1 order line → 2 inventory item に跨る予約の例**:
```
purchase_order_line.inventory_transactionable_id = bridge_X

inventory_transaction_1:
  inventory_transactionable_id = bridge_X    ← 同じ bridge
  event_type: reserve
  reserved_delta: +40
  location: 'warehouse-A', product_id: 'P001'  ← inventory item A (40個)

inventory_transaction_2:
  inventory_transactionable_id = bridge_X    ← 同じ bridge
  event_type: reserve
  reserved_delta: +20
  location: 'warehouse-B', product_id: 'P001'  ← inventory item B (20個)
```

purchase_order_line 1行で合計60個を2拠点から予約。既存設計を変更せず実現可能。

**塞ぐ箇所**: なし。設計修正不要。

#### B-5-8. generator SoT変更箇所 【O-1〜O-6反映済み】

| ファイル | 変更内容 |
|---|---|
| `prj/code_generator/json_schema.yaml` | `inventory_transaction`(O-1 x-generate/O-3 status廃止/O-4 二系統delta/O-5 event_id廃止/O-6 denormalized fields) + `inventory_transactionable`(O-2 ultra-thin) entities 新規追加 |
| `prj/code_generator/json_schema.yaml` | `inventory_allocation` に Phase 1 移行用 sync ロジック追記コメント |
| `prj/code_generator/json_schema.yaml` | business entities(purchase_order 等)に `inventory_transactionable_id` FK フィールドを追加(O-2 逆転参照) |
| `code_generator/generate.py` | `x-ledger-source` を持つ entity を検出してbridge書き込みコードを service_after_approve.ts に注入 |
| `code_generator/templates/ledger_write_stub.ts.jinja2` | **新規**: bridge作成→business entity紐付け→inventory_transaction INSERT(二系統delta)→inventory cache更新 の once-stub(O-2+O-4+O-6) |

---

### B-6. receiving_receipt への汎用パターン適用 + inventory 事前指定 【R4反映】

> **確定方針R4**: inventory は遅くとも approval 前に指定する。

**方針**: receiving_receipt を x-approval + x-ledger-source + x-splittable の組み合わせで再構成。

**inventory_id 指定のタイミング (R4)**:
- receiving_receipt_line 作成時 (draft 状態) に inventory_id を指定必須
- または split 時に各 sub-item に inventory_id を設定
- approval 前(approve アクション実行前)に inventory_id が null の場合は approval を拒否

```yaml
# json_schema.yaml 案
receiving_receipt_line:
  required: [id, receiving_receipt_id, product_id, receipt_quantity, inventory_id]  # ← R4: required
  x-approval:
    on_approved:
      emit_hook: true    # service_after_approve.ts:
                         #   inventory_transaction INSERT (type=receive)
                         #   inventory_transactionable INSERT (source=receiving_receipt_line)
                         #   inventory.quantity += line.receipt_quantity (cache 更新)
    on_rejected:
      terminal: true     # R7: 終端却下(再申請不可)
      set_fields:
        status: "rejected"
  x-splittable: true    # line を承認前のみ分割可能 (R6)
  properties:
    inventory_id:        # R4: 追加
      type: string
      x-relationship:
        type: many-to-one
        target: inventory
```

**approval 前バリデーション (R4)**:
```typescript
// approval_request 作成時のバリデーション (手書き service_validation.ts または API route)
if (line.inventory_id === null) {
  throw new Error('inventory_id must be set before approval');
}
```

**承認フロー (改訂)**:
1. receiving_receipt 作成 → lines を draft 状態で作成 (inventory_id 必須)
2. 必要に応じて split でラインを分割 (承認前のみ / R6)
3. 倉庫担当が各 line を approve/reject (approvable + approval_request 経由)
4. approve 発火 → `service_after_approve.ts`:
   - inventory_transaction INSERT (type=receive, delta=+receipt_quantity)
   - inventory_transactionable INSERT (source=receiving_receipt_line)
   - inventory.quantity += receipt_quantity (cache 更新 / R1)
5. reject 発火(terminal) → `service_after_reject.ts`:
   - status=terminal_rejected 更新のみ (在庫変動なし / R7)

---

### B-7. x-receiving は当面無視

既存の `x-receiving` 設定(confirm route / ReceivingConfirmForm)は本設計では**触らない**。

- `generate.py:585-615` の `x-receiving` 処理ブロックはそのまま存置
- confirm route の認証バグは DP-4 で独立対応(functional 変更ではなく 1 行の auth 追加)
- 将来: `x-receiving` → ledger + approval パターンへのマイグレーション guide を別途作成

---

## パート C: cmd_277 との差分整理 + DP-4 再検討 【R5反映】

### 上書きされる設計(DP-1/DP-2/DP-3)

| cmd_277 DP | 内容 | 代替する汎用プリミティブ |
|---|---|---|
| **DP-1**: per-line ship/release/cancel + qty UI | per-line action route + body 契約修正 | **O-7確定**: split→approve UX(B-4 x-splittable で所望量の sub-item に分割→approve)。数量指定 endpoint は設けない。 |
| **DP-2**: receipt = 到着ログ, confirm 廃止 | 作成時即座に inventory 加算 | **B-6**: approve → service_after_approve で inventory_transaction INSERT |
| **DP-3**: receipt → inventory 指定 (FK/selector) | line に inventory_id 追加 | **R4**: inventory_id は approval 前に必須。B-5(ledger source)で実際の在庫加算 |

**DP-1 の body 契約違反バグ** は approval flow 移行で自然解消:
- ship ≒ approve → `POST /api/approvable/{id}/actions/approve` (body 不要)
- action_buttons.tsx の ship/release ロジックが不要になる

---

### DP-4 再検討: 認証簡素化 【R5反映】

> **確定方針R5**: UIもAPIも同じgetter/serviceを呼ぶ。session+API keyの二経路(dual-mode)を用意する必要は
> ない可能性が大きい。本当にAPI keyによる外部API認証が必要かを見極めた上で簡素化する。
> ただし confirm route の無認証問題(security bug)の封鎖は必須。

#### R5 評価: API key による外部 API 認証は本当に必要か?

| 観点 | 評価 |
|---|---|
| **generator の用途** | 主にブラウザ UI 向けの CRUD アプリ生成 |
| **外部 API 統合の頻度** | 二次的(プロジェクト固有のカスタマイズで対応可) |
| **action routes の性質** | approve/reject/ship/receive = ユーザーが実行する操作 → audit trail に user 識別が必要 → session auth が自然 |
| **cypress テストでの API key 使用** | `X-API-Key` を使用しているが、これはセッションなしでの便宜的代替 |
| **結論** | **Action routes に限れば session auth のみで充足。API key は不要。** |

#### R5 再設計: Session-only for Action Routes (DP-4 改)

**採用する簡素化**:

```typescript
// lib/api-auth.ts に追加 (シンプル版)
export async function requireSession(): Promise<{ userId: string }> {
  const userId = await getSessionUserId();
  if (!userId) throw new ApiError(401, 'Login required.');
  return { userId };
}
```

**route 別の認証方針 (改訂)**:

| Route 種別 | 認証 | 理由 |
|---|---|---|
| 標準 entity REST GET (list, view) | `authenticateApiKey` (現行維持) | 外部 API 統合の可能性あり |
| 標準 entity REST POST/PUT/DELETE | `authenticateApiKey` (現行維持) | 既存との互換性維持 |
| **action routes** (ship/approve/reject/split) | **`requireSession()` に変更** | ユーザー操作 → audit trail 必要、API key 不要 |
| **confirm route** (receiving) | **`requireSession()` を追加** (現在は認証なし) | security bug 封鎖 |

**DP-4 の dual-mode (`authenticateRequest()`) は採用しない**。
- action routes: session のみ
- data routes: API key のみ (現行維持)
- 将来: 外部 API 統合が必要になったプロジェクトは個別に手書き route を追加する方針

**cypress e2e への影響**:
- 現在: action routes は API key で叩いている (が実際には 401 になっていた = 機能していない)
- 変更後: action routes は session auth が必要 → cypress でも session 確立が必要
- **cypress support の session 確立ヘルパー** が必要 (既存の `cy.login()` 等を活用)
- cypress API e2e で action routes をテストしている箇所があれば修正が必要

**generator SoT変更箇所**:

| ファイル | 変更内容 |
|---|---|
| `lib/api-auth.ts` | `requireSession()` 関数を追加 |
| `code_generator/generators.py:1144` | action route の `authenticateApiKey` → `requireSession` に変更 |
| `code_generator/templates/receiving_confirm_route.ts.jinja2` | `requireSession()` を追加(現在は認証なし) |

**data route (api_route.ts.jinja2) は変更しない** (dual-mode 採用しないため)。

---

## 要承認論点 一覧 (確定版 / dashboard 🚨要裁可 転記用)

### ★ R1〜R8 で決着した論点(取り下げ)

| 旧裁可ID | 内容 | R決着 |
|---|---|---|
| DP-4-A | authenticateRequest() dual-mode 方式 | **R5 で否決**。session-only for action routes に変更 |
| DP-4-B | generator 全体への広域波及への明示同意 | **R5 で範囲限定**。action routes のみ。data routes は変更なし |
| DP-4-C | CSRF = SameSite=Lax 充足 | **R5 反映後も同様**。session-only なら CSRF リスク変わらず |
| B-4-C | split 前 approval の扱い | **R6 で確定**。split は承認前のみ許可 |
| B-5-A | polymorphic: source_entity+source_id フィールド | **R3 で否決**。bridge pattern (inventory_transactionable) に変更 |
| B-5-C | 集計 API を手書きに委ねる | **R1 で解決**。inventory テーブル自体が SUM cache |
| 追論-1 | 子 entity の approval を本体とする | **R6 で採用** |
| 追論-5 | x-reservation と x-approval の排他化 | **R8 で採用**。x-approval 優先 + 将来 x-reservation 廃止 |

### ★ O-1〜O-7 で決着した論点(取り下げ)

| 旧裁可ID | 内容 | O決着 |
|---|---|---|
| **R1-確認** | inventory が materialized cache であることへの同意(inventory_allocation の統合含む) | **O-4+O-6で確定**。quantity=SUM(quantity_delta)、reserved=SUM(reserved_delta)。inventory_allocation も multi-record に統合 |
| **R3-確認** | inventory_transactionable bridge の具体スキーマ | **O-2で確定**。ultra-thin({id}のみ) + 逆転参照。旧schema(transactionable_type等)は廃止 |
| **B-2-B** | purchase_order の ship/release: purchase_per_item に x-approval を付与する方針 | **O-7で確定**。既存 approval API を流用。split→approve UX を採用 |
| **B-4-A** | split entity: 同テーブル self-ref FK (Option A) | **O-7で確定**。split→approve UX の採用により split 機能の設計方向が確定 |

### ★ 現在の裁可待ちリスト(O-1〜O-7適用後・残8件)

| 裁可ID | 内容 | 推奨 |
|---|---|---|
| **R5-new-A** | action routes を session-only (requireSession()) にする設計への同意 | **要裁可** |
| **R5-new-B** | cypress API e2e の action routes テスト修正への同意(session 確立ヘルパー利用) | **要裁可** |
| **R7-new-A** | approval_request に `terminal_rejected` status を追加することへの同意 | **要裁可** |
| **R8-new-A** | x-reservation + x-approval 両方定義時に x-approval 優先 + 警告を generator に実装することへの同意 | **要裁可** |
| **R8-new-B** | x-reservation の将来廃止方針を設計書に明記することへの同意 | **要裁可** |
| **B-2-A** | approval 付与先の選択基準を schema 設計者の判断に委ねる設計 | **委ねる(spec依存)** |
| **B-3-A** | x-approval.on_rejected + on_rejected_dispatch.ts.jinja2 追加 | **採用推奨** |
| **B-6-A** | receiving_receipt_line に x-approval + x-splittable + inventory_id required を付与する方針 | **採用推奨** |

**新規追加論点**: なし(O-1〜O-7の反映で矛盾は生じず)。**裁可待ち = 上記8件のみ。**

---

## 実現性・工数・リスク評価 (改訂)

### 変更規模

| プリミティブ | Generator 変更ファイル | 複雑度 |
|---|---|---|
| DP-4 改 (session-only) | api-auth.ts + generators.py action route | **低** |
| B-1 (x-reservation 警告) | generate.py + generators.py | **低** |
| B-3 (rejection + terminal) | on_rejected_dispatch.ts.jinja2 + stub + generate.py + schema | **低-中** |
| B-4 (split) | split_action_route.ts.jinja2 + generate.py + schema | **中-高** |
| B-5 (ledger + transactionable bridge) | schema 2 entities + generate.py + stub | **中-高** (R1+R3 で設計複雑化) |

### 推奨実装順序

1. **DP-4 改 (session-only action routes)** — confirm route security bug 封鎖と同時。技術リスク最低
2. **B-3 (rejection + terminal reject)** — approval 機構の対称化
3. **B-5 Phase 1 (inventory_transaction + transactionable bridge)** — schema 追加 + Phase 1 では inventory_allocation と並存
4. **B-4 (split)** — 最も複雑。B-5 完了後に実施
5. **B-5 Phase 2 (inventory_allocation 廃止)** — 最後。段階的移行完了

### 失敗シナリオ (改訂)

| シナリオ | リスク | 対策 |
|---|---|---|
| inventory_transaction SUM と inventory.quantity の不整合 | キャッシュ値が正しくない在庫を表示 | reconciliation スクリプト(定期的に SUM → inventory を再計算)を用意 |
| split self-ref FK が Prisma circular reference に引っかかる | build error | schema 作成前に Prisma self-reference パターンの検証が必要 |
| approved_at ガードの競合(同時承認) | 二重作成 | Serializable isolation で防止。approvable.approved_at SET と inventory_transaction INSERT をアトミックに |
| cypress e2e が session-only action routes で失敗 | テスト破損 | cypress login helper を action route テストに組み込む |
| inventory_allocation(旧) と inventory_transaction(新) の Phase 1 並存で二重更新 | 在庫数値ズレ | Phase 1 中は inventory_transaction への書き込みを dry-run モードで開始し、diff を監視してから切り替え |

---

## 将来拡張: split order line by inventory transaction / inventory 【O-8-2追記・非実装】

> **殿方針(2026-07-06, O-8)**: 主要タスク完了後で良い。現時点は**非実装**。
> 実装は主要タスク(DP-4改/B-3/B-5 Phase1/B-4/B-5 Phase2)完了後に別 cmd で起票。

### 背景

予約 PO で一つの order line が複数 inventory item に跨り予約する場合(単一 inventory item の quantity 不足)、
その後の出荷/解放を「inventory transaction 単位」または「inventory item 単位」で個別に進めたい。

### 前方互換の証明

B-5-9 で確認済み: 確定設計(O-2+O-6)は「1 order line → N inventory_transaction」を自然に許容する。
将来拡張は**確定設計の変更を要しない**。split feature(B-4)との地続きで実現できる。

### 想定する将来拡張フロー

#### パターン1: transaction 単位で split → approve

```
状況: order line が inventory A(40個) + inventory B(20個) で reserve 済み

目標: inventory A の40個だけ先に出荷したい

フロー:
  [1] order line を「transaction 単位」で split (x-splittable):
        sub-item 1 → inventory_transaction_A に紐付く部分 (40個)
        sub-item 2 → inventory_transaction_B に紐付く部分 (20個)
  [2] sub-item 1 を approve → ship transaction INSERT(quantity_delta=-40, reserved_delta=-40)
  [3] sub-item 2 は後から approve (独立して進行可能)
```

#### パターン2: inventory 単位で分割ビュー

```
状況: order line 1行を inventory item 別に表示・操作したい

将来 UI: order line の detail page に inventory_transaction 一覧を表示
  → transaction 単位でチェックボックス → 選択した部分を split → approve
```

### 設計ポイント(将来 cmd 起票時の参照用)

| 観点 | 方針 |
|---|---|
| **split の粒度** | transaction 単位(各 inventory_transactionable_id = bridge への紐付き単位)が自然な区切り |
| **O-7 との地続き** | split→approve UX は既に O-7 で確定。inventory 単位 split もこの UX フローに乗る |
| **x-splittable の拡張** | 現行 B-4 の split は quantity ベース。inventory 単位 split には「どの transaction に紐付けるか」の指定ロジックが追加で必要になる可能性あり |
| **Phase 条件** | 実装は B-5 Phase1(inventory_transaction entity 追加)完了後。B-4(split)実装後が前提 |

### 実装スコープ外の明示

**本節は設計書への将来拡張の記録のみ。実装・コード変更は一切含まない。**
主要タスク完了後、別 cmd として起票する。

---

## コード変更・実装を一切行っていないことの確認

- ブランチ切替: なし (`rebase/app-template-wip` を維持)
- コード変更: なし (設計書ファイルの改訂のみ)
- git add/commit/generate-code: 未実行
- 実装はすべて承認後の別 cmd で行う
