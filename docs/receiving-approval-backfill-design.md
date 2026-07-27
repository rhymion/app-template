# Design: receiving_receipt_line Approval Back-fill Mechanism

**cmd**: cmd_295 (設計フェーズ)  
**作成**: 2026-07-09  
**担当**: (design review)  
**状態**: 殿裁可待ち

---

## 0. Executive Summary

`receiving_receipt_line` は `x-approval` を持つが `new:false` (親の nested-create 経由で生成) ゆえ
`service_after_create.ts` が生成されず、親 create 時に `approvable + approval_request` が生成されない。
殿が prj SoT で `approvable_id` を `String @unique` (非 null) に変更済みのため、
現状のまま nested-create を実行すると DB の NOT NULL 制約で **失敗する**。

既存 precedent (x-reservation `strategy: ledger_transaction`) は
「親 create 後に子を再読込して approvable + approval_request を生成し approvable_id を back-fill する」
パターンを持つが、receiving_receipt には x-reservation がないため恩恵に与れない。

本設計では **案A (明示的 `x-approval-lines` スキーマキー)** を推奨する。

---

## 1. Precedent 実物調査

### 1.1 ファイル・関数・行範囲

| ファイル | 関数 | 行範囲 | 役割 |
|--------|------|--------|------|
| `code_generator/generators.py` | `_build_ledger_reservation_allocation_code()` | 753–907 | ledger_transaction 全体の TypeScript コードを文字列生成 |
| `code_generator/generators.py` | `_build_reservation_allocation_code()` | 998–1001 | strategy 分岐ルータ (ledger_transaction → 上の関数) |
| `code_generator/generators.py` | `service_context()` | 1715–1716 | 上の関数を呼び出して `reservation_allocation_code` を返す |
| `code_generator/templates/service.ts.jinja2` | — | 30–32 | `{% if reservation_allocation_code %}{{ reservation_allocation_code }}{% endif %}` で注入 |

### 1.2 per-child approvable back-fill の仕組み (行891–907)

```python
# generators.py L891-907
return (
    header +
    f"    const _reservationLines = await tx.{lines_entity}.findMany({{\n"
    f"      where: {{ {model}_id: created.id }},\n"          # ← 子を再読込
    f"    }});\n"
    f"    for (const _line of _reservationLines) {{\n"
    f"      let _remaining = (_line as Record<string, unknown>).{req_qty_field} as number;\n"
    + claim_and_approval_body +                              # ← 在庫確保 + approvable 生成 + approval_request 生成
    f"      await tx.{lines_entity}.update({{\n"
    f"        where: {{ id: _line.id }},\n"
    f"        data: {{\n"
    f"          {line_txable_f}: bridge.id,\n"
    f"          approvable_id: approvable.id,\n"            # ← back-fill
    f"        }},\n"
    f"      }});\n"
    f"    }}"
)
```

`claim_and_approval_body` (行803–858) で実行する内容:
1. `tx.approvable.create({ data: {} })` — approvable 生成
2. `tx.approval_flow.findMany({ where: { entity_name: lines_entity } })` — フロー検索
3. 各フローに対して `tx.approval_request.create(...)` — approval_request 生成
4. `tx.approvable.update({ where: { id }, data: { creator_id: actorId } })` — 作成者記録

**Transaction 境界**: 全操作が親 create と同一 `prisma.$transaction` 内 (service.ts.jinja2 の `async (tx) =>` ブロック)。

### 1.3 ledger_transaction 方式の non-null 問題

この方式は子の nested-create 後に `UPDATE` で back-fill するため、
「nested-create 時点で approvable_id = NULL」となる。
殿が prj SoT で `approvable_id` を `String @unique` (NOT NULL) にした場合、
`prj:sync` 後の Prisma client は非 null 型として扱い、
`db:push` で DB にも NOT NULL 制約が適用される → **nested-create が失敗する**。

> ⚠️ これは `purchase_per_item` でも同様に発生する (後述 §5 参照)。

### 1.4 leave_request (new:true + x-approval) の通常フロー

`leave_request/service.ts` (L40–53) は:
1. `const approvable = await tx.approvable.create({ data: {} })` — **create より前に** approvable 生成
2. `const created = await tx.leave_request.create({ data: { ..., approvable_id: approvable.id } })` — 生成時に FK 含む
3. `afterCreate(tx, { ...created, approvable: { id: created.approvable_id } }, ...)` — approval_request 生成

Generator 側では `one_to_one_pre_creates` / `one_to_one_fk_data_lines` / `one_to_one_spread` 変数 (service.ts.jinja2 L8–37) がこのパターンを生成する。

---

## 2. 問題の構造

```
receiving_receipt (new:true, can_create=true)
  └─ lines: receiving_receipt_line[] (new:false, NO service_after_create.ts)
               ├─ x-approval (approvable_id が必要)
               └─ approvable_id: String @unique (prj SoT 非 null)

現状:
  service.ts の nested-create に approvable_id なし  ← NOT NULL 違反で失敗
  approval_request が一切生成されない              ← 承認フロー不動

既存の解決経路:
  leave_request (new:true): one_to_one_pre_creates が approvable を先行生成 → FK 含む create
  purchase_per_item (x-reservation): ledger_transaction が後続 UPDATE で back-fill
                                     ← ただし現状は non-null 制約下でも同じ問題あり(§5)

receiving_receipt_line: どちらの経路にも乗らない → GAP
```

---

## 3. 設計案比較

### 案A: 明示的 `x-approval-lines` スキーマキー ★推奨

**概念**: 親エンティティ定義 (`receiving_receipt`) に `x-approval-lines: [lines]` を追加する。
Generator がこのキーを読んで「sub-entity pre-create + 後続 approval_request 生成」を親の service.ts に注入する。

**Schema 変更 (`prj/code_generator/json_schema.yaml`)**:
```yaml
receiving_receipt:
  type: object
  required: [id, receipt_no, status]
  x-approval-lines:         # ← 追加 (プロパティ名のリスト)
    - lines
  x-display: ...
```

**Generator 変更箇所**:

| ファイル | 変更内容 | 規模 |
|--------|---------|------|
| `generators.py` | `_build_approval_lines_pre_create_code(parent_def, model)` 新関数 | ~25 行 |
| `generators.py` | `_build_approval_lines_post_create_code(parent_def, model, schema)` 新関数 | ~45 行 |
| `generators.py` | `service_context()`: `x-approval-lines` 検知 → 両関数呼び出し → dict に追加 | ~15 行 |
| `build_context.py` | `_build_child_data()` L186–197: approval-lines 子の `approvable_id` を除外ではなくインデックス渡しに変更 | ~20 行 |
| `build_context.py` | `_build_child_nested_create()` L284: 対象子にフラグがあれば `(f, _i)` コールバックへ変更 | ~15 行 |
| `service.ts.jinja2` | L27 付近 (flatten_nested_creates の後): pre-create ブロック追加 | ~4 行 |
| `service.ts.jinja2` | L32 付近 (reservation_allocation_code の後): post-create ブロック追加 | ~4 行 |
| `json_schema.yaml` | receiving_receipt に `x-approval-lines: [lines]` 追加 | 2 行 |

**生成される TypeScript (receiving_receipt/service.ts の addReceivingReceipt 内)**:

```ts
// [PRE-CREATE: service.ts.jinja2 の new injection point 1]
// x-approval-lines: pre-create one approvable per line (satisfies NOT NULL)
const _linesApprIds = await Promise.all(
  linesItems.map(() => tx.approvable.create({ data: {} }).then((a) => a.id))
);

const created = await tx.receiving_receipt.create({
  data: {
    creator_id: actorId,
    ...
    lines: {
      create: linesItems.map((f, _i) => ({     // ← _i 追加
        product_id: f.product_id,
        receipt_quantity: f.receipt_quantity,
        status: f.status,
        inventory_id: f.inventory_id || null,
        parent_id: f.parent_id || null,
        is_split_result: f.is_split_result,
        inventory_transactionable_id: f.inventory_transactionable_id || null,
        approvable_id: _linesApprIds[_i],       // ← FK を先行生成 ID で充填
      })),
    },
  },
});

// [POST-CREATE: service.ts.jinja2 の new injection point 2]
// x-approval-lines: create approval_requests for each line's approvable
const _lineApprFlows = await tx.approval_flow.findMany({
  where: { entity_name: 'receiving_receipt_line' },
});
const _lineCreator = await tx.user.findUnique({
  where: { id: actorId },
  select: { roles: { select: { id: true } } },
});
const _lineCreatorRoleIds = _lineCreator?.roles.map((r) => r.id) ?? [];
for (const _apprId of _linesApprIds) {
  let _hasLineFlow = false;
  for (const _flow of _lineApprFlows) {
    if (_flow.requestor_role_id && !_lineCreatorRoleIds.includes(_flow.requestor_role_id)) {
      continue;
    }
    await tx.approval_request.create({
      data: { approvable_id: _apprId, approval_flow_id: _flow.id, status: 0 },
    });
    _hasLineFlow = true;
  }
  if (_hasLineFlow) {
    await tx.approvable.update({
      where: { id: _apprId },
      data: { creator_id: actorId },
    });
  }
}
```

**build_context.py の変更 (L186–197 周辺)** — **【2026-07-10 訂正・subtask_295b QC 指摘反映】**:

> ⚠️ 当初案(下記取消線相当)は誤り: `_child_bridge_excludes` から `approvable_id` を
> 除外すると `field_map_create` (fmc) に `approvable_id: f.approvable_id` が含まれる。
> その状態で approval_indexed 分岐が `approvable_id: {arr}[_i]` を追加すると、生成 TS
> オブジェクトリテラルに `approvable_id` キーが2回現れ **TS1117 (重複キー)** で
> コンパイル失敗する。
>
> **正しい方式**: `_child_bridge_excludes` の計算は変更しない
> (`approvable_id` は引き続き除外対象 = fmc から除外したまま)。
> `_build_child_nested_create` / `_build_child_nested_update` 側で
> approval_indexed のときだけ `approvable_id: {arr}[_i]` を明示的に追加する
> (fmc には含まれないので重複しない)。実装は subtask_295b/295c で確認済み — 生成される
> nested-create 構造は設計意図(pre-create 配列をインデックス経由で渡す)と完全同一。

```python
# _child_bridge_excludes の計算は変更しない(approvable_id は常にここで除外)
_child_bridge_excludes = {
    k for k, v in child_props_dict.items()
    if isinstance(v, dict) and (v.get('x-relationship') or {}).get('type') == 'one-to-one_bridge'
}

# approval_indexed フラグのみ追加。x-approval-lines(明示キー)と
# x-reservation ledger_transaction の lines(purchase_per_item 等)を
# helpers.schema_helpers.get_approval_lines_props() で同一リストに統合し、
# 両者を完全に同一のインデックス方式で扱う(D2: 完全横並び)。
_parent_approval_lines = set(get_approval_lines_props(schema['definitions'].get(model, {})))
approval_indexed = prop_name in _parent_approval_lines
approval_array_var = f'_{child_var}ApprIds' if approval_indexed else ''
```

**_build_child_nested_create の変更 (L284–294)**:
```python
def _build_child_nested_create(children_data: list[dict]) -> str:
    lines = []
    for c in children_data:
        pn  = c['property_name']
        cv  = c['child_var']
        fmc = c['field_map_create']
        if c['use_connect']:
            lines.append(...)
        elif c.get('approval_indexed'):
            # インデックス付きコールバック + approvable_id 注入
            arr = c['approval_array_var']
            lines.append(
                f"      {pn}: {{\n"
                f"        create: {cv}Items.map((f, _i) => ({{\n"
                f"{fmc}\n"
                f"          approvable_id: {arr}[_i],\n"
                f"        }})),\n"
                f"      }},"
            )
        else:
            lines.append(...)  # 既存の通り
    return '\n'.join(lines)
```

**利点**:
- 明示的キーが必要 → 既存エンティティ (leave_request, purchase_order) に影響ゼロ
- ledger_transaction の precedent と同一ロジック (creator_role_id フィルタ等)
- 将来の新 line child には `x-approval-lines: [new_prop]` を追加するだけ
- non-null 制約を満たす (pre-create で approvable_id を先行生成)

---

### 案B: 自動検出 (new:false + x-approval を持つ embedded child を自動スキャン)

**概念**: スキーマキー不要。Generator が親の embedded children をスキャンし、
`new:false` かつ `x-approval` を持つ子を自動検出して同様の back-fill を生成する。

**変更箇所**: `build_context.py` + `generators.py` (スキャンロジック)

**問題点**:
- `purchase_per_item` は x-reservation で back-fill 済み → 二重適用リスク
  (キャッチアップロジックが必要: "x-reservation の ledger_transaction 対象なら除外する")
- `bridge_child_ir` 経由で生成される子 (commentable 等) との混同リスク
- 将来のエンティティが誤ってキャッチされる可能性
- 見えないトリガー → スキーマを見ても back-fill が発生するかわかりにくい

**総評**: 自動化は魅力的だが誤検出・二重適用リスクが高い。
テスト量が少ない段階での採用は危険。

---

### 案C (殿案): 子の approval 生成ロジックを関数化して親から呼び出す

**概念**: 子 line の approval 生成を独立した関数として定義し、親 service.ts から呼び出す。
実質的に「approval_request 生成を helper 関数に切り出した案A」に近い。

**実装バリエーション**:
- C1: `service_after_create_stub.ts.jinja2` に `createLineApprovals(tx, lineId, entityName, actorId)` 関数を追加して export → 親が import して呼ぶ  
  問題: `receiving_receipt_line` は `new:false` で `service_after_create.ts` が生成されない (generate.py L444)
  → 別途生成ゲートの変更が必要

- C2: 親の `service_after_create.ts` に line-approval コードを注入する  
  問題: `receiving_receipt/service_after_create.ts` は write-once stub → generator が上書きしない
  → prj SoT に手動実装が必要で generator-driven でなくなる

- C3: 案A の後段 (post-create ブロック) をインライン関数として service.ts に生成する  
  案A との違いは命名・構造のみ; 変更箇所と回帰リスクはほぼ同等

**総評**: C1/C2 は generate.py の gate 変更か write-once 制約の例外処理が必要で侵襲的。
C3 は実質案Aと等価で命名の差しかない。案Aの方がスキーマ上の意図が明確。

---

## 4. 推奨案: 案A + pre-create 方式

### 4.1 選定理由

| 評価軸 | 案A | 案B | 案C |
|-------|-----|-----|-----|
| 回帰リスク | ◎ 明示キーで既存影響ゼロ | △ 誤検出リスク | △ template 変更による波及 |
| non-null 制約解決 | ◎ pre-create で NOT NULL 充足 | △ back-fill UPDATE 方式は非 null 下で失敗 | △ 案次第 |
| 将来拡張性 | ◎ キー追加のみ | ◎ 自動 | ○ 要 template 変更 |
| 実装複雑度 | ○ 中程度 | △ 自動検出ロジック + 除外ロジックが複雑 | △ gate 変更 or write-once 例外 |
| ledger_transaction との整合 | ◎ 並列概念として一貫 | △ 干渉考慮が必要 | ○ |
| スキーマ可読性 | ◎ 意図が明確 | △ 暗黙 | ○ |

### 4.2 スキーマキー正式名と配置

**キー名**: `x-approval-lines`  
**配置**: 親エンティティ定義 (base entity, `_detail` ではなく) に配置  
**型**: 文字列リスト (property_name のリスト)

```yaml
# prj/code_generator/json_schema.yaml
receiving_receipt:          # ← base entity 定義に追加
  type: object
  required: [id, receipt_no, status]
  x-approval-lines:         # ← ここ (x-display や x-reservation と同レベル)
    - lines                 # receiving_receipt_detail.properties.lines のプロパティ名
  ...
```

### 4.3 Generator 変更の詳細

#### json_schema.yaml
- `receiving_receipt` 定義に `x-approval-lines: [lines]` を追加 (2 行)

#### build_context.py 【2026-07-10 訂正・subtask_295b QC 指摘反映 — §3/§5.2 と同内容】
- **変更関数**: `_build_child_data()` (L149–255)
  - `_child_bridge_excludes` の計算ブロック自体は**変更しない** (`approvable_id` は引き続き除外対象 = `field_map_create` から除外したまま。除外を外すと fmc とインデックス注入の二重 `approvable_id` キーで TS1117 になる — 詳細は §3 案A参照)
  - 代わりに `_parent_approval_lines = set(get_approval_lines_props(schema['definitions'].get(model, {}), model, schema))` を計算し、対象 prop_name の場合のみ child dict に `approval_indexed: True`, `approval_array_var: f'_{cv}ApprIds'` を追加
  - `get_approval_lines_props()` は明示 `x-approval-lines` キーと、`x-reservation.transaction.strategy: ledger_transaction` かつ lines entity が `x-approval` を持つケース (purchase_per_item) を同一リストに統合する (D2: 完全横並び — helpers/schema_helpers.py に実装、詳細は §5.2)
  - 約 +15 行

- **変更関数**: `_build_child_nested_create()` / `_build_child_nested_update()` (build_context.py)
  - `c.get('approval_indexed')` のときは `(f, _i)` コールバック + `approvable_id: {arr}[_i]` を追加 (fmc 側には含まれないため重複しない)
  - update 側は新規追加 line (`f.id` なし) の `create` 節のみに適用。既存 line (`id` あり) の `update` 節は元の `approvable_id` を触らない
  - 約 +25 行 (create/update 両方)

#### generators.py
- **新関数**: `_build_approval_lines_pre_create_code(parent_def, model, schema, mode='create')` (約 25 行)
  - `get_approval_lines_props()` を読んで各 prop の `child_var` を解決
  - `mode='create'`: 全 `{child_var}Items` に対して pre-create
  - `mode='update'`: `{child_var}Items.filter(f => !f.id)` (新規追加 line のみ) に対して pre-create — 既存 line は初回作成時の approvable_id を維持
  - `const _{child_var}ApprIds = await Promise.all(...)` を生成

- **新関数**: `_build_approval_lines_post_create_code(parent_def, model, schema)` (約 45 行)
  - 子 entity 名を `_resolve_approval_lines_entity()` (`{model}_detail.properties.{prop}.items.$ref` を辿る) で解決
  - `approval_flow.findMany({ entity_name: lines_entity })` + per-approvable `approval_request.create` ループを生成
  - `approvable.update({ creator_id: actorId })` も含む
  - create/update 両フローで共用 (呼び出し側が渡す `_{child_var}ApprIds` の母集団が異なるだけ)

- **変更**: `service_context()`
  - `get_approval_lines_props(parent_def, model, schema)` が非空の場合に4変数 (`approval_lines_pre_create_code` / `approval_lines_post_create_code` / `approval_lines_pre_update_code` / `approval_lines_post_update_code`) を計算:
    ```python
    approval_lines_pre_create_code  = ''
    approval_lines_post_create_code = ''
    approval_lines_pre_update_code  = ''
    approval_lines_post_update_code = ''
    if get_approval_lines_props(parent_def, model, schema):
        approval_lines_pre_create_code  = _build_approval_lines_pre_create_code(parent_def, model, schema, mode='create')
        approval_lines_post_create_code = _build_approval_lines_post_create_code(parent_def, model, schema)
        if can_update:
            approval_lines_pre_update_code  = _build_approval_lines_pre_create_code(parent_def, model, schema, mode='update')
            approval_lines_post_update_code = _build_approval_lines_post_create_code(parent_def, model, schema)
    ```
  - return dict に上記4変数を追加
  - 約 +20 行

#### `_build_ledger_reservation_allocation_code()` (既存関数の改修 — purchase_per_item 対応、§5.2)
- has_lines (例: purchase_per_item) 経路から approvable 生成・back-fill を削除。in-body の役割は在庫クレーム (ledger 行作成) + bridge FK 紐付けのみに縮小
- approvable/approval_request 生成は pre-create/post-create 側 (上記) に一元化されるため、この関数はもう `approvable` を一切参照しない
- has_lines=False (自己完結・現状どのエンティティも未使用) の経路は従来の create-then-back-fill のまま維持 (embedded child 配列がなく pre-create フックする先がないため)

#### service.ts.jinja2
```jinja2
{% if one_to_one_pre_creates %}
{{ one_to_one_pre_creates }}
{% endif %}
{% if approval_lines_pre_create_code %}  {# ← 追加: nested-create の直前 #}
{{ approval_lines_pre_create_code }}
{% endif %}
    const created = await tx.{{ model }}.create({
      data: {
        ...
      },
    });
{% if reservation_allocation_code %}
{{ reservation_allocation_code }}
{% endif %}
{% if approval_lines_post_create_code %}  {# ← 追加: reservation_allocation_code の後 #}
{{ approval_lines_post_create_code }}
{% endif %}
```
update 側 (`update{{ parent_pascal }}`) にも同様に `approval_lines_pre_update_code` (nested-update の直前) / `approval_lines_post_update_code` (nested-update の後) の2箇所を追加。各 `{% if %}` guard により x-approval-lines 対象外のエンティティへの影響はゼロ。

---

## 5. approvable_id mandatory 整合の検証

### 5.1 receiving_receipt_line

prj SoT: `approvable_id  String  @unique` (NOT NULL)  
app-generator: `approvable_id  String?  @unique` (nullable) — 現状

`prj:sync` 後は prj SoT の schema が有効 → `db:push` で NOT NULL 制約が DB に適用される。

案A の pre-create 方式:
- `_linesApprIds` を nested-create 前に生成
- nested-create body に `approvable_id: _linesApprIds[_i]` を含む
- **NOT NULL 制約下でも nested-create が成功する** ✅

追加で必要な変更: `app-generator/prisma/schema.prisma` の receiving_receipt_line の `approvable_id` を
`String?` から `String` に変更することを generator テンプレート側で対応するか、
prj SoT に依存するか → **本設計では prj SoT を正として、generator テンプレートも `String` (非 null) を生成するよう修正を推奨**。
(json_schema.yaml の `required` フィールドに `approvable_id` を含む場合、generator が nullable でなく non-null として Prisma schema を生成するよう build_context.py を修正する)

### 5.2 purchase_per_item の同型 gap 判定

**判定: 同型 gap あり、subtask_295c で対応完了 (2026-07-10)**

- `purchase_per_item.approvable_id`: prj SoT で `String @unique` (NOT NULL)
- `purchase_order/service.ts` の nested-create: `approvable_id` を含まない (build_context.py で除外)
- ledger_transaction back-fill: nested-create **後** に UPDATE で approvable_id を書き戻す
- 問題: prj SoT 非 null 制約下では nested-create 自体が **失敗する**

**実装済みの対応**: 💡 の共通化案を採用。
`helpers/schema_helpers.py` に `get_approval_lines_props(parent_def)` を新設し、
`x-approval-lines` (明示キー) と `x-reservation.transaction.strategy: ledger_transaction` の
`lines` プロパティを同一リストに統合。`_build_child_data()` / `_build_approval_lines_pre_create_code()` /
`_build_approval_lines_post_create_code()` はこのリストを見るだけで、
receiving_receipt_line と purchase_per_item を完全に同一のインデックス方式で扱う (D2 完全横並び)。
`_build_ledger_reservation_allocation_code()` からは approvable/approval_request 生成コードを削除し
(pre-create/post-create 側に一元化)、in-body の役割は在庫クレーム + bridge FK 紐付けのみに縮小した。

---

## 6. 既存経路への回帰リスク評価

### 6.1 leave_request (new:true + x-approval)

- 変更対象: `build_context.py` の `_build_child_data()` / `_build_child_nested_create()` — leave_request は embedded children を持たないため **影響なし** ✅
- `service.ts.jinja2` への追加ブロック: `{% if approval_lines_pre_create_code %}` で guard されており、leave_request は `x-approval-lines` を持たないため injection なし ✅
- `service_after_create_stub.ts.jinja2` は変更しない → leave_request の afterCreate 動作不変 ✅

### 6.2 purchase_order (x-reservation ledger_transaction)

- `x-approval-lines` を持たないため新ブロックは injection されない ✅
- `_build_child_data()` の `_child_bridge_excludes` ロジック変更は `prop_name in _parent_approval_lines` のみに作用 — purchase_order の `items` prop は `_parent_approval_lines` に入らない ✅
- **注意**: §5.2 の purchase_per_item 対応 (ledger_transaction の pre-create 化) を実施する場合、
  ledger_transaction code の変更が purchase_order の allocate フロー全体に影響する。
  変更前後での purchase_order E2E テスト (購入発注作成 + 在庫予約) の PASS 確認が必須。

### 6.3 その他 x-approval エンティティ (receiving_receipt_line_detail のみ など)

- `receiving_receipt_line_detail` は `new:false` / `edit:false` のため service.ts が生成されない → 影響なし ✅
- 他の `x-approval` エンティティ (future): `x-approval-lines` キーを持たない限り影響なし ✅

---

## 7. 実装工数見積りとハマりどころ

### 7.1 工数見積り

| 作業 | 推定行数 | 難易度 |
|------|---------|-------|
| json_schema.yaml 変更 | 2 行 | 低 |
| generators.py 新関数 2 本 | ~70 行 | 中 |
| generators.py service_context 変更 | ~15 行 | 低 |
| build_context.py _build_child_data 変更 | ~20 行 | 中 |
| build_context.py _build_child_nested_create 変更 | ~10 行 | 中 |
| service.ts.jinja2 変更 | ~8 行 | 低 |
| **合計** | **~125 行** | **中** |

### 7.2 想定されるハマりどころ

1. **lines entity 解決の難しさ**  
   `_build_approval_lines_post_create_code` で entity 名を解決する際、
   `receiving_receipt_detail.properties.lines.items.$ref` を辿って `receiving_receipt_line` を得る必要がある。
   schema の deep traversal ロジックが必要 (fail fast で schema validation を追加推奨)。

2. **`child_var` と `approval_array_var` の命名衝突**  
   複数の x-approval-lines が存在するケースで変数名が衝突しないよう命名規則を確立する。
   → `_{child_var}ApprIds` (例: `_linesApprIds`) で一意性を保証。

3. **update フロー (lines の差分 update) への non-null 影響**  
   `receiving_receipt/service.ts` の updateReceivingReceipt では、
   既存 line の update body にも `approvable_id` が含まれていない。
   update では approvable は既存のものを保持するため、update body への注入は不要だが、
   新たに追加された lines (no id → create) に対しては pre-create が必要。
   → update 時の nested-create も `linesItems.filter(f => !f.id)` の count 分だけ approvable を先行生成する必要あり。
   **これは service.ts.jinja2 の update ブロックにも同様の injection が必要** (追加実装項目)。

4. **linesItems.length = 0 のエッジケース**  
   lines なしで receiving_receipt を作成する場合、`_linesApprIds` は空配列になる。
   `Promise.all([])` は安全だが、コードの可読性のために guard を入れることを推奨:
   ```ts
   if (linesItems.length > 0) {
     const _linesApprIds = ...
   }
   ```

5. **prj:sync による prisma/schema.prisma 上書き**  
   app-generator 内の `prisma/schema.prisma` は `prj:sync` で上書きされる。
   app-generator 側のスキーマ変更 (nullable → non-null) は `prj/prisma/schema.prisma` を正とし、
   generator から生成ではなく prj SoT で管理する方針を明確化すること。

---

## 8. 殿裁可を要する論点

```
🚨 dashboard 要対応転記用

【D1】推奨案の確認
  案A (明示的 x-approval-lines キー + pre-create 方式) を採用するか。
  → 代替: 案B (自動検出・回帰リスク高) / 案C (leave_request の関数化・案Aと実質同等)

【D2】purchase_per_item の同時対応
  receiving_receipt_line と同型の gap が purchase_per_item にも存在する
  (ledger_transaction 方式は prj SoT non-null 下で nested-create が失敗する)。
  → cmd_295 で同時修正するか、別 cmd に分離するか。
  → 同時修正の場合: _build_ledger_reservation_allocation_code と案A の pre-create を共通化推奨。

【D3】update フロー (差分 update 時の新 line) への対応スコープ
  receiving_receipt update 時に新規追加される line (id なし) にも
  approvable pre-create + approval_request 生成が必要。
  → cmd_295 に含めるか、別 cmd か。

【D4】Prisma schema 生成の non-null 対応
  json_schema.yaml の `required` に含まれる `approvable_id` を generator が
  Prisma schema で `String` (非 null) として出力するよう build_context.py を修正するか、
  prj SoT での手動管理を継続するか。
```

---

## 9. North Star Alignment

```yaml
north_star_alignment:
  status: aligned
  reason: >
    receiving_receipt_line の approval_request が生成されないことで承認フローが機能せず、
    入荷検収の品質管理プロセスが迂回される。本設計により承認フローが generator 経由で
    保証され、プロジェクトの「承認ゲートの一貫性」を維持する。
  risks_to_north_star:
    - "purchase_per_item の同型 gap を放置すると発注承認フローも同様に機能しない可能性がある"
    - "update フロー (新規追加 line) を対象外にすると、edit 画面から line を追加した場合に承認なしで生成される"
```
