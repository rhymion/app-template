# app-template

Template repository for the [Rhymion App Generator](https://github.com/rhymion/app-generator).

Define your schema and custom code in **`prj/`**, then deploy with a single command. The generator (a git submodule under `app-generator/`) stays untouched — your customizations live in `prj/` and are overlay-copied into the generator at build time.

🇯🇵 [日本語版はこちら](./README_ja.md)

---

## Repository layout

```
app-template/
├── prj/                 ← YOUR schema and custom code lives here
│   ├── code_generator/json_schema.yaml
│   ├── prisma/schema.prisma
│   ├── components/      (entity-specific custom components)
│   ├── lib/             (entity-specific custom server logic)
│   └── messages/ja.json
├── app-generator/       ← submodule (do not edit directly)
├── scripts/sync-prj.sh  ← copies prj/. → app-generator/
├── package.json         ← local dev/build shortcuts
└── README.md
```

**Rule of thumb:** edit `prj/`, never `app-generator/`. Every local dev/build command runs `scripts/sync-prj.sh` first, which overlay-copies `prj/.` onto `app-generator/`.

**The `app-generator/` submodule** is pinned at a specific commit and is generally not modified directly. Local temporary changes (for debugging or experimentation) are fine — they do not affect this repository's history as long as you do not commit the updated submodule pointer. If you need a persistent change to the generator, contribute it upstream to `app-generator` and then update the submodule pin here.

---

## Prerequisites

| Tool | Min. version |
|------|--------------|
| [Git](https://git-scm.com/downloads) | any |
| [Node.js](https://nodejs.org/) | 20 LTS |
| npm | 10 (bundled with Node.js) |
| [Python 3](https://www.python.org/downloads/) | 3.10+ |
| [Docker](https://docs.docker.com/get-docker/) | any (for local Postgres) |
| [Vercel CLI](https://vercel.com/docs/cli) | latest (only for CLI deploys) |

---

## First-time setup

```bash
git clone --recurse-submodules <your-fork-of-app-template>
cd app-template

# Bootstrap: init submodule, install npm deps (root + app-generator),
# create Python venv under app-generator/.venv, install Python deps.
npm run setup
```

`npm run setup` is idempotent — re-run it any time the submodule or deps change. To start your local database, run `npm --prefix app-generator run docker:up:dev` (dev) or `docker:up:test` (test) separately.

---

## Three ways to deploy

### 1. Local (npm)

```bash
npm run dev       # syncs prj/ → app-generator/, then starts the Next.js dev server
npm run build     # syncs prj/ → app-generator/, then runs next build
npm start         # starts the built Next.js app (app-generator/start)
npm run test:e2e:build # syncs prj/ → app-generator/, then runs next build in test environment
npm run test:e2e:cy:start # starts the built Next.js app and start E2E testing
```

These three commands are thin wrappers around `app-generator/package.json`. The full set is still available via `npm --prefix app-generator run <name>`. As app-generator does not provide setting files for production, you have to create them when you want to build in local, using setting files for testing and so on.

### 2. Vercel — git push / merge

One-time setup (Vercel dashboard):

1. Import this repository into Vercel. Set **Root Directory to `app-generator/`**.
2. Build/Install/Output commands: leave the defaults. They are read from `app-generator/vercel.json`, which syncs `prj/` into `app-generator/` before `next build` runs.
3. Framework Preset: **Next.js** (set by `app-generator/vercel.json`).
4. Provision the following **Vercel resources** for your project (via Vercel dashboard → Storage):
   - **PostgreSQL** (accessed via Prisma)
   - **Blob Store**
   - **Redis**

5. Add **environment variables**:

   | Variable | Notes |
   |----------|-------|
   | `DATABASE_URL` | Postgres connection string |
   | `POSTGRES_URL` | Vercel Postgres URL |
   | `PRISMA_DATABASE_URL` | Usually set automatically when Vercel Postgres is connected; if Prisma fails to connect, manually set this to the correct pooling URL |
   | `REDIS_URL` | Redis connection string |
   | `BLOB_READ_WRITE_TOKEN` | Vercel Blob token |
   | `AUTH_SECRET` | Random secret for NextAuth (generate with `openssl rand -base64 32`) |
   | `NEXTAUTH_URL` | Your deployed app URL |

   See `app-generator/.env.example` for a full list.

6. **CI in forked repositories**: To run CI on a fork of this repo, add `AUTH_SECRET` to your repository's **Settings → Secrets and variables → Actions**.

After that, every push (or merge to your production branch) triggers a deploy. No extra dashboard configuration is needed.

### 3. Vercel — CLI

From the `app-generator` directory:

```bash
vercel          # preview deploy
vercel --prod   # production deploy
```

The build script in `app-generator/` automatically syncs `prj/` before building — you do **not** need to sync manually before deploying. The first time you run this, Vercel CLI will prompt you to link the directory to a Vercel project.

---

## Changing the port

The dev/start commands respect the `PORT` environment variable:

```bash
PORT=4000 npm run dev
PORT=4000 npm start
```

Other places that reference the port:

| File | Setting | Notes |
|------|---------|-------|
| `app-generator/.env` | `NEXTAUTH_URL` | Must match the chosen port for login to work locally. |
| `app-generator/docker-compose.test.yml` | Postgres `ports:` | Change if the host's 5432 is taken. Also update `DATABASE_URL`. |

For Vercel deploys the port is managed by the platform — no change needed.

> **E2E tests and `db push`:** Because `test:e2e:build` uses `cross-env NODE_ENV=test`, an external `PORT` environment variable does not propagate to Prisma. To change the port used by `db push` or E2E tests, **edit `app-generator/.env.test` directly** (or place a `.env.test` override in `prj/` and let sync copy it over). Simply setting `PORT` externally is not enough for these commands.

---

## Customising your app

1. Edit the schema in `prj/code_generator/json_schema.yaml` and `prj/prisma/schema.prisma`.
2. Put any custom entity-specific overrides in `prj/components/<entity>/`, `prj/lib/<entity>/`, `prj/messages/`.
3. Run `npm run dev` — `prj/` is overlay-copied into `app-generator/`, the code generator regenerates, and the app reloads.

`sync-prj.sh` uses `cp -a prj/. app-generator/`, so it only **adds or overwrites** files. It never deletes generator files that aren't in `prj/`. If you need a clean slate, run `git submodule deinit -f app-generator && git submodule update --init --recursive` to reset the submodule.

---

## Editing the Schema

The application schema is defined in `prj/code_generator/json_schema.yaml`.
Changes to the schema require running the code generator to regenerate application files.

### Method A: Manual Editing

1. Edit `prj/code_generator/json_schema.yaml`
2. Refer to the schema reference documentation:
   - `app-generator/docs/knowledge/schema-yaml-configuration.md`
   - Online docs at the app-generator repository
3. Run code generation: `npm run generate-code`
4. Verify the generated code compiles: `npm run build`

### Method B: AI-Assisted Editing (Claude Code / Codex)

Use Claude Code or Codex to design or update the schema:

**Claude Code:**
```
/generate-schema <your request>
```

**Codex:**
Select the `generate-schema` task and describe what you need.

The AI will:
- Create or update `prj/code_generator/json_schema.yaml`
- Run `npm run generate-code` to regenerate application files
- Verify the build succeeds

> **Note:** All generated and edited files are saved under `prj/`. The change in 
> `app-generator/`submodule is temporary.

---

## Usage as a Base Project

`app-template` is designed to be forked and used as the foundation for your own application. The core idea is the **wrapper-project pattern**: your project-specific code lives in `prj/`, while the generator engine (`app-generator/`) stays as an unmodified submodule.

### Wrapper-project pattern

```
your-app/           ← fork of app-template
├── prj/            ← YOUR schema, components, custom logic
│   ├── code_generator/json_schema.yaml
│   ├── prisma/schema.prisma
│   ├── components/
│   ├── lib/
│   └── messages/ja.json
├── app-generator/  ← submodule (never edited directly)
└── scripts/sync-prj.sh
```

Fork (or use as a template) this repo. All your changes go into `prj/`. The generator engine is pinned at a specific commit and upgraded explicitly — not by editing it in place.

### prj:sync flow

Every `dev` and `build` command runs `scripts/sync-prj.sh` first, which overlay-copies `prj/.` onto `app-generator/`. You can also trigger it manually — though in normal use this is not necessary, since sync is already embedded in `dev`, `build`, `test:e2e:build`, and the app-generator's `vercel-build`. Run it only when you want to verify the sync in isolation:

```bash
npm run sync   # copy prj/ → app-generator/ without starting anything else
```

Workflow: edit `prj/` → run `npm run dev` (syncs automatically) → generator regenerates → app reloads.

### Vercel deploy

After forking and completing [First-time setup](#first-time-setup):

1. Import your fork into Vercel. Set **Root Directory to `app-generator/`**.
2. Provision Vercel resources (PostgreSQL, Blob Store, Redis) and add environment variables (`REDIS_URL`, `BLOB_READ_WRITE_TOKEN`, `POSTGRES_URL`, `PRISMA_DATABASE_URL`, `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL` — see `app-generator/.env.example` and the [Vercel — git push / merge](#2-vercel--git-push--merge) section for details).
3. Every push to your production branch triggers a deploy automatically.

For a one-shot production deploy from the CLI:

```bash
vercel --prod
```

### Environment variable handoff

Your `.env` lives in `app-generator/`. When a collaborator clones the repo:

1. Copy `app-generator/.env.example` → `app-generator/.env`
2. Fill in secrets (`DATABASE_URL`, `AUTH_SECRET`, etc.)
3. Add the same keys as Vercel environment variables for deployed environments

The test database uses `app-generator/.env.test`, which is checked in and requires no changes for local development.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `app-generator/` is empty | `git submodule update --init --recursive` |
| Vercel build skips the sync | Make sure Root Directory is set to `app-generator/` (not the repo root) so `app-generator/vercel.json` is picked up |
| Port 3000 already in use | `PORT=4000 npm run dev` |
| Local DB connection refused | Start Docker manually: `npm --prefix app-generator run docker:up:dev` (or `docker:up:test` for test DB) |

---

## License

See [LICENSE](./LICENSE).
