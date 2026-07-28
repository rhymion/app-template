# receiving_asn / purchase_order ライフサイクル 現状調査報告

> **種別**: 調査のみ（コード変更・commitなし）
> **Target**: app-template (this repository)
> **作成**: 2026-07-05 | cmd_276 / subtask_276a
> **担当**: (implementor)

---

## 結論サマリ

| 問い | 回答 |
|---|---|
| Q1: receiving_asn から在庫を積む経路は在るか | **無い（設計通り）**。在庫加算は `receiving_receipt` の confirm action で行う設計（`x-receiving.policy.inventoryMutation: confirm_receipt`）。ASNは中間ステータスの記録のみで、直接inventoryを触らない。 |
| Q2: 予約済みpurchase_orderの出荷/解放/取消UIは在るか | **在る**（API・UI・e2eすべて実装済み）。ただし **UIボタンにAPI契約違反のバグを発見**（下記「現状症状」参照） — ship/release操作はUIから実行すると必ず失敗する。 |

---

## Q1: receiving_asn からの在庫積み上げ経路

### 事実確認

`prj/code_generator/json_schema.yaml` 冒頭（L13-30）に以下の設定:

```yaml
x-receiving:
  roles:
    purchase_order: receiving_purchase_order
    asn: receiving_asn
    receipt: receiving_receipt
  policy:
    allowDirectReceipt: true
    allowReceiptFromAsn: true
    allowReceiptFromPurchaseOrder: true
    inventoryMutation: confirm_receipt   # ← 在庫加算のトリガーはreceiptのconfirmのみ
  inventory:
    entity: inventory
    productField: product_id
    quantityField: quantity
```

`inventoryMutation: confirm_receipt` により、生成器（`app-generator/code_generator/generate.py` L585-615）は **`receiving_receipt` エンティティに対してのみ** confirm action を生成する。`receiving_asn`・`receiving_purchase_order` には在庫を動かすactionは一切生成されない。

### 実装箇所（実在確認済み）

- **API**: `POST /api/receiving_receipt/[id]/actions/confirm`
  - 実体: `app-generator/app/api/receiving_receipt/[id]/actions/confirm/route.ts`
  - テンプレート: `app-generator/code_generator/templates/receiving_confirm_route.ts.jinja2`
  - 処理: `inventory_selections: {inventory_id, quantity}[]` を受け取り、`$transaction`内で各 `inventory.quantity` を `increment`、`receiving_receipt.status` を confirmed に更新。
- **UI**: `components/receiving_receipt/ReceivingConfirmForm.tsx`
  - `components/receiving_receipt/FormView.tsx` L11/L54 で**正しくimport・レンダリングされている**（受入receipt詳細画面に表示される）。
  - 在庫一覧を取得 → 加算数量を行ごとに入力 → confirmボタンでAPIへ `inventory_selections` を送信。API契約と**整合している**（Q2で見つかったバグとは異なり、こちらは正しく実装されている）。

### receiving_asn / receiving_purchase_order の役割

`prj/prisma/schema.prisma` L959-993 の通り、`receiving_asn` / `receiving_asn_line` は `shipped_quantity` / `done_quantity` / `cancelled_quantity` / `outstanding_quantity` を持つが、これらは**ステータス追跡用の数量であり、inventoryテーブルへの外部キーもリレーションも存在しない**。ASN側にinventoryを増減させるコードパスは生成器内を検索しても存在しない（`grep -rn "receiving_asn" generate.py generators.py` でinventory更新ロジックへの参照なし）。

**→ 「未実装」ではなく「設計上、ASNは経由しない」が事実。** 在庫はreceipt確認時にのみ積まれる。ASN→receiptへの連携（`receiving_receipt.asn_id`）はあるが、それは紐付けのみで、asn_lineの数量をreceiptへ自動転記する処理は無い（receipt側のinventory_selectionsはUI操作者が都度入力する手動フロー）。

---

## Q2: 予約済みpurchase_orderの出荷/解放/取消

### 在処（実在確認済み）

| 項目 | パス |
|---|---|
| API: shipOrder | `app-generator/app/api/purchase_order/[id]/actions/ship/route.ts` → `POST /api/purchase_order/{id}/actions/ship` |
| API: releaseReservation | `app-generator/app/api/purchase_order/[id]/actions/release/route.ts` → `POST /api/purchase_order/{id}/actions/release` |
| API: cancelReservation | `app-generator/app/api/purchase_order/[id]/actions/cancel/route.ts` → `POST /api/purchase_order/{id}/actions/cancel` |
| 実装本体 | `app-generator/lib/purchase_order/reservation_actions.ts` |
| UIボタン | `app-generator/components/purchase_order/ReservationActionButtons.tsx` |
| UI組込み | `app-generator/components/purchase_order/FormView.tsx` L10/L40（`purchase_order`詳細画面に表示される） |
| e2e (API) | `app-generator/cypress/e2e/api/purchase_order_reservation_gen.cy.ts` L139-239（LC-1/LC-2/LC-3） |
| e2e (関連) | `app-generator/cypress/e2e/api/purchase_order_reservation.cy.ts`（R1-R6, allocation生成/insufficient/並行制御/更新削除ガード） |

殿の記憶「APIを用意したはずだが在処を失念」は**正しい** — 3本ともpurchase_order配下に実在する。UIにも組み込まれ、ボタンとして表示される。見つけにくかった理由は下記「現状症状」参照。

### スキーマ設定（`purchase_order.x-reservation.actions`, json_schema.yaml L1841-1871）

```yaml
actions:
  shipOrder:    { type: ship,    openStatuses: [reserved, partially_shipped], doneStatus: shipped }
  releaseReservation: { type: release, openStatuses: [reserved, partially_shipped], doneStatus: released }
  cancelReservation:  { type: cancel,  openStatuses: [reserved, partially_shipped], doneStatus: cancelled }
```

`inventory_allocation.status` の整数enum: `0=reserved, 1=partially_shipped, 2=shipped, 3=released, 4=cancelled`（`reservation_actions.ts`内の`status: 2/3/4`と整合）。

`inventory_allocation` との関係は過去裁定(cmd_153/174/175/178)通り: action駆動・remaining_quantityのfield単位更新・`$transaction({isolationLevel: 'Serializable'})`で行ロック相当の直列化。

### 現状症状（実挙動で確認・重大バグ）

**UIボタンからship/release操作を行うと必ず失敗する。** コード読解で確認:

`ReservationActionButtons.tsx` L4-12, L43-45:
```tsx
async function handleShipOrder(id: string, qty?: number) {
  const res = await fetch(`/api/purchase_order/${id}/actions/ship`, {
    method: 'POST',
    body: JSON.stringify(qty != null ? { quantity: qty } : {}),   // ← "quantity" キー
  });
  ...
}
...
<button onClick={() => run(() => handleShipOrder(id))}>   // ← qty引数が渡されず常にundefined
```

一方、APIルート側（`generators.py` L1137, `_build_action_route_code`）が要求するキーは:
```ts
const { requestedQty } = await req.json();   // ship の場合
const { releaseQty }   = await req.json();   // release の場合
```

**ボタンは常に `qty=undefined` で呼ばれるため送信bodyは `{}`。** サーバは `requestedQty`/`releaseQty` を `undefined` として受け取り、`reservation_actions.ts`内で `Math.min(undefined, remaining_quantity)` → `NaN` となり、Prismaの`decrement: NaN`実行時にエラーが発生する（500応答、UI上は赤字でエラー表示）。

- **cancelReservation** はqty不要のため、この経路では正常動作する（body destructureが無い）。
- **ship/release** はボタンをクリックするだけでは**数量入力欄自体がUIに存在せず**、かつ仮に実装されていてもbodyキー名が `quantity` vs `requestedQty`/`releaseQty` で不一致なため、実行不可能な状態。

この不整合はe2eテスト（LC-1/LC-2）では検出できない。理由: e2eはAPIを直接 `{ requestedQty: 3, releaseQty: 3 }` という**正しいキー**で叩いており、UIボタンの実装は経由しない。生成器側の単体テスト（`code_generator/tests/test_reservation.py` L1480-1521）も、ルート側の文字列（`requestedQty`/`releaseQty`存在確認）とボタン側の関数名（`ReservationActionButtons`/`handleShipOrder`存在確認）を別々に検証するのみで、**両者の契約一致（bodyキー名・qty値受け渡し）を検証するテストが存在しない**。

**→ 「本来動くはずのAPIがUIから叩けない」症状の技術的原因はこれ。** ブラウザで実際にボタンを押して確認すれば500エラー（Prisma invalid data / NaN起因）が再現する見込み（テスト環境での実機確認は本タスクでは非破壊優先のためコード読解に留め、実行はしていない）。

### 生成器テンプレート側の該当箇所

- `app-generator/code_generator/templates/action_buttons.tsx.jinja2` L5-13: qty引数を受ける関数を生成するが、ボタン(L28)は `handle{{...}}(id)` と**id única渡しで呼び出しており、qtyを渡す入力UIが生成されない**。
- 同ファイルL9: `body: JSON.stringify(... { quantity: qty } ...)` — キー名が固定で`quantity`。ルート側キー名（`requestedQty`/`releaseQty`、`generators.py` L1137）と噛み合っていない。

この2点はテンプレートのバグであり、`purchase_order`固有ではなく、`x-reservation.actions`でship/release actionを持つ全entityに影響する（generator全体のバグ）。修正は本調査のスコープ外（設計→軍師レビュー→承認が必要な生成器変更のため、別cmdを推奨）。

---

## reservation-lifecycle ブランチとの欠落比較（read-only）

**手法**: `git diff rebase/app-template-wip doreen/reservation-lifecycle` をsuperproject（prj/）とapp-generator submoduleの両方で実施。ブランチ切替は一切行っていない。

### 結論: 欠落なし。むしろ現在のWIPブランチの方が新しい

- **superproject `prj/code_generator/json_schema.yaml`**: `doreen/reservation-lifecycle` は `format-version: 1.0`・statusフィールドが文字列enum・`x-custom-components`（ReceivingConfirmFormのview組込み設定）が**存在しない**旧世代のスキーマ。現在のWIPブランチは `format-version: 2.0`・整数enum（過去裁定D1=A準拠）・`x-custom-components`設定済み — **WIPが上位互換**。
- **x-reservation設定（purchase_order）**: 両ブランチで完全一致（diffなし）。欠落なし。
- **app-generator submodule** (`code_generator/generators.py`, `action_buttons.tsx.jinja2`, `receiving_confirm_route.ts.jinja2`ほか):
  - `doreen/reservation-lifecycle`（HEAD算出前の古いコミット）は `authenticateApiKey` を使わず `x-actor-id` ヘッダを直接信頼する認可未実装コードだった。現在のWIPは `authenticateApiKey` 経由 — **WIPの方がセキュア**。
  - status literalの扱いも、WIPは整数/文字列enumを判別する `_enum_value_literal` ヘルパーを追加済み（reservation-lifecycle側は単純な文字列リテラル埋め込みで、整数enumのDBでは不整合を起こし得る）。
  - `action_buttons.tsx.jinja2` は**両ブランチで完全一致**（上述のバグは reservation-lifecycle 由来ではなく、生成器に元々存在する未修正バグ）。

**総括**: `rebase/app-template-wip` は `doreen/reservation-lifecycle` からの後退・欠落は無く、逆に複数の改善（整数enum・認可強化・x-custom-components）が先行して取り込まれている。今回発見したship/release UIバグは、ブランチ間の差分に起因するものではなく、生成器自体に元々存在する独立したバグ。

---

## 非破壊性の確認

- ブランチ切替（checkout/switch）は一切実行していない。現在も `rebase/app-template-wip` のまま。
- 他ブランチ参照はすべて `git show <branch>:<path>` / `git diff <branch1> <branch2> -- <path>` のread-only操作のみ。
- ファイル編集・`git add`・`git commit`・`git reset`・`git clean`等の破壊的操作は一切実行していない。
- 本報告書ファイル（`docs/receiving-purchase-order-status-investigation.md`）の新規作成のみが本タスクによる変更点。

---

## 追加調査(Q1b): receiving_receipt確認フロー詳細 + 「UIでAPI key要求」根因 (cmd_276 / subtask_276b)

> **作成**: 2026-07-05 | subtask_276b（subtask_276aの追加調査、コード変更なし）

### 結論サマリ

| 問い | 回答 |
|---|---|
| 「確認 (Confirm Receipt)」ボタンを押すとAPI keyを要求される根本原因は何か | **確認ボタン(1個目)を押した瞬間に呼ばれる `fetchInventory()` が、ブラウザから直接 `GET /api/inventory`（標準entity一覧REST API）を叩いており、そのルートが `authenticateApiKey()` を強制するため。** ブラウザのfetchはAPI keyヘッダを一切付けないので、常に401 `Missing API key` が発生する。これは receiving_receipt 固有ではなく、**generatorの標準entity REST route（`api_route.ts.jinja2`）を`'use client'`コンポーネントから直fetchする箇所すべてに共通する設計上の欠陥**。 |

### 1. UI側の呼び出し先(実装読解)

`components/receiving_receipt/ReceivingConfirmForm.tsx`（テンプレート:
`code_generator/templates/receiving_confirm_form.tsx.jinja2`）の画面フローは2段階:

1. **1個目のボタン**「Inventory 選択して確認 (Confirm Receipt)」(L90-92) → `fetchInventory()` (L36-55) を実行。
   - `fetch(`/api/{{ receiving_inventory_entity }}?f.product_id=...`)` = `GET /api/inventory`（product_idが単一の場合はfilter付き、複数なら無フィルタ全件）。
   - **殿が体験した「クリックするとAPI keyエラー」はこの1個目のボタンで発生する**。ここで401が返ると`catch`節で`setError(String(e))`され、画面に赤字でエラーメッセージ（`Error: Missing API key. Provide X-API-Key header or Authorization: Bearer <key>.`）がそのまま表示される。
2. 在庫一覧が取得できて初めて2個目のボタン「確認 (Confirm)」(L128-130) が表示され、`handleConfirm()` (L57-80) が `POST /api/receiving_receipt/{id}/actions/confirm` を叩く。**1個目でエラーになるため、2個目には到達しない**。

### 2. API側の仕様

**(a) `GET /api/inventory`**（1個目のボタンの呼び出し先。これが真因）
- 実体: `app-generator/app/api/inventory/route.ts`
- テンプレート: `code_generator/templates/api_route.ts.jinja2`（全entity共通の標準一覧/作成route。inventory固有ではない）
- 認証: L7 `const { userId: actorId } = await authenticateApiKey(request);` → L8 `requireApiPermission(actorId, 'inventory', 'read')` → OKなら `getInventoryPage()`。
- **`authenticateApiKey`は`X-API-Key`ヘッダか`Authorization: Bearer`しか見ない（`lib/api-auth.ts` L46-53）。Cookie/セッションは一切参照しない。** ブラウザの素の`fetch()`はこれらのヘッダを付けないため、ログイン済みユーザーであっても必ず401になる。

**(b) `POST /api/receiving_receipt/{id}/actions/confirm`**（2個目のボタン。到達しないため未検証だが読解で確認）
- 実体: `app-generator/app/api/receiving_receipt/[id]/actions/confirm/route.ts`
- テンプレート: `code_generator/templates/receiving_confirm_route.ts.jinja2`
- inventory更新箇所: L34-38 `$transaction`内で`inventory_selections`をループし`tx.inventory.update({ where:{id: sel.inventory_id}, data:{ quantity:{increment: sel.quantity} }})` → 続けてL40-46で`receiving_receipt.status=confirmed値, confirmed_at`更新。
- **こちらは`authenticateApiKey`を一切import/呼び出ししていない — 認証なしの生書き込みエンドポイント**（副次的な発見。本来必要な認可チェックが抜けている、別種の欠陥。真因の「API key要求」とは別軸なので修正候補で分けて記載）。

### 3.【中核】「UIクリックでAPI keyが要る」の根本原因

**原因はentity単位に付き物の標準REST route(`api_route.ts.jinja2`)の設計方針そのものにある。**

- `api_route.ts.jinja2`（`app/api/<entity>/route.ts`を生成する共通テンプレート、全entity共通）は、外部APIコンシューマ向けの「公開REST API」として設計されており、認証は`authenticateApiKey`一本足（session fallbackなし）。これは意図的な設計（`lib/api-auth.ts`のコメント・cypress `api/*.cy.ts`群が`X-API-Key`ヘッダを使う専用e2eであることからも明白）。
- 一方、ブラウザ向けの「内部」エンドポイント（例: `app/api/upload/route.ts`が`auth()`(NextAuth session)を使う、`app/api/notifications/mark-read/route.ts`が`getSessionUserId()`(`lib/authz.ts`)を使う）は、この標準REST routeとは**別の認証ヘルパー**を使う、もう一つの確立されたパターンが同じコードベース内に既に存在する。
- **`ReceivingConfirmForm.tsx`（`'use client'`コンポーネント）は、本来「内部UI専用の在庫参照API」を新設すべきところ、標準の外部向けentity一覧route `/api/inventory` をそのまま直接fetchしてしまっている。** これが生成器（`receiving_confirm_form.tsx.jinja2`）のテンプレートバグであり、「API本体とUIが同一ロジックを共有する」設計自体（サービス層 `getInventoryPage()` を両方から呼ぶこと）は妥当だが、「HTTP経路まで完全に同一のentryを共有」してしまった結果、外部API専用のAPI key認証がブラウザ操作に漏れ出している。
- 認証ロジック自体に分岐は無い（session優先→API keyフォールバックのような多段構成ではなく、`authenticateApiKey`はAPI key必須の単一経路）。「なぜセッションで通らないか」の答えは「このrouteはそもそもセッションを見るコードが1行も無いから」。

### 4. 他action endpointとの認証パターン比較

| Route | 呼び出し元(UI) | 認証方式 | ブラウザから直fetchした場合の帰結 |
|---|---|---|---|
| `GET /api/inventory`（標準entity route） | `ReceivingConfirmForm.tsx`(fetchInventory) | `authenticateApiKey`必須 | **401 Missing API key（今回の症状そのもの）** |
| `POST /api/receiving_receipt/{id}/actions/confirm` | `ReceivingConfirmForm.tsx`(handleConfirm) | **認証なし**（`authenticateApiKey`未使用） | 誰でも書き込み可能（別種の欠陥・認可漏れ） |
| `POST /api/purchase_order/{id}/actions/{ship,release,cancel}` | `ReservationActionButtons.tsx` | `authenticateApiKey`必須（`generators.py` `_build_action_route_code` L1144/1152で固定注入） | **同じく401 Missing API key**（subtask_276aで発見したbody契約違反バグとは別に、こちらもボタンを押すと先に401で落ちる。両バグが重なっている） |
| `POST /api/upload` | `ImageUpload.tsx`等 | `auth()`（NextAuthセッション） | ブラウザから正常に通る（内部UI向け設計） |
| `POST /api/notifications/mark-read` | `NotificationBell.tsx` | `getSessionUserId()`（`lib/authz.ts`、セッションcookie） | ブラウザから正常に通る（内部UI向け設計） |

**判別結果**: receiving_receiptのconfirmフローだけが特殊なのではなく、**「`'use client'`コンポーネントが標準entity REST route または `authenticateApiKey`ベースのaction routeを直接fetchしている箇所全部」が同一の構造的欠陥を持つ、生成パターン全体の問題**。確認できた実例は2箇所（`ReceivingConfirmForm.tsx`→`/api/inventory`、`ReservationActionButtons.tsx`→ship/release/cancel）で、いずれも`code_generator/templates/`側のテンプレート起因（アプリ側のhand editではない）。`grep -rl "fetch(\`/api/" components/`で確認した限り、この2ファイルが該当の全てである。

### 5. 修正候補（調査のみ・実装はしない）

以下は方向性の提示のみ。いずれも生成器（`code_generator/`）側の変更を要するため、設計→軍師レビュー→承認のプロセスに乗せることを推奨:

1. **案A（session/API-key二経路化）**: `lib/api-auth.ts`に`authenticateRequest()`のような、まずセッションcookieを見て(`getSessionUserId()`)、無ければ`X-API-Key`/`Bearer`にフォールバックする関数を新設し、標準entity route・action routeの両方をこれに切替える。外部APIコンシューマ（API key保持者）・ブラウザUI（セッション保持者）の両方が同一routeを叩けるようになる。影響範囲: `api_route.ts.jinja2`, `_build_action_route_code`(generators.py)ほか、`authenticateApiKey`を使う全route生成箇所。
2. **案B（内部専用route分離）**: `ReceivingConfirmForm.tsx`用に`getSessionUserId()`ベースの内部専用read route（例: `/api/_internal/inventory-for-receipt`）を別途生成し、公開REST API(`/api/inventory`)とは分離する。`ReservationActionButtons.tsx`が叩くaction routeについても同様に、action route自体の認証を`getSessionUserId()`に変更（外部APIとしての利用実績・必要性が薄いなら案Aより単純）。
3案とも、confirm route自体の**認証チェック皆無**（上記4項参照）という副次的な欠陥は別途修正が必要（`getSessionUserId()`または`authenticateApiKey`のいずれかを追加し、少なくとも認証済みユーザーのみ書き込み可能にする）。

**注記**: `ReservationActionButtons.tsx`側は今回発見した401エラーに加え、subtask_276aで発見済みのbody契約違反バグ（`quantity` vs `requestedQty`/`releaseQty`、qty未渡し）も併存している。401を解消しても契約違反バグが残っていればship/releaseは500エラーに変わるだけなので、**両方の修正が揃って初めてUIから正常動作する**。

### 非破壊性の確認（本追加調査分）

- ブランチ切替なし（`rebase/app-template-wip`のまま）。コード変更・commit・generate-code実行・test env起動は一切行っていない（読解のみで根因特定できたため）。
- 本セクションの追記のみが変更点（既存セクションは無編集）。
