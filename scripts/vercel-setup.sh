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

# `echo "KEY=val" >> file` silently concatenates onto the last line instead of
# starting a new one when the file doesn't already end in a newline (found
# live during this script's development — see report subtask_298a). Call this
# before any such append to _ENV_FILE.
_ensure_trailing_newline() {
  local _f="$1"
  [[ -s "$_f" ]] || return 0
  [[ "$(tail -c1 "$_f")" == "" ]] || printf '\n' >> "$_f"
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

# ── Step A: Neon get-or-create (DC-1: API direct, DC-2: branch-per-env) ─────
# NEON_PROJECT_ID (persisted in .env.production.local) is the idempotency
# anchor. See docs/vercel-automation-design.md §13.
#
# Connection-string retrieval uses the Neon CLI (neonctl) instead of the raw
# REST `connection_uri` endpoint: a direct REST pooled-connection fetch failed
# in a live run, while neonctl succeeded. neonctl is installed as a pinned
# devDependency (package.json) rather than invoked via per-run `npx <pkg>@ver`
# fetch or a global install: a global install's behavior can't be guaranteed
# across environments (global-only entries reach shell PATH; local ones
# don't), so _neonctl() below calls the local binary
# (node_modules/.bin/neonctl) directly — deterministic resolution, no
# registry/network round-trip once `npm install` has run, and the version is
# pinned in package.json for reproducibility. Project/branch get-or-create
# stay on REST: neonctl's `projects create --region-id` does not offer
# aws-ap-northeast-1 (the region this script provisions into; confirmed via
# `npx neonctl projects create --help`), and both paths are idempotent no-ops
# once NEON_PROJECT_ID/the branch already exist, so there is nothing to gain
# from converting them.
echo ""
echo "=== Step A: Neon get-or-create ==="
_NEON_AUTH="Authorization: Bearer ${NEON_API_KEY:-}"
_NEON_API="https://console.neon.tech/api/v2"

# neonctl reads the Neon API key from the NEON_API_KEY env var (already
# exported by vercel-env.sh's `set -a` source of .env.production.local) —
# confirmed via a live call, so it is never passed as a CLI flag (would leak
# into `ps` output).
_neonctl() {
  if [[ ! -x "${ROOT}/node_modules/.bin/neonctl" ]]; then
    echo "ERROR: neonctl not found in node_modules — run 'npm install' in ${ROOT} first." >&2
    return 1
  fi
  "${ROOT}/node_modules/.bin/neonctl" "$@"
}

get_or_create_neon_project() {
  if [[ -n "${NEON_PROJECT_ID:-}" ]]; then
    echo "[SKIP] NEON_PROJECT_ID already set: ${NEON_PROJECT_ID}"
    return 0
  fi

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
    _NEW=$(curl -sS -X POST -H "$_NEON_AUTH" -H "Content-Type: application/json" \
      -d "{\"project\":{\"name\":\"${NEON_PROJECT_NAME}\",\"region_id\":\"aws-ap-northeast-1\",\"pg_version\":16}}" \
      "${_NEON_API}/projects")
    NEON_PROJECT_ID=$(printf '%s' "$_NEW" | python3 -c \
      "import sys,json; print(json.load(sys.stdin)['project']['id'])")
    echo "  Created Neon project: ${NEON_PROJECT_NAME} (${NEON_PROJECT_ID})"
  fi

  if grep -q "^NEON_PROJECT_ID=" "${_ENV_FILE}" 2>/dev/null; then
    sed -i "s|^NEON_PROJECT_ID=.*|NEON_PROJECT_ID=${NEON_PROJECT_ID}|" "${_ENV_FILE}"
  else
    _ensure_trailing_newline "${_ENV_FILE}"
    echo "NEON_PROJECT_ID=${NEON_PROJECT_ID}" >> "${_ENV_FILE}"
  fi
  export NEON_PROJECT_ID
}

get_neon_connection_strings() {
  # Get pooled (app runtime) and unpooled (migration) endpoints for one branch.
  local branch_name="$1" var_pooled="$2" var_unpooled="$3"

  if [[ "$branch_name" == "staging" ]]; then
    _BRANCHES=$(curl -sS -H "$_NEON_AUTH" "${_NEON_API}/projects/${NEON_PROJECT_ID}/branches")
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

  # `-o table` (the default) is the actual raw connection string on stdout for
  # this command — confirmed live; `-o json` does NOT wrap it in JSON, so the
  # output is captured as-is, not parsed.
  local pooled_url direct_url
  pooled_url=$(_neonctl connection-string "$branch_name" \
    --project-id "${NEON_PROJECT_ID}" --pooled)
  direct_url=$(_neonctl connection-string "$branch_name" \
    --project-id "${NEON_PROJECT_ID}")

  for pair in "${var_pooled}=${pooled_url}" "${var_unpooled}=${direct_url}"; do
    key="${pair%%=*}"; val="${pair#*=}"
    # Neon connection strings contain `&` (e.g. `&channel_binding=require`), which
    # sed's replacement text treats as "whole match" — escape it so the literal
    # value is written instead of the match re-embedding itself on every run
    # (found live: 16x accumulated duplication across repeated executions — see
    # report subtask_298a CF-1).
    val_escaped="${val//&/\\&}"
    if grep -q "^${key}=" "${_ENV_FILE}" 2>/dev/null; then
      sed -i "s|^${key}=.*|${key}=${val_escaped}|" "${_ENV_FILE}"
    else
      _ensure_trailing_newline "${_ENV_FILE}"
      echo "${key}=${val}" >> "${_ENV_FILE}"
    fi
  done
  # Assign via `export NAME=value` (not `eval`) so `&` and other shell
  # metacharacters in the connection string are treated as a literal value,
  # not re-parsed as shell syntax (found live: eval turned the export into a
  # backgrounded subshell at `&channel_binding=require`, leaving the in-memory
  # var empty even though .env.production.local was written correctly — see
  # report subtask_299a CF-5).
  export "${var_pooled}=${pooled_url}"
  export "${var_unpooled}=${direct_url}"
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
  get_neon_connection_strings "production" "DATABASE_URL_PROD" "DATABASE_URL_UNPOOLED_PROD"
  get_neon_connection_strings "staging" "DATABASE_URL_STAGING" "DATABASE_URL_UNPOOLED_STAGING"
fi
export DATABASE_URL_PROD DATABASE_URL_STAGING DATABASE_URL_UNPOOLED_PROD DATABASE_URL_UNPOOLED_STAGING

# ── Step B: Upstash Redis get-or-create (shared with GCP — DP-4=A symmetry) ──
# Same DB name as gcp-setup.sh Step 4.5 -> same Upstash instance, so REDIS_URL
# is identical between the GCP and Vercel deploy paths. See §14.
echo ""
echo "=== Step B: Upstash Redis get-or-create ==="
#_UPSTASH_DB_NAME="${VERCEL_PROJECT_NAME:-app-generator-sample}-redis"
_UPSTASH_DB_NAME="${UPSTASH_DB_NAME:-app-generator-sample-redis}"


_upstash_api() {
  local _method="$1" _path="$2" _body="${3:-}"
  local _auth="Basic $(printf '%s:%s' "${UPSTASH_EMAIL}" "${UPSTASH_API_KEY}" | base64 -w0)"
  local _curl=(curl -sS -X "$_method" -H "Authorization: ${_auth}")
  [[ -n "$_body" ]] && _curl+=(-H "Content-Type: application/json" -d "$_body")
  local _out _code
  _out=$("${_curl[@]}" -w $'\n%{http_code}' "https://api.upstash.com${_path}") || {
    echo "ERROR: Upstash API ${_method} ${_path} — curl transport failure" >&2
    return 1
  }
  _code="${_out##*$'\n'}"
  _out="${_out%$'\n'*}"
  if [[ "$_code" != 2* ]]; then
    echo "ERROR: Upstash API ${_method} ${_path} failed (HTTP ${_code}):" >&2
    echo "       ${_out}" >&2
    return 1
  fi
  printf '%s' "$_out"
}

# Extract "password|endpoint|port" from a DB JSON object (password may be
# empty — create/reset-password responses include it, list/get omit it).
_upstash_parse_db() {
  python3 -c "
import sys, json
db = json.load(sys.stdin)
if not isinstance(db, dict):
    sys.stderr.write('unexpected Upstash response (not a JSON object)\n'); sys.exit(2)
print('{}|{}|{}'.format(db.get('password',''), db.get('endpoint',''), db.get('port','')))
"
}

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY-RUN] Would get-or-create Upstash Redis DB ${_UPSTASH_DB_NAME}"
  REDIS_URL="${REDIS_URL:-<DRY_RUN_REDIS_URL>}"
else
  : "${UPSTASH_EMAIL:?UPSTASH_EMAIL is required in .env.production.local}"
  : "${UPSTASH_API_KEY:?UPSTASH_API_KEY is required in .env.production.local}"
  : "${UPSTASH_PRIMARY_REGION:?UPSTASH_PRIMARY_REGION is required in .env.production.local}"

  _EXISTING_DBS=$(_upstash_api GET /v2/redis/databases) || exit 1
  _DB_OBJ=$(printf '%s' "$_EXISTING_DBS" | python3 -c "
import sys, json
data = json.load(sys.stdin); dbs = data if isinstance(data, list) else []
for db in dbs:
    if db.get('database_name') == sys.argv[1]:
        print(json.dumps(db)); break
" "${_UPSTASH_DB_NAME}")

  if [[ -n "$_DB_OBJ" ]]; then
    echo "[SKIP] Upstash Redis DB ${_UPSTASH_DB_NAME} already exists"
  else
    _DB_PAYLOAD=$(printf '{"database_name":"%s","platform":"aws","primary_region":"%s","tls":true}' \
      "${_UPSTASH_DB_NAME}" "${UPSTASH_PRIMARY_REGION}")
    _DB_OBJ=$(_upstash_api POST /v2/redis/database "$_DB_PAYLOAD") || exit 1
    echo "  Created Upstash Redis DB: ${_UPSTASH_DB_NAME}"
  fi

  _DB_ID=$(printf '%s' "$_DB_OBJ" | python3 -c "import sys,json; print(json.load(sys.stdin).get('database_id',''))")
  _PARSED=$(printf '%s' "$_DB_OBJ" | _upstash_parse_db) || exit 1
  IFS='|' read -r _REDIS_PW _REDIS_EP _REDIS_PORT <<<"$_PARSED"

  # list/get responses omit the password. Reset only when we don't already have
  # a usable REDIS_URL persisted, so ordinary re-runs don't rotate the live
  # Redis password (mirrors gcp-setup.sh's Secret Manager preservation check).
  if [[ -z "$_REDIS_PW" ]]; then
    if [[ -n "${REDIS_URL:-}" ]]; then
      echo "  Password not returned by list; REDIS_URL already set in .env.production.local — preserving it."
    else
      echo "  Password not returned by list; resetting to obtain a credential..."
      [[ -z "$_DB_ID" ]] && { echo "ERROR: no database_id available to reset password" >&2; exit 1; }
      _RESET_OBJ=$(_upstash_api POST "/v2/redis/reset-password/${_DB_ID}") || exit 1
      _PARSED=$(printf '%s' "$_RESET_OBJ" | _upstash_parse_db) || exit 1
      IFS='|' read -r _REDIS_PW _REDIS_EP _REDIS_PORT <<<"$_PARSED"
    fi
  fi

  if [[ -n "$_REDIS_PW" && -n "$_REDIS_EP" && -n "$_REDIS_PORT" ]]; then
    REDIS_URL="rediss://:${_REDIS_PW}@${_REDIS_EP}:${_REDIS_PORT}"
    if grep -q "^REDIS_URL=" "${_ENV_FILE}" 2>/dev/null; then
      sed -i "s|^REDIS_URL=.*|REDIS_URL=${REDIS_URL}|" "${_ENV_FILE}"
    else
      _ensure_trailing_newline "${_ENV_FILE}"
      echo "REDIS_URL=${REDIS_URL}" >> "${_ENV_FILE}"
    fi
    echo "  REDIS_URL set"
  elif [[ -z "${REDIS_URL:-}" ]]; then
    echo "ERROR: incomplete Upstash connection info (password/endpoint/port) and no existing REDIS_URL." >&2
    echo "       DB object: ${_DB_OBJ}" >&2
    exit 1
  fi
fi
export REDIS_URL

# ── Step 1: Link project ────────────────────────────────────────────────────
# Runs before Step C (Blob) — Blob store creation/token retrieval below needs
# the project already linked with VERCEL_PROJECT_ID resolved (see note there).
echo ""
echo "[Step 1] Adding and Linking Vercel project..."
_ADD_ARGS=(project add "${VERCEL_PROJECT_NAME}")
[[ -n "$VERCEL_ORG_ID" ]] && _ADD_ARGS+=(--scope "${VERCEL_ORG_ID}")
run vercel "${_ADD_ARGS[@]}"
_LINK_ARGS=(link --yes --project "${VERCEL_PROJECT_NAME}")
[[ -n "$VERCEL_ORG_ID" ]] && _LINK_ARGS+=(--scope "${VERCEL_ORG_ID}")

# VERCEL_PROJECT_ID: once VERCEL_ORG_ID is present in the environment, the
# Vercel CLI requires VERCEL_PROJECT_ID to be present too, or commands like
# `vercel env ls/add/pull` fail with "You specified VERCEL_ORG_ID but you
# forgot to specify VERCEL_PROJECT_ID" (confirmed live — `link`/`project add`
# themselves are fine without it, since they take --project/--scope directly,
# but the env-var commands used below and in vercel_env_inject are not).
if [[ -n "${VERCEL_PROJECT_ID:-}" ]]; then
  # Idempotent re-run: VERCEL_PROJECT_ID is already known (persisted in
  # .env.production.local by a prior run, exported here via vercel-env.sh's
  # `set -a` source). Re-deriving it from .vercel/project.json is not just
  # unnecessary but actively harmful: with VERCEL_ORG_ID+VERCEL_PROJECT_ID
  # both already present in the environment, `vercel link` below resolves via
  # those env vars and DELETES .vercel/project.json instead of writing it
  # (confirmed live) — breaking the python3 read that used to run
  # unconditionally right after. Skip that read entirely and reuse the
  # existing value directly; the .env.production.local write is also skipped
  # since the persisted value is already correct.
  run vercel "${_LINK_ARGS[@]}"
  echo "  OK: project linked."
  echo "  [SKIP] VERCEL_PROJECT_ID already set: ${VERCEL_PROJECT_ID} (skipping project.json derivation)"
elif [[ "$DRY_RUN" == "true" ]]; then
  run vercel "${_LINK_ARGS[@]}"
  echo "  OK: project linked."
  VERCEL_PROJECT_ID="<DRY_RUN_VERCEL_PROJECT_ID>"
else
  # First run (VERCEL_PROJECT_ID not yet known): unset VERCEL_ORG_ID/
  # VERCEL_PROJECT_ID for this one `link` call only, so the CLI is forced
  # through the explicit --scope/--project args above and writes a fresh
  # .vercel/project.json (rather than silently deleting/skipping it) —
  # `link`/`project add` need only --project/--scope, never the env vars, so
  # unsetting them here is safe and does not reintroduce the "you specified
  # VERCEL_ORG_ID but forgot VERCEL_PROJECT_ID" error from cmd_298.
  run env -u VERCEL_ORG_ID -u VERCEL_PROJECT_ID vercel "${_LINK_ARGS[@]}"
  echo "  OK: project linked."
  # `vercel link` just wrote the resolved project ID to .vercel/project.json;
  # read it from there (authoritative — correct even when VERCEL_PROJECT_NAME
  # resolved to a pre-existing project) rather than re-deriving it another way.
  VERCEL_PROJECT_ID=$(python3 -c \
    "import json; print(json.load(open('${ROOT}/.vercel/project.json'))['projectId'])")
  if grep -q "^VERCEL_PROJECT_ID=" "${_ENV_FILE}" 2>/dev/null; then
    sed -i "s|^VERCEL_PROJECT_ID=.*|VERCEL_PROJECT_ID=${VERCEL_PROJECT_ID}|" "${_ENV_FILE}"
  else
    _ensure_trailing_newline "${_ENV_FILE}"
    echo "VERCEL_PROJECT_ID=${VERCEL_PROJECT_ID}" >> "${_ENV_FILE}"
  fi
fi
export VERCEL_PROJECT_ID

# ── Helper: pull a live env-var value from Vercel (used for Blob token) ─────
# `vercel env ls` only shows metadata ("Encrypted") — pulling is the only way
# to get an actual decrypted value. The pulled file is written by `mktemp`
# (private, mode 600) and removed immediately after parsing; the value is
# returned via stdout capture only, never echoed to the terminal/log.
_vercel_pull_env_var() {
  local _var_name="$1" _target="$2" _tmp _val
  _tmp="$(mktemp)"
  if ! vercel env pull --environment "${_target}" --yes "${_tmp}" >/dev/null 2>&1; then
    rm -f "${_tmp}"
    return 1
  fi
  _val=$(python3 -c "
import sys
name = sys.argv[1]
with open(sys.argv[2]) as f:
    for line in f:
        line = line.rstrip('\n')
        if line.startswith(name + '='):
            v = line[len(name) + 1:]
            if len(v) >= 2 and v[0] == '\"' and v[-1] == '\"':
                v = v[1:-1]
            print(v)
            break
" "${_var_name}" "${_tmp}")
  rm -f "${_tmp}"
  [[ -n "$_val" ]] || return 1
  printf '%s' "${_val}"
}

# ── Step C: Vercel Blob get-or-create (DC-3: PD-4 superseded — CLI available) ──
# VERCEL_BLOB_STORE_ID (persisted in .env.production.local) is the idempotency
# anchor — `vercel blob get-store` takes a store ID, not a name. See §15.
#
# BLOB_READ_WRITE_TOKEN retrieval (PD-5 resolved): `vercel blob get-store` has
# no --output/--json flag at all (confirmed live) and never returns the RW
# token regardless of format, so parsing its output was never viable. Working
# path: `vercel blob create-store --environment <env>` connects the new store
# to the linked project, which auto-injects BLOB_READ_WRITE_TOKEN into that
# project env (confirmed live: `vercel env ls production` shows
# BLOB_READ_WRITE_TOKEN immediately after `create-store --environment
# production`) — then `_vercel_pull_env_var` above reads the live value back.
echo ""
echo "=== Step C: Vercel Blob get-or-create ==="
if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY-RUN] Would get-or-create Blob store for ${VERCEL_PROJECT_NAME:-<unset>}"
  BLOB_READ_WRITE_TOKEN="${BLOB_READ_WRITE_TOKEN:-<DRY_RUN_BLOB_TOKEN>}"
else
  if [[ -n "${VERCEL_BLOB_STORE_ID:-}" ]]; then
    echo "[SKIP] VERCEL_BLOB_STORE_ID already set: ${VERCEL_BLOB_STORE_ID}"
    BLOB_READ_WRITE_TOKEN=$(_vercel_pull_env_var BLOB_READ_WRITE_TOKEN production) || BLOB_READ_WRITE_TOKEN=""
    if [[ -z "$BLOB_READ_WRITE_TOKEN" ]]; then
      echo "  WARNING: BLOB_READ_WRITE_TOKEN not found in production env for this store." >&2
      echo "  This happens if the store predates the --environment auto-connect flag" >&2
      echo "  below (existing stores are not retroactively connectable via CLI — no" >&2
      echo "  'vercel blob connect' subcommand exists, confirmed via --help)." >&2
      echo "  MANUAL FALLBACK: in the Vercel dashboard, open Storage ->" >&2
      echo "  ${VERCEL_BLOB_STORE_ID} -> Connect to Project, select" >&2
      echo "  ${VERCEL_PROJECT_NAME} (production + preview), then re-run this script." >&2
    fi
  else
    _STORE_NAME="${VERCEL_PROJECT_NAME:-app-generator-sample}-uploads"
    _STORE_JSON=$(vercel blob create-store "${_STORE_NAME}" --yes --access public \
      --environment production --environment preview 2>&1)
    VERCEL_BLOB_STORE_ID=$(printf '%s' "$_STORE_JSON" | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print(d.get('storeId',''))" 2>/dev/null \
      || printf '%s' "$_STORE_JSON" | grep -oP 'store_\w+' | head -1)
    if grep -q "^VERCEL_BLOB_STORE_ID=" "${_ENV_FILE}" 2>/dev/null; then
      sed -i "s|^VERCEL_BLOB_STORE_ID=.*|VERCEL_BLOB_STORE_ID=${VERCEL_BLOB_STORE_ID}|" "${_ENV_FILE}"
    else
      _ensure_trailing_newline "${_ENV_FILE}"
      echo "VERCEL_BLOB_STORE_ID=${VERCEL_BLOB_STORE_ID}" >> "${_ENV_FILE}"
    fi
    export VERCEL_BLOB_STORE_ID
    echo "  Created Blob store: ${_STORE_NAME} (${VERCEL_BLOB_STORE_ID})"
    BLOB_READ_WRITE_TOKEN=$(_vercel_pull_env_var BLOB_READ_WRITE_TOKEN production) || BLOB_READ_WRITE_TOKEN=""
    if [[ -z "$BLOB_READ_WRITE_TOKEN" ]]; then
      echo "  WARNING: store created but BLOB_READ_WRITE_TOKEN not retrievable via env pull." >&2
      echo "  MANUAL FALLBACK: check Vercel dashboard Storage -> ${_STORE_NAME} -> confirm" >&2
      echo "  it is connected to ${VERCEL_PROJECT_NAME}, then set BLOB_READ_WRITE_TOKEN" >&2
      echo "  manually in .env.production.local." >&2
    fi
  fi
fi
export BLOB_READ_WRITE_TOKEN

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
  echo "[DRY-RUN] DATABASE_URL=<redacted> npm --prefix ${ROOT}/app-generator run migrate:deploy"
else
  : "${DATABASE_URL_UNPOOLED_PROD:?DATABASE_URL_UNPOOLED_PROD is required in .env.production.local}"
  DATABASE_URL="${DATABASE_URL_UNPOOLED_PROD}" npm --prefix "${ROOT}/app-generator" run migrate:deploy
fi
echo "  OK: migration complete."

# ── Step 4: First-time migration against staging DB ─────────────────────────
# Same rationale as Step 3, but for the preview/staging DB (see two-DB pattern
# in vercel-env.sh). Run once here so the first preview deploy doesn't hit an
# un-migrated staging database.
echo ""
echo "[Step 4] Running migrate:deploy against staging DB..."
if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY-RUN] DATABASE_URL=<redacted> npm --prefix ${ROOT}/app-generator run migrate:deploy"
else
  : "${DATABASE_URL_UNPOOLED_STAGING:?DATABASE_URL_UNPOOLED_STAGING is required in .env.production.local}"
  DATABASE_URL="${DATABASE_URL_UNPOOLED_STAGING}" npm --prefix "${ROOT}/app-generator" run migrate:deploy
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
