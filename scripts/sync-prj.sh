#!/usr/bin/env bash
# Overlay-copy prj/ onto app-generator/.
# Idempotent. Never deletes files in app-generator/.
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
