# Approval Request 承認時イベント発火 設計書

> **Phase**: 設計のみ (実装は裁可後の別 cmd)
> **対象**: app-generator-2 / proj_c
> **作成**: 2026-06-21 | cmd_206
> **前提**: cmd_198/199 の承認フロー自動生成が完了済みであること
> **public_safe**: ✅ private 名・固有エンティティ名 含まず

---

## §1 概要・目的

### 1.1 背景と接続点

既存の承認フロー (cmd_198/199) は次の流れを自動生成する:

```
エンティティ作成
  → afterCreate フック (service_after_create.ts)
      → approval_request を approvable ごとに生成 (各 approval_flow に対応)
  → UI: ApprovalSection コンポーネントでステップ管理
  → 承認者が Approve/Reject ボタン操作
      → approveApprovalRequest() in lib/approval_request/actions.ts
          → approval_request.status = 1 (Approved)
          → approval_history に記録
          → 申請者に通知
```

**現状の欠如**: 全ての approval_request が Approved になった瞬間 (= 最終承認) に何も起きない。ビジネスロジックが空白になっている。

### 1.2 設計範囲

本設計は「最終承認確定時のイベント発火」機構を追加する:

| 対象 | 内容 |
|------|------|
| 発火トリガー | 最終承認確定の定義と検出ロジック |
| 発火後の副作用 | 標準生成コード / skeleton hook の 2 層構造 |
| generator 変更 | schema 宣言方法と生成テンプレートの変更点 |

**スコープ外 (本設計)**:
- reject/差戻し時の別フロー (将来の拡張候補)
- 通知システム (既存 `notify()` を再利用)
- approval_flow そのものの構造変更

---

## §2 発火契機の厳密定義 (DP-1)

### 2.1 「最終承認完了」の定義

```
ある approvable について、
  関連する全 approval_request の status = 1 (Approved)
  かつ 当該 approvable に対する最初の「全承認」状態であること (冪等性)
→ イベント発火
```

**理由**: 全 approval_flow に対応する approval_request は `afterCreate` フックで一斉に作成される。したがって「全 approval_request が Approved = 全フロー完了」が成立する。`followed_by` は承認ステップの表示制御 (誰がいつ Approve できるか) に使われるが、最終完了判定には不要。

### 2.2 並列分岐時の完了判定

```
approval_flow A (preceded_by=[])    → approval_request X
approval_flow B (preceded_by=[A])   → approval_request Y
approval_flow C (preceded_by=[])    → approval_request Z

最終完了 = X.status=1 AND Y.status=1 AND Z.status=1
         = COUNT(approval_requests WHERE approvable_id=? AND status!=1) == 0
```

DAG の深さや分岐数に依存せず、「全件 status=1」のシンプルな条件で判定できる。

### 2.3 reject/差戻し時の扱い

- reject 時: 発火しない (status=2 なので全件=1 条件を満たさない)
- resubmit 後の再承認: 再度 status=1 条件を満たす可能性がある
- **二重発火防止が必要** (§2.4 参照)

### 2.4 冪等性 — fire-once の実装候補

| 案 | 実装 | pros | cons |
|----|------|------|------|
| **★ 推奨** DB フラグ | `approvable.approved_at TIMESTAMP NULL` を追加。NULL の場合のみ発火し、同トランザクション内で now() をセット | トランザクション保証・再承認後の二重発火も防止・audit trail 代わりにもなる | schema migration 必要 |
| 状態機械 | approvable に `state` 列 (pending/approved/rejected) を追加し状態遷移で管理 | ユースケースが増えた時に拡張しやすい | 現状オーバーエンジニアリング |
| idempotency key | 外部 UUID をリクエストに含め DB で dedup | stateless な発火に適する | 承認 UI 改修が必要 |

**推奨: DB フラグ方式 (`approvable.approved_at`)**

```typescript
// approveApprovalRequest() 内のトランザクション拡張 (擬似コード)
await prisma.$transaction(async (tx) => {
  // 1. 現在の approval_request を Approved に更新
  await tx.approval_request.update({ where: { id }, data: { status: 1 } });

  // 2. この approvable の全 approval_request を再チェック
  const approvable = await tx.approvable.findUnique({
    where: { id: req.approvable_id },
    select: { id: true, approved_at: true, approval_requests: { select: { status: true } } },
  });

  const allApproved = approvable?.approval_requests.every(r => r.status === 1);
  const alreadyFired = approvable?.approved_at != null;

  if (allApproved && !alreadyFired) {
    // 3. approved_at をセット (fire-once フラグ)
    await tx.approvable.update({ where: { id: approvable.id }, data: { approved_at: new Date() } });

    // 4. 標準生成コード実行 (フィールド更新等)
    await runStandardOnApprovedActions(tx, entityName, entityId);

    // 5. skeleton hook 呼び出し (存在する場合)
    await callAfterApproveHook(tx, entityName, entityId);
  }
});
```

---

## §3 イベント種別の整理

### 3.1 副作用の分類

| 種別 | 例 | 生成戦略 |
|------|-----|---------|
| (a) 対象エンティティ自身のフィールド更新 | `leave_request.status = 'approved'`, `order.approved = true` | **標準生成** — schema 宣言から自動生成 |
| (b) 対象エンティティの他フィールド更新 | `leave_request.approved_at = now()`, `leave_request.final_approver_id = userId` | **標準生成** (シンプルな field=value) |
| (c) 関連エンティティの生成/更新 | 発注承認後に在庫引当レコードを作成 | **skeleton hook** |
| (d) 通知・外部連携 | メール送信、Webhook 呼び出し | **skeleton hook** (built-in notify は standard に含めても可) |

### 3.2 標準生成と skeleton の判定基準

```
標準生成 (x-approval.on_approved.set_fields が宣言されている場合):
  - 対象エンティティの1つ以上のフィールドを固定値または式で更新するだけ
  - 更新対象は approvable と 1:1 で繋がるエンティティ自身に限る
  - 生成コードで完結 (外部サービス呼び出し不要)

skeleton hook (emit_hook: true が宣言されている場合):
  - 上記以外のすべて
  - 手編集が必要なビジネスロジックを含む
  - 両方を同時に宣言することも可能 (先に set_fields を実行し、次に hook を呼ぶ)
```

---

## §4 コード生成戦略 (DP-2・DP-3)

### 4.1 標準生成: 対象エンティティのフィールド更新 (DP-2)

**対象**: schema で `x-approval.on_approved.set_fields` が宣言されたエンティティ

**生成コード配置**:
- `lib/approval_request/actions.ts` (現状は手書きファイル) に `runStandardOnApprovedActions()` ヘルパーを生成追加

生成コードのイメージ:

```typescript
// 生成される関数 (actions.ts 内に追加)
async function runStandardOnApprovedActions(
  tx: Tx,
  entityName: string,
  approvableId: string,
): Promise<void> {
  // schema x-approval.on_approved.set_fields から生成
  if (entityName === 'leave_request') {
    const lr = await tx.leave_request.findFirst({ where: { approvable_id: approvableId } });
    if (lr) {
      await tx.leave_request.update({ where: { id: lr.id }, data: { status: 'approved' } });
    }
  }
  // ... 他のエンティティも UNION ALL 形式で生成
}
```

**DP-2 オプション比較**:

| オプション | 適用範囲 | pros | cons |
|----------|---------|------|------|
| ★ A: status 専用 | status フィールドのみ標準生成 | シンプル・実装容易 | status 以外のフィールドは hook 必須 |
| B: 任意 field=value | schema 宣言した任意フィールドを標準生成 | 柔軟性高い・hook 不要なケースが増える | 生成ロジックの複雑度増 |
| C: 標準生成なし | 全ケース skeleton hook | 最もシンプルな生成 | ユーザーが全ケースで hook を書く必要 |

**推奨: Option B (任意 field=value)**
- status 専用では `approved_at: now()` や `final_state: 'completed'` 等の単純なケースも hook が必要になり不便
- 対象フィールドは自エンティティのスカラーフィールドに限定すれば生成ロジックは管理可能

### 4.2 skeleton hook: service_after_approve.ts (DP-3)

**対象**: schema で `x-approval.on_approved.emit_hook: true` が宣言されたエンティティ

**DP-3 オプション比較**:

| オプション | 説明 | pros | cons |
|----------|------|------|------|
| ★ A: 新規 stub ファイル | `lib/{entity}/service_after_approve.ts` — service_after_create パターンを踏襲 | 既存パターンと統一・再生成保全が明確 | 新テンプレートファイルの追加が必要 |
| B: actions.ts に inline | 生成コードを手書き actions.ts に直接挿入 | ファイル数増えない | 生成/手書きの境界が曖昧・再生成で消える危険 |
| C: 既存 afterCreate 流用 | service_after_create.ts に承認後処理も追加 | ファイル追加不要 | 責務が混在・create 時と approve 時で関心が異なる |

**推奨: Option A (新規 stub ファイル)**

生成テンプレート: `code_generator/templates/service_after_approve_stub.ts.jinja2`

```typescript
// 生成される stub: lib/{{ model }}/service_after_approve.ts
// ⚠️ このファイルは初回生成時のみ作成されます。手編集後は上書きされません。
{% if one_to_one_rels | selectattr('target', 'equalto', 'approvable') | list %}
import type { PrismaClient } from '@/app/generated/prisma/client';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * 最終承認確定時に呼び出されるフック。
 * TODO: このファイルを編集して、承認後のビジネスロジックを実装してください。
 */
export async function afterApprove(
  tx: Tx,
  entityId: string,
  approvableId: string,
  approvedByUserId: string,
): Promise<void> {
  // TODO: 承認後処理を実装する
  // 例: 他のエンティティ作成、外部連携、メール送信 等
}
{% else %}
// このエンティティは approvable と接続されていません。このファイルは使用されません。
export async function afterApprove(): Promise<void> {}
{% endif %}
```

**再生成保全方針**: `service_after_create_stub.ts.jinja2` と同じ "once-stub" パターン。
`generate.py` が対象ファイルを生成する前に `os.path.exists()` でチェックし、**存在する場合はスキップ**。初回のみ生成。

---

## §5 schema 宣言インタフェース (DP-4)

### 5.1 x-approval キー設計

**DP-4 オプション比較**:

| オプション | 構文位置 | pros | cons |
|----------|---------|------|------|
| ★ A: エンティティ top-level `x-approval` | `entity: { x-approval: { on_approved: {...} } }` | 他の `x-*` キー (x-search, x-ui 等) と対称・見つけやすい | 既存 `approvable_id` relationship 宣言と別場所 |
| B: relationship 下 `x-approval` | `approvable_id: { x-relationship: {...}, x-approval: {...} }` | 関連する宣言が一箇所にまとまる | x-* キーのスコープが relationship ではなく entity | 
| C: 別ファイル `approval_events.yaml` | 独立ファイルで宣言 | 既存 schema に手を加えない | 情報が分散・generator の読み込み場所追加 |

**推奨: Option A (エンティティ top-level `x-approval`)**

### 5.2 宣言構文の具体例

```yaml
# json_schema.yaml — approvable entity の例

entity_name:           # ユーザー定義エンティティ (例: leave_request, purchase_order 等)
  x-approval:
    on_approved:
      set_fields:                    # (optional) 標準生成: フィールド更新
        status: "approved"           # 文字列: その値をセット
        # approved_at: "__now__"     # 特殊値: 承認時刻をセット (reserved)
        # final_approver_id: "__approver_user_id__"  # 特殊値: 承認者ユーザーID
      emit_hook: true               # (optional) skeleton 生成: service_after_approve.ts を生成

# 両方指定する場合: set_fields → afterApprove() の順で実行
# set_fields のみ: hook ファイル生成なし
# emit_hook のみ: 標準フィールド更新なし・全処理を hook に委ねる
```

### 5.3 生成される hook の仕様

`emit_hook: true` の場合、生成される `lib/{entity}/service_after_approve.ts`:

| 要素 | 設計 |
|------|------|
| 関数名 | `afterApprove` |
| 引数 | `tx: Tx, entityId: string, approvableId: string, approvedByUserId: string` |
| 戻り値 | `Promise<void>` |
| 配置 | `lib/{entity}/service_after_approve.ts` |
| 再生成 | once-stub (ファイル存在時はスキップ) |
| 呼び出し元 | `lib/approval_request/actions.ts` の `approveApprovalRequest()` 内 (動的 import または 事前 import テーブル方式) |

---

## §6 既存資産との接続・generator 変更箇所

### 6.1 actions.ts への変更

`lib/approval_request/actions.ts` は現在**手書きファイル** (generated ではない)。
変更方針:

```
Option A: actions.ts を生成対象にする (BREAKING — 手書き内容が失われる)
★ Option B: actions.ts は手書きのまま。別ファイルで生成コードを提供し import する。
  - lib/approval_request/on_approved_dispatch.ts (生成)
    → 各エンティティの "全承認後アクション" をディスパッチする関数
  - actions.ts から on_approved_dispatch.ts を import して呼ぶ (1行追加のみ)
Option C: actions.ts にコメントマーカーを用いた部分生成 (複雑)
```

**推奨: Option B** — 最小侵襲。actions.ts は既存パターンを保護しつつ、生成コードを別ファイルに分離。

生成ファイル: `lib/approval_request/on_approved_dispatch.ts`

```typescript
// AUTO-GENERATED — DO NOT EDIT
// 生成元: code_generator/templates/on_approved_dispatch.ts.jinja2

{% for entity in approvable_entities %}
import { afterApprove as {{ entity.name }}AfterApprove }
  from '@/lib/{{ entity.name }}/service_after_approve';
{% endfor %}

export async function dispatchOnApproved(
  tx: Tx,
  entityName: string,
  entityId: string,
  approvableId: string,
  approvedByUserId: string,
): Promise<void> {
{% for entity in approvable_entities %}
  if (entityName === '{{ entity.name }}') {
{% if entity.set_fields %}
    // 標準フィールド更新 (from x-approval.on_approved.set_fields)
    await tx.{{ entity.name }}.update({
      where: { id: entityId },
      data: { {% for k, v in entity.set_fields.items() %}{{ k }}: {{ v | quote }}{% if not loop.last %}, {% endif %}{% endfor %} },
    });
{% endif %}
{% if entity.emit_hook %}
    await {{ entity.name }}AfterApprove(tx, entityId, approvableId, approvedByUserId);
{% endif %}
    return;
  }
{% endfor %}
}
```

`actions.ts` への変更 (手動で1回追加):

```typescript
// actions.ts に追加する import と呼び出し
import { dispatchOnApproved } from '@/lib/approval_request/on_approved_dispatch';

// approveApprovalRequest() のトランザクション内、approved_at セット後:
await dispatchOnApproved(tx, entityName, entityId, approvableId, userId);
```

### 6.2 generator テンプレートファイル変更候補

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `code_generator/generate.py` | 変更 | `x-approval` を読む build_context 追加。`approvable_entities` リストを生成。once-stub チェック追加 |
| `code_generator/templates/on_approved_dispatch.ts.jinja2` | 新規 | `lib/approval_request/on_approved_dispatch.ts` を生成 |
| `code_generator/templates/service_after_approve_stub.ts.jinja2` | 新規 | `lib/{entity}/service_after_approve.ts` を once-stub 生成 |
| `prisma/schema.prisma` (base) | 変更 | `approvable` に `approved_at DateTime?` を追加 |
| `prisma/migrations/` | 新規 | `ALTER TABLE approvable ADD COLUMN approved_at TIMESTAMP NULL` |
| `code_generator/json_schema.yaml` | 変更 | `approvable` に `approved_at` プロパティ追加 |

### 6.3 proj_c testbed での検証方針

```
検証エンティティ候補: leave_request (既に approvable 接続済み)
検証シナリオ:
  1. leave_request に x-approval.on_approved.set_fields: { status: "approved" } を追加
  2. generate-code → on_approved_dispatch.ts 生成確認
  3. leave_request を作成 → 承認フロー起動 → 全承認後に status = "approved" 確認
  4. emit_hook: true を追加 → service_after_approve.ts stub 生成確認
  5. 再 generate-code → stub ファイルが上書きされないこと (once-stub) を確認
  6. 二重発火テスト: 同一 approvable を reject→resubmit→approve → 1回のみ発火
ゲート: pytest + e2e API (SKIP=0 必須)
```

---

## §7 決定点 (DP) サマリ

| DP | 問題 | 推奨案 | trade-off |
|----|------|--------|-----------|
| **DP-1** | 終端完了セマンティクス・冪等性 | `approvable.approved_at` DB フラグ + トランザクション内チェック | schema migration 必要だが確実性・トレーサビリティ最高 |
| **DP-2** | 標準生成の適用範囲 | 任意 field=value (スカラーフィールド限定) | status 専用より柔軟。型安全を schema 宣言で担保 |
| **DP-3** | skeleton hook 機構 | 新規 stub `service_after_approve.ts` (once-stub 方式) | 既存 afterCreate パターンと統一。新テンプレート2本追加 |
| **DP-4** | schema 宣言構文 | エンティティ top-level `x-approval: { on_approved: { set_fields, emit_hook } }` | 他 `x-*` 拡張と一貫性あり。set_fields + emit_hook の組み合わせ可 |

---

## 付録: private 名チェック

提出前チェック: 本文に private 名の混入なし (OK)。
汎用エンティティ例 `entity_name` / `leave_request` を使用 (leave_request はシステム標準サンプルとして使用済みの公開可能な名称)。
