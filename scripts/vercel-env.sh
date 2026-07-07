#!/usr/bin/env bash
# Source this file to load Vercel deployment variables and the vercel_env_inject
# function, used by vercel-setup.sh and vercel-deploy.sh.
# Usage (sourced):   source "$(dirname "${BASH_SOURCE[0]}")/vercel-env.sh"
# Usage (direct run): bash scripts/vercel-env.sh inject <production|preview>
#
# Two-DB pattern (see docs/vercel-automation-design.md §7):
#   inject production -> PRISMA_DATABASE_URL_PROD    is injected as PRISMA_DATABASE_URL
#   inject preview    -> PRISMA_DATABASE_URL_STAGING is injected as PRISMA_DATABASE_URL
#   (all preview/staging deploys share one DB — deliberate, keeps DB count at 2)
set -euo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
_ENV_FILE="${_SCRIPT_DIR}/../.env.production.local"

if [[ -f "$_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$_ENV_FILE"
  set +a
else
  echo "ERROR: .env.production.local not found at ${_ENV_FILE}" >&2
  echo "  Copy .env.production.local.example to .env.production.local and fill in values." >&2
  exit 1
fi

DRY_RUN="${DRY_RUN:-false}"

# AUTH_SECRET: generate-once-persist (if unset, generates and writes back to .env.production.local)
if [[ -z "${AUTH_SECRET:-}" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] AUTH_SECRET not set — will generate with openssl rand -base64 32 and save to .env.production.local at runtime"
    AUTH_SECRET="<DRY_RUN_AUTH_SECRET>"
  else
    AUTH_SECRET=$(openssl rand -base64 32)
    if grep -q "^AUTH_SECRET=" "${_ENV_FILE}" 2>/dev/null; then
      sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=${AUTH_SECRET}|" "${_ENV_FILE}"
    else
      echo "AUTH_SECRET=${AUTH_SECRET}" >> "${_ENV_FILE}"
    fi
    echo "[INFO] AUTH_SECRET generated and saved to .env.production.local"
  fi
  export AUTH_SECRET
fi

# Required variables — abort with a clear message if missing (skip hard-fail in DRY_RUN
# so the syntax/flow of a fresh checkout can still be exercised end-to-end).
if [[ "$DRY_RUN" != "true" ]]; then
  : "${REDIS_URL:?REDIS_URL is required — set in .env.production.local}"
  : "${VERCEL_PROJECT_NAME:?VERCEL_PROJECT_NAME is required — set in .env.production.local}"
else
  REDIS_URL="${REDIS_URL:-<DRY_RUN_REDIS_URL>}"
  VERCEL_PROJECT_NAME="${VERCEL_PROJECT_NAME:-<DRY_RUN_VERCEL_PROJECT_NAME>}"
fi

VERCEL_ORG_ID="${VERCEL_ORG_ID:-}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"

export REDIS_URL VERCEL_PROJECT_NAME VERCEL_ORG_ID GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET

# ── inject_var: upsert one Vercel env var, never echoing the secret value ────
# Usage: inject_var NAME VALUE TARGET
inject_var() {
  local name="$1" value="$2" target="$3"
  if [[ -z "$value" ]]; then
    echo "  [SKIP] ${name}: [unset] (not configured for ${target})"
    return 0
  fi
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] printf '%s' <redacted> | vercel env add ${name} ${target} --force"
  else
    printf '%s' "$value" | vercel env add "$name" "$target" --force
    echo "  Injected: ${name}: [set] -> ${target}"
  fi
}

# ── vercel_env_inject: inject the full variable set for one Vercel environment ──
# Usage: vercel_env_inject <production|preview>
vercel_env_inject() {
  local target="${1:?Usage: vercel_env_inject <production|preview>}"
  local prisma_url

  case "$target" in
    production)
      if [[ "$DRY_RUN" == "true" ]]; then
        prisma_url="${PRISMA_DATABASE_URL_PROD:-<DRY_RUN_PRISMA_DATABASE_URL_PROD>}"
      else
        : "${PRISMA_DATABASE_URL_PROD:?PRISMA_DATABASE_URL_PROD is required in .env.production.local for target=production}"
        prisma_url="$PRISMA_DATABASE_URL_PROD"
      fi
      ;;
    preview)
      if [[ "$DRY_RUN" == "true" ]]; then
        prisma_url="${PRISMA_DATABASE_URL_STAGING:-<DRY_RUN_PRISMA_DATABASE_URL_STAGING>}"
      else
        : "${PRISMA_DATABASE_URL_STAGING:?PRISMA_DATABASE_URL_STAGING is required in .env.production.local for target=preview}"
        prisma_url="$PRISMA_DATABASE_URL_STAGING"
      fi
      ;;
    development)
      echo "ERROR: 'development' target is not supported — sensitive vars are not allowed on Vercel's development environment." >&2
      return 1
      ;;
    *)
      echo "ERROR: unknown target '${target}' (expected production|preview)" >&2
      return 1
      ;;
  esac

  echo "=== Injecting Vercel env vars: target=${target} ==="
  inject_var PRISMA_DATABASE_URL "$prisma_url" "$target"
  inject_var AUTH_SECRET "$AUTH_SECRET" "$target"
  inject_var REDIS_URL "$REDIS_URL" "$target"
  inject_var GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID" "$target"
  inject_var GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET" "$target"
  inject_var AUTH_TRUST_HOST "true" "$target"
  inject_var NODE_ENV "production" "$target"
  echo "=== Injection complete for ${target}. Trigger a redeploy for changes to take effect. ==="
}

# Allow direct execution: bash scripts/vercel-env.sh inject <production|preview>
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  if [[ "${1:-}" == "inject" ]]; then
    vercel_env_inject "${2:?Usage: bash scripts/vercel-env.sh inject <production|preview>}"
  else
    echo "Usage: bash scripts/vercel-env.sh inject <production|preview>" >&2
    exit 1
  fi
fi
