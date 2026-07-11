# Design: x-splittable 汎用化 + Split UI (cmd_296)

**cmd**: cmd_296 (設計フェーズ)  
**作成**: 2026-07-09  
**担当**: gunshi  
**状態**: 殿裁可待ち  
**協調**: cmd_295 (x-approval-lines / approvable pre-create 方式) 設計書を踏まえた設計

---

## 0. Executive Summary

現行の `x-splittable` 実装には4つの重大な問題がある:
1. `receipt_quantity` / `inventory_id` / `parent_id` / `is_split_result` がハードコードされており receiving 特化
2. Σ(parts.quantityField) == parent.quantityField の検証が存在しない
3. split 時に `approvable` を DELETE + `approvable_id: null` → prj SoT 非 null 制約違反
4. UI が皆無 (API route のみ生成)

本設計では以下を実現する:
- `x-splittable` をオブジェクト形式に拡張し quantityField・自己 FK を宣言/自動検出
- Σ検証を split route に追加
- approvable 削除を廃し approvable_id mandatory を維持 (cmd_295 設計思想の一貫)
- `SplitActionSection.tsx` テンプレートを新規作成し view page に自動注入

---

## 1. 現行実装の問題分析

### 1.1 対象ファイルと行範囲

| ファイル | 行範囲 | 問題 |
|--------|--------|------|
| `code_generator/generate.py` | L617–648 | ハードコード: receipt_quantity/inventory_id/parent_id/is_split_result を直書きで除外 |
| `templates/split_action_route.ts.jinja2` | L1–96 (全体) | ハードコード: receipt_quantity/inventory_id/parent_id/is_split_result を直書き; Σ検証なし; approvable delete+null化 |
| `prj/code_generator/json_schema.yaml` | L2664 | `x-splittable: true` のみ (quantityField 未宣言) |

### 1.2 現在 x-splittable を持つエンティティ

`json_schema.yaml` grep 結果: `receiving_receipt_line` のみ (L2664)。他エンティティへの影響範囲は現状ゼロ。

### 1.3 approvable_id null 問題 (最重要)

`split_action_route.ts.jinja2` L60–67:
```ts
if (parent.approvable_id) {
  await tx.approval_request.deleteMany({ where: { approvable_id: parent.approvable_id } });
  await tx.approvable.delete({ where: { id: parent.approvable_id } });   // ← DELETE
}
await tx.receiving_receipt_line.update({
  where: { id },
  data: { status: SPLIT_STATUS, approvable_id: null },  // ← NULL SET
});
```

prj SoT: `approvable_id String @unique` (NOT NULL) → NULL セットは **DB 制約違反で失敗**。
加えて、approvable 履歴が消滅するため監査証跡が失われる。

---

## 2. x-splittable スキーマキー設計

### 2.1 正式なキー形式

**後方互換**: `x-splittable: true` は引き続き受理 (Σ検証なし・quantityField なし)

**推奨新形式**:
```yaml
x-splittable:
  quantityField: receipt_quantity   # required: Σ検証対象のフィールド名
  perPartRequired:                  # optional: 各partに必須のフィールド (R4)
    - inventory_id
  # parentField: parent_id         # optional: 自動検出で解決 (下記)
  # splitResultField: is_split_result  # optional: 自動検出で解決 (下記)
```

**キー正式名**: `x-splittable` (既存キーを拡張)  
**配置**: base エンティティ定義 (`receiving_receipt_line`) のトップレベル

**json_schema.yaml 変更箇所**:
```yaml
# prj/code_generator/json_schema.yaml L2664
receiving_receipt_line:
  ...
  x-splittable:
    quantityField: receipt_quantity
    perPartRequired:
      - inventory_id
```

### 2.2 parentField / splitResultField の自動検出ロジック

`generate.py` の `_splittable_defs` ループ内 (L624–648 の置換) で:

**parentField (自己参照 FK) の自動検出**:
```python
def _detect_split_parent_field(props: dict, entity_name: str, schema: dict) -> str | None:
    """Find the property with x-relationship.type == 'many-to-one' and target == entity_name."""
    for prop_name, prop_def in props.items():
        rel = (prop_def.get('x-relationship') or {})
        if rel.get('type') == 'many-to-one' and rel.get('target') == entity_name:
            return prop_name  # e.g., 'parent_id'
    return None
```
→ `receiving_receipt_line.parent_id` の `x-relationship.target == 'receiving_receipt_line'` で検出

**splitResultField の自動検出**:
```python
def _detect_split_result_field(props: dict) -> str | None:
    """Find boolean property named 'is_split_result' by convention."""
    for prop_name, prop_def in props.items():
        if prop_def.get('type') == 'boolean' and prop_name == 'is_split_result':
            return prop_name
    return None  # エンティティが is_split_result を持たない場合
```

### 2.3 inherited_fields の計算ロジック (generate.py 更新版)

```python
_split_cfg = _def_val.get('x-splittable')
_is_bool_splittable = _split_cfg is True
_splittable_dict = _split_cfg if isinstance(_split_cfg, dict) else {}
_qty_field = _splittable_dict.get('quantityField')  # None if bool form
_per_part_req = _splittable_dict.get('perPartRequired') or []
_cfg_parent_f = _splittable_dict.get('parentField')
_cfg_split_r_f = _splittable_dict.get('splitResultField')

_parent_f = _cfg_parent_f or _detect_split_parent_field(_split_entity_props, _def_key, schema)
_split_r_f = _cfg_split_r_f or _detect_split_result_field(_split_entity_props)

# Always exclude: system fields + auto-detected structural fields
_always_exclude = {
    'id', 'status', 'approvable_id', 'inventory_transactionable_id',
    *([_qty_field] if _qty_field else []),         # quantityField
    *([_parent_f] if _parent_f else []),           # self-ref FK
    *([_split_r_f] if _split_r_f else []),         # split result flag
    *_per_part_req,                                # per-part required fields
}

_inherited_fields = [f for f in _split_entity_props if f not in _always_exclude]
```

---

## 3. 数量保存の不変量 (Σ検証)

### 3.1 実装方式

`split_action_route.ts.jinja2` に以下ブロックを追加 (quantityField が宣言されている場合のみ):

```ts
{% if has_quantity_check %}
// Σ validation: sum of parts.{quantity_field} must equal parent.{quantity_field}
for (const part of parts) {
  if ((part.{{ quantity_field }} as number) <= 0) {
    throw new ApiError(400, 'Each part {{ quantity_field }} must be positive');
  }
}
const _totalQty = parts.reduce((s, p) => s + ((p.{{ quantity_field }} as number) ?? 0), 0);
if (_totalQty !== (parent as Record<string, unknown>).{{ quantity_field }} as number) {
  throw new ApiError(400, `Split parts must sum to ${(parent as Record<string, unknown>).{{ quantity_field }}} (got ${_totalQty})`);
}
{% endif %}
```

### 3.2 境界ケースの扱い

| ケース | HTTP | 判定 |
|--------|------|------|
| `parts.length < 2` | 400 | 既存バリデーション (変更なし) |
| `parts[i].quantityField <= 0` | 400 | 新規: 各 part が正値であること |
| `Σ != parent.quantityField` | 400 | 新規: 総和一致 |
| `Σ == parent.quantityField` (部分和可) | OK | 不可。全量を分割しなければならない |
| quantityField 未宣言 (`x-splittable: true`) | — | Σ検証スキップ (後方互換) |

**設計方針**: split は「全量の再分配」を意味する (残量保持なし)。
全量を parts に割り振らない split は業務的に誤りなため、総和 == 親値を強制する。

---

## 4. approvable_id mandatory 整合設計 (cmd_295 との共通化)

### 4.1 設計方針

殿裁定: **approvable_id は mandatory 維持。split で null 化せず、approvable も削除しない。**

変更前 (現行・問題あり):
```ts
await tx.approval_request.deleteMany({ where: { approvable_id: parent.approvable_id } });
await tx.approvable.delete({ where: { id: parent.approvable_id } });  // ← 削除
await tx.entity.update({ where: { id }, data: { status: SPLIT_STATUS, approvable_id: null } });  // ← null
```

変更後 (設計):
```ts
// Step 1: 親の approval_requests のみ削除 (approvable レコード自体は保持)
// approvable は split 前の審査履歴として残す (monitoring/audit 目的)
{% if has_approvable %}
if (parent.approvable_id) {
  await tx.approval_request.deleteMany({ where: { approvable_id: parent.approvable_id } });
  // approvable は DELETE しない: approvable_id を mandatory 維持し履歴保全
}
{% endif %}
// Step 2: 親を split 状態に更新 (approvable_id は変更しない)
await tx.{{ entity_name }}.update({
  where: { id },
  data: { status: SPLIT_STATUS },  // approvable_id: null は追加しない
});
```

### 4.2 子の approvable 生成 — cmd_295 との共通化

cmd_295 設計 (x-approval-lines) では `_build_approval_lines_post_create_code()` Python 関数が
親 service.ts の post-create ブロックで approval_request を生成する。

split route での子 approvable 生成は **同一の TypeScript パターン** (approval_flow lookup + per-flow create) を使う。

**共通化アプローチ: generator-level 関数の再利用**

```python
# generators.py に shared helper を追加
def _build_approval_create_block_for_entity(
    entity_name: str,          # e.g., 'receiving_receipt_line'
    approvable_id_expr: str,   # e.g., 'childApprovable.id'
    actor_id_expr: str,        # e.g., 'userId'
    tx_var: str = 'tx',
    indent: str = '        ',
) -> str:
    """Generate TypeScript block to create approval_requests for one approvable.
    
    Used by:
      - cmd_295: _build_approval_lines_post_create_code (post-create in service.ts)
      - cmd_296: split_action_route.ts.jinja2 (per-child approvable)
    """
    return (
        f"{indent}let _hasApprFlow = false;\n"
        f"{indent}for (const _apFlow of _approvalFlows) {{\n"
        f"{indent}  if (_apFlow.requestor_role_id && !_creatorRoleIds.includes(_apFlow.requestor_role_id)) {{\n"
        f"{indent}    continue;\n"
        f"{indent}  }}\n"
        f"{indent}  await {tx_var}.approval_request.create({{\n"
        f"{indent}    data: {{ approvable_id: {approvable_id_expr}, approval_flow_id: _apFlow.id, status: 0 }},\n"
        f"{indent}  }});\n"
        f"{indent}  _hasApprFlow = true;\n"
        f"{indent}}}\n"
        f"{indent}if (_hasApprFlow) {{\n"
        f"{indent}  await {tx_var}.approvable.update({{\n"
        f"{indent}    where: {{ id: {approvable_id_expr} }},\n"
        f"{indent}    data: {{ creator_id: {actor_id_expr} }},\n"
        f"{indent}  }});\n"
        f"{indent}}}"
    )
```

cmd_295 の `_build_approval_lines_post_create_code()` はこの関数を呼ぶ。
cmd_296 の `split_action_route.ts.jinja2` では `_approvalFlows` / `_creatorRoleIds` を事前に確立してから
各 part ループ内でテンプレートブロックを展開する:

```jinja2
{% if has_approvable %}
    // Pre-fetch approval metadata (shared pattern with cmd_295 x-approval-lines)
    const _creatorInfo = await tx.user.findUnique({
      where: { id: userId },
      select: { roles: { select: { id: true } } },
    });
    const _creatorRoleIds = _creatorInfo?.roles.map((r) => r.id) ?? [];
    const _approvalFlows = await tx.approval_flow.findMany({
      where: { entity_name: '{{ entity_name }}' },
    });
{% endif %}
    for (const part of parts) {
{% if has_approvable %}
      const childApprovable = await tx.approvable.create({ data: {} });
{{ approval_create_block }}  {# ← _build_approval_create_block_for_entity() の出力 #}
{% endif %}
      await tx.{{ entity_name }}.create({
        data: {
          {% for field in inherited_fields %}
          {{ field }}: (part.{{ field }} ?? parent.{{ field }}) as never,
          {% endfor %}
          {{ quantity_field }}: part.{{ quantity_field }},
          {% for f in per_part_required %}
          {{ f }}: part.{{ f }} ?? parent.{{ f }},
          {% endfor %}
          {% if parent_field %}
          {{ parent_field }}: parent.id,
          {% endif %}
          {% if split_result_field %}
          {{ split_result_field }}: true,
          {% endif %}
          status: 0,
{% if has_approvable %}
          approvable_id: childApprovable.id,
{% endif %}
        },
      });
    }
```

**完全再利用が難しい部分**:
- cmd_295 は「複数の子 approvable ID を配列で保持し、ループ後に approval_request を生成」するのに対し、
  cmd_296 は「各 part のループ内で approvable.create → approval_request.create を逐次処理」する。
- ループ構造が異なる → `_build_approval_create_block_for_entity` helper は内部ブロックのみを担当し、
  各々のループ構造は呼び出し元で管理する。これが現実的な共通化の境界。

---

## 5. Split UI / User Flow 設計

### 5.1 既存 UI パターンの調査

| パターン | ファイル | 特徴 |
|--------|---------|------|
| `ReservationActionButtons.tsx` | `action_buttons.tsx.jinja2` | auto-generate → `form_view.tsx.jinja2` L93 で auto-inject |
| `ApprovalSection` | `_standard/ApprovalSection.tsx` | write-once → `x-custom-components` で手動宣言して inject |
| `AttachmentSection` | `_standard/AttachmentSection.tsx` | write-once → `x-custom-components` で手動宣言 |

**Split UI の採用パターン**: `ReservationActionButtons` 方式 (auto-generate + auto-inject)

理由:
- `x-splittable` が判明した時点で generator が UI を自動生成するのが原則
- `x-custom-components` は手動宣言が必要 → 抜け漏れリスク
- `ReservationActionButtons` の inject パターン (L47–49, L92–94) と対称性を保てる

### 5.2 生成コンポーネント設計

**新規テンプレート**: `code_generator/templates/split_action_section.tsx.jinja2`  
**生成先**: `components/{entity_name}/SplitActionSection.tsx`  
**生成タイミング**: generate.py の x-splittable ループ (L617–648 の後半) で追加生成

```tsx
// SplitActionSection.tsx (generated by split_action_section.tsx.jinja2)
'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
{% if per_part_required %}
import Autocomplete from '@mui/material/Autocomplete';
{% endif %}

type SplitPart = {
  {{ quantity_field }}: number;
  {% for f in per_part_required %}
  {{ f }}: string;
  {% endfor %}
};

export function SplitActionSection({
  id,
  {{ quantity_field }},
  onSuccess,
}: {
  id: string;
  {{ quantity_field }}: number;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<SplitPart[]>([
    { {{ quantity_field }}: 0{% for f in per_part_required %}, {{ f }}: ''{% endfor %} },
    { {{ quantity_field }}: 0{% for f in per_part_required %}, {{ f }}: ''{% endfor %} },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalAssigned = parts.reduce((s, p) => s + (p.{{ quantity_field }} || 0), 0);
  const remaining = {{ quantity_field }} - totalAssigned;

  function updatePart(idx: number, field: keyof SplitPart, value: string | number) {
    setParts(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }

  function addPart() {
    setParts(prev => [...prev, { {{ quantity_field }}: 0{% for f in per_part_required %}, {{ f }}: ''{% endfor %} }]);
  }

  function removePart(idx: number) {
    if (parts.length <= 2) return;
    setParts(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (remaining !== 0) {
      setError(`Total must equal ${{{ quantity_field }}} (current remaining: ${remaining})`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/{{ entity_name }}/${id}/actions/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parts }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg);
      }
      setOpen(false);
      onSuccess?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="outlined" color="secondary" onClick={() => setOpen(true)}>
        Split
      </Button>
      <Dialog open={open} onClose={() => !loading && setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Split {{ entity_name | pascal_case }} (total: {{{ quantity_field }}})</DialogTitle>
        <DialogContent>
          {error && <Typography color="error" sx={{ mb: 1 }}>{error}</Typography>}
          <Typography variant="body2" color={remaining === 0 ? 'success.main' : 'text.secondary'} sx={{ mb: 2 }}>
            Remaining: {remaining}
          </Typography>
          {parts.map((part, idx) => (
            <Box key={idx} sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
              <TextField
                label="Part {{ quantity_field }}"
                type="number"
                size="small"
                value={part.{{ quantity_field }}}
                onChange={e => updatePart(idx, '{{ quantity_field }}', Number(e.target.value))}
                inputProps={{ min: 1 }}
                sx={{ width: 120 }}
              />
              {% for f in per_part_required %}
              <TextField
                label="{{ f }}"
                size="small"
                value={part.{{ f }}}
                onChange={e => updatePart(idx, '{{ f }}', e.target.value)}
                sx={{ flex: 1 }}
              />
              {% endfor %}
              <IconButton onClick={() => removePart(idx)} disabled={parts.length <= 2} size="small">
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <Button startIcon={<AddIcon />} onClick={addPart} size="small">
            Add Part
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading || remaining !== 0} variant="contained">
            {loading ? 'Splitting...' : 'Split'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

### 5.3 form_view.tsx.jinja2 への injection

既存の `ReservationActionButtons` 注入と対称 (form_view.tsx.jinja2 L47–49, L92–94 参照):

```jinja2
{# Import (L47 付近に追加) #}
{% if is_splittable and split_config.quantity_field %}
import { SplitActionSection } from './SplitActionSection';
{% endif %}

{# JSX (L92–94 の ReservationActionButtons の後に追加) #}
{% if is_splittable and split_config.quantity_field %}
      <SplitActionSection
        id={src.id}
        {{ split_config.quantity_field }}={(src as Record<string, unknown>).{{ split_config.quantity_field }} as number}
        onSuccess={() => window.location.reload()}
      />
{% endif %}
```

**注**: `onSuccess` の実装として `window.location.reload()` は最小コスト。
`router.refresh()` (Next.js App Router) を使う場合は `useRouter` import が必要。
設計判断として 殿に委ねる (D3)。

### 5.4 generate.py への追加

x-splittable ループ (L617–648) を以下のように拡張:

```python
for _def_key, _def_val in _splittable_defs.items():
    if _def_key.endswith('_detail'):
        continue
    if not _def_val.get('x-splittable'):
        continue

    # ... 既存の _split_ctx 構築 (更新版) ...

    # Route generation (既存)
    _write(_split_api_dir / 'route.ts', _render(env, 'split_action_route.ts.jinja2', _split_ctx))

    # UI generation (新規)
    if _qty_field:  # quantityField が宣言されている場合のみ UI を生成
        # components/{entity}/ の SplitActionSection.tsx
        _split_ui_ctx = {
            'entity_name': _def_key,
            'quantity_field': _qty_field,
            'per_part_required': _per_part_req,
        }
        _split_ui_dir = out / 'components' / _def_key
        _write_stub(
            _split_ui_dir / 'SplitActionSection.tsx',
            _render(env, 'split_action_section.tsx.jinja2', _split_ui_ctx),
        )

    print(f'  Split action route → app/api/{_def_key}/[id]/actions/split/')
```

---

## 6. 変更ファイルと行範囲のまとめ

| ファイル | 変更内容 | 規模 |
|--------|---------|------|
| `prj/code_generator/json_schema.yaml` | `receiving_receipt_line.x-splittable` をオブジェクト形式へ変更 | 4 行変更 |
| `code_generator/generate.py` L617–648 | ハードコード除去・自動検出関数追加・UI generation 追加 | ~30 行変更+追加 |
| `templates/split_action_route.ts.jinja2` | 全面改修: 汎用フィールド・Σ検証・approvable fix・approval block | 現行 ~96 行 → ~130 行 |
| `templates/split_action_section.tsx.jinja2` | **新規作成** (~90 行) | 新規 |
| `code_generator/build_context.py` | `is_splittable` / `split_config` を build_context() のコンテキストに追加 | ~20 行 |
| `templates/form_view.tsx.jinja2` | SplitActionSection import + JSX injection | ~8 行 |
| `generators.py` | `_build_approval_create_block_for_entity()` 共有ヘルパー追加 (cmd_295 との共通化) | ~25 行 |

---

## 7. 実装順序の提案 (cmd_295 との関係)

### 7.1 依存関係評価

| cmd_296 の作業 | cmd_295 完了待ちか | 理由 |
|--------------|-------------------|------|
| x-splittable スキーマ拡張 (json_schema.yaml) | 不要 | 独立変更 |
| generate.py 汎用化 + auto-detect | 不要 | 独立変更 |
| split_action_route.ts.jinja2 改修 | 不要 (独立実装可) | approvalblock は独立で書ける |
| `_build_approval_create_block_for_entity` を generators.py に追加 | **cmd_295 完了後推奨** | cmd_295 が `_build_approval_lines_post_create_code` を実装するため、その後で共通 helper に統合した方が重複を防ぐ |
| split UI (SplitActionSection.tsx 生成) | 不要 | 独立変更 |
| form_view.tsx.jinja2 injection | 不要 | 独立変更 |

### 7.2 推奨実行順序

```
Phase 1 (cmd_295 完了前に並行実施可能):
  a. json_schema.yaml の x-splittable 拡張
  b. generate.py の汎用化 + auto-detect + Σ検証 (approvable 部分のみ TODO コメント)
  c. split_action_section.tsx.jinja2 新規作成 + form_view.tsx.jinja2 injection
  d. split_action_route.ts.jinja2 の Σ検証・フィールド汎用化・approvable null fix

Phase 2 (cmd_295 完了後):
  e. generators.py に _build_approval_create_block_for_entity() 追加
  f. split_action_route.ts.jinja2 の per-child approval block を共通ヘルパー経由に切り替え
  g. cmd_295 の post-create block も同共通ヘルパーを使うよう統合
```

**ファイル競合リスク**: `generators.py` は cmd_295 (新関数追加) と cmd_296 (共通ヘルパー追加) が触れる。
Phase 2 を cmd_295 完了後にまとめることで競合を回避。

---

## 8. 設計の自己レビュー (実現性・ハマりどころ)

### 8.1 汎用化の完全性

現行ハードコードフィールド:
- `receipt_quantity` → `{{ quantity_field }}` で置換 ✅
- `inventory_id` → `per_part_required` ループで置換 ✅
- `parent_id` → `{{ parent_field }}` で置換 (自動検出) ✅
- `is_split_result` → `{{ split_result_field }}` で置換 (自動検出) ✅

自動検出が失敗するケース: self-referential FK を持たないエンティティで split → `parent_field = None` のまま生成 (OK、その場合 parent_id なし)。

### 8.2 SplitActionSection の perPartRequired UI

`inventory_id` のような FK フィールドは、単純な TextField では usability が低い (CUID を手入力するのは現実的でない)。
理想: Autocomplete + lookup API。しかし split route テンプレートはシンプルさを優先し、
まず TextField で実装する (lookup は将来拡張)。
→ 殿に確認要 (D4)。

### 8.3 form_view.tsx.jinja2 の `is_splittable` コンテキスト

現行 `build_context()` はエンティティの detail 定義から context を構築する。
`x-splittable` は base entity 定義にあるため、`build_context()` 内で:
- `entity_schema` から base entity の `x-splittable` を読む (detail allOf の $ref を辿って base entity 名を解決)
- `is_splittable`, `split_config` dict をコンテキストに追加

変更箇所: `build_context.py` の `build_context()` 関数 (L636 付近)、~20 行追加。

### 8.4 `x-splittable: true` (bool 形式) の後方互換

generate.py の `if not _def_val.get('x-splittable'):` は `True` も dict も通過するため既存互換は保たれる。
ただし `True` の場合 `_qty_field = None` → Σ検証なし、UI なし (既存動作と同一)。
→ 移行後は json_schema.yaml を dict 形式に更新することを推奨。

---

## 9. 殿裁可を要する論点

```
🚨 dashboard 要対応転記用

【D1】approvable の「無効化」表現
  split 時に approval_requests のみ削除し、approvable レコードは保持する設計を採用する。
  approvable テーブルに 'status' / 'superseded' フィールドが存在しないため、
  「split により承認フロー無効化」は entity.status = split のみで表現する。
  → この設計で十分か、approvable に superseded_at 等のフィールド追加が必要か？

【D2】per_part_required の UI (perPartRequired フィールドのユーザー入力方式)
  現設計では inventory_id を単純 TextField で入力 (CUID 直接入力) とする。
  → Autocomplete + lookup API への拡張を本 cmd スコープに含めるか、後続 cmd か？

【D3】onSuccess の実装方法 (SplitActionSection)
  split 後の画面更新: `window.location.reload()` vs `router.refresh()` (Next.js App Router)
  → router.refresh() を使う場合、FormView に useRouter import が追加される。どちらを採用するか？

【D4】x-splittable: true (bool 形式) の扱い
  本 cmd で json_schema.yaml を dict 形式へ移行完了させるか、
  bool 形式の後方互換コードを永続的に維持するか？
  (現状 x-splittable エンティティは receiving_receipt_line のみのため移行コストは小)

【D5】split UI の親行表示
  split した後、receiving_receipt_line_detail の view ページに:
  - 親行のリンク (parent_id → receiving_receipt_line) を表示するか？
  - 子行一覧を表示するか？
  → 本 cmd スコープに含めるか、別 cmd か？
```

---

## 10. North Star Alignment

```yaml
north_star_alignment:
  status: aligned
  reason: >
    split は受入/予約フローのコア操作。現状はAPI routeのみで
    UI・数量検証が皆無のため、実際のオペレーションで使えない。
    本設計により split が generator を通じて安全・汎用的に供給され、
    承認フローとの整合性も保たれる。
  risks_to_north_star:
    - "approvable 履歴を DELETE したまま放置すると受入履歴の監査証跡が失われ、コンプライアンスリスクになる"
    - "Σ検証なしのまま進むと数量不整合の split が通り、在庫台帳と受入記録が乖離する"
    - "UI なしの状態が続くと split 操作が開発者以外には実質不可能なままになる"
```
