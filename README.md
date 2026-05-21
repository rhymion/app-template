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
├── package.json         ← top-level deploy commands
└── README.md
```

**Rule of thumb:** edit `prj/`, never `app-generator/`. Every deploy command runs `scripts/sync-prj.sh` first, which overlay-copies `prj/.` onto `app-generator/`.

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

# Python deps for the code generator
python3 -m venv .venv && source .venv/bin/activate
pip install -r app-generator/requirements.txt

# Bootstrap: init submodule, sync prj/, install npm deps, start DB, push schema
npm run setup

# .env for the generator (edit as needed)
cp app-generator/.env.test app-generator/.env
```

`npm run setup` is idempotent — re-run it any time the submodule or deps change.

---

## Three ways to deploy

### 1. Local (npm)

```bash
npm run dev       # syncs prj/ → app-generator/, then runs next dev
npm run build     # syncs, generates code, runs prisma + next build
npm start         # serves the built app
```

These three commands replace the longer list in `app-generator/package.json`. The full set is still available via `npm --prefix app-generator run <name>`.

### 2. Vercel — git push / merge

One-time setup (Vercel dashboard):

1. Import this repository into Vercel.
2. Set **Root Directory** to `app-generator`.
3. Enable **Include source files outside of the Root Directory** so `../prj` is visible at build time.
4. Framework Preset: **Next.js** (auto-detected).
5. Add environment variables — at minimum `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`. See `app-generator/.env.example`.

After that, every push (or merge to your production branch) triggers a deploy. Vercel runs `npm run vercel-build` inside `app-generator/`, which calls `prj:sync` to overlay `../prj/` before building. No extra config needed.

### 3. Vercel — CLI

From the template root:

```bash
npm run deploy           # preview deploy
npm run deploy:prod      # production deploy
```

Both commands sync `prj/` first, then run `vercel --cwd app-generator`. The first time you run this, Vercel CLI will prompt you to link the directory to a Vercel project.

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

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `app-generator/` is empty | `git submodule update --init --recursive` |
| Vercel build can't find `../prj` | Enable "Include source files outside of the Root Directory" in Vercel project settings |
| Port 3000 already in use | `PORT=4000 npm run dev` |
| Local DB connection refused | `npm --prefix app-generator run docker:test:up` |

---

## License

See [LICENSE](./LICENSE).
