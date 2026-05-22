#!/usr/bin/env bash
# First-time (and idempotent) bootstrap for app-template.
# - Initializes the app-generator submodule
# - Syncs prj/ into app-generator/
# - Installs npm deps
# - Starts the local Postgres test container and waits for it
# - Pushes the Prisma schema and generates the client
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> git submodule update --init --recursive"
git submodule update --init --recursive

echo "==> sync prj/ -> app-generator/"
bash scripts/sync-prj.sh

cd app-generator

echo "==> npm install"
npm install

echo "==> docker compose up (test Postgres)"
npm run docker:up:test

echo "==> wait for Postgres to accept connections"
for i in $(seq 1 60); do
  if docker compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ "$i" == "60" ]]; then
    echo "Postgres did not become ready within 60s." >&2
    exit 1
  fi
done

echo "==> set up test environment symlink"
npm run env:use -- test

echo "==> prisma db push (using env:use test)"
npm run db:push

echo "==> prisma generate"
npm run db:generate

echo
echo "Setup complete. Next: 'npm run dev' from the repository root (or 'npm run start' to run production build)."
