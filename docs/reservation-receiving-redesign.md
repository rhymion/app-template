# 予約(purchase_order)/受入(receiving_receipt) ライフサイクル再設計書

> ⚠️ **[廃止] この設計書は cmd_278 の方針転換により上書きされた。**
> **DP-1/DP-2/DP-3 は `docs/generic-primitives-redesign.md` の汎用プリミティブ設計に置換される。**
> **DP-4(認証再設計)のみ存置。** 変遷の記録として本ファイルは保持する。

> **種別**: 設計書（コード変更・実装なし）
> **Target**: app-template (this repository)
>           + `app-generator` (generator template変更)
> **作成**: 2026-07-05 | cmd_277 / design_277a
> **前提調査**: cmd_276 subtask_276a/276b

---

## 0. 背景と解決すべき問題

| バグ/問題 | 発見 | 内容 |
|---|---|---|
| ship/release body契約違反 | cmd_276a | UIボタンがqty未渡し、bodyキー名不一致 (`quantity` vs `requestedQty`/`releaseQty`) → 500 |
| ship/release/受入confirm 401 | cmd_276b | ブラウザfetchが`authenticateApiKey`専用routeに当たり常に401 |
| confirm route 無認証 | cmd_276b | `POST .../actions/confirm`に認証チェック皆無 → security bug |
| 受入フロー設計変更 | cmd_277 | receipt = 物理到着ログとして再定義、confirm 2段階フローを廃止 |
| inventory指定 | cmd_277 | receipt作成時にinventory(FK)を指定する設計 |

---

## 1. DP-1: purchase_order の per-line ship/release/cancel + 数量UI

### 1.1 現状

```
x-reservation:
  mode: count
  lines: items               # purchase_per_item = 注文明細行
  result:
    allocationEntity: inventory_allocation
    lineField: purchase_per_item_id
  actions:
    shipOrder:    { type: ship,    openStatuses: [reserved, partially_shipped] }
    releaseReservation: { type: release, openStatuses: [reserved, partially_shipped] }
    cancelReservation:  { type: cancel,  openStatuses: [reserved, partially_shipped] }
```

バグ: action_buttons.tsx.jinja2 がqty引数を受けず、bodyキー名も不一致。

### 1.2 設計方針

**per-line** = purchase_per_itemごとに ship/release/cancel を行う。
各 inventory_allocation は `purchase_per_item_id` でラインに紐付いているため、
action時に `purchase_per_item_id` を指定し、そのラインに属する allocation のみを操作する。

### 1.3 API仕様 (推奨案: Option A — 親エンドポイントにline contextを渡す)

```
POST /api/purchase_order/{id}/actions/ship
Body: { purchase_per_item_id: string, requestedQty: integer }

POST /api/purchase_order/{id}/actions/release
Body: { purchase_per_item_id: string, releaseQty: integer }

POST /api/purchase_order/{id}/actions/cancel
Body: { purchase_per_item_id: string }    # qty不要 (全残数量キャンセル or 3分割)
```

| 案 | 内容 | 推奨 |
|---|---|---|
| **A(推奨)** | 既存エンドポイントにlineフィールドを追加 | ルーティング変更なし、generator影響最小 |
| B | `/api/purchase_per_item/{id}/actions/ship` | 明細行エンティティにx-reservation追加が必要、エンドポイント数増 |

**Option A 推奨理由**: 現行の `_build_action_route_code` のルーティング規則を変えずに、
bodyにline contextを追加するだけで対応できる。inventory_allocationのフィルタに
`purchase_per_item_id` を追加する変更のみ。

### 1.4 generator SoT変更箇所

| ファイル | 変更内容 |
|---|---|
| `code_generator/templates/action_buttons.tsx.jinja2` | ①qty入力UIを追加(ship/release)、②bodyキー名を`requestedQty`/`releaseQty`に修正、③purchase_per_item_idをbodyに含める、④ボタンonClickがqtyとline_idを渡す |
| `code_generator/generators.py` `_build_action_route_code` L1137 | shipの`const { requestedQty }`、releaseの`const { releaseQty }`に `purchase_per_item_id` destructure追加 |
| `code_generator/generators.py` ship/release実装 | inventory_allocationのwhereにpurchase_per_item_idフィルタを追加 |

### 1.5 UI仕様

- purchase_order detail/edit ページの明細行(purchase_per_item)ごとに ship/release/cancel ボタンを配置
- ship/release ボタンには数量入力欄(`<input type="number" min=1 max={remaining_quantity}>`)を付属
- cancel は数量入力不要 (cmd_174/178: remaining_quantity + status で Done/Cancelled/Not-yet 3分割)
- ボタンはステータスに応じて表示/非表示 (openStatuses: [reserved, partially_shipped])

### 1.6 cancel 部分取消 (過去裁定 cmd_174/178 踏襲)

キャンセル粒度: **Done/Cancelled/Not-yet の3分割**
- Done = 既出荷済み (remaining_quantity 消費分)
- Cancelled = 今回キャンセル (今回指定量)
- Not-yet = 残残数量 (新しいallocationとして残す)

この設計は inventory_allocation を split/update する実装で、generator側の
`_build_action_route_code` cancel branch に実装される。

### 1.7 殿裁可点 DP-1

- [ ] **DP-1-A**: per-line指定方式 = Option A(親エンドポイントにline context追加) vs Option B(明細行エンドポイント)
- [ ] **DP-1-B**: cancel部分取消の3分割方式(Done/Cancelled/Not-yet)への同意 (過去裁定の再確認)
- [ ] **DP-1-C**: ship/release の quantity入力UIをdetail pageのinline inputにする方式への同意

---

## 2. DP-2: receiving_receipt = 物理到着ログ (confirm status廃止)

### 2.1 現状

```
receiving_receipt: { status: [0=draft, 1=confirmed, 2=cancelled], confirmed_at }
フロー: 作成(draft) → ReceivingConfirmForm → confirm(1=confirmed) → 在庫加算
```

バグ: ConfirmFormがGET /api/inventoryを直fetchして401。そもそも2段階フローが問題。

### 2.2 新設計

```
receiving_receipt: { status: [0=draft, 1=confirmed, 2=cancelled], confirmed_at }  ← フィールド温存
フロー: 作成時点で即座に在庫加算完結 (draft不要、statusは将来用途のみ)
```

**statusフィールドは温存するが、現在の confirm フローには使用しない。**
将来のQC却下・誤登録取消等の用途に備えて残す。

### 2.3 変更概要

| 項目 | 現状 | 新設計 |
|---|---|---|
| receipt作成 | draft状態で作成 | 作成時に inventory 更新を同時実行 |
| confirm アクション | ReceivingConfirmFormで在庫加算 | 廃止(routeは将来のために残しても可) |
| ReceivingConfirmForm | 在庫選択→confirm実行 | 廃止 or 作成フォームに置換 |
| x-custom-components | `ReceivingConfirmForm` を viewにmount | 不要になる(削除 or 変更) |

### 2.4 generator SoT変更箇所

| ファイル | 変更内容 |
|---|---|
| `code_generator/templates/receiving_confirm_form.tsx.jinja2` | 廃止または作成フォームへ再設計 |
| `code_generator/templates/receiving_confirm_route.ts.jinja2` | 廃止または保留(将来用途) |
| `code_generator/generate.py` x-receiving処理 | `inventoryMutation: create_receipt` 新値対応、または既存 `confirm_receipt` の動作変更 |
| `prj/code_generator/json_schema.yaml` | `x-receiving.policy.inventoryMutation` 値の変更(または新値追加) |

| 案 | 内容 | 推奨 |
|---|---|---|
| **A(推奨)** | `inventoryMutation: create_receipt`(新値)で作成時に在庫更新するrouteを生成 | 既存 confirm_receipt との後方互換を保ちつつ新規に定義 |
| B | `confirm_receipt`の実装を変更してcreate時に発火 | 既存スキーマ値を再利用できるが、意味が混乱する |

### 2.5 殿裁可点 DP-2

- [ ] **DP-2-A**: receipt作成=即座に在庫加算(confirm不要)の方針への同意
- [ ] **DP-2-B**: statusフィールド温存(消さないが現在未使用)の方針への同意
- [ ] **DP-2-C**: `inventoryMutation` 値を新値 `create_receipt` に変更する方式 vs 既存 `confirm_receipt` の意味変更

---

## 3. DP-3: receiving_receipt が inventory を指定 (FK/selector)

### 3.1 現状

receiving_receipt_line: `{ product_id, receipt_quantity, done_quantity, cancelled_quantity, outstanding_quantity }`
inventoryへのFKなし。

### 3.2 新設計: inventory_id を line に追加

```yaml
# json_schema.yaml 変更案
receiving_receipt_line:
  properties:
    inventory_id:              # 新規追加
      type: string
      pattern: "^c[a-z0-9]{24,}$"
      x-relationship:
        type: many-to-one
        target: inventory
        labelField: id          # 将来: lot_number or location で表示
```

**配置: receipt_line レベル(推奨)**

| 案 | 配置 | 推奨 |
|---|---|---|
| **A(推奨)** | `receiving_receipt_line.inventory_id` | 各明細行が独立したinventoryロットを指定できる(例: ロット番号違い) |
| B | `receiving_receipt.inventory_id` | receipt全体で1つのinventory。明細行数が複数の場合に制約 |

Option A 推奨理由: 1回の受入で複数ロット/棚のinventoryに分けて積むユースケースに対応できる。
将来の「新規inventory作成」機能もline単位の方が拡張しやすい。

### 3.3 在庫加算ロジック (DP-2との結合)

```typescript
// receiving_receiptのcreate route (DP-2の新generate)
await prisma.$transaction(async (tx) => {
  // 1. receipt作成
  const receipt = await tx.receiving_receipt.create({ data: { receipt_no, purchase_order_id, ... } });
  // 2. 各lineを作成
  for (const line of lines) {
    await tx.receiving_receipt_line.create({ data: { receiving_receipt_id: receipt.id, product_id: line.product_id, receipt_quantity: line.receipt_quantity, inventory_id: line.inventory_id } });
    // 3. inventory.quantity を increment
    await tx.inventory.update({ where: { id: line.inventory_id }, data: { quantity: { increment: line.receipt_quantity } } });
  }
});
```

### 3.4 UI仕様

- receiving_receipt 作成フォーム:
  - 明細行ごとに `inventory_id` のselectorを表示
  - selectorはproduct_idに基づいてfilterされたinventory一覧を表示
  - 受入数量(receipt_quantity)を各行に入力
- UIはブラウザセッション認証で動作(DP-4の authenticateRequest() 適用後)

### 3.5 将来拡張の余地

「receipt で新規inventory作成」のためのフック:
- `inventory_id` が null の場合に新規inventory作成 (lot_number, location 等を入力)
- 今回はselect-existingのみ実装 → `inventory_id: required` として設計

### 3.6 generator SoT変更箇所

| ファイル | 変更内容 |
|---|---|
| `prj/code_generator/json_schema.yaml` | `receiving_receipt_line.inventory_id` FK追加 |
| `prisma/schema.prisma` (生成物) | `ReceivingReceiptLine.inventory_id` + `@relation` 追加 |
| `code_generator/generate.py` x-receiving処理 | inventory_id をlineに含むcreate transactionを生成するロジック追加 |
| UIコンポーネントテンプレート | receiving_receipt 作成フォームにinventory selectorを追加 |

### 3.7 殿裁可点 DP-3

- [ ] **DP-3-A**: inventory_idの配置 = line レベル(推奨A) vs receipt レベル(B)
- [ ] **DP-3-B**: 今回はselect-existing only(inventory_id required)で実装する方針への同意
- [ ] **DP-3-C**: 将来の「新規inventory作成」をnullable拡張として留保する設計方針への同意

---

## 4. DP-4: 認証再設計 — session優先 + API keyフォールバック

### 4.1 現状の問題

| Route種別 | 現在の認証 | ブラウザ動作 |
|---|---|---|
| 標準entity REST (`api_route.ts.jinja2`) | `authenticateApiKey` のみ | **401** (session不可) |
| action route (`_build_action_route_code`) | `authenticateApiKey` のみ | **401** (session不可) |
| confirm route (`receiving_confirm_route.ts.jinja2`) | **なし** | 誰でも書き込み可能 |
| upload route | `auth()` (NextAuth session) | 正常 |
| notifications/mark-read | `getSessionUserId()` | 正常 |

### 4.2 新設計: authenticateRequest() 関数の新設

```typescript
// lib/api-auth.ts に追加
export async function authenticateRequest(
  request: NextRequest
): Promise<{ userId: string }> {
  // Step 1: セッション確認 (NextAuth cookie)
  const sessionUserId = await getSessionUserId();
  if (sessionUserId) return { userId: sessionUserId };

  // Step 2: API key フォールバック (既存authenticateApiKeyを再利用)
  return authenticateApiKey(request);
}
```

`getSessionUserId()` は `next/cache` の `cache()` でメモ化済み(同一リクエスト内での
重複DB呼び出しなし)。

### 4.3 影響範囲評価

**変更対象テンプレート/箇所:**

| 対象 | 変更内容 | 影響entity数 |
|---|---|---|
| `code_generator/templates/api_route.ts.jinja2` | `authenticateApiKey` → `authenticateRequest` | 全entity(10〜20) |
| `code_generator/generators.py` `_build_action_route_code` | `authenticateApiKey` → `authenticateRequest` | x-reservationを持つ全entity |
| `code_generator/templates/receiving_confirm_route.ts.jinja2` | `authenticateRequest` を追加(現在なし) | receiving_receipt |
| `lib/api-auth.ts` | `authenticateRequest()` 関数を追加 | (共通ライブラリ) |

**変更不要なもの:**
- `app/api/upload/route.ts`: 既に `auth()` 使用
- `app/api/notifications/mark-read/route.ts`: 既に `getSessionUserId()` 使用
- `app/api/test-utils/reset-caches/route.ts`: テスト専用エンドポイント(auth不要の設計)
- 手書きroute群(approval_request, auth): 個別対応維持

### 4.4 既存APIテスト(cypress)との後方互換性

**問題なし。** cypress api e2e は全て `X-API-Key` ヘッダを明示的に設定して叩く。
`authenticateRequest()` の Step 1(セッション確認)はcypress環境ではセッションが
ないため `null` を返し、Step 2(API key)にフォールバックする → 現行と同一の挙動。

e2e変更は不要。

### 4.5 セキュリティ評価

| リスク | 評価 | 対策 |
|---|---|---|
| CSRF | セッション経由のPOST = サードパーティサイトからのリクエストにsessioncookieが付く懸念 | NextAuth v5のデフォルト: `SameSite=Lax`(クロスオリジンPOSTにはcookieが付かない)。追加対策不要。 |
| session偽装 | セッションはNextAuthがJWT署名/暗号化管理 | 既存のセッション管理と同一リスク |
| API key漏洩 | API keyフォールバックは既存と同一 | 既存のセキュリティポリシーを踏襲 |
| 権限昇格 | sessionユーザーとAPI keyユーザーで同一の`requireApiPermission()`を通過 | 権限チェックに変更なし。新規リスクなし |

**評価: 新たなセキュリティリスクは生じない。**

### 4.6 オプション比較

| 案 | 内容 | 推奨 |
|---|---|---|
| **A(推奨)** | `authenticateRequest()` = session優先 + API key fallback | 変更量最小、後方互換、実装シンプル |
| B | ブラウザ向け内部専用routeを別途生成 | route数倍増、generator複雑化、推奨しない |

### 4.7 generator波及の重要性

**これはgenerator全体(全生成アプリの全entity route)に波及する広域変更。**
proj_cだけでなく、app-generatorを使う全プロジェクト(proj_b, proj_f等)の
生成物に影響する。

殿の明確な同意を要する理由:
1. 全entityのAPIが「ブラウザセッションからも叩ける」状態になる
2. 既存のAPI-key専用設計の意図的な制約が緩和される
3. 将来の全generate-codeで新テンプレートが使われる

### 4.8 殿裁可点 DP-4

- [ ] **DP-4-A**: `authenticateRequest()` = session優先 + API key fallback 方式への同意
- [ ] **DP-4-B**: generator全体への広域波及 (全entity routeがブラウザセッション対応になること)への明確な同意
- [ ] **DP-4-C**: CRSFリスクは `SameSite=Lax` で充足という評価への同意

---

## 5. 設計の統合: DP-2 + DP-3 のエンドポイント設計

### 5.1 receiving_receipt 作成フロー (新)

```
POST /api/receiving_receipt
Body: {
  receipt_no: string,
  purchase_order_id?: string,
  asn_id?: string,
  lines: [
    { product_id, receipt_quantity, inventory_id }
  ]
}

Transaction:
  1. receiving_receipt.create
  2. receiving_receipt_line.createMany (with inventory_id)
  3. inventory.update(where: id=line.inventory_id, increment: receipt_quantity) × lines数
```

認証: `authenticateRequest()` (DP-4)

### 5.2 receiving_receipt_line への UI フロー

1. 受入receipt作成画面:
   - receipt_no, purchase_order(任意), asn(任意) を入力
   - 明細行を追加: product → inventory selector (product_idでフィルタ) → 受入数量
   - [作成] ボタン → POST /api/receiving_receipt → 即座に在庫加算完結

2. ConfirmForm は廃止(または将来のQC却下用途のために保留)

---

## 6. 実現性・工数・リスク評価

### 6.1 変更規模

| DP | 変更ファイル数(generator) | 複雑度 |
|---|---|---|
| DP-1 (per-line + qty UI) | 2-3 (action_buttons, generators.py action) | 中 (bodyキー + UI拡張) |
| DP-2 (receipt=log) | 3-4 (generate.py, confirm_form/route template) | 中-高 (transaction生成ロジック) |
| DP-3 (inventory FK) | 2-3 (schema, generate.py, 作成フォーム) | 中 (FK + selector UI) |
| DP-4 (auth) | 2 (api-auth.ts, api_route.ts.jinja2 + generators.py) | 低 (関数追加+置換) |

DP-4は技術的難度が最も低い(関数追加+文字列置換)。DP-2/DP-3はcreate transaction生成が最も複雑。

### 6.2 失敗シナリオと対策

| シナリオ | リスク | 対策 |
|---|---|---|
| DP-4でgetSessionUserId()がnullを誤って返す | 認証がAPI keyへ不必要にfallbackする | テストケース: ログイン済みセッションで認証が通ることを確認 |
| DP-2で在庫加算transactionが部分失敗 | receipt作成済み+在庫加算なし/半端 | Prismaの$transactionで全or無を保証 |
| DP-3でinventory_id必須化によりマイグレーション失敗 | 既存データにinventory_idがない | 既存receiving_receipt_lineがなければ問題なし(app-template = 検証用testbed) |
| generator全波及で既存proj_b/f e2eが壊れる | api_route変更で意図せず動作変更 | DP-4はsession first → API key fallbackなので既存API keyテストは影響なし |
| DP-1でaction_buttons変更が他entity(f)に波及 | x-reservation ship/releaseを持つ全entityに影響 | テンプレート変更はprojcで検証後に他projに展開 |

### 6.3 実装順序の推奨

1. **DP-4**: 最優先。認証基盤として他DP実装の前提条件。技術的リスク最低。
2. **DP-1**: body契約修正はDP-4と並行可能。per-line UIは追加実装。
3. **DP-3**: schema変更 + create transaction実装。マイグレーション含む。
4. **DP-2**: DP-3と密結合。DP-3完了後に合わせて実装。

---

## 7. 殿裁可点 一覧 (dashboard 🚨要裁可 転記用)

### DP-1: per-line ship/release/cancel + 数量UI

| 裁可ID | 内容 | 推奨案 |
|---|---|---|
| DP-1-A | per-line指定方式: **A(親エンドポイントにpurchase_per_item_idをbody追加)** vs B(明細行エンドポイント) | **A** |
| DP-1-B | cancel部分取消の3分割方式(Done/Cancelled/Not-yet = 過去裁定cmd_174/178)への同意 | 過去裁定踏襲 |
| DP-1-C | ship/release の quantity入力UI = detail pageのinline input方式への同意 | **A** |

### DP-2: receiving_receipt = 到着ログ

| 裁可ID | 内容 | 推奨案 |
|---|---|---|
| DP-2-A | receipt作成=即座に在庫加算(confirm不要)の方針への同意 | **A(新方針)** |
| DP-2-B | statusフィールド温存(消さないが現在未使用)の方針への同意 | **温存** |
| DP-2-C | inventoryMutation新値 `create_receipt` 方式 vs 既存 `confirm_receipt` の意味変更 | **A(新値)** |

### DP-3: receiving_receipt が inventory を指定

| 裁可ID | 内容 | 推奨案 |
|---|---|---|
| DP-3-A | inventory_idの配置 = **line レベル**(各明細行が独立したinventoryを指定) vs receipt レベル | **line レベル** |
| DP-3-B | 今回はselect-existing only(inventory_id required)で実装 | **select-existing** |
| DP-3-C | 将来の「新規inventory作成」をnullable拡張として留保する設計方針への同意 | **将来留保** |

### DP-4: 認証再設計

| 裁可ID | 内容 | 推奨案 |
|---|---|---|
| DP-4-A | `authenticateRequest()` = session優先 + API key fallback 方式への同意 | **A** |
| DP-4-B | generator全体への広域波及(全entity routeがブラウザセッション対応になること)への**明確な同意** | **要明示同意** |
| DP-4-C | CSRFリスクは `SameSite=Lax` で充足という評価への同意 | **充足** |

---

## 8. コード変更・実装を一切行っていないことの確認

- ブランチ切替: なし (`rebase/app-template-wip` を維持)
- コード変更: なし (この設計書ファイルの新規作成のみ)
- git add/commit/generate-code: 未実行
- 実装はすべて殿裁可後の別cmdで行う
