#!/usr/bin/env bash
# Overlay-copy prj/ onto app-generator/. Idempotent. Never deletes files in
# app-generator/.
#
# Callers (as of cmd_485): root package.json's `dev` and `build` scripts
# only. It is NOT used by any Vercel deploy path — there is no vercel.json
# at this repository's root (see docs/vercel-automation-design.md §17.5 for
# why one must never be added back). Local dev/build are the sole remaining
# reason this script exists; see docs/vercel-automation-design.md §17.6 for
# the full retirement plan (a pending, unmerged change switches `dev`/
# `build` to `npm --prefix app-generator run prj:sync` instead, at which
# point this script has zero callers and should be deleted outright).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/prj"
DST="$ROOT/app-generator"

if [[ ! -d "$SRC" ]]; then
  echo "sync-prj: no prj/ directory at $SRC; nothing to sync."
  exit 0
fi

if [[ ! -d "$DST" ]]; then
  echo "sync-prj: app-generator/ not found at $DST." >&2
  echo "         Run 'git submodule update --init --recursive' first." >&2
  exit 1
fi

echo "sync-prj: copying $SRC/. -> $DST/"
cp -a "$SRC/." "$DST/"
echo "sync-prj: done."
