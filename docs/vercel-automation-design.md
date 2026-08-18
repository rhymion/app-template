# Vercel Environment Automation Script Design

**Created:** 2026-07-07
**Status:** Implemented and live. Provisioning scripts (`scripts/vercel-setup.sh` and
friends) are the authoritative source for exact current behavior — this document
covers architecture and rationale; where the two diverge, defer to the scripts.
Historical superseded content is kept only where it explains *why* a current name/shape
looks the way it does (see §6).
**Scope:** Vercel production deployment automation for app-template (proj_c)
**Mirrors:** `scripts/gcp-*.sh` (parallel automation suite for the GCP Cloud Run path,
in the app-generator repository's `scripts/`)
**Supersedes:** the original draft of this document, previously located at
`docs/knowledge/vercel-automation-design.md` in the app-generator repository
(see redirect note left at that path).

> **⚠ cmd_484 correction (2026-07-29): §1/§3/§3.1/§3.2/§4 build-strategy design
> superseded in practice — root-level `vercel.json` removed.** This document's
> originally adopted build strategy ("pre-generated commit + explicit root
> `vercel.json` `buildCommand`", §3) was never actually deployed. Every live
> Vercel project connected to this repository (`app-generator-sample`,
> `sample-app`, `oshicry`, `real-estate` — confirmed via `vercel project
> inspect` against the `rhymion-labs` team scope, 2026-07-29) has **Vercel
> Project Settings → Root Directory = `app-generator`**, which is the
> "alternative considered (not adopted as primary)" design originally
> described in §3.2. `scripts/vercel-setup.sh` Step 1.5 already implements
> and enforces this alternative (`_VERCEL_ROOT_DIRECTORY="${VERCEL_ROOT_DIRECTORY:-app-generator}"`,
> written via the Vercel Projects API) — the actual, shipped automation
> silently pivoted to the alternative design after this document was written,
> and this document was never updated to match. The root-level `vercel.json`
> this document specified (§3.2) was consequently **dead configuration**,
> never read by any live deployment, and has been deleted (cmd_484). See §17
> for the corrected design. Additionally, §3's claim that Python/uv are
> unavailable in the Vercel build environment was never actually tested and
> is **false** — see §17 for the empirical correction.

---

## 0. Objective

Automate Vercel environment variable setup and deploy for **app-template**
(this repository, proj_c — the wrapper repo that consumes the
`app-generator` submodule), providing the same scriptable experience as the GCP
automation suite (`scripts/gcp-env.sh` / `gcp-setup.sh` / `gcp-deploy.sh` /
`gcp-teardown.sh` in proj_b).

**Key difference from GCP:** Vercel is a git-connected platform. A Git-provider deploy
(GitHub push) is triggered automatically; this automation additionally covers a CLI
deploy path (`vercel deploy`) plus environment variable injection and first-time DB
migration, both of which must precede a working deploy.

---

## 1. Deploy Target (Corrected — was wrong in the initial draft)

**Deploy target is this repository (app-template, proj_c), NOT
the app-generator repository (proj_b).**

- proj_b (`app-generator-2`) is the generator **source** — it has no `.gitmodules` and
  is also used as a self-hosted GCP demo app. It is not what gets deployed to Vercel.
- proj_c (`app-template`) is the **wrapper repo**: it has `.gitmodules` pointing at
  `https://github.com/rhymion/app-generator.git` (submodule path: `app-generator/`),
  plus `prj/` (schema + overlay customizations), `scripts/` (`setup.sh`,
  `sync-prj.sh`), and `docs/`.
- The actual Next.js application (`app/`, `components/`, `lib/`, `package.json`,
  `next.config.ts`, etc.) lives **inside the `app-generator/` submodule**, not at the
  app-template root.
- All Vercel automation scripts, `vercel.json`, and env files therefore live in
  **app-template**, and must account for the submodule boundary (see §2).

---

## 2. Submodule Support (Corrected — FS-1 was wrongly marked N/A)

The `app-generator` submodule **must be checked out before any build or deploy
step** — `scripts/sync-prj.sh` fails immediately if `app-generator/` does not exist:

```
sync-prj: app-generator/ not found at <root>/app-generator.
         Run 'git submodule update --init --recursive' first.
```

And the root `package.json` build script chains through it:
`"build": "bash scripts/sync-prj.sh && npm --prefix app-generator run build:full"`.

### Git-provider deploys (GitHub push → Vercel)

Official Vercel documentation confirms automatic submodule checkout:

> Source: https://vercel.com/docs/builds/build-features#git-submodules
> "On Vercel, you can deploy Git submodules with a Git provider as long as the
> submodule is publicly accessible through the HTTP protocol."

Our submodule URL (`https://github.com/rhymion/app-generator.git`) is public HTTPS,
so **no extra configuration is needed for Git-provider deploys.**

### CLI deploys (`vercel deploy`, via `vercel-deploy.sh`)

Caveat from the same Vercel doc set — `.gitmodules` is in the Vercel CLI
"ignored files" list (https://vercel.com/docs/builds/build-features#ignored-files-and-folders).
This applies **only** to `vercel deploy` (direct CLI upload), not to Git-provider
deploys. Practical effect: the submodule **directory contents** are uploaded as
regular files, but `git submodule update --init --recursive` must be run locally
**before** invoking `vercel deploy`, or the submodule directory may be stale/empty
in the uploaded snapshot.

`vercel-deploy.sh` therefore runs, in order:
1. `git submodule update --init --recursive`
2. `test -d app-generator/app` (verification gate — fails loudly if checkout didn't work)
3. `vercel deploy [--prod]`

---

## 3. Build Command (Corrected — the naive "use existing build scripts" approach fails)

### Why the existing scripts don't work on Vercel

- Root `npm run build` = `bash scripts/sync-prj.sh && npm --prefix app-generator run build:full`
- `build:full` = `docker:up:prod generate-code migrate:deploy db:generate db:seed-tenant build`
  - `docker:up:prod` → **fails**, no Docker available in the Vercel build environment
  - `generate-code` (= `python-generate`, invoking the Python code generator) → **fails**,
    no Python/uv available in the Vercel build environment
  - `db:seed-tenant` → should not run on every production build
- The submodule's own `"vercel-build"` npm script (auto-detected by Vercel by
  convention if no `vercel.json` `buildCommand` is set) is **also broken** for the
  same reasons — see §3.1 below.

### Build strategy decision: pre-generated commit + explicit `buildCommand`

Generated code (`app/`, `components/`, `lib/`, etc.) is **not** excluded by the
`app-generator` submodule's `.gitignore` — it is committed at the submodule's pinned
commit. This means **no runtime code generation is needed in the Vercel build.**
Python/uv are not required at build time.

Correct build sequence:
1. `bash scripts/sync-prj.sh` — copy `prj/` overlays into `app-generator/`
2. `npm --prefix app-generator install` — install Next.js app dependencies
3. `npm --prefix app-generator run db:generate` — `prisma generate` (type safety for the build)
4. `npm --prefix app-generator run build` — `next build`

`migrate:deploy` is **excluded** from the build command — it runs separately, once,
via `vercel-setup.sh` before the first deploy (see §5). Running migrations on every
build risks blocking all deploys on a failed migration and is unnecessary — schema
changes are infrequent relative to code deploys.

### 3.1 Note on the existing `app-generator/package.json` `"vercel-build"` script

`app-generator/package.json` already defines:

```
"vercel-build": "run-s prj:sync python-generate migrate:deploy db:generate db:seed-tenant build"
```

This script is **left unmodified and undeleted** — it is not Vercel-environment
compatible (same failures as `build:full`: no Python/uv, `migrate:deploy` and
`db:seed-tenant` should not run at build time). It is safe to leave in place because
**Vercel's explicit `vercel.json` `buildCommand` takes precedence over the
package.json `vercel-build` / `build` script auto-detection convention** — when
`buildCommand` is set in `vercel.json`, Vercel runs that command verbatim instead of
looking for a `vercel-build` or `build` npm script.
(Reference: https://vercel.com/docs/deployments/configure-a-build#build-command —
"If the `vercel.json` configuration file for a project has a `buildCommand` defined,
it will override the setting in the dashboard and any build scripts in `package.json`.")
This document's `vercel.json` (§3.2) always defines an explicit `buildCommand`, so the
broken `vercel-build` script is dormant and cannot be accidentally invoked in this
deployment path. If `vercel.json` is ever removed or its `buildCommand` deleted,
Vercel would fall back to the broken `vercel-build` script — keep this in mind before
touching `vercel.json`.

### 3.2 `vercel.json` design

File: `vercel.json` in this repository (app-template) (NEW — at app-template root)

```json
{
  "buildCommand": "bash scripts/sync-prj.sh && npm --prefix app-generator run db:generate && npm --prefix app-generator run build",
  "installCommand": "npm install && npm --prefix app-generator install",
  "outputDirectory": "app-generator/.next",
  "framework": "nextjs"
}
```

Notes:
- `outputDirectory: app-generator/.next` — Next.js builds into `app-generator/` since
  that is where `next.config.ts` lives.
- `framework: nextjs` — explicit, ensures Vercel applies Next.js build optimizations.
- `installCommand` includes **both** `npm install` (root) and
  `npm --prefix app-generator install` (submodule deps).
- `prisma generate` runs in `buildCommand` (not `postinstall`) for explicit control.
- `migrate:deploy` is **not** in `buildCommand` — it runs in `vercel-setup.sh` (§5).

Alternative considered (not adopted as primary): setting Vercel Project Settings →
Root Directory = `app-generator`, with `buildCommand: npm run prj:sync && npm run
db:generate && npm run build` and standard `outputDirectory: .next`. Cleaner Next.js
auto-detection, but the Root Directory setting is **not captured in a committed
file** (must be set per-project in the dashboard). `vercel.json` with explicit
`buildCommand` (adopted above) is fully version-controlled and reproducible, so it is
the primary approach. `vercel-setup.sh` may add `--rootDirectory app-generator` to
`vercel link` if this alternative is later preferred.

> **⚠ cmd_484 correction:** this "alternative" is what actually shipped —
> `scripts/vercel-setup.sh` Step 1.5 sets Root Directory to `app-generator`
> via the Vercel Projects API, and every live project confirms it. The
> "primary" design above (root `vercel.json`, adopted at the time this
> section was written) was never actually deployed and has been removed.
> See §17.

---

## 4. Scripts Placement (Corrected — was wrongly proposed under app-generator-2/scripts/)

All Vercel automation scripts live in **`scripts/` in this repository (app-template)**
(not `app-generator-2/scripts/`, not inside the `app-generator/` submodule):

1. Deploy target is app-template (proj_c). Its `scripts/` is the natural home for
   deployment automation — `setup.sh` and `sync-prj.sh` already live there.
2. proj_b (`app-generator-2`) has `gcp-*.sh` because proj_b **is** both the generator
   source **and** a self-hosted GCP demo app (no submodule). This is a structural
   difference from proj_c — the symmetric analogy does not apply.
3. `vercel-*.sh` contain proj_c-specific deployment config (team ID, project name,
   env vars) — they do not belong in the generator source (submodule), which is
   shared across every generated app.
4. Placing them in the submodule (`app-generator/scripts/`) would pollute the shared
   generator codebase with one deployment's specifics and require modifying a commit
   in `rhymion/app-generator` just for app-template's setup.

Files (all in `app-template/scripts/` unless noted):
- `vercel-env.sh` — env var injection (two-DB pattern, see §6)
- `vercel-setup.sh` — link + inject + first-time migration
- `vercel-deploy.sh` — submodule checkout guard + `vercel deploy`
- `vercel-teardown.sh` — env var removal + unlink
- `.env.production.local.example` in this repository (app-template) — template
- `vercel.json` in this repository (app-template) — build config (§3.2)

---

## 5. Operation Sequence

> **⚠ cmd_691 correction (2026-08-14): three-stage split.** `vercel-setup.sh`
> used to also run `migrate:deploy`/`db:seed-tenant` (old Steps 3/4/5/5.5).
> Those are now two separate scripts run *after* setup — see §19 for why and
> what changed. `vercel-setup.sh` is control-plane only.

The Neon/Upstash/Blob provisioning steps originally planned as manual (see §6, §14-§16)
are now automated inside `vercel-setup.sh` — a single script run handles get-or-create
provisioning for all three. `.env.production.local` only needs credentials, not resource
URLs.

### Step 1: Prepare `.env.production.local`

```bash
cp .env.production.local.example .env.production.local
# Fill in:
#   AUTH_SECRET        — leave blank for auto-generation on first run
#   NEON_API_KEY, NEON_PROJECT_NAME       — Neon get-or-create credentials (§14)
#   UPSTASH_EMAIL, UPSTASH_API_KEY, UPSTASH_PRIMARY_REGION — Upstash get-or-create credentials (§15)
#   GOOGLE_CLIENT_ID / SECRET              — from Google Cloud Console (if using Google OAuth)
#   VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_NAME — Vercel project identity
# DATABASE_URL_PROD/STAGING, DATABASE_URL_UNPOOLED_PROD/STAGING, REDIS_URL,
# BLOB_READ_WRITE_TOKEN, and the various *_ID idempotency anchors are all
# written back into this file automatically by vercel-setup.sh — leave them blank.
```

### Step 2: Run control-plane setup (no DB writes)

```bash
export VERCEL_TOKEN="<your-token>"    # env var only, never --token flag
DRY_RUN=true bash scripts/vercel-setup.sh   # optional: preview all writes first
bash scripts/vercel-setup.sh
```

`vercel-setup.sh`, in order: verify the submodule is checked out (Step 0) → Neon
get-or-create (Step A, §14) → Upstash get-or-create (Step B, §15) → link the Vercel
project and ensure its Root Directory (Steps 1/1.5) → Vercel Blob get-or-create
(Step C, §16) → inject all env vars for `production` and `preview` (Step 2). Every
step is idempotent — re-running after a partial failure skips whatever already
succeeded. **No migration or seeding runs here** — see Steps 3/4 below.

### Step 3: First deploy (creates the database schema)

```bash
vercel env ls production     # optional: confirm all vars are listed

# Staging (either works — both trigger the same vercel-build, which runs
# migrate:deploy):
git push origin develop      # Vercel preview auto-deploy (preferred path)
# or: bash scripts/vercel-deploy.sh

# Production:
bash scripts/vercel-deploy.sh --prod
```

Both environments must have at least one successful deploy before seeding —
`vercel-build` (not `vercel-setup.sh`) is what creates the schema, via
`migrate:deploy` (§18).

### Step 4: Seed (bootstrap tenant and admin user)

Run **after** Step 3 has completed for the target environment:

```bash
bash scripts/vercel-seed.sh          # seed staging
bash scripts/vercel-seed.sh --prod   # seed production
```

`vercel-seed.sh` checks that the schema exists (`prisma migrate status`)
before seeding; if Step 3 hasn't run yet for that environment, it stops with
a human-readable message instead of failing on missing tables. See §19.

### Diagnostic (any time, read-only)

```bash
bash scripts/vercel-setup.sh --status
```

Prints `prisma migrate status` for both production and staging without
writing anything — useful for confirming Step 3/4 landed, or for checking
whether an auto-deploy (git push) already migrated staging behind your back.

### On Teardown

```bash
bash scripts/vercel-teardown.sh
```

Removes injected env vars and unlinks the project only — it never depended
on the removed migrate/seed steps in `vercel-setup.sh`, so this split
required no teardown change (confirmed by reading the script: `_VARS` and
the unlink call reference nothing from those steps).

---

## 6. DB Provider Decision Gate (V-1)

> **⚠ cmd_292 ruling (2026-07-07): V-1 superseded.**
> Prisma Postgres is replaced by **Neon** as the Vercel DB provider.
> The original Prisma Postgres decision and rationale are preserved below for audit trail.
> Active design: see §14 (Neon provisioning) and §8.1 (updated env var inventory).

### Original decision (cmd_290) — superseded

Prisma Postgres was selected under the assumption of a single app. Decision table as
originally written:

| Condition | Fits Free tier? | Decision |
|---|---|---|
| Single app, prod + staging = 2 DBs | Yes | CONFIRMED: Continue with Prisma Postgres. No additional cost. |
| Multiple apps OR per-preview at scale | No (DB cap at 5) | Evaluate Neon |

Prisma Postgres Free tier: 5 databases max. Paid tiers: Starter $10/mo, Pro $49/mo.

### cmd_292 ruling: Neon replaces Prisma Postgres

**Reason for reversal:** Prisma Postgres Free tier caps at 5 databases. At scale (multi-app
deployments, per-preview independent DBs), this cap is a structural constraint. Neon Free
tier offers 100 projects and 10 branches/project — far more headroom.

**Neon Free tier (confirmed 2026-07-07):**
- 100 projects / account
- 10 branches / project
- 0.5 GB storage / project (5 GB total)
- 100 compute-hours / project / month (scale-to-zero after 5 min inactivity)
- Source: https://neon.com/docs/introduction/plans

**Neon vs Prisma Postgres comparison:**

| Feature | Prisma Postgres | Neon |
|---------|-----------------|------|
| Free DB count | 5 databases | 100 projects × 10 branches |
| Connection pooling | Accelerate (bundled) | PgBouncer pooled endpoint (built-in) |
| Preview branch support | Manual | Native (per-branch Neon branch) |
| ORM | Prisma (bundled) | Prisma (ORM unchanged, datasource only) |
| Extension support | Limited (pg_trgm yes, pg_bigm unknown) | Broader |

**Connection pooling on Vercel serverless (important):**
With Prisma Postgres, Accelerate was the connection pooler (`prisma+postgres://` URL →
`withAccelerate()` in lib/prisma.ts). With Neon, Accelerate is NOT used. Instead:
- Use Neon's **pooled endpoint** (`*-pooler.neon.tech` hostname, PgBouncer transaction mode)
- This handles connection multiplexing at Neon's infrastructure layer
- `lib/prisma.ts` uses `DATABASE_URL` → `pg.Pool` path — works with both
  Cloud SQL socket (GCP) and Neon pooled URL (Vercel)
- `@neondatabase/serverless` (HTTP-based) is **NOT needed** — that is for Edge Functions
  (V8 isolate, no TCP stack). Vercel serverless functions support TCP and Fluid compute
  allows connection reuse. PgBouncer pooled endpoint is the correct choice.
- Source: https://neon.com/docs/connect/choose-connection

**Note — Accelerate and load-testing:** The switch from Prisma Accelerate to Neon pooled
endpoint means the `PRISMA_DATABASE_URL` path in `lib/prisma.ts` is no longer used for
Vercel. Connection pooling is now at Neon's PgBouncer layer. The connection exhaustion
risk (ref: memory/load-testing-plan.md) is mitigated by the pooled endpoint, but
Neon's connection_limit per compute unit and Neon plan limits should still be validated
in load testing.

### Prod/staging separation strategy

**Selected: branch-within-single-project** (Neon recommendation)

| Strategy | Description | Verdict |
|----------|-------------|---------|
| **Branch-per-env (1 project)** | `production` = production, `staging` = staging branch | ✅ Selected — efficient, fewer projects |
| Project-per-env | Separate Neon projects for prod and staging | Wastes project quota, unnecessary |

Implementation:
- 1 Neon project: `${NEON_PROJECT_NAME}` (e.g. `app-generator-sample`)
- `production` branch → `DATABASE_URL_PROD` (pooled), `DATABASE_URL_UNPOOLED_PROD` (direct)
- `staging` branch → `DATABASE_URL_STAGING` (pooled), `DATABASE_URL_UNPOOLED_STAGING` (direct)
- Unpooled endpoints are used only for `migrate:deploy` (DDL operations — PgBouncer
  transaction mode does not guarantee statement ordering for DDL)
- Source: https://neon.com/branching/production-staging-workflows

**Corrections found live, after this design was written (see `scripts/vercel-setup.sh`
Step A for the actual current logic):**
- A new Neon project's default branch is always named `main`, with no create-time flag
  to rename it — `vercel-setup.sh` renames it to `production` on first run
  (`ensure_production_branch`), idempotently.
- `aws-ap-northeast-1` is **not** an available Neon project-creation region for this
  account — the actual default is `aws-ap-southeast-1` (override via `NEON_REGION_ID`).
- A branch created via the raw REST API has no attached compute by default;
  `ensure_branch_compute` adds one before requesting a connection string.
- Connection-string retrieval uses the `neonctl` CLI (pinned devDependency, invoked via
  `node_modules/.bin/neonctl`), not the raw REST `connection_uri` endpoint — a direct
  REST pooled-connection fetch failed in a live run.

---

## 7. Two-DB Environment Variable Pattern (FS-6, updated for cmd_292)

> **cmd_292 update:** Variable names changed from `PRISMA_DATABASE_URL_*` to `DATABASE_URL_*`
> to reflect the switch from Prisma Accelerate URLs to standard Neon PostgreSQL URLs.
> The two-DB injection pattern (prod/staging share one staging DB) is unchanged.

`vercel-env.sh inject <environment>` injects a different DB URL depending on target:

| Target environment | Source var (in .env.production.local) | Injected as |
|---|---|---|
| `production` | `DATABASE_URL_PROD` | `DATABASE_URL` |
| `preview` | `DATABASE_URL_STAGING` | `DATABASE_URL` |

All preview (staging) deploys share the same `DATABASE_URL_STAGING` (Neon `staging`
branch pooled endpoint) — deliberate, keeps total Neon branch usage at 2 per project.

**Migrations use unpooled endpoints** (added in cmd_292):
`migrate:deploy` in `vercel-setup.sh` uses `DATABASE_URL_UNPOOLED_PROD` /
`DATABASE_URL_UNPOOLED_STAGING` (direct Neon endpoints) instead of the pooled
endpoints. PgBouncer transaction mode does not preserve DDL statement ordering across
connections, so migration must run on a direct connection.

---

## 8. Environment Variable Inventory

> **cmd_292 update:** `PRISMA_DATABASE_URL_PROD/STAGING` renamed to `DATABASE_URL_PROD/STAGING`.
> New vars added: `DATABASE_URL_UNPOOLED_PROD/STAGING`, `NEON_API_KEY`, `NEON_PROJECT_NAME`,
> `NEON_PROJECT_ID`, `VERCEL_BLOB_STORE_ID`, `BLOB_READ_WRITE_TOKEN`.

### 8.1 Variables Required on Vercel Production (cmd_292 updated)

| Variable | Required | Secret | Value Source | Notes |
|----------|----------|--------|------|-------|
| `DATABASE_URL_PROD` | **Critical** | sensitive | Auto: Neon provisioning (§14) | Neon pooled endpoint; injected as `DATABASE_URL` on `production` |
| `DATABASE_URL_STAGING` | **Critical** | sensitive | Auto: Neon provisioning (§14) | Neon pooled endpoint; injected as `DATABASE_URL` on `preview` |
| `AUTH_SECRET` | **Critical** | sensitive | generate-once-persist (`openssl rand -base64 32`) | Also used for attachment filename encryption and MFA TOTP |
| `REDIS_URL` | Required | sensitive | Auto: Upstash get-or-create (§15) | Format: `rediss://…` (Upstash global tier, shared with GCP) |
| `BLOB_READ_WRITE_TOKEN` | Required | sensitive | Auto: Vercel Blob get-or-create (§16) | Formerly manual-only (V-5 superseded — see §16) |
| `GOOGLE_CLIENT_ID` | Optional | encrypted | Manual: Google Cloud Console OAuth 2.0 | Required only if siteConfig enables Google provider |
| `GOOGLE_CLIENT_SECRET` | Optional | sensitive | Manual: Google Cloud Console OAuth 2.0 | Required only if siteConfig enables Google provider |
| `AUTH_TRUST_HOST` | Required | no | Static: `true` | Eliminates need for explicit `AUTH_URL` behind Vercel proxy |
| `NODE_ENV` | Required | no | Static: `production` | Disables dev-only features, enables production Prisma log levels |

### 8.2 Variables in .env.production.local (not injected to Vercel — provisioning use only)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL_UNPOOLED_PROD` | Neon direct endpoint (production branch) — used only for `migrate:deploy` in vercel-setup.sh |
| `VERCEL_ROOT_DIRECTORY` | Vercel project Root Directory (Projects API field, no `vercel.json` equivalent); defaults to `app-generator`. Set idempotently by `vercel-setup.sh` Step 1.5 via `PATCH /v9/projects/{id}` |
| `DATABASE_URL_UNPOOLED_STAGING` | Neon direct endpoint (staging branch) — used only for `migrate:deploy` in vercel-setup.sh |
| `NEON_API_KEY` | Neon API token for get-or-create provisioning |
| `NEON_PROJECT_NAME` | Neon project name (e.g. `app-generator-sample`) — used as get-or-create key |
| `NEON_PROJECT_ID` | Written by vercel-setup.sh after first provisioning; idempotency anchor |
| `UPSTASH_EMAIL` | Upstash account email — same credential used in `gcp-setup.sh` |
| `UPSTASH_API_KEY` | Upstash Management API key — same credential used in `gcp-setup.sh` |
| `UPSTASH_PRIMARY_REGION` | Upstash region for DB creation (e.g. `ap-northeast-1`) |
| `VERCEL_BLOB_STORE_ID` | Written by vercel-setup.sh after Blob store creation; idempotency anchor |
| `VERCEL_TOKEN` | Vercel personal token — env var only, never --token flag |
| `VERCEL_ORG_ID` | Vercel team scope |
| `VERCEL_PROJECT_NAME` | Vercel project name |

### 8.3 Variables NOT Set on Vercel (GCP-only)

`STATEMENT_TIMEOUT_MS` (applies only on the pg.Pool/direct-socket GCP branch — Neon
pooled endpoint handles timeouts at the pooler layer), `GCS_BUCKET`, `UPSTASH_EMAIL` /
`UPSTASH_API_KEY` / `UPSTASH_PRIMARY_REGION` (used by provisioning scripts only, not
runtime), `NEON_API_KEY` / `NEON_PROJECT_NAME` / `NEON_PROJECT_ID` (provisioning only),
`VERCEL_BLOB_STORE_ID` (provisioning only), `PROJECT_ID`/`REGION`/`INSTANCE_NAME` (GCP
infra), `SHADOW_DATABASE_URL`, `TEST_RESET_TOKEN`.

---

## 9. Pending Decisions

| ID | Severity | Item |
|---|---|---|
| PD-1 | resolved | Real provisioning + deploy: done. Production is live on Neon + Vercel. |
| PD-2 | low (resolved) | Staging/production DB isolation resolved as Neon branch-per-env within single project (§6). |
| PD-3 | medium, still open | uploads API → Vercel Blob migration (`app/api/uploads/[...path]/route.ts`). Confirmed still filesystem-based (`public/uploads/`) as of this writing — Blob token provisioning is automated (§16), but the app code migration itself has not been done. Separate task. |
| PD-4 | resolved | `BLOB_READ_WRITE_TOKEN` previously noted as "cannot automate". **Superseded:** `vercel blob create-store --environment` is used and connects the store to the project automatically (see §16). |
| PD-5 | resolved | `vercel blob get-store` has no `--output`/`--json` flag and never returns the RW token — token is instead read back via `vercel env pull` after `create-store --environment` auto-injects it (see §16). |

All decision points that once gated this section (Neon provisioning mechanism, prod/staging
separation strategy, Blob automation, live-provisioning go) are resolved and reflected in
the implementation described in §6, §14, and §16 above.

---

## 10. Confirmed Configuration Values (V-2, V-3, V-5, V-6, V-7)

- **V-2** project name (`VERCEL_PROJECT_NAME`) and **V-3** team (`VERCEL_ORG_ID`) —
  see `.env.production.local.example` for the current confirmed values, or run
  `vercel project ls` / inspect `.vercel/project.json` for the live-linked state.
  Not duplicated as literals here: if the target project/team changes, this
  section would otherwise go stale independently of the actual config file
  (confirmed 2026-07-28 to still match the live-linked project).
- **V-5** Vercel Blob (`BLOB_READ_WRITE_TOKEN`) — **cmd_292 update:** `vercel blob create-store` CLI is available; provisioning now automatable in vercel-setup.sh (§16). Uploads API code migration (`app/api/uploads/`) still tracked as PD-3 (separate cmd).
- **V-6** Upstash Redis shared with GCP (`REDIS_URL`, Upstash global tier, HTTP-based) — get-or-create in vercel-setup.sh (§15)
- **V-7** personal token (`VERCEL_TOKEN` env var only, never `--token` flag)

---

## 11. GCP Patterns Replicated in Implementation

| Pattern | GCP implementation | Vercel equivalent |
|---------|-------------------|-------------------|
| `.env.production.local` source of truth | `source "$_ENV_FILE"` at script start | Same — `source "$_ENV_FILE"` in `vercel-env.sh` |
| generate-once-persist for `AUTH_SECRET` | `openssl rand -base64 32` → write back to `.env.production.local` | Same pattern |
| Required-var guard | `: "${VAR:?message}"` | Same pattern |
| `DRY_RUN=true` mode | `run() { if DRY_RUN; then echo; else exec; fi }` | Same pattern |
| Secret non-echo | `printf '%s' "$value"` redirect | Same — never `echo` |
| Idempotent operations | GCP: `gcloud` upsert patterns | Vercel: `vercel env add --force` (upsert) |
| 2-step confirmation for teardown | `read -rp` twice | Same pattern in `vercel-teardown.sh` |

---

## 12. Risks and Mitigations

| Risk | Scenario | Mitigation |
|------|----------|-----------|
| Secret in bash history | `echo "$SECRET" \| vercel env add` | Always use `printf '%s' "$VALUE" \| vercel env add NAME production --force`. Never echo. |
| Submodule not checked out before CLI deploy | `vercel deploy` uploads a stale/empty `app-generator/` | `vercel-deploy.sh` runs `git submodule update --init --recursive` then `test -d app-generator/app` before deploying |
| `PRISMA_DATABASE_URL` missing | Accelerate URL not set → app has no DB connection at all on Vercel (there is no direct-socket fallback available in the Vercel network) | Required-var guard (`: "${VAR:?...}"`) in `vercel-env.sh` before injection |
| Sensitive var type for production | Sensitive vars cannot be read back via CLI/dashboard | `.env.production.local` is the source of truth — never lose it |
| `--force` overwrites intended value | Re-running `vercel-env.sh` overwrites a manually-updated var | Script warns: re-run overwrites. `DRY_RUN` mode available |
| Mixed production/preview in one command | `vercel env add NAME production preview < file` behaves unexpectedly | Always add per-environment in separate commands |
| `VERCEL_TOKEN` exposure in process list | `--token $TOKEN` visible in `ps aux` | Use `VERCEL_TOKEN` env var, not `--token` flag |
| `migrate:deploy` accidentally added to `buildCommand` | A failed migration blocks ALL deploys | Migration only runs in `vercel-setup.sh`, never in `vercel.json` `buildCommand` |
| No persistent filesystem on Vercel | File uploads stored in `public/uploads/` fail | Out of scope for this automation; tracked as PD-3 |

---

## 13. Deliverables

| File | Contents |
|------|----------|
| `docs/vercel-automation-design.md` | This document (moved + updated from app-generator-2) |
| `vercel.json` | Explicit build config (§3.2) |
| `.env.production.local.example` | Vercel section, two-DB pattern (§7) |
| `scripts/vercel-env.sh` | Source `.env.production.local`, validate, generate-once-persist `AUTH_SECRET`, inject vars per-environment (two-DB) |
| `scripts/vercel-setup.sh` | `vercel link` + `vercel-env.sh` inject + one-time `migrate:deploy` |
| `scripts/vercel-deploy.sh` | Submodule checkout guard + `vercel deploy [--prod]` |
| `scripts/vercel-teardown.sh` | Remove all env vars + unlink |

**Scope note (cmd_290):** no real Vercel operations are executed in this implementation
(PD-1). Verification is limited to `bash -n` syntax checks, `DRY_RUN=true` execution
paths, required-var guard behavior, and secret non-exposure checks.

All scripts are written in English (maintained deliverable).

---

## 14. Neon Provisioning: get-or-create (cmd_292, implemented)

> **Source:** https://api-docs.neon.tech/reference/createproject

**Current implementation lives in `scripts/vercel-setup.sh` Step A** — the pseudocode
originally sketched here (raw `curl` calls against the Neon REST API) is superseded and
has been removed from this document to avoid duplicating logic that has since diverged
from what actually ships. Read the script directly; it is extensively commented with the
live findings that shaped it. Summary of what it does:

- `NEON_PROJECT_ID` (persisted in `.env.production.local`) is the idempotency anchor —
  set → skip creation; unset → list projects by `NEON_PROJECT_NAME`, or create new.
- Connection strings are fetched via the `neonctl` CLI (pinned devDependency), not raw
  REST — a direct REST pooled-connection fetch failed in a live run.
- Project region is `aws-ap-southeast-1` (`aws-ap-northeast-1` is not available for
  project creation on this account/org), overridable via `NEON_REGION_ID`.
- The default branch (`main` at creation) is renamed to `production`, idempotently.
- A branch with no attached compute (e.g. a freshly-REST-created `staging` branch) gets
  one attached before a connection string is requested.
- Values are written back to `.env.production.local` with careful escaping — Neon
  connection strings contain literal `&` (e.g. `&channel_binding=require`), which both
  `set -a; source` and `sed` replacement text can otherwise mis-handle.

---

## 15. Upstash Redis get-or-create (Vercel — symmetric to gcp-setup.sh, implemented)

> **Design:** Mirror of `gcp-setup.sh` Step 4.5. GCP and Vercel share a **single Upstash
> instance**, so `REDIS_URL` is identical between the two deploy paths.  
> **Source:** https://upstash.com/docs/devops/developer-api/authentication

**Current implementation lives in `scripts/vercel-setup.sh` Step B.** Key points:
- Same DB name convention as `gcp-setup.sh` (`${UPSTASH_DB_NAME:-app-generator-sample-redis}`)
  → same Upstash instance → `REDIS_URL` identical between GCP and Vercel; if GCP already
  provisioned it, the list-by-name check returns `[SKIP]`.
- `list`/`get` responses omit the password — it is reset (rotated) only when no usable
  `REDIS_URL` is already persisted, so ordinary re-runs don't rotate a live password.
- Upstash Management API auth: `Authorization: Basic base64(EMAIL:API_KEY)`.

---

## 16. Vercel Blob get-or-create (cmd_292, implemented — supersedes PD-4 "cannot automate")

> **Source:** https://vercel.com/docs/vercel-blob/manage-blob-storage

**Current implementation lives in `scripts/vercel-setup.sh` Step C.** `vercel blob
create-store` is an official CLI command — the original PD-4 "cannot automate" verdict
was incorrect. `VERCEL_BLOB_STORE_ID` (persisted in `.env.production.local`) is the
idempotency anchor.

**PD-5 resolved, differently than originally planned:** `vercel blob get-store` has no
`--output`/`--json` flag at all and never returns the read-write token regardless of
format — parsing its output was never viable. The working path instead: `vercel blob
create-store --environment production --environment preview` connects the new store to
the linked project, which auto-injects `BLOB_READ_WRITE_TOKEN` into that project's env;
the token is then read back via `vercel env pull` (a store predating the
`--environment` auto-connect flag has no CLI-only path — connect it via the dashboard's
Storage → Connect to Project, then re-run).

---

## 16. Script File Changes Summary (cmd_292 — for implementation)

### vercel.json (app-template root)

Historical note only — this file was removed in cmd_484 (see §17). It was
dead configuration by the time of the cmd_292 addendum (no live project's
Root Directory pointed at the app-template repo root), so this section's
original "no changes required" verdict was moot in practice, not merely
unaffected by the cmd_292 DB-provider change.

---

## 17. Build Strategy Correction (cmd_484): Root Directory = `app-generator`, not root `vercel.json`

> **Superseded:** §1 ("Deploy Target"), §3 ("Build Command"), §3.1, §3.2, and
> the `vercel.json` deliverable in §13/§16 above. Kept for historical record;
> do not follow §3/§3.2 for new setup — follow this section instead.

### 17.1 What actually ships

Every Vercel project connected to this repository sets **Project Settings →
Root Directory = `app-generator`**, not the app-template superproject root.
Confirmed 2026-07-29 via `vercel project inspect <name>` (team `rhymion-labs`)
against all four projects with build history rooted in this repo:

| Project | Root Directory | Build Command (effective) |
|---|---|---|
| `app-generator-sample` | `app-generator` | `npm run vercel-build` |
| `sample-app` | `app-generator` | `npm run vercel-build` |
| `oshicry` | `app-generator` | `npm run vercel-build` |
| `real-estate` | `app-generator` | `npm run vercel-build` |

With Root Directory set this way, Vercel reads **`app-generator/vercel.json`**
(inside the submodule), not any file at the app-template superproject root.
`app-generator/vercel.json`'s `buildCommand` is `npm run vercel-build`, which
runs `app-generator/package.json`'s `vercel-build` script:

```
run-s prj:sync python-generate migrate:deploy db:generate db:seed-tenant build
```

This **does** run code generation at build time (`python-generate` = `uv venv
--python 3.12 .venv && ... && npm run generate-code`) — no pre-generated-commit
strategy is needed, and none is in effect. Generated application code
(`app/`, `components/`, `lib/`, etc.) is produced fresh on every build rather
than being committed to the submodule.

This design is also already implemented in automation, not just observed:
`scripts/vercel-setup.sh` Step 1.5 ("Ensure Vercel project Root Directory")
reads and, if necessary, `PATCH`es a linked project's `rootDirectory` to
`${VERCEL_ROOT_DIRECTORY:-app-generator}` via the Vercel Projects API. The
automation was evidently updated to this design after this document (§3.2)
was written, and this document was never updated to match — that gap is what
cmd_484 closes.

### 17.2 Python/uv availability in the Vercel build container — §3's claim was never tested and is false

§3 ("Why the existing scripts don't work on Vercel") asserted "no Python/uv
available in the Vercel build environment" as the reason code generation
could not run in `buildCommand`. This was never empirically verified when
written (cmd_290, 2026-07-07) and is **false**: production build
logs for `app-generator-sample` (deployed 2026-07-24), `sample-app`
(2026-06-26), and `real-estate` (2026-06-05) all show `uv venv --python 3.12
.venv && ... && npm run generate-code` completing successfully as part of
`npm run vercel-build`, followed by `Build Completed`. `uv` provisions its
own Python 3.12 interpreter at build time; no system Python needs to be
preinstalled in the Vercel image. This same unverified assumption was
independently repeated (not re-verified against the live build environment)
in an earlier cmd_480 investigation report — both trace back to this
document's original, untested §3 claim. Lesson: a claim about what a runtime
environment can or cannot do must be checked against that runtime directly
(actual build logs, or a real deploy) — restating an earlier design
document's stated rationale, however confidently worded, is not
verification.

### 17.3 Disposition of root-level `vercel.json`

Deleted (cmd_484). It specified `buildCommand: bash scripts/sync-prj.sh &&
npm --prefix app-generator run db:generate && npm --prefix app-generator run
build` — a "pre-generated commit" strategy (§3) that both (a) was never
actually deployed by any live project, per §17.1, and (b) would have relied
on committed generated code, which the design principle recorded in §3
itself explicitly aimed to avoid once code generation was proven to work in
the Vercel build container (§17.2). Keeping it around as inert, misleading
configuration was itself a source of confusion. `README.md` / `README_ja.md`
already document the correct, live procedure ("Set Root Directory to
`app-generator/`") and required no changes for this correction.

`scripts/sync-prj.sh` is retired as a follow-up to this correction: with the
root `vercel.json` gone, and `package.json`'s `dev`/`build` switched to
`prj:sync` (see §17.6), it had zero remaining callers and has been deleted
outright.

### 17.4 Standing pitfall: a dashboard Build/Install Command override outlives a Root Directory change

Not part of this correction's changes, but recorded here since it is exactly
the design property that made §17.1's outcome possible and is worth guarding
against going forward: a Vercel project's dashboard-level Build/Install
Command **override** (set once via the dashboard UI or the Projects API, not
via `vercel.json`) takes precedence over `vercel.json` and does **not**
auto-adjust when Root Directory is changed afterward. A command written for
one Root Directory (e.g. one that includes `--prefix app-generator`, written
when Root Directory was the repository root) silently breaks once Root
Directory is changed to `app-generator` — the command still runs, but now
resolves paths relative to a cwd that has already moved one level down,
producing a doubled path (`app-generator/app-generator/...`) and a
`package.json`-not-found failure. Any future Root Directory change should be
paired with a check of whether a Build/Install Command override is set on
the project (Project Settings → Build & Development Settings — an "Override"
toggle next to each of Build/Install/Output Command) and, if so, whether it
still matches the new Root Directory.

### 17.5 Confirmed rule (cmd_485): a root-level `vercel.json` must never exist in this repository

**Rule:** `vercel.json` must not be recreated at the app-template repository
root, for any reason, regardless of what Root Directory is set to in the
dashboard. Directly confirmed as the cause of an actual (not hypothetical)
deploy failure: with Root Directory already set to `app-generator` (§17.1),
the root-level `vercel.json` this document originally specified (§3.2)
still had its `buildCommand`/`installCommand` applied — both written
assuming a repository-root cwd (`npm --prefix app-generator run …`) — on
top of a build cwd Vercel had already moved to `app-generator/` via the
Root Directory setting. The two `--prefix app-generator` segments stacked
into a doubled path (`/vercel/path0/app-generator/app-generator/`) and the
build failed with a missing-`package.json` error. Deleting the file
(cmd_484) is what fixed this deploy: with no root `vercel.json` present,
Vercel fell through to **`app-generator/vercel.json`** (`buildCommand: npm
run vercel-build`), which succeeded.

This is the same failure shape as §17.4's dashboard-override pitfall — a
build-command source written for one cwd silently breaking once Root
Directory moves the effective cwd — except the source here is a **committed
file** rather than a dashboard setting, which is why it is called out as its
own numbered rule: a dashboard override is at least visible and auditable
per-project in Project Settings, but a committed root `vercel.json` is
invisible in that view and will silently reappear (and refail, the same
way) for every project built from this repo if anyone re-adds it — e.g.
while "restoring" what looks like missing Vercel config, or copying a
pattern from an older revision of this document. Consistent with this
project's general preference for not committing generated/deploy-config
output that the platform can already derive on its own —
`app-generator/vercel.json` is the single source of truth for the build
command that actually ships.

**`app-generator/vercel.json`'s `buildCommand` runs `npm run vercel-build`**,
confirmed by reading `app-generator/package.json` (no live deploy needed —
static config, §17.1):

```
"vercel-build": "run-s prj:sync python-generate migrate:deploy db:generate db:seed-tenant build"
```

This **does** include `migrate:deploy` and `db:seed-tenant` on every single
build/deploy (not just first-time setup) — confirmed by the script
definition itself, not inferred.

**Which DB a build's `migrate:deploy`/`db:seed-tenant` touch**, confirmed by
reading the environment-variable injection config (§7, §8 — no live check
performed):
- `vercel-env.sh inject preview` sets `DATABASE_URL` to `DATABASE_URL_STAGING`
  (Neon `staging` branch, **pooled** endpoint) for `preview` deployments; a
  `production` deploy gets `DATABASE_URL_PROD` instead (§7 table). Every
  preview deploy across every branch shares the one staging DB — deliberate
  (§7).
- The `migrate:deploy` embedded in `vercel-build` runs against whatever
  `DATABASE_URL` the build environment has — i.e. the **pooled** endpoint on
  both `preview` and `production`. This is a different code path from
  `vercel-setup.sh`'s own one-time `migrate:deploy` call, which explicitly
  uses the **unpooled** endpoints (§7, "Migrations use unpooled endpoints")
  because PgBouncer transaction mode does not preserve DDL statement
  ordering. §7's unpooled-endpoint rationale therefore does not cover the
  `migrate:deploy` that runs inside `vercel-build` on every ordinary
  build/deploy — this is a config-reading observation only, not something
  this task investigates or fixes further.

### 17.6 `scripts/sync-prj.sh` retired (cmd_485)

`scripts/sync-prj.sh` has been deleted. Root `package.json`'s `dev` and
`build` scripts now run `npm --prefix app-generator run prj:sync` (i.e.
`app-generator/scripts/prj_sync.py`) instead of `bash scripts/sync-prj.sh`,
matching `test:e2e:build` and `generate-code`, which already used `prj:sync`.
`prj:sync` also deep-merges `messages/*.json` rather than overwriting it
wholesale — a strict improvement over the plain `cp -a` `sync-prj.sh` used.

**Lineage of this decision, for anyone reading the git history:** an earlier
branch (commit `1ef16c4`)
concluded the opposite — *keep* `sync-prj.sh` and narrow its callers to
`vercel.json` only, reasoning that the Vercel build container had no Python
runtime to run `prj_sync.py`. That conclusion does not apply here, for two
independent reasons:

1. Its premise for keeping the file — a root-level `vercel.json` that needed
   a Python-free sync mechanism — no longer exists; that file was deleted for
   an unrelated, confirmed deploy-breaking reason (§17.3/§17.5).
2. Its premise about Python availability was itself never actually verified
   empirically and turned out to be false: §17.2 confirms the Vercel build
   container **does** have Python available (`uv` provisions its own Python
   3.12 at build time). So even independent of point 1, routing through
   `scripts/sync-prj.sh` to avoid a Python dependency was never necessary.

With both premises gone, `1ef16c4`'s content (the `dev`/`build` → `prj:sync`
switch) was carried forward into this change, but its file-retention
rationale was not — `scripts/sync-prj.sh` had zero remaining callers
anywhere in this repository once `dev`/`build` switched, and was deleted in
the same change rather than kept "just in case."

`prj:sync` requires Python 3 to run, but this introduces no new prerequisite:
`test:e2e:build` and `generate-code` already required Python 3 before this
change (see the Prerequisites table in `README.md`/`README_ja.md`).

## 18. `DIRECT_URL` wired into Vercel (cmd_657 follow-up, 2026-08-12)

### 18.1 What changed

`scripts/vercel-env.sh`'s `vercel_env_inject()` now injects a `DIRECT_URL`
Vercel env var (Production and Preview) alongside the existing `DATABASE_URL`,
sourced from `DATABASE_URL_UNPOOLED_PROD` / `DATABASE_URL_UNPOOLED_STAGING`.
Both values were already being fetched from Neon and persisted to
`.env.production.local` by `vercel-setup.sh`'s `get_neon_connection_strings()`
— nothing new is fetched. What was missing was forwarding the already-present
unpooled value to Vercel. Re-running `vercel-setup.sh` (idempotent, same as
every other var it injects) is sufficient to apply this — no manual Vercel
dashboard step.

This closes the gap `app-generator`'s `prisma.config.ts` (cmd_657,
`docs/knowledge/prisma-direct-vs-pooled-connection.md` in that repo) depends
on: on Vercel, that file now requires `DIRECT_URL` to be set and throws at
config-load time if it isn't. Before this change, nothing set it on Vercel.

**Naming decision:** the Vercel-side variable is named `DIRECT_URL` (Prisma's
convention), not `DATABASE_URL_UNPOOLED_PROD`/`_STAGING` (this repo's local
`.env.production.local` convention). This isn't a stylistic pick between two
equally-valid options — `prisma.config.ts` in `app-generator` already reads
`process.env.DIRECT_URL` specifically (added in a prior change, merged
ahead of this one); naming the Vercel env var anything else would mean the value never
reaches the code that consumes it. The two conventions are kept in their own
layers rather than mixed: `.env.production.local` (local persistence, this
repo) keeps its existing `DATABASE_URL_UNPOOLED_*` names; `DIRECT_URL` is
only the name of the Vercel-injected variable, matching what the consuming
`prisma.config.ts` reads.

### 18.2 Corrected: `migrate:deploy` **is** part of `buildCommand`

`scripts/vercel-setup.sh`'s Step 3/5 comments previously claimed `prisma
migrate deploy` was "deliberately NOT part of vercel.json buildCommand,"
citing §3. The Step 3 migration call itself (one-time, local, unpooled) was
never wrong — only that claim was. Lineage, traced via `git log` across both
repos rather than a point-in-time `grep` (a `grep` alone would only show
today's mismatch, not whether the comment was ever accurate):

- The comment was added in `de54bd0` (cmd_290, 2026-07-07). At that commit,
  app-template's **root-level** `vercel.json` existed with a buildCommand
  (`bash scripts/sync-prj.sh && npm --prefix app-generator run db:generate &&
  ... build`) that genuinely did **not** include `migrate:deploy` — the claim
  was correct for the config actually in effect at the time.
- `app-generator/vercel.json`, whose buildCommand (`npm run vercel-build`)
  *does* include `migrate:deploy`, had existed since `74383f86`
  (2026-05-24) — predating the comment — but was not yet the operative
  config: Root Directory pointed at the app-template repository root, so
  Vercel read the root `vercel.json`, not the submodule's.
- `9cfdd7c` (cmd_484, 2026-07-29) deleted the root-level `vercel.json` as
  dead configuration (§17.3) once Root Directory was confirmed to already be
  `app-generator` in practice. From that point on, `app-generator/vercel.json`
  became the operative buildCommand — the one that includes `migrate:deploy`
  — but the Step 3/5 comments in `vercel-setup.sh` were never updated to
  match. §17.5 (this same cmd_484 correction) already established the
  current reality; this task closes the remaining stale comment cmd_484
  missed.

**Verdict: the comment went stale, it was not wrong from the start.** It
accurately described app-template's build config as it stood on
2026-07-07 and stopped matching reality only after cmd_484's Root Directory
correction on 2026-07-29. The Step 3/5 comments have been corrected in
place; see the script for the current rationale (schema must exist before
Step 4/5.5's `db:seed-tenant`, which is not part of `buildCommand`).

One practical consequence, not itself investigated or changed by this task:
the `migrate:deploy` embedded in `vercel-build` now also picks up `DIRECT_URL`
(via `prisma.config.ts`'s `directMigrationUrl || DATABASE_URL` — see the
app-generator doc above) once this Vercel-env change is applied via
`vercel-setup.sh`, so the every-build `prisma migrate deploy` inside
`vercel-build` moves off the pooled connection too, not just
`vercel-setup.sh`'s own one-time calls (which already used the unpooled value
directly and were never affected by this gap).

### 18.3 Whether `migrate:deploy` should keep running on every build

Out of scope for this task (cmd_657's addendum scoped it to the connection
target, not the timing) — flagged upstream instead of changed. `vercel-build`
running `prisma migrate deploy` on every ordinary Vercel build/deploy means a
bad migration can block all Vercel deploys, as `vercel-setup.sh`'s original
(now-corrected) Step 3 comment warned about in the first place, just
attributed to the wrong file.

---

## 19. Three-stage split: setup / deploy / seed, and the SSL warning fix (cmd_691, 2026-08-14)

### 19.1 Why `vercel-setup.sh` no longer runs migrate/seed

`vercel-setup.sh`'s old Steps 3/4/5/5.5 ran `migrate:deploy`/`db:seed-tenant`
against production, then staging, as the last part of setup. Two problems,
both about *when* a step runs, not *who* owns it (§18.2 already established
who owns `migrate:deploy`: `vercel-build`, not `vercel-setup.sh`):

- **Redundant owner for migrate.** `vercel-build` already runs
  `migrate:deploy` on every deploy. A second, earlier call inside
  `vercel-setup.sh` added no coverage `vercel-deploy.sh`'s first run
  wouldn't already provide, just an extra place migration failures could
  surface.
- **Wrong-order risk for seed.** `vercel-setup.sh` runs *before* the first
  deploy. If migration ownership ever moved earlier (or a future change
  reordered steps), seeding before any deploy has happened means seeding a
  database with no schema yet — a silent, hard-to-diagnose failure mode:
  relying on operators to run things in the right order, with no check,
  eventually fails when someone doesn't.

The fix: split into three scripts, each with one job, run in a fixed order —
`vercel-setup.sh` (control plane: provisioning, project link, env vars — no
DB writes) → `vercel-deploy.sh` (creates the schema, via `vercel-build`'s
`migrate:deploy`) → `vercel-seed.sh` (new; bootstrap data). `vercel-seed.sh`
does not just assume the order was followed — it checks `prisma migrate
status` before seeding and stops with a plain-language message if the schema
isn't there yet (§4's `gcp-seed.sh` uses the same pattern: check the
prerequisite is real before touching data, don't just document it and hope).

Verified live, without touching Vercel/Neon: a scratch local Postgres
container with no migrations applied reproduces the "someone ran
`vercel-seed.sh` before any deploy" scenario. `vercel-seed.sh` against it:

```
[Guard] Checking schema exists (migration state)...
ERROR: schema is not ready for seeding on staging.

  ...
  No migration found in prisma/migrations
  The current database is not managed by Prisma Migrate.
  ...

  If the message above says no migration is applied yet / database not
  managed by Prisma Migrate:
    Run scripts/vercel-deploy.sh (or git push to trigger Vercel auto-deploy)
    first, then re-run this script.
```

exit 1, no seed attempted. Against the same container after a real
`migrate deploy` (full schema applied, `_prisma_migrations` populated): the
guard reports "Schema confirmed", `db:seed-tenant` runs, and prints "Tenant
seeded successfully!" — re-running it a second time is a no-op success
(idempotent), same as `db:seed-tenant`'s existing upsert-based writes always
were.

**A note on the guard's own implementation** (found only by running it, not
by reading the design): an earlier version of this guard matched
`migrate status`'s output against fixed message strings (`"No migration
found in the migrations directory"`, `"P1001|P1017|..."`). Neither string
occurs verbatim in this Prisma version's real output, and this repo (unlike
a real consumer with committed migrations) has zero migration files of its
own, so the same "No migration found in prisma/migrations" line appears on
*both* a schema-less database (real problem) and an up-to-date one (fine) —
text matching can't tell them apart, and the original pattern silently fell
through to "confirmed" on every failure mode it didn't happen to match,
including an unrelated `prisma.config.ts` load error. The guard now keys on
`prisma migrate status`'s exit code instead (0 = proceed, nonzero = stop and
show the real output) — the only signal confirmed reliable across all cases
tested.

### 19.2 SSL deprecation warning: root cause and fix

Separately, a warning appeared during `db:seed-tenant`:

```
Warning: SECURITY WARNING: The SSL modes 'prefer', 'require', and
'verify-ca' are treated as aliases for 'verify-full'. In the next major
version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt
standard libpq semantics, which have weaker security guarantees.
```

This is an `app-generator`-side fix (`lib/db-url.ts`, applied in
`lib/prisma.ts` and `scripts/seed-tenant.ts`), reached by this repo's own
submodule pointer bump rather than duplicated here — see
`app-generator/docs/knowledge/pg-connection-string-sslmode-deprecation.md`
for the full root-cause writeup (source of the warning, why it's harmless
today, why it would become a real regression after the next major version,
and the fix). Summary: Neon's connection strings embed
`sslmode=require`, which `pg-connection-string` warns about but currently
treats identically to `sslmode=verify-full` (byte-identical resulting `ssl`
config, confirmed by direct inspection of the installed
`pg-connection-string@2.11.0` source and by a live `pg.Pool` connection
attempt with each). Pinning to `verify-full` explicitly silences the warning
today and — per the deprecation message's own guidance — keeps that same
verification strength after the next major version, instead of drifting to
weaker libpq semantics along with everyone who left it unpinned.
`prisma migrate deploy` (`vercel-build`) is unaffected — Prisma's migration
engine doesn't use the `pg-connection-string` npm package at all.
