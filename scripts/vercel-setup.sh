#!/usr/bin/env bash
# Vercel project setup for app-template: verifies the app-generator submodule,
# links the Vercel project, injects env vars for both production and preview
# (two-DB pattern), then runs migrate:deploy once against the production DB
# before the first deploy.
#
# Usage:
#   ./scripts/vercel-setup.sh              # live run
#   DRY_RUN=true ./scripts/vercel-setup.sh # echo all write commands, no Vercel/DB changes
#
# Prerequisites: vercel CLI, npm
# Must run after: git submodule update --init --recursive (or let Step 0 do it)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/vercel-env.sh"

DRY_RUN="${DRY_RUN:-false}"

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] $*"
  else
    "$@"
  fi
}

echo ""
echo "================================================================="
echo "  Vercel setup: project=${VERCEL_PROJECT_NAME}"
echo "================================================================="
[[ "$DRY_RUN" == "true" ]] && echo "[DRY-RUN mode — write commands echoed, not executed]"
echo ""

# ── Step 0: Submodule check ─────────────────────────────────────────────────
echo "[Step 0] Verifying app-generator submodule is checked out..."
if [[ ! -d "${ROOT}/app-generator/app" ]]; then
  echo "  app-generator/app not found — running git submodule update --init --recursive..."
  run git -C "${ROOT}" submodule update --init --recursive
fi
if [[ "$DRY_RUN" != "true" ]]; then
  test -d "${ROOT}/app-generator/app" || { echo "ERROR: app-generator/app still not found after submodule checkout." >&2; exit 1; }
fi
echo "  OK: submodule present."

# ── Step 1: Link project ────────────────────────────────────────────────────
echo ""
echo "[Step 1] Linking Vercel project..."
_LINK_ARGS=(link --yes --project "${VERCEL_PROJECT_NAME}")
[[ -n "$VERCEL_ORG_ID" ]] && _LINK_ARGS+=(--scope "${VERCEL_ORG_ID}")
run vercel "${_LINK_ARGS[@]}"
echo "  OK: project linked."

# ── Step 2: Inject env vars (production + preview) ──────────────────────────
echo ""
echo "[Step 2] Injecting environment variables..."
vercel_env_inject production
vercel_env_inject preview

# ── Step 3: First-time migration against production DB ─────────────────────
# Deliberately NOT part of vercel.json buildCommand (see
# docs/vercel-automation-design.md §3): a failed migration on every build
# would block ALL deploys. Run once here, before the first deploy.
echo ""
echo "[Step 3] Running migrate:deploy against production DB..."
if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY-RUN] PRISMA_DATABASE_URL=<redacted> npm --prefix ${ROOT}/app-generator run migrate:deploy"
else
  : "${PRISMA_DATABASE_URL_PROD:?PRISMA_DATABASE_URL_PROD is required in .env.production.local}"
  PRISMA_DATABASE_URL="${PRISMA_DATABASE_URL_PROD}" npm --prefix "${ROOT}/app-generator" run migrate:deploy
fi
echo "  OK: migration complete."

# ── Step 4: First-time migration against staging DB ─────────────────────────
# Same rationale as Step 3, but for the preview/staging DB (see two-DB pattern
# in vercel-env.sh). Run once here so the first preview deploy doesn't hit an
# un-migrated staging database.
echo ""
echo "[Step 4] Running migrate:deploy against staging DB..."
if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY-RUN] PRISMA_DATABASE_URL=<redacted> npm --prefix ${ROOT}/app-generator run migrate:deploy"
else
  : "${PRISMA_DATABASE_URL_STAGING:?PRISMA_DATABASE_URL_STAGING is required in .env.production.local}"
  PRISMA_DATABASE_URL="${PRISMA_DATABASE_URL_STAGING}" npm --prefix "${ROOT}/app-generator" run migrate:deploy
fi
echo "  OK: migration complete."

echo ""
echo "================================================================="
echo "  Vercel setup complete"
echo "================================================================="
if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY-RUN] Run without DRY_RUN=true to apply changes."
else
  echo "  Next: git push (Git-provider auto-deploy) or bash scripts/vercel-deploy.sh [--prod]"
fi
echo ""
