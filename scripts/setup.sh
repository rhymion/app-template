#!/usr/bin/env bash
# Idempotent bootstrap for app-template.
# - Initializes the app-generator submodule
# - Installs npm deps (root + app-generator)
# - Creates Python venv under app-generator/.venv and installs Python deps
# Note: start the local database separately with:
#   npm --prefix app-generator run docker:up:dev   (development)
#   npm --prefix app-generator run docker:up:test  (test)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> git submodule update --init --recursive"
git submodule update --init --recursive

echo "==> npm install (root)"
npm install

echo "==> npm install (app-generator)"
npm --prefix app-generator install

echo "==> Python venv (app-generator/.venv)"
python3 -m venv app-generator/.venv 2>/dev/null || true

echo "==> pip install -r app-generator/requirements.txt"
app-generator/.venv/bin/pip install -r app-generator/requirements.txt

echo
echo "Setup complete."
echo "Next: start your local database, then run 'npm run dev' from the repository root."
