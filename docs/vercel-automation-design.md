# Vercel Environment Automation Script Design

**Created:** 2026-07-07
**Status:** cmd_292 addendum in progress — V-1 (DB) and V-5 (Blob) superseded by approved ruling (see §6, §15)
**Scope:** Vercel production deployment automation for app-template (proj_c)
**Mirrors:** `scripts/gcp-*.sh` (parallel automation suite for the GCP Cloud Run path,
in the app-generator repository's `scripts/`)
**Supersedes:** the original draft of this document, previously located at
`docs/knowledge/vercel-automation-design.md` in the app-generator repository
(see redirect note left at that path).

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

### Step 1: Prepare `.env.production.local`

```bash
cp .env.production.local.example .env.production.local
# Fill in:
#   AUTH_SECRET                    — leave blank for auto-generation in Step 2
#   REDIS_URL                      — obtain from Upstash Console
#   GOOGLE_CLIENT_ID / SECRET      — from Google Cloud Console (if using Google OAuth)
#   PRISMA_DATABASE_URL_PROD       — leave blank until DB provider decision (§7) is executed
#   PRISMA_DATABASE_URL_STAGING    — leave blank until DB provider decision (§7) is executed
```

### Step 2: Authenticate and Link Project

```bash
export VERCEL_TOKEN="<your-token>"    # from vercel.com/account/tokens — env var only, never --token flag
bash scripts/vercel-setup.sh          # runs: vercel link --yes --project $VERCEL_PROJECT_NAME
```

### Step 3: Obtain Prisma Postgres / Accelerate URLs (Manual — Cannot Automate)

See §7 (DB provider decision gate) — two URLs are needed:
`PRISMA_DATABASE_URL_PROD` and `PRISMA_DATABASE_URL_STAGING`.

### Step 4: Inject Environment Variables + Run First Migration

```bash
bash scripts/vercel-setup.sh
```

`vercel-setup.sh`:
1. Links the Vercel project (`vercel link`)
2. Sources `vercel-env.sh` to inject all required vars, per target environment
   (`production` → `PRISMA_DATABASE_URL_PROD`; `preview` → `PRISMA_DATABASE_URL_STAGING`)
3. Runs `npm --prefix app-generator run migrate:deploy` once, against the production
   DB, before the first deploy (this step is deliberately **not** part of the build
   command — see §3)

### Step 5: Verify Env and Trigger Deploy

```bash
vercel env ls production     # confirm all vars are listed
git push origin main         # Vercel auto-deploys on push (preferred path)
# Or: bash scripts/vercel-deploy.sh [--prod]   # manual CLI deploy
```

### On Teardown

```bash
bash scripts/vercel-teardown.sh
```

---

## 6. DB Provider Decision Gate (V-1)

> **⚠ cmd_292 ruling (2026-07-07): V-1 superseded.**
> Prisma Postgres is replaced by **Neon** as the Vercel DB provider.
> The original Prisma Postgres decision and rationale are preserved below for audit trail.
> Active design: see §13 (Neon provisioning) and §8.1 (updated env var inventory).

### Original decision (cmd_290 / subtask_290b) — superseded

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
| **Branch-per-env (1 project)** | `main` = production, `staging` = staging branch | ✅ Selected — efficient, fewer projects |
| Project-per-env | Separate Neon projects for prod and staging | Wastes project quota, unnecessary |

Implementation:
- 1 Neon project: `${NEON_PROJECT_NAME}` (e.g. `app-generator-sample`)
- `main` branch → `DATABASE_URL_PROD` (pooled), `DATABASE_URL_UNPOOLED_PROD` (direct)
- `staging` branch → `DATABASE_URL_STAGING` (pooled), `DATABASE_URL_UNPOOLED_STAGING` (direct)
- Unpooled endpoints are used only for `migrate:deploy` (DDL operations — PgBouncer
  transaction mode does not guarantee statement ordering for DDL)
- Source: https://neon.com/branching/production-staging-workflows

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
| `DATABASE_URL_PROD` | **Critical** | sensitive | Auto: Neon provisioning (§13) | Neon pooled endpoint; injected as `DATABASE_URL` on `production` |
| `DATABASE_URL_STAGING` | **Critical** | sensitive | Auto: Neon provisioning (§13) | Neon pooled endpoint; injected as `DATABASE_URL` on `preview` |
| `AUTH_SECRET` | **Critical** | sensitive | generate-once-persist (`openssl rand -base64 32`) | Also used for attachment filename encryption and MFA TOTP |
| `REDIS_URL` | Required | sensitive | Auto: Upstash get-or-create (§14) | Format: `rediss://…` (Upstash global tier, shared with GCP) |
| `BLOB_READ_WRITE_TOKEN` | Required | sensitive | Auto: Vercel Blob get-or-create (§15) | Formerly manual-only (V-5 superseded — see §15) |
| `GOOGLE_CLIENT_ID` | Optional | encrypted | Manual: Google Cloud Console OAuth 2.0 | Required only if siteConfig enables Google provider |
| `GOOGLE_CLIENT_SECRET` | Optional | sensitive | Manual: Google Cloud Console OAuth 2.0 | Required only if siteConfig enables Google provider |
| `AUTH_TRUST_HOST` | Required | no | Static: `true` | Eliminates need for explicit `AUTH_URL` behind Vercel proxy |
| `NODE_ENV` | Required | no | Static: `production` | Disables dev-only features, enables production Prisma log levels |

### 8.2 Variables in .env.production.local (not injected to Vercel — provisioning use only)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL_UNPOOLED_PROD` | Neon direct endpoint (main branch) — used only for `migrate:deploy` in vercel-setup.sh |
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
| PD-1 | high | Real provisioning + deploy go: after `NEON_API_KEY` / `VERCEL_TOKEN` handoff. This design/implementation phase = scripts only, no live Vercel/Neon operations. |
| PD-2 | low (resolved) | Staging/production DB isolation resolved as Neon branch-per-env within single project (§6). |
| PD-3 | medium | uploads API → Vercel Blob migration (`app/api/uploads/[...path]/route.ts`). Separate cmd. The `BLOB_READ_WRITE_TOKEN` provisioning is now automatable (§15), but the app code migration is still out of scope here. |
| PD-4 | resolved (cmd_292) | `BLOB_READ_WRITE_TOKEN` previously noted as "cannot automate". **Superseded:** `vercel blob create-store` CLI is available and supported (see §15). |
| PD-5 | low | `vercel blob get-store` output format for token extraction — needs verification during implementation (§15). |

**cmd_292 decision point (for maintainer decision — must be resolved before implementation):**

| ID | Decision point | Design-review recommendation |
|---|---|---|
| DC-1 | Neon provisioning機構: Marketplace Integration vs API直接 | **API (vercel-setup.sh get-or-create)** — scriptable, get-or-create symmetric to gcp-setup.sh; Marketplace adds new instance only |
| DC-2 | Neon prod/staging分離: project分離 vs branch分離 | **Branch分離 (1 project, main=prod, staging=staging branch)** — Neon推奨, fewer projects, efficient |
| DC-3 | Vercel Blob自動化: `vercel blob create-store` を組み込む | **Yes — 自動化** (PD-4 superseded). get-or-create with VERCEL_BLOB_STORE_ID anchor |
| DC-4 | live provisioning実施: NEON_API_KEY / VERCEL_TOKEN handoff timing | 殿go後に別cmd (PD-1 unchanged) |

---

## 10. Confirmed Configuration Values (V-2, V-3, V-5, V-6, V-7)

- **V-2** project name: `app-generator-sample` (`VERCEL_PROJECT_NAME`)
- **V-3** team: `team_dV6bZ5phXWZj0nuGdtinMzJQ` (`VERCEL_ORG_ID`)
- **V-5** Vercel Blob (`BLOB_READ_WRITE_TOKEN`) — **cmd_292 update:** `vercel blob create-store` CLI is available; provisioning now automatable in vercel-setup.sh (§15). Uploads API code migration (`app/api/uploads/`) still tracked as PD-3 (separate cmd).
- **V-6** Upstash Redis shared with GCP (`REDIS_URL`, Upstash global tier, HTTP-based) — get-or-create in vercel-setup.sh (§14)
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

## 13. Deliverables (this implementation — subtask_290c)

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

## 13. Neon Provisioning: get-or-create Design (cmd_292)

> **Source:** https://api-docs.neon.tech/reference/createproject  
> **Auth:** `Authorization: Bearer ${NEON_API_KEY}`

### Idempotency mechanism

`NEON_PROJECT_ID` stored in `.env.production.local` is the anchor. On re-run:
- If `NEON_PROJECT_ID` is set → skip creation, proceed to branch/connection check
- If unset → list projects, find by `NEON_PROJECT_NAME`, or create new

### Step-by-step (to be implemented in `vercel-setup.sh` Step A)

```bash
# ── Step A: Neon get-or-create ──────────────────────────────────────────────
echo "=== Step A: Neon get-or-create ==="
_NEON_AUTH="Authorization: Bearer ${NEON_API_KEY}"
_NEON_API="https://console.neon.tech/api/v2"

get_or_create_neon_project() {
  # If project ID already persisted, skip creation
  if [[ -n "${NEON_PROJECT_ID:-}" ]]; then
    echo "[SKIP] NEON_PROJECT_ID already set: ${NEON_PROJECT_ID}"
    return 0
  fi

  # Search existing projects by name
  _EXISTING=$(curl -sS -H "$_NEON_AUTH" "${_NEON_API}/projects" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data.get('projects', []):
    if p.get('name') == sys.argv[1]:
        print(json.dumps(p)); break
" "${NEON_PROJECT_NAME}")

  if [[ -n "$_EXISTING" ]]; then
    echo "[SKIP] Neon project ${NEON_PROJECT_NAME} already exists"
    NEON_PROJECT_ID=$(printf '%s' "$_EXISTING" | python3 -c \
      "import sys,json; print(json.load(sys.stdin)['id'])")
  else
    # Create new project
    _NEW=$(curl -sS -X POST -H "$_NEON_AUTH" -H "Content-Type: application/json" \
      -d "{\"project\":{\"name\":\"${NEON_PROJECT_NAME}\",
           \"region_id\":\"aws-ap-northeast-1\",\"pg_version\":16}}" \
      "${_NEON_API}/projects")
    NEON_PROJECT_ID=$(printf '%s' "$_NEW" | python3 -c \
      "import sys,json; print(json.load(sys.stdin)['project']['id'])")
    echo "  Created Neon project: ${NEON_PROJECT_NAME} (${NEON_PROJECT_ID})"
  fi

  # Persist to .env.production.local (idempotency anchor)
  if grep -q "^NEON_PROJECT_ID=" "${_ENV_FILE}" 2>/dev/null; then
    sed -i "s|^NEON_PROJECT_ID=.*|NEON_PROJECT_ID=${NEON_PROJECT_ID}|" "${_ENV_FILE}"
  else
    echo "NEON_PROJECT_ID=${NEON_PROJECT_ID}" >> "${_ENV_FILE}"
  fi
  export NEON_PROJECT_ID
}

get_neon_connection_strings() {
  # Get pooled (app) and unpooled (migrations) endpoints for a branch
  local branch_name="$1" var_pooled="$2" var_unpooled="$3"

  # Create staging branch if needed
  if [[ "$branch_name" == "staging" ]]; then
    _BRANCHES=$(curl -sS -H "$_NEON_AUTH" \
      "${_NEON_API}/projects/${NEON_PROJECT_ID}/branches")
    _STAGING_EXISTS=$(printf '%s' "$_BRANCHES" | python3 -c "
import sys, json
for b in json.load(sys.stdin).get('branches', []):
    if b.get('name') == 'staging': print('yes'); break
")
    if [[ "$_STAGING_EXISTS" != "yes" ]]; then
      curl -sS -X POST -H "$_NEON_AUTH" -H "Content-Type: application/json" \
        -d '{"branch":{"name":"staging"}}' \
        "${_NEON_API}/projects/${NEON_PROJECT_ID}/branches" > /dev/null
      echo "  Created Neon staging branch"
    else
      echo "[SKIP] Neon staging branch already exists"
    fi
  fi

  # Fetch connection URI (pooled)
  _CONN_POOLED=$(curl -sS -H "$_NEON_AUTH" \
    "${_NEON_API}/projects/${NEON_PROJECT_ID}/connection_uri\
?branch_name=${branch_name}&pooled=true")
  local pooled_url
  pooled_url=$(printf '%s' "$_CONN_POOLED" | python3 -c \
    "import sys,json; print(json.load(sys.stdin)['uri'])")

  # Fetch connection URI (direct/unpooled)
  _CONN_DIRECT=$(curl -sS -H "$_NEON_AUTH" \
    "${_NEON_API}/projects/${NEON_PROJECT_ID}/connection_uri\
?branch_name=${branch_name}&pooled=false")
  local direct_url
  direct_url=$(printf '%s' "$_CONN_DIRECT" | python3 -c \
    "import sys,json; print(json.load(sys.stdin)['uri'])")

  # Write to .env.production.local
  for pair in "${var_pooled}=${pooled_url}" "${var_unpooled}=${direct_url}"; do
    key="${pair%%=*}"; val="${pair#*=}"
    if grep -q "^${key}=" "${_ENV_FILE}" 2>/dev/null; then
      sed -i "s|^${key}=.*|${key}=${val}|" "${_ENV_FILE}"
    else
      echo "${key}=${val}" >> "${_ENV_FILE}"
    fi
  done
  eval "export ${var_pooled}=${pooled_url} ${var_unpooled}=${direct_url}"
  echo "  Set ${var_pooled} and ${var_unpooled}"
}

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY-RUN] Would get-or-create Neon project ${NEON_PROJECT_NAME:-<unset>}"
  DATABASE_URL_PROD="${DATABASE_URL_PROD:-<DRY_RUN_NEON_PROD>}"
  DATABASE_URL_STAGING="${DATABASE_URL_STAGING:-<DRY_RUN_NEON_STAGING>}"
  DATABASE_URL_UNPOOLED_PROD="${DATABASE_URL_UNPOOLED_PROD:-<DRY_RUN_NEON_UNPOOLED_PROD>}"
  DATABASE_URL_UNPOOLED_STAGING="${DATABASE_URL_UNPOOLED_STAGING:-<DRY_RUN_NEON_UNPOOLED_STAGING>}"
else
  : "${NEON_API_KEY:?NEON_API_KEY is required in .env.production.local}"
  : "${NEON_PROJECT_NAME:?NEON_PROJECT_NAME is required in .env.production.local}"
  get_or_create_neon_project
  get_neon_connection_strings "main" "DATABASE_URL_PROD" "DATABASE_URL_UNPOOLED_PROD"
  get_neon_connection_strings "staging" "DATABASE_URL_STAGING" "DATABASE_URL_UNPOOLED_STAGING"
fi
```

**Notes:**
- Neon API reference: https://api-docs.neon.tech/reference/createproject
- `connection_uri` endpoint: GET `/projects/{project_id}/connection_uri?branch_name=<name>&pooled=<true|false>`
- Pooled URL format: `postgresql://user:pass@ep-xxx-pooler.aws-ap-northeast-1.neon.tech/dbname?sslmode=require`
- Direct URL format: `postgresql://user:pass@ep-xxx.aws-ap-northeast-1.neon.tech/dbname?sslmode=require`

---

## 14. Upstash Redis get-or-create (Vercel — symmetric to gcp-setup.sh)

> **Design:** Mirror of `gcp-setup.sh` Step 4.5. Uses the same `UPSTASH_EMAIL` /
> `UPSTASH_API_KEY` credentials. GCP and Vercel share a **single Upstash instance**.  
> **Source:** https://upstash.com/docs/devops/developer-api/authentication

The Upstash provisioning code in `gcp-setup.sh` (helpers `_upstash_api`, `_upstash_parse_db`,
the Step 4.5 block) is extracted verbatim into a shared helper function and referenced from
both `gcp-setup.sh` and `vercel-setup.sh`. The DB name is `${SERVICE_NAME:-app-generator-sample}-redis`
(same in both scripts → same Upstash instance).

**Implementation approach for `vercel-setup.sh` Step B:**

```bash
# ── Step B: Upstash Redis get-or-create (shared with GCP) ──────────────────
echo "=== Step B: Upstash Redis get-or-create ==="
# Reuse the _upstash_api / _upstash_parse_db helpers (copy from gcp-setup.sh or
# source from a shared scripts/upstash-helpers.sh if both scripts are in the same repo).
_UPSTASH_DB_NAME="${VERCEL_PROJECT_NAME:-app-generator-sample}-redis"
_UPSTASH_AUTH="Basic $(printf '%s:%s' "${UPSTASH_EMAIL}" "${UPSTASH_API_KEY}" | base64 -w0)"
# ... (same get-or-create logic as gcp-setup.sh Step 4.5) ...
# Result: REDIS_URL="rediss://:${_REDIS_PW}@${_REDIS_EP}:${_REDIS_PORT}"
```

**Key points:**
- Same DB name as `gcp-setup.sh` → same Upstash instance → REDIS_URL identical between GCP and Vercel
- If GCP has already provisioned the instance, the list-by-name check returns `[SKIP]`
- The password is preserved via Secret Manager on GCP side; on Vercel side, `REDIS_URL` is read
  from `.env.production.local` (if previously set) and injected via `vercel-env.sh`
- Upstash Management API auth: `Authorization: Basic base64(EMAIL:API_KEY)` (confirmed current)
- Source: https://upstash.com/docs/devops/developer-api/authentication

---

## 15. Vercel Blob get-or-create (cmd_292 — supersedes PD-4 "cannot automate")

> **⚠ cmd_290 V-5 / PD-4 superseded:** `vercel blob create-store` is an official CLI command.
> The original "cannot automate" verdict was incorrect. Blob store provisioning is fully
> automatable as of the Vercel Blob CLI release.  
> **Source:** https://vercel.com/docs/vercel-blob/manage-blob-storage  
> https://vercel.com/changelog/vercel-blob-cli-is-now-available

### Idempotency mechanism

`VERCEL_BLOB_STORE_ID` stored in `.env.production.local` is the anchor. `vercel blob get-store`
takes a store ID, not a name, so the persisted ID is required for idempotent re-runs.

### Implementation approach for `vercel-setup.sh` Step C

```bash
# ── Step C: Vercel Blob get-or-create ───────────────────────────────────────
echo "=== Step C: Vercel Blob get-or-create ==="
if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY-RUN] Would get-or-create Blob store for ${VERCEL_PROJECT_NAME:-<unset>}"
  BLOB_READ_WRITE_TOKEN="${BLOB_READ_WRITE_TOKEN:-<DRY_RUN_BLOB_TOKEN>}"
else
  if [[ -n "${VERCEL_BLOB_STORE_ID:-}" ]]; then
    echo "[SKIP] VERCEL_BLOB_STORE_ID already set: ${VERCEL_BLOB_STORE_ID}"
    # Retrieve current token from existing store (exact --output format TBD at impl time)
    BLOB_READ_WRITE_TOKEN=$(vercel blob get-store "${VERCEL_BLOB_STORE_ID}" \
      --output json 2>/dev/null | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print(d.get('readWriteToken',''))")
  else
    # Create store
    _STORE_NAME="${VERCEL_PROJECT_NAME:-app-generator-sample}-uploads"
    _STORE_JSON=$(vercel blob create-store "${_STORE_NAME}" --access public 2>&1)
    # NOTE: Exact output format of `vercel blob create-store` must be verified
    # during implementation — parse accordingly (store ID and token extraction).
    VERCEL_BLOB_STORE_ID=$(printf '%s' "$_STORE_JSON" | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print(d.get('storeId',''))" 2>/dev/null \
      || printf '%s' "$_STORE_JSON" | grep -oP 'store_\w+' | head -1)
    # Persist store ID as idempotency anchor
    if grep -q "^VERCEL_BLOB_STORE_ID=" "${_ENV_FILE}" 2>/dev/null; then
      sed -i "s|^VERCEL_BLOB_STORE_ID=.*|VERCEL_BLOB_STORE_ID=${VERCEL_BLOB_STORE_ID}|" "${_ENV_FILE}"
    else
      echo "VERCEL_BLOB_STORE_ID=${VERCEL_BLOB_STORE_ID}" >> "${_ENV_FILE}"
    fi
    export VERCEL_BLOB_STORE_ID
    # Retrieve token
    BLOB_READ_WRITE_TOKEN=$(vercel blob get-store "${VERCEL_BLOB_STORE_ID}" \
      --output json 2>/dev/null | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print(d.get('readWriteToken',''))")
    echo "  Created Blob store: ${_STORE_NAME} (${VERCEL_BLOB_STORE_ID})"
  fi
fi
export BLOB_READ_WRITE_TOKEN
```

**Implementation note (PD-5):** The exact JSON output schema of `vercel blob create-store`
and `vercel blob get-store --output json` must be verified during implementation. The
`readWriteToken` field name is assumed from Vercel Blob API conventions but should be
confirmed before shipping. If token is not directly accessible via `get-store`, the token
obtained at create time should be persisted to `.env.production.local` immediately.

### Revised vercel-setup.sh Step sequence (cmd_292)

```
Step 0: submodule check        (unchanged)
Step A: Neon get-or-create     (new — sets DATABASE_URL_PROD/STAGING and UNPOOLED variants)
Step B: Upstash get-or-create  (new — sets REDIS_URL, symmetric to gcp-setup.sh Step 4.5)
Step C: Blob get-or-create     (new — sets BLOB_READ_WRITE_TOKEN, VERCEL_BLOB_STORE_ID)
Step 1: vercel link            (unchanged)
Step 2: vercel-env inject      (updated — DATABASE_URL_* instead of PRISMA_DATABASE_URL_*, adds BLOB_READ_WRITE_TOKEN)
Step 3: migrate:deploy (prod)  (updated — uses DATABASE_URL_UNPOOLED_PROD)
Step 4: migrate:deploy (staging)(updated — uses DATABASE_URL_UNPOOLED_STAGING)
```

---

## 16. Script File Changes Summary (cmd_292 — for implementation)

### scripts/vercel-env.sh

| Change | Detail |
|--------|--------|
| Required-var guards | Replace `PRISMA_DATABASE_URL_PROD/STAGING` guards with `DATABASE_URL_PROD/STAGING` |
| `vercel_env_inject production` | Inject `DATABASE_URL` from `DATABASE_URL_PROD` (was `PRISMA_DATABASE_URL_PROD`) |
| `vercel_env_inject preview` | Inject `DATABASE_URL` from `DATABASE_URL_STAGING` (was `PRISMA_DATABASE_URL_STAGING`) |
| Add `BLOB_READ_WRITE_TOKEN` injection | `inject_var BLOB_READ_WRITE_TOKEN "$BLOB_READ_WRITE_TOKEN" "$target"` (skip if empty — safe per inject_var design) |
| Add `UPSTASH_EMAIL/API_KEY/PRIMARY_REGION` vars | These are sourced from `.env.production.local` but NOT injected to Vercel (provisioning only) |

### scripts/vercel-setup.sh

| Change | Detail |
|--------|--------|
| Add source of Neon/Upstash/Blob vars | These are now written to `.env.production.local` by Step A/B/C and then sourced |
| Steps A/B/C (new) | Neon get-or-create, Upstash get-or-create, Blob get-or-create (before Step 1 link) |
| Step 3 migration command | `PRISMA_DATABASE_URL="${PRISMA_DATABASE_URL_PROD}"` → `DATABASE_URL="${DATABASE_URL_UNPOOLED_PROD}"` |
| Step 4 migration command | Same update using `DATABASE_URL_UNPOOLED_STAGING` |

### .env.production.local.example

| Change | Detail |
|--------|--------|
| Remove Prisma Postgres section | Remove `PRISMA_DATABASE_URL_PROD` and `PRISMA_DATABASE_URL_STAGING` lines; add note that section is superseded |
| Add Neon section | `DATABASE_URL_PROD=`, `DATABASE_URL_STAGING=`, `DATABASE_URL_UNPOOLED_PROD=`, `DATABASE_URL_UNPOOLED_STAGING=`, `NEON_API_KEY=`, `NEON_PROJECT_NAME=app-generator-sample`, `NEON_PROJECT_ID=` |
| Add Upstash provisioning vars | `UPSTASH_EMAIL=`, `UPSTASH_API_KEY=`, `UPSTASH_PRIMARY_REGION=ap-northeast-1` |
| Update Blob section | `BLOB_READ_WRITE_TOKEN=` note: "Auto-provisioned by vercel-setup.sh Step C"; `VERCEL_BLOB_STORE_ID=` |

### vercel.json

No changes required — build command is DB-provider agnostic.
