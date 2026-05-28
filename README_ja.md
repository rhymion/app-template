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
├── package.json         ← ローカルの dev/build ショートカット
└── README.md
```

**原則**：`prj/` のみを編集し、`app-generator/` は直接いじらない。各ローカル dev/build コマンドは最初に `scripts/sync-prj.sh` を実行し、`prj/.` を `app-generator/` に上書きコピーします。

**`app-generator/` サブモジュール**は特定のコミットに固定されており、基本的に直接変更しません。ローカルでの一時的な変更（デバッグや実験目的）は問題ありません — サブモジュールのポインタをコミットしなければ、このリポジトリの履歴に影響しません。ジェネレータへの永続的な変更が必要な場合は、上流の `app-generator` にコントリビュートし、その後ここでサブモジュールのピンを更新するのが正しい流れです。

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

# 一括ブートストラップ（submodule init → npm install（root + app-generator）→
# app-generator/.venv に Python venv 作成 → Python 依存インストール）
npm run setup
```

`npm run setup` は冪等です。submodule や依存を更新したらいつでも再実行できます。ローカル DB は別途 `npm --prefix app-generator run docker:up:dev`（開発）または `docker:up:test`（テスト）で起動してください。

---

## デプロイ手段 3 種

### 1. ローカル（npm）

```bash
npm run dev       # prj/ → app-generator/ を同期し、Next.js dev サーバを起動
npm run build     # prj/ → app-generator/ を同期し、next build を実行
npm start         # ビルド済み Next.js アプリを起動（app-generator/start）
```

この 3 コマンドは `app-generator/package.json` の薄いラッパーです。元のコマンドはすべて `npm --prefix app-generator run <name>` で従来通り呼び出せます。

### 2. Vercel（git push / merge）

初回設定（Vercel ダッシュボード）：

1. このリポジトリを Vercel に Import。**Root Directory を `app-generator/` に設定する**。
2. Build / Install / Output コマンドはデフォルトのままで OK。`app-generator/vercel.json` が読まれ、その中のビルドスクリプトが `prj/` を `app-generator/` に上書きコピーしてから `next build` を実行します。
3. Framework Preset は **Next.js**（`app-generator/vercel.json` で指定済み）。
4. 以下の **Vercel リソース**をプロジェクトにプロビジョニングします（Vercel ダッシュボード → Storage）：
   - **PostgreSQL**（Prisma 経由で接続）
   - **Blob Store**
   - **Redis**

5. **環境変数**を追加します：

   | 変数 | 備考 |
   |------|------|
   | `DATABASE_URL` | Postgres 接続文字列 |
   | `POSTGRES_URL` | Vercel Postgres の URL |
   | `PRISMA_DATABASE_URL` | Vercel Postgres 接続時に通常は自動設定されます。Prisma が接続できない場合は、正しいプーリング URL を手動で設定してください |
   | `REDIS_URL` | Redis 接続文字列 |
   | `BLOB_READ_WRITE_TOKEN` | Vercel Blob トークン |
   | `AUTH_SECRET` | NextAuth 用のランダムシークレット（`openssl rand -base64 32` で生成） |
   | `NEXTAUTH_URL` | デプロイ済みアプリの URL |

   詳細は `app-generator/.env.example` を参照してください。

6. **フォークリポジトリでの CI**：フォークしたリポジトリで CI を動かすには、リポジトリの **Settings → Secrets and variables → Actions** に `AUTH_SECRET` を追加してください。

これ以降、push（あるいは本番ブランチへの merge）のたびに自動デプロイされます。ダッシュボードでの追加設定は不要です。

### 3. Vercel CLI

`app-generator` ディレクトリから：

```bash
cd app-generator
vercel          # プレビュー
vercel --prod   # 本番
```

`app-generator/` 内のビルドスクリプトがビルド前に自動で `prj/` を同期するため、**手動での `prj:sync` は不要**です。初回はプロジェクトとのリンクが促されます。

> **注意：** リポジトリルートからデプロイスクリプトを実行しないでください — それらは削除されました。デプロイは必ず `app-generator/` から行ってください。

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

Vercel 上のポートはプラットフォーム管理のため変更不要です。

> **E2E テストと `db push` のポート変更：** `test:e2e:build` は `cross-env NODE_ENV=test` を使用するため、外側から `PORT` 環境変数を注入しても Prisma まで届きません。`db push` や E2E テストで使用するポートを変更する場合は、**`app-generator/.env.test` を直接編集**してください（`prj/` に `.env.test` を置いて sync でコピーさせる方法も可）。外部から `PORT` を設定するだけでは不十分です。

---

## カスタマイズの流れ

1. `prj/code_generator/json_schema.yaml` と `prj/prisma/schema.prisma` でスキーマを定義。
2. エンティティ単位の上書きは `prj/components/<entity>/`、`prj/lib/<entity>/`、`prj/messages/` に置く。
3. `npm run dev` を実行 — `prj/` が `app-generator/` に上書きされ、コード生成とアプリ起動まで自動で行われます。

`sync-prj.sh` は `cp -a prj/. app-generator/` を使うため、**追加と上書きのみ**を行い、ジェネレータ側のファイルを削除することはありません。クリーンに戻したいときは `git submodule deinit -f app-generator && git submodule update --init --recursive` で submodule を初期化してください。

---

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

`dev` / `build` の各コマンドは最初に `scripts/sync-prj.sh` を実行し、`prj/.` を `app-generator/` に上書きコピーします。手動で呼び出すことも可能ですが、通常は不要です — 同期処理は `dev`・`start`・`test:e2e:build`・app-generator の `vercel-build` に既に含まれています。同期だけを単独で確認したい特殊なケースでのみ使用してください：

```bash
npm run sync   # 他の操作なしで prj/ → app-generator/ をコピー
```

ワークフロー：`prj/` を編集 → `npm run dev`（自動で同期）→ ジェネレーターが再生成 → アプリが再起動。

### Vercel デプロイ

フォーク後、[初回セットアップ](#初回セットアップ) を終えたら：

1. フォークリポジトリを Vercel に Import。**Root Directory を `app-generator/` に設定する**。
2. Vercel リソース（PostgreSQL・Blob Store・Redis）をプロビジョニングし、環境変数（`REDIS_URL`・`BLOB_READ_WRITE_TOKEN`・`POSTGRES_URL`・`PRISMA_DATABASE_URL`・`DATABASE_URL`・`AUTH_SECRET`・`NEXTAUTH_URL`）を追加します（詳細は `app-generator/.env.example` および上記の [Vercel（git push / merge）](#2-vercelgit-push--merge) セクションを参照）。
3. 以降は本番ブランチへの push のたびに自動デプロイされます。

CLI から本番に一発デプロイする場合：

```bash
cd app-generator
vercel --prod
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
| Vercel ビルドで sync がスキップされる | Root Directory が `app-generator/` に設定されているか確認（リポジトリ直下を指定しないこと）。`app-generator/vercel.json` が読まれないと sync が走らない |
| ポート 3000 が使用中 | `PORT=4000 npm run dev` |
| ローカル DB に接続できない | Docker を手動起動: `npm --prefix app-generator run docker:up:dev`（開発）または `docker:up:test`（テスト） |

---

## ライセンス

[LICENSE](./LICENSE) を参照してください。
