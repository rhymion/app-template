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
```

These three commands are thin wrappers around `app-generator/package.json`. The full set is still available via `npm --prefix app-generator run <name>`.

### 2. Vercel — git push / merge

One-time setup (Vercel dashboard):

1. Import this repository into Vercel. Set **Root Directory to `app-generator/`**.
2. Build/Install/Output commands: leave the defaults. They are read from `app-generator/vercel.json`, which syncs `prj/` into `app-generator/` before `next build` runs.
3. Framework Preset: **Next.js** (set by `app-generator/vercel.json`).
4. Add environment variables — at minimum `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`. See `app-generator/.env.example`.

After that, every push (or merge to your production branch) triggers a deploy. No extra dashboard configuration is needed.

### 3. Vercel — CLI

From the `app-generator` directory:

```bash
cd app-generator
vercel          # preview deploy
vercel --prod   # production deploy
```

The build script in `app-generator/` automatically syncs `prj/` before building — you do **not** need to sync manually before deploying. The first time you run this, Vercel CLI will prompt you to link the directory to a Vercel project.

> **Note:** Do not run deploy scripts from the repo root — those have been removed. Always deploy from `app-generator/`.

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

---

## Customising your app

1. Edit the schema in `prj/code_generator/json_schema.yaml` and `prj/prisma/schema.prisma`.
2. Put any custom entity-specific overrides in `prj/components/<entity>/`, `prj/lib/<entity>/`, `prj/messages/`.
3. Run `npm run dev` — `prj/` is overlay-copied into `app-generator/`, the code generator regenerates, and the app reloads.

`sync-prj.sh` uses `cp -a prj/. app-generator/`, so it only **adds or overwrites** files. It never deletes generator files that aren't in `prj/`. If you need a clean slate, run `git submodule deinit -f app-generator && git submodule update --init --recursive` to reset the submodule.

---

## Updating the generator

```bash
git submodule update --remote app-generator
git add app-generator
git commit -m "Bump app-generator"
```

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

Every `dev` and `build` command runs `scripts/sync-prj.sh` first, which overlay-copies `prj/.` onto `app-generator/`. You can also trigger it manually:

```bash
npm run sync   # copy prj/ → app-generator/ without starting anything else
```

Workflow: edit `prj/` → run `npm run dev` (syncs automatically) → generator regenerates → app reloads.

### Vercel deploy

After forking and completing [First-time setup](#first-time-setup):

1. Import your fork into Vercel. Set **Root Directory to `app-generator/`**.
2. Add environment variables (`DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL` at minimum — see `app-generator/.env.example`).
3. Every push to your production branch triggers a deploy automatically.

For a one-shot production deploy from the CLI:

```bash
cd app-generator
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
