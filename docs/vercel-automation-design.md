# Vercel Environment Automation Script Design

**Created:** 2026-07-07
**Status:** Confirmed — ready for implementation (corrected design, subtask_290b)
**Scope:** Vercel production deployment automation for app-template (proj_c)
**Mirrors:** `scripts/gcp-*.sh` (parallel automation suite for the GCP Cloud Run path,
in `~/work/sandbox/app-generator-2/scripts/`)
**Supersedes:** the original draft of this document, previously located at
`~/work/sandbox/app-generator-2/docs/knowledge/vercel-automation-design.md`
(see redirect note left at that path).

---

## 0. Objective

Automate Vercel environment variable setup and deploy for **app-template**
(`~/work/generated-apps/app-template`, proj_c — the wrapper repo that consumes the
`app-generator` submodule), providing the same scriptable experience as the GCP
automation suite (`scripts/gcp-env.sh` / `gcp-setup.sh` / `gcp-deploy.sh` /
`gcp-teardown.sh` in proj_b).

**Key difference from GCP:** Vercel is a git-connected platform. A Git-provider deploy
(GitHub push) is triggered automatically; this automation additionally covers a CLI
deploy path (`vercel deploy`) plus environment variable injection and first-time DB
migration, both of which must precede a working deploy.

---

## 1. Deploy Target (Corrected — was wrong in the initial draft)

**Deploy target is `~/work/generated-apps/app-template` (proj_c), NOT
`~/work/sandbox/app-generator-2` (proj_b).**

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

File: `~/work/generated-apps/app-template/vercel.json` (NEW — at app-template root)

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

All Vercel automation scripts live in **`~/work/generated-apps/app-template/scripts/`**
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
- `~/work/generated-apps/app-template/.env.production.local.example` — template
- `~/work/generated-apps/app-template/vercel.json` — build config (§3.2)

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

## 6. DB Provider Decision Gate (V-1, updated — Shogun addition)

### Prisma Postgres

- Free tier: **5 databases max**
- Paid tiers: Starter $10/mo, Pro $49/mo, Business $129/mo (separate from Vercel Pro billing)

### Neon (comparison)

- Free tier: 100 projects, 10 branches/project
- Structural advantage: branch-per-preview-environment is a native Neon feature
- Requires separate Accelerate wiring (not bundled like Prisma Postgres)

### Decision gate

| Condition | Fits Free tier? | Decision |
|---|---|---|
| Single app (app-generator-sample), prod + staging = 2 DBs | Yes | **CONFIRMED: Continue with Prisma Postgres. No additional cost.** |
| Multiple apps OR per-preview independent DB at scale | No (DB cap) | Evaluate migration to Neon (100 projects Free, branch=preview env) |

Downsides of Prisma Postgres to keep in mind:
- DB count cap at 5 (Free) — structural weakness for multi-app / multi-preview scenarios
- Prisma stack coupling — locked into Prisma Data Platform for connection pooling
- Narrower PostgreSQL extension support than Neon (pg_trgm supported; pg_bigm and
  others may not be)

### V-4 update: staging/preview DB strategy

**Default: all preview deploys SHARE one staging DB** (economical). `prod(1) +
staging(1) = 2` total — well within the Free tier limit of 5.
Per-preview independent DB (one DB per preview deploy) is a **future option** via the
Neon branch model, only if/when scale requires it. No action needed at current scope.

---

## 7. Two-DB Environment Variable Pattern (FS-6, updated)

`vercel-env.sh inject <environment>` injects a different Prisma URL depending on target:

| Target environment | Source var | Injected as |
|---|---|---|
| `production` | `PRISMA_DATABASE_URL_PROD` | `PRISMA_DATABASE_URL` |
| `preview` | `PRISMA_DATABASE_URL_STAGING` | `PRISMA_DATABASE_URL` |

All preview (staging) deploys share the same `PRISMA_DATABASE_URL_STAGING` — this is
deliberate, not an oversight: it keeps total DB count at 2 (prod + staging), safely
within the Prisma Postgres Free tier cap of 5.
Future: if per-preview isolation is needed at scale, evaluate the Neon branch model
(§6, future option).

---

## 8. Environment Variable Inventory

### 8.1 Variables Required on Vercel Production

| Variable | Required | Secret | Value Source | Notes |
|----------|----------|--------|------|-------|
| `PRISMA_DATABASE_URL_PROD` | **Critical** | sensitive | Manual: Prisma Console → Accelerate URL | Injected as `PRISMA_DATABASE_URL` on `production` target |
| `PRISMA_DATABASE_URL_STAGING` | **Critical** | sensitive | Manual: Prisma Console → Accelerate URL (separate DB) | Injected as `PRISMA_DATABASE_URL` on `preview` target |
| `AUTH_SECRET` | **Critical** | sensitive | generate-once-persist (`openssl rand -base64 32`) | Also used for attachment filename encryption and MFA TOTP |
| `REDIS_URL` | Required | sensitive | Manual: Upstash Console or API | Format: `rediss://…` (Upstash global tier) |
| `GOOGLE_CLIENT_ID` | Optional | encrypted | Manual: Google Cloud Console OAuth 2.0 | Required only if siteConfig enables Google provider |
| `GOOGLE_CLIENT_SECRET` | Optional | sensitive | Manual: Google Cloud Console OAuth 2.0 | Required only if siteConfig enables Google provider |
| `AUTH_TRUST_HOST` | Required | no | Static: `true` | Eliminates need for explicit `AUTH_URL` behind Vercel proxy |
| `NODE_ENV` | Required | no | Static: `production` | Disables dev-only features, enables production Prisma log levels |

### 8.2 Variables NOT Set on Vercel (GCP-only)

`DATABASE_URL` (direct socket path, Cloud Run only), `STATEMENT_TIMEOUT_MS` (only
applies on the PrismaPg/direct-socket branch), `GCS_BUCKET`, `UPSTASH_EMAIL` /
`UPSTASH_API_KEY` (used by `gcp-setup.sh` only, not needed for Vercel env injection
itself), `PROJECT_ID`/`REGION`/`INSTANCE_NAME` (GCP infra), `SHADOW_DATABASE_URL`,
`TEST_RESET_TOKEN`.

> **Note — File uploads on Vercel:** `app/api/uploads/[...path]/route.ts` uses a local
> filesystem path. Vercel functions have no persistent filesystem; uploads will not
> work without migrating to a blob store. Out of scope for this automation; tracked
> as PD-3/PD-4 (§9) — 🚨 for Shogun, must be resolved before production launch.

---

## 9. Pending Decisions

| ID | Severity | Item |
|---|---|---|
| PD-1 | high | Real deploy go: after VERCEL_TOKEN handoff. This design/implementation phase = scripts only, no live Vercel operations. |
| PD-2 | low (resolved) | Staging/production DB isolation resolved as staging-shared default (§6/§7). No action needed at current scope. |
| PD-3 | medium | uploads API → Vercel Blob migration (`app/api/uploads/[...path]/route.ts`). Separate cmd. |
| PD-4 | low | `BLOB_READ_WRITE_TOKEN` provisioning — manual via Vercel dashboard (cannot automate). Document in setup guide. |

---

## 10. Confirmed Configuration Values (V-2, V-3, V-5, V-6, V-7)

- **V-2** project name: `app-generator-sample` (`VERCEL_PROJECT_NAME`)
- **V-3** team: `team_dV6bZ5phXWZj0nuGdtinMzJQ` (`VERCEL_ORG_ID`)
- **V-5** Vercel Blob (`BLOB_READ_WRITE_TOKEN`) — uploads API migration required before launch (PD-3)
- **V-6** Upstash Redis shared with GCP (`REDIS_URL`, Upstash global tier, HTTP-based)
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

**Scope note:** no real Vercel operations are executed in this implementation
(PD-1). Verification is limited to `bash -n` syntax checks, `DRY_RUN=true` execution
paths, required-var guard behavior, and secret non-exposure checks.

All scripts are written in English (maintained deliverable).
