# app-template

[Rhymion App Generator](https://github.com/rhymion/app-generator) を利用するためのテンプレートリポジトリです。

スキーマやカスタムコードは **`prj/`** に置き、コマンド一発でデプロイできます。ジェネレータ本体（`app-generator/` の git submodule）には直接手を入れません。`prj/` の内容はビルド時に `app-generator/` に上書きコピーされます。

🇬🇧 [English version](./README.md)

---

## ディレクトリ構成

```
app-template/
├── prj/                 ← あなたのスキーマ・カスタムコードを置く場所
│   ├── code_generator/json_schema.yaml
│   ├── prisma/schema.prisma
│   ├── components/      （エンティティごとのカスタムコンポーネント）
│   ├── lib/             （エンティティごとのカスタムサーバーロジック）
│   └── messages/ja.json
├── app-generator/       ← submodule（直接編集しない）
├── scripts/sync-prj.sh  ← prj/. → app-generator/ をコピー
├── package.json         ← トップレベルのデプロイコマンド
└── README.md
```

**原則**：`prj/` のみを編集し、`app-generator/` は直接いじらない。各デプロイコマンドは最初に `scripts/sync-prj.sh` を実行し、`prj/.` を `app-generator/` に上書きコピーします。

---

## 前提ツール

| ツール | 最低バージョン |
|------|--------------|
| [Git](https://git-scm.com/downloads) | 任意 |
| [Node.js](https://nodejs.org/) | 20 LTS |
| npm | 10（Node.js に同梱） |
| [Python 3](https://www.python.org/downloads/) | 3.10+ |
| [Docker](https://docs.docker.com/get-docker/) | 任意（ローカル Postgres 用） |
| [Vercel CLI](https://vercel.com/docs/cli) | 最新版（CLI デプロイ時のみ） |

---

## 初回セットアップ

```bash
git clone --recurse-submodules <your-fork-of-app-template>
cd app-template

# コードジェネレータ用 Python 依存
python3 -m venv .venv && source .venv/bin/activate
pip install -r app-generator/requirements.txt

# 一括ブートストラップ（submodule init → prj/ 同期 → npm install →
# Postgres 起動 → 接続待機 → schema push → Prisma client 生成）
npm run setup
```

`npm run setup` は冪等です。submodule や依存を更新したらいつでも再実行できます。ローカル DB には `app-generator/.env.test` をそのまま利用します。カスタマイズしたい場合のみ `cp app-generator/.env.test app-generator/.env` してください。

---

## デプロイ手段 3 種

### 1. ローカル（npm）

```bash
npm run dev       # prj/ → app-generator/ を同期し、コード生成 + DB prep を実行して next dev を起動（テスト DB）
npm run build     # 同期 → コード生成 → prisma + next build（テスト DB）
npm start         # ビルド済みアプリを起動。check:build でビルドの鮮度を確認してからサーバを起動する
```

この 3 コマンドで `app-generator/package.json` の長大なスクリプト群を覆えます。元のコマンドはすべて `npm --prefix app-generator run <name>` で従来通り呼び出せます。

### 2. Vercel（git push / merge）

初回設定（Vercel ダッシュボード）：

1. このリポジトリを Vercel に Import。**Root Directory はリポジトリ直下のまま**にする（`app-generator/` を指定しない）。
2. Build / Install / Output コマンドはデフォルトのままで OK。`vercel.json` が `npm run vercel-build` を呼び、その先頭で `prj/` が `app-generator/` に上書きコピーされてから `next build` が走ります。
3. Framework Preset は **Next.js**（`vercel.json` で指定済み）。
4. 環境変数を追加。少なくとも `DATABASE_URL` / `AUTH_SECRET` / `NEXTAUTH_URL`。詳細は `app-generator/.env.example`。

これ以降、push（あるいは本番ブランチへの merge）のたびに自動デプロイされます。ダッシュボードでの追加設定は不要です。

### 3. Vercel CLI

`app-generator` ディレクトリから：

```bash
cd app-generator
vercel          # プレビュー
vercel --prod   # 本番
```

`vercel-build` スクリプトがビルド前に自動で `prj:sync` を実行するため、**手動での `prj:sync` は不要**です。

テンプレートルートのショートカットを使う場合（こちらも `prj/` を同期してから Vercel を実行します）：

```bash
npm run deploy           # プレビュー
npm run deploy:prod      # 本番
```

初回はいずれの方法でもプロジェクトとのリンクが促されます。

---

## ポートの変更

dev / start コマンドは `PORT` 環境変数を尊重します：

```bash
PORT=4000 npm run dev
PORT=4000 npm start
```

連動して確認すべき場所：

| ファイル | 設定項目 | 備考 |
|---------|---------|------|
| `app-generator/.env` | `NEXTAUTH_URL` | ローカルログインを使う場合は新しいポートに合わせる |
| `app-generator/docker-compose.test.yml` | Postgres の `ports:` | ホストの 5432 が埋まっている場合のみ変更。あわせて `DATABASE_URL` も更新 |

ジェネレータ内部サービスのポートは `app-generator/config/ports.yaml` で管理されます。このファイルを編集したら `npm --prefix app-generator run ports:generate` を実行して env ファイルを再生成してください。

Vercel 上のポートはプラットフォーム管理のため変更不要です。

---

## カスタマイズの流れ

1. `prj/code_generator/json_schema.yaml` と `prj/prisma/schema.prisma` でスキーマを定義。
2. エンティティ単位の上書きは `prj/components/<entity>/`、`prj/lib/<entity>/`、`prj/messages/` に置く。
3. `npm run dev` を実行 — `prj/` が `app-generator/` に上書きされ、コード生成とアプリ起動まで自動で行われます。

`sync-prj.sh` は `cp -a prj/. app-generator/` を使うため、**追加と上書きのみ**を行い、ジェネレータ側のファイルを削除することはありません。クリーンに戻したいときは `git submodule deinit -f app-generator && git submodule update --init --recursive` で submodule を初期化してください。

---

## ジェネレータの更新

```bash
git submodule update --remote app-generator
git add app-generator
git commit -m "Bump app-generator"
```

---

## ベースプロジェクトとしての使い方

`app-template` はフォークして自分のアプリのベースとして使うことを想定しています。基本パターンは **ラッパープロジェクト方式** — プロジェクト固有のコードは `prj/` に置き、ジェネレーターエンジン（`app-generator/`）は手を加えずサブモジュールとして保持します。

### ラッパープロジェクトパターン

```
your-app/           ← app-template のフォーク
├── prj/            ← あなたのスキーマ・コンポーネント・カスタムロジック
│   ├── code_generator/json_schema.yaml
│   ├── prisma/schema.prisma
│   ├── components/
│   ├── lib/
│   └── messages/ja.json
├── app-generator/  ← サブモジュール（直接編集しない）
└── scripts/sync-prj.sh
```

このリポジトリをフォーク（またはテンプレートとして利用）します。変更はすべて `prj/` に加えます。ジェネレーターエンジンは特定のコミットに固定され、明示的にアップデートします（直接編集はしません）。

### prj:sync の流れ

`dev` / `build` / `deploy` の各コマンドは最初に `scripts/sync-prj.sh` を実行し、`prj/.` を `app-generator/` に上書きコピーします。手動で呼び出すことも可能です：

```bash
npm run prj:sync   # 他の操作なしで prj/ → app-generator/ をコピー
```

ワークフロー：`prj/` を編集 → `npm run dev`（自動で同期）→ ジェネレーターが再生成 → アプリが再起動。

### Vercel デプロイ

フォーク後、[初回セットアップ](#初回セットアップ) を終えたら：

1. フォークリポジトリを Vercel に Import。**Root Directory はリポジトリ直下**のままにする。
2. 環境変数を追加（最低限 `DATABASE_URL`・`AUTH_SECRET`・`NEXTAUTH_URL` — 詳細は `app-generator/.env.example`）。
3. 以降は本番ブランチへの push のたびに自動デプロイされます。

CLI から本番に一発デプロイする場合：

```bash
npm run deploy:prod
```

### 環境変数の引き継ぎ

`.env` は `app-generator/` に置きます。新しいメンバーがリポジトリをクローンしたとき：

1. `app-generator/.env.example` → `app-generator/.env` にコピー
2. シークレット（`DATABASE_URL`・`AUTH_SECRET` 等）を記入
3. 同じキーを Vercel の環境変数にも登録する

テスト用 DB には `app-generator/.env.test` を使用します。このファイルはリポジトリにコミット済みで、ローカル開発では変更不要です。

---

## トラブルシュート

| 症状 | 対処 |
|------|------|
| `app-generator/` が空 | `git submodule update --init --recursive` |
| Vercel ビルドで sync がスキップされる | Root Directory がリポジトリ直下になっているか確認（`app-generator/` を指定しないこと）。`vercel.json` が読まれないと sync が走らない |
| ポート 3000 が使用中 | `PORT=4000 npm run dev` |
| ローカル DB に接続できない | `npm run setup` を再実行（Postgres を待つ）、または `npm --prefix app-generator run docker:up` |

---

## ライセンス

[LICENSE](./LICENSE) を参照してください。
